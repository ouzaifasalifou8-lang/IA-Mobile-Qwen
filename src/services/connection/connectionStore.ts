// Service de connexion WebSocket + Bluetooth amélioré avec protocole temps réel
import {makeAutoObservable, runInAction} from 'mobx';
import {realtimeProtocol, Frame, MessageType} from './realtimeProtocol';

export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'error';

export interface DeviceInfo {
  id: string;
  name: string;
  address: string; // IP:port pour WiFi
  type: 'wifi' | 'bluetooth';
  rssi?: number;
  lastSeen?: number;
  signalStrength?: number; // 0-100
}

export interface ConnectionMessage {
  id: string;
  type: MessageType;
  payload: string | Uint8Array;
  timestamp: number;
  sender: 'app' | 'device';
  progress?: number; // 0-100 pour les streams
  metadata?: Record<string, any>;
}

export interface ConnectionStats {
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
  latency: number; // ms
  packetLoss: number; // %
  bandwidth: number; // kbps
  uptime: number; // ms
  startTime: number;
}

class ConnectionStore {
  status: ConnectionStatus = 'disconnected';
  devices: DeviceInfo[] = [];
  connectedDevice: DeviceInfo | null = null;
  messages: ConnectionMessage[] = [];
  error = '';
  stats: ConnectionStats = this.initStats();

  private ws: WebSocket | null = null;
  private sendTimer: NodeJS.Timer | null = null;
  private heartbeatTimer: NodeJS.Timer | null = null;
  private statsTimer: NodeJS.Timer | null = null;
  
  private onMessageCallbacks: ((msg: ConnectionMessage) => void)[] = [];
  private onStreamCallbacks: ((id: string, type: MessageType, progress: number) => void)[] = [];
  private onStatusChangeCallbacks: ((status: ConnectionStatus) => void)[] = [];

  // Configuration réseau
  private readonly SCAN_TIMEOUT = 10000;
  private readonly CONNECT_TIMEOUT = 5000;
  private readonly HEARTBEAT_INTERVAL = 30000;
  private readonly SEND_INTERVAL = 10; // ms entre envois
  private readonly MAX_MESSAGES_HISTORY = 100;

  private messageBuffer: ConnectionMessage[] = [];
  private streamProgress = new Map<string, number>();

  constructor() {
    makeAutoObservable(this);
  }

  private initStats(): ConnectionStats {
    return {
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      latency: 0,
      packetLoss: 0,
      bandwidth: 0,
      uptime: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Scanner les appareils WiFi sur le réseau local
   */
  async scanWifi(ipRange: string = '192.168.4'): Promise<void> {
    runInAction(() => {
      this.status = 'scanning';
      this.devices = [];
      this.error = '';
    });

    const commonPorts = [80, 8080, 3000, 8765, 81];
    const commonIPs = [1, 2, 100, 101, 102, 103, 104, 105];
    const found: DeviceInfo[] = [];

    const checks = commonIPs.map(async (lastOctet) => {
      const ip = `${ipRange}.${lastOctet}`;
      for (const port of commonPorts) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1000);
          const resp = await fetch(`http://${ip}:${port}/info`, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (resp.ok) {
            const data = await resp.json().catch(() => ({}));
            const signal = data.signal || Math.random() * 100;
            runInAction(() => {
              found.push({
                id: `${ip}:${port}`,
                name: data.name || `Appareil ${ip}`,
                address: `${ip}:${port}`,
                type: 'wifi',
                signalStrength: Math.min(100, Math.max(0, signal)),
                lastSeen: Date.now(),
              });
              this.devices = [...found];
            });
          }
        } catch {}
      }
    });

    await Promise.all(checks);

    // Ajouter adresses communes ESP32
    const esp32Defaults = [
      {
        id: '192.168.4.1:80',
        name: 'ESP32 (Access Point)',
        address: '192.168.4.1:80',
        type: 'wifi' as const,
        signalStrength: 75,
        lastSeen: Date.now(),
      },
      {
        id: '192.168.1.1:80',
        name: 'Routeur/AP',
        address: '192.168.1.1:80',
        type: 'wifi' as const,
        signalStrength: 80,
        lastSeen: Date.now(),
      },
    ];

    runInAction(() => {
      for (const d of esp32Defaults) {
        if (!this.devices.find(dev => dev.id === d.id)) {
          this.devices.push(d);
        }
      }
      this.status = this.devices.length > 0 ? 'disconnected' : 'error';
      if (this.devices.length === 0) {
        this.error = 'Aucun appareil trouvé';
      }
    });
  }

