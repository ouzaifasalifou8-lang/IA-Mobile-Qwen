/**
 * ESP32Manager - Gestionnaire de communication WebSocket avec l'ESP32
 * Supporte: texte/commandes, photos, audio, fichiers, video (MJPEG)
 * Protocol: WebSocket sur WiFi local (pas de latence reseau internet)
 */

type MessageHandler = (data: ESP32Message) => void;
type ConnectionHandler = (connected: boolean) => void;

export interface ESP32Message {
  type: 'text' | 'command' | 'photo' | 'audio' | 'file' | 'video' | 'status';
  payload: string | object;
  metadata?: {
    filename?: string;
    mimeType?: string;
    chunkIndex?: number;
    totalChunks?: number;
    size?: number;
  };
}

export interface ESP32Config {
  ip: string;
  port: number;
  reconnectDelay: number;
  pingInterval: number;
}

const DEFAULT_CONFIG: ESP32Config = {
  ip: '192.168.4.1',
  port: 80, // Port WebSocket standard pour ESP32
  reconnectDelay: 3000,
  pingInterval: 5000,
};

class ESP32Manager {
  private ws: WebSocket | null = null;
  private config: ESP32Config = DEFAULT_CONFIG;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private shouldReconnect = false;
  private fileChunks: Map<string, string[]> = new Map();
  private _robotMode = false;
  private robotMessageHandler: ((msg: ESP32Message) => Promise<string>) | null =
    null;

  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  // ===== POLLING HTTP (quand WebSocket non dispo) =====
  startHttpPolling(
    onMessage: (msg: ESP32Message) => Promise<string>,
    ip = '192.168.4.1',
    intervalMs = 500,
  ) {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    console.log('[ESP32] Demarrage polling HTTP vers', ip);

    this.pollingTimer = setInterval(async () => {
      try {
        // 1. Recuperer le message en attente sur l'ESP32
        const ctrl1 = new AbortController();
        setTimeout(() => ctrl1.abort(), 3000);
        const resp = await fetch('http://' + ip + '/msg_attente', {
          signal: ctrl1.signal,
        });
        const data = await resp.json();

        if (data.msg && data.msg.length > 0) {
          console.log('[ESP32] Message recu via polling:', data.msg.slice(0, 50));

          // 2. Traiter le message avec l'IA
          const msg: ESP32Message = {type: 'text', payload: data.msg};
          const reponse = await onMessage(msg);

          // 3. Envoyer la reponse a l'ESP32
          if (reponse) {
            const ctrl2 = new AbortController();
            setTimeout(() => ctrl2.abort(), 3000);
            await fetch('http://' + ip + '/set_reponse', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({reponse}),
              signal: ctrl2.signal,
            });
          }
        }
      } catch {
        // Connexion perdue, on continue silencieusement
      }
    }, intervalMs);
  }

  stopHttpPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      console.log('[ESP32] Polling HTTP arrete.');
    }
  }

  // ===== MODE ROBOT =====

  get robotMode(): boolean {
    return this._robotMode;
  }

  // Active le mode robot : l'IA ecoute l'ESP32 ET le chat
  // onRobotMessage : callback appele quand l'ESP32 envoie un message
  // Il doit retourner la reponse de l'IA (string)
  startRobotMode(
    onRobotMessage: (msg: ESP32Message) => Promise<string>,
    config?: Partial<ESP32Config>,
  ) {
    this._robotMode = true;
    this.robotMessageHandler = onRobotMessage;
    console.log('[ESP32] Mode robot ACTIVE');
    if (!this.isConnected) {
      this.connect(config);
    }
  }

  stopRobotMode() {
    this._robotMode = false;
    this.robotMessageHandler = null;
    console.log('[ESP32] Mode robot DESACTIVE');
  }

  // Envoie une reponse texte vers l'ESP32 (pour synthese vocale)
  sendResponse(text: string): boolean {
    return this._send(
      JSON.stringify({
        type: 'text',
        payload: text,
        metadata: {isResponse: true},
      }),
    );
  }

  // ===== CONNEXION =====

  connect(config?: Partial<ESP32Config>) {
    if (config) {
      this.config = {...DEFAULT_CONFIG, ...config};
    }
    this.shouldReconnect = true;
    this._connect();
  }

  private _connect() {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    this.isConnecting = true;
    const url = `ws://${this.config.ip}:${this.config.port}`;
    console.log('[ESP32] Connexion WebSocket vers', url);

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[ESP32] Connecte!');
        this.isConnecting = false;
        this._startPing();
        this._notifyConnection(true);
      };

      this.ws.onmessage = event => {
        this._handleMessage(event.data);
      };

      this.ws.onerror = error => {
        console.log('[ESP32] Erreur WebSocket:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        console.log('[ESP32] Deconnecte.');
        this.isConnecting = false;
        this._stopPing();
        this._notifyConnection(false);
        if (this.shouldReconnect) {
          this._scheduleReconnect();
        }
      };
    } catch (err) {
      console.log('[ESP32] Erreur creation WebSocket:', err);
      this.isConnecting = false;
      if (this.shouldReconnect) {
        this._scheduleReconnect();
      }
    }
  }
  disconnect() {
    this.shouldReconnect = false;
    this._stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ===== ENVOI DE DONNEES =====

  // Texte simple ou commande JSON
  sendText(text: string): boolean {
    return this._send(JSON.stringify({type: 'text', payload: text}));
  }

  sendCommand(action: string, params?: object): boolean {
    return this._send(
      JSON.stringify({type: 'command', payload: {action, ...params}}),
    );
  }

  // Photo en base64 - envoyee en chunks pour eviter les timeouts
  async sendPhoto(
    base64Data: string,
    filename = 'photo.jpg',
  ): Promise<boolean> {
    const CHUNK_SIZE = 4096; // 4KB par chunk
    const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);
    const transferId = Date.now().toString();

    for (let i = 0; i < totalChunks; i++) {
      const chunk = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const ok = this._send(
        JSON.stringify({
          type: 'photo',
          payload: chunk,
          metadata: {
            filename,
            chunkIndex: i,
            totalChunks,
            transferId,
          },
        }),
      );
      if (!ok) {
        return false;
      }
      // Petite pause pour ne pas saturer le buffer WebSocket
      await new Promise(r => setTimeout(r, 10));
    }
    return true;
  }

  // Audio en streaming - envoie chunk par chunk en temps reel
  sendAudioChunk(pcmData: string, chunkIndex: number): boolean {
    return this._send(
      JSON.stringify({
        type: 'audio',
        payload: pcmData,
        metadata: {chunkIndex},
      }),
    );
  }

  // Fichier generique en chunks
  async sendFile(
    base64Data: string,
    filename: string,
    mimeType: string,
  ): Promise<boolean> {
    const CHUNK_SIZE = 4096;
    const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);
    const transferId = Date.now().toString();

    for (let i = 0; i < totalChunks; i++) {
      const chunk = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const ok = this._send(
        JSON.stringify({
          type: 'file',
          payload: chunk,
          metadata: {
            filename,
            mimeType,
            chunkIndex: i,
            totalChunks,
            transferId,
            size: base64Data.length,
          },
        }),
      );
      if (!ok) {
        return false;
      }
      await new Promise(r => setTimeout(r, 10));
    }
    return true;
  }
  // ===== RECEPTION =====

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler) {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  // ===== PRIVE =====

  private _send(data: string): boolean {
    if (!this.isConnected) {
      console.log('[ESP32] Non connecte, message perdu:', data.slice(0, 50));
      return false;
    }
    try {
      this.ws!.send(data);
      return true;
    } catch (err) {
      console.log('[ESP32] Erreur envoi:', err);
      return false;
    }
  }

  private _handleMessage(raw: string) {
    try {
      const msg: ESP32Message = JSON.parse(raw);

      // Reassemblage des fichiers/photos recus en chunks
      if (
        msg.metadata?.totalChunks &&
        msg.metadata.totalChunks > 1 &&
        msg.metadata.chunkIndex !== undefined
      ) {
        const key = `${msg.type}_${msg.metadata.chunkIndex}`;
        if (!this.fileChunks.has(key)) {
          this.fileChunks.set(
            key,
            new Array(msg.metadata.totalChunks).fill(''),
          );
        }
        const chunks = this.fileChunks.get(key)!;
        chunks[msg.metadata.chunkIndex] = msg.payload as string;

        // Tous les chunks recus ?
        if (chunks.every(c => c !== '')) {
          const complete = {...msg, payload: chunks.join('')};
          this.fileChunks.delete(key);
          this.messageHandlers.forEach(h => h(complete));
        }
        return;
      }

      this.messageHandlers.forEach(h => h(msg));

      // Mode robot : on envoie le message a l'IA et on renvoie la reponse a l'ESP32
      if (
        this._robotMode &&
        this.robotMessageHandler &&
        msg.type !== 'status'
      ) {
        this.robotMessageHandler(msg)
          .then(response => {
            if (response) {
              this.sendResponse(response);
            }
          })
          .catch(err => {
            console.log('[ESP32] Erreur traitement message robot:', err);
          });
      }
    } catch {
      // Message texte brut (non-JSON)
      this.messageHandlers.forEach(h => h({type: 'text', payload: raw}));
    }
  }

  private _startPing() {
    this.pingTimer = setInterval(() => {
      this._send(JSON.stringify({type: 'command', payload: {action: 'ping'}}));
    }, this.config.pingInterval);
  }

  private _stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private _scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      console.log('[ESP32] Tentative de reconnexion...');
      this._connect();
    }, this.config.reconnectDelay);
  }

  private _notifyConnection(connected: boolean) {
    this.connectionHandlers.forEach(h => h(connected));
  }
}

// Singleton global - une seule connexion partagee dans toute l'app
export const esp32Manager = new ESP32Manager();
