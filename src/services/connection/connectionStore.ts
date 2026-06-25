// Service de connexion WebSocket pour communication avec ESP32 et autres appareils
import {makeAutoObservable, runInAction} from 'mobx';

export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'error';

export type MessageType = 'text' | 'audio' | 'video' | 'file' | 'command' | 'ai_response';

export interface DeviceInfo {
  id: string;
  name: string;
  address: string; // IP:port pour WiFi
  type: 'wifi' | 'bluetooth';
  rssi?: number;
}

export interface ConnectionMessage {
  type: MessageType;
  payload: string | Uint8Array;
  timestamp: number;
  sender: 'app' | 'device';
  metadata?: Record<string, any>;
}

class ConnectionStore {
  status: ConnectionStatus = 'disconnected';
  devices: DeviceInfo[] = [];
  connectedDevice: DeviceInfo | null = null;
  messages: ConnectionMessage[] = [];
  error = '';
  private ws: WebSocket | null = null;
  private onMessageCallbacks: ((msg: ConnectionMessage) => void)[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  // Scanner les appareils WiFi sur le réseau local
  async scanWifi(ipRange: string = '192.168.4'): Promise<void> {
    runInAction(() => {
      this.status = 'scanning';
      this.devices = [];
      this.error = '';
    });

    const commonPorts = [80, 8080, 3000, 8765, 81];
    const commonIPs = [1, 2, 100, 101, 102, 103, 104, 105];
    const found: DeviceInfo[] = [];

    // Scanner en parallèle
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
            runInAction(() => {
              found.push({
                id: `${ip}:${port}`,
                name: data.name || `Appareil ${ip}`,
                address: `${ip}:${port}`,
                type: 'wifi',
              });
              this.devices = [...found];
            });
          }
        } catch {}
      }
    });

    await Promise.all(checks);

    // Ajouter aussi des adresses communes ESP32
    const esp32Defaults = [
      {id: '192.168.4.1:80', name: 'ESP32 (Access Point)', address: '192.168.4.1:80', type: 'wifi' as const},
      {id: '192.168.1.1:80', name: 'Routeur/AP', address: '192.168.1.1:80', type: 'wifi' as const},
    ];

    runInAction(() => {
      // Ajouter les defaults s'ils ne sont pas déjà trouvés
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

  // Connexion WebSocket à un appareil
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
        }, 5000);

        this.ws!.onopen = () => {
          clearTimeout(timeout);
          runInAction(() => {
            this.status = 'connected';
            this.connectedDevice = device;
          });
          resolve();
        };

        this.ws!.onerror = (e) => {
          clearTimeout(timeout);
          reject(new Error('Erreur de connexion WebSocket'));
        };

        this.ws!.onclose = () => {
          runInAction(() => {
            this.status = 'disconnected';
            this.connectedDevice = null;
          });
        };

        this.ws!.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const msg: ConnectionMessage = {
              type: data.type || 'text',
              payload: data.payload || data.message || '',
              timestamp: Date.now(),
              sender: 'device',
              metadata: data.metadata,
            };
            runInAction(() => {
              this.messages.push(msg);
            });
            this.onMessageCallbacks.forEach(cb => cb(msg));
          } catch {}
        };
      });
    } catch (e: any) {
      runInAction(() => {
        this.status = 'error';
        this.error = e?.message || 'Connexion échouée';
        this.ws = null;
      });
    }
  }

  // Envoyer un message
  send(type: MessageType, payload: string, metadata?: Record<string, any>): boolean {
    if (!this.ws || this.status !== 'connected') return false;
    try {
      this.ws.send(JSON.stringify({type, payload, metadata, timestamp: Date.now()}));
      const msg: ConnectionMessage = {type, payload, timestamp: Date.now(), sender: 'app', metadata};
      runInAction(() => { this.messages.push(msg); });
      return true;
    } catch {
      return false;
    }
  }

  // Envoyer une réponse IA en temps réel
  sendAiResponse(text: string): boolean {
    return this.send('ai_response', text, {source: 'ai'});
  }

  // Envoyer un fichier en base64
  sendFile(name: string, base64Data: string, mimeType: string): boolean {
    return this.send('file', base64Data, {name, mimeType});
  }

  // S'abonner aux messages entrants
  onMessage(callback: (msg: ConnectionMessage) => void): () => void {
    this.onMessageCallbacks.push(callback);
    return () => {
      this.onMessageCallbacks = this.onMessageCallbacks.filter(cb => cb !== callback);
    };
  }

  // Déconnecter
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    runInAction(() => {
      this.status = 'disconnected';
      this.connectedDevice = null;
    });
  }

  clearMessages(): void {
    runInAction(() => { this.messages = []; });
  }
}

export const connectionStore = new ConnectionStore();