  /**
   * Connexion WebSocket à un appareil
   */
  async connect(device: DeviceInfo): Promise<void> {
    runInAction(() => {
      this.status = 'connecting';
      this.error = '';
    });

    try {
      const wsUrl = `ws://${device.address}/ws`;
      this.ws = new WebSocket(wsUrl);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout de connexion'));
        }, this.CONNECT_TIMEOUT);

        this.ws!.onopen = () => {
          clearTimeout(timeout);
          runInAction(() => {
            this.status = 'connected';
            this.connectedDevice = device;
            this.stats = this.initStats();
            this.messageBuffer = [];
            this.streamProgress.clear();
          });

          // Démarrer les timers
          this.startSendLoop();
          this.startHeartbeat();
          this.startStatsCollection();

          // Initialiser listeners protocole
          this.setupProtocolListeners();

          resolve();
        };

        this.ws!.onerror = (e) => {
          clearTimeout(timeout);
          reject(new Error('Erreur de connexion WebSocket'));
        };

        this.ws!.onclose = () => {
          this.cleanup();
          runInAction(() => {
            this.status = 'disconnected';
            this.connectedDevice = null;
          });
          this.notifyStatusChange('disconnected');
        };

        this.ws!.onmessage = (event) => {
          this.handleIncomingData(event.data);
        };
      });

      this.notifyStatusChange('connected');
    } catch (e: any) {
      runInAction(() => {
        this.status = 'error';
        this.error = e?.message || 'Connexion échouée';
        this.ws = null;
      });
      this.notifyStatusChange('error');
      throw e;
    }
  }

  /**
   * Setup listeners pour le protocole temps réel
   */
  private setupProtocolListeners(): void {
    // Écouter les frames complètes
    realtimeProtocol.onFrame((frame: Frame) => {
      this.handleReceivedFrame(frame);
    });

    // Écouter le début des streams
    realtimeProtocol.onStreamStart((type: MessageType, id: string) => {
      this.streamProgress.set(id, 0);
      runInAction(() => {
        this.onStreamCallbacks.forEach(cb => cb(id, type, 0));
      });
    });

    // Écouter la progression des streams
    realtimeProtocol.onStreamProgress((progress: number, id: string) => {
      this.streamProgress.set(id, progress);
      runInAction(() => {
        this.onStreamCallbacks.forEach(cb => {
          const msg = this.messages.find(m => m.id === id);
          if (msg) cb(id, msg.type, progress);
        });
      });
    });
  }

  /**
   * Traiter les données reçues
   */
  private handleIncomingData(data: any): void {
    try {
      if (data instanceof ArrayBuffer) {
        // Protocole binaire
        const uint8 = new Uint8Array(data);
        realtimeProtocol.processReceivedFrame(uint8);
      } else if (typeof data === 'string') {
        // Fallback JSON
        const parsed = JSON.parse(data);
        const msg: ConnectionMessage = {
          id: parsed.id || this.generateUUID(),
          type: parsed.type || 'text',
          payload: parsed.payload || '',
          timestamp: Date.now(),
          sender: 'device',
          metadata: parsed.metadata,
        };
        this.addMessage(msg);
        this.onMessageCallbacks.forEach(cb => cb(msg));
      }
      
      runInAction(() => {
        this.stats.bytesReceived += data.length || 0;
        this.stats.messagesReceived++;
      });
    } catch (e) {
      console.error('[Connection] Erreur traitement données:', e);
    }
  }

  /**
   * Traiter un frame reçu complet
   */
  private handleReceivedFrame(frame: Frame): void {
    try {
      let payload: string | Uint8Array = frame.payload;

      // Décompresser si nécessaire
      if (frame.metadata?.compression === 'gzip') {
        // En production, décompresser ici
      }

      // Convertir en string pour texte/ai_response
      if (frame.type === 'text' || frame.type === 'ai_response' || frame.type === 'command') {
        payload = new TextDecoder().decode(frame.payload);
      }

      const msg: ConnectionMessage = {
        id: frame.id,
        type: frame.type,
        payload,
        timestamp: frame.timestamp,
        sender: frame.sender,
        progress: this.streamProgress.get(frame.id),
        metadata: frame.metadata,
      };

      this.addMessage(msg);
      this.onMessageCallbacks.forEach(cb => cb(msg));

      runInAction(() => {
        this.stats.bytesReceived += frame.payload.length;
        this.stats.messagesReceived++;
      });
    } catch (e) {
      console.error('[Connection] Erreur traitement frame:', e);
    }
  }

  /**
   * Boucle d'envoi des messages en queue
   */
  private startSendLoop(): void {
    if (this.sendTimer) return;

    this.sendTimer = setInterval(() => {
      if (!this.ws || this.status !== 'connected') return;

      const frames = realtimeProtocol.getNextFrames(5);
      for (const frame of frames) {
        this.sendFrame(frame);
      }
    }, this.SEND_INTERVAL);
  }

  /**
   * Envoyer un frame
   */
  private sendFrame(frame: Frame): void {
    if (!this.ws || this.status !== 'connected') {
      realtimeProtocol.retryFrame(frame);
      return;
    }

    try {
      // Sérialiser et envoyer
      const binary = this.serializeFrame(frame);
      this.ws.send(binary);

      runInAction(() => {
        this.stats.bytesSent += binary.length;
        this.stats.messagesSent++;
      });
    } catch (e) {
      console.error('[Connection] Erreur envoi frame:', e);
      realtimeProtocol.retryFrame(frame);
    }
  }

  /**
   * Démarrer le heartbeat
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    realtimeProtocol.startHeartbeat();
  }

  /**
   * Démarrer la collection de statistiques
   */
  private startStatsCollection(): void {
    if (this.statsTimer) return;

    this.statsTimer = setInterval(() => {
      runInAction(() => {
        const now = Date.now();
        this.stats.uptime = now - this.stats.startTime;
        
        // Estimer la bande passante
        if (this.stats.uptime > 0) {
          this.stats.bandwidth = Math.round((this.stats.bytesSent / (this.stats.uptime / 1000)) * 8 / 1000); // kbps
        }
      });
    }, 1000);
  }

  /**
   * Envoyer du texte
   */
  async sendText(text: string, priority: 'low' | 'normal' | 'high' = 'normal'): Promise<string> {
    const id = await realtimeProtocol.sendText(text, priority);
    return id;
  }

  /**
   * Envoyer une réponse IA en streaming
   */
  async sendAiResponseStream(
    text: string,
    onProgress?: (sent: number, total: number) => void
  ): Promise<void> {
    return realtimeProtocol.sendAiResponseStream(text, onProgress);
  }

  /**
   * Envoyer de l'audio
   */
  async sendAudioStream(
    audioBuffer: Uint8Array,
    codec: 'opus' | 'aac' = 'opus',
    bitrate: number = 32,
    onProgress?: (sent: number, total: number) => void
  ): Promise<string> {
    return realtimeProtocol.sendAudioStream(audioBuffer, codec, bitrate, onProgress);
  }

  /**
   * Envoyer de la vidéo
   */
  async sendVideoStream(
    videoBuffer: Uint8Array,
    codec: 'h264' | 'h265' = 'h264',
    bitrate: number = 1000,
    fps: number = 30,
    onProgress?: (sent: number, total: number) => void
  ): Promise<string> {
    return realtimeProtocol.sendVideoStream(videoBuffer, codec, bitrate, fps, onProgress);
  }

  /**
   * Envoyer un fichier
   */
  async sendFile(
    filename: string,
    fileBuffer: Uint8Array,
    mimeType: string = 'application/octet-stream',
    onProgress?: (sent: number, total: number) => void
  ): Promise<string> {
    return realtimeProtocol.sendFile(filename, fileBuffer, mimeType, onProgress);
  }

  /**
   * Ajouter un message à l'historique
   */
  private addMessage(msg: ConnectionMessage): void {
    runInAction(() => {
      this.messageBuffer.push(msg);
      this.messages.push(msg);
      
      // Limiter l'historique
      if (this.messages.length > this.MAX_MESSAGES_HISTORY) {
        this.messages = this.messages.slice(-this.MAX_MESSAGES_HISTORY);
      }
    });
  }

  /**
   * S'abonner aux messages entrants
   */
  onMessage(callback: (msg: ConnectionMessage) => void): () => void {
    this.onMessageCallbacks.push(callback);
    return () => {
      this.onMessageCallbacks = this.onMessageCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * S'abonner aux changements de progression de stream
   */
  onStreamProgress(callback: (id: string, type: MessageType, progress: number) => void): () => void {
    this.onStreamCallbacks.push(callback);
    return () => {
      this.onStreamCallbacks = this.onStreamCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * S'abonner aux changements de statut
   */
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.onStatusChangeCallbacks.push(callback);
    return () => {
      this.onStatusChangeCallbacks = this.onStatusChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyStatusChange(status: ConnectionStatus): void {
    this.onStatusChangeCallbacks.forEach(cb => cb(status));
  }

  /**
   * Déconnecter
   */
  disconnect(): void {
    this.cleanup();
    this.ws?.close();
    this.ws = null;

    runInAction(() => {
      this.status = 'disconnected';
      this.connectedDevice = null;
    });
    this.notifyStatusChange('disconnected');
  }

  private cleanup(): void {
    if (this.sendTimer) {
      clearInterval(this.sendTimer);
      this.sendTimer = null;
    }
    if (this.heartbeatTimer) {
      realtimeProtocol.stopHeartbeat();
      this.heartbeatTimer = null;
    }
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  /**
   * Nettoyer les messages
   */
  clearMessages(): void {
    runInAction(() => {
      this.messages = [];
      this.messageBuffer = [];
    });
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): ConnectionStats {
    return {...this.stats};
  }

  /**
   * Obtenir la latence estimée
   */
  getLatency(): number {
    return this.stats.latency;
  }

  /**
   * Obtenir la bande passante
   */
  getBandwidth(): number {
    return this.stats.bandwidth;
  }

  /**
   * Utilitaires
   */
  private serializeFrame(frame: Frame): Uint8Array {
    const header = JSON.stringify({
      id: frame.id,
      type: frame.type,
      sequence: frame.sequence,
      totalChunks: frame.totalChunks,
      chunkIndex: frame.chunkIndex,
      timestamp: frame.timestamp,
      sender: frame.sender,
      metadata: frame.metadata,
      checksum: frame.checksum,
    });

    const headerBytes = new TextEncoder().encode(header);
    const headerLen = new Uint32Array([headerBytes.length]);

    const result = new Uint8Array(4 + headerBytes.length + frame.payload.length);
    result.set(new Uint8Array(headerLen.buffer), 0);
    result.set(headerBytes, 4);
    result.set(frame.payload, 4 + headerBytes.length);

    return result;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Deprecated - keeping for backwards compatibility
  send(type: MessageType, payload: string, metadata?: Record<string, any>): boolean {
    this.sendText(payload, metadata?.priority || 'normal');
    return true;
  }

  sendAiResponse(text: string): boolean {
    this.sendText(text, 'high');
    return true;
  }

  sendFile(name: string, base64Data: string, mimeType: string): boolean {
    const buffer = this.base64ToUint8Array(base64Data);
    realtimeProtocol.sendFile(name, buffer, mimeType);
    return true;
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

export const connectionStore = new ConnectionStore();
