/**
 * ESP32Manager - Gestionnaire de communication Bluetooth avec l'ESP32
 * Supporte: texte/commandes, photos, audio, fichiers, video
 * Protocol: Bluetooth Serial (RFCOMM)
 */

import { bluetoothService } from '../bluetoothService';

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
  deviceId?: string;
  reconnectDelay: number;
}

const DEFAULT_CONFIG: ESP32Config = {
  deviceId: '', // À définir après scan
  reconnectDelay: 3000,
};

class ESP32Manager {
  private config: ESP32Config = DEFAULT_CONFIG;
  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private shouldReconnect = false;
  private _robotMode = false;
  private robotMessageHandler: ((msg: ESP32Message) => Promise<string>) | null = null;
  private _isConnected = false;

  constructor() {
    // Initialiser le service Bluetooth
    bluetoothService.init();
    
    // Écouter les messages Bluetooth
    bluetoothService.onMessage((msg) => {
      this._handleMessage(msg);
    });
  }

  // ===== CONNEXION =====

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(config?: Partial<ESP32Config>): Promise<boolean> {
    if (this.isConnected) return true;
    
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Si pas de deviceId, on scanne
    if (!this.config.deviceId) {
      console.log('[ESP32] Scan des appareils Bluetooth...');
      const devices = await bluetoothService.scanDevices();
      console.log('[ESP32] Appareils trouvés:', devices);
      
      // Chercher un ESP32
      const esp32 = devices.find(d => 
        d.name.toLowerCase().includes('esp32') || 
        d.name.toLowerCase().includes('ouzaif')
      );
      
      if (esp32) {
        this.config.deviceId = esp32.id;
        console.log('[ESP32] ESP32 trouvé:', esp32.name);
      } else {
        console.log('[ESP32] Aucun ESP32 trouvé');
        return false;
      }
    }

    this.isConnecting = true;
    const connected = await bluetoothService.connect(this.config.deviceId);
    this.isConnecting = false;
    
    if (connected) {
      this._isConnected = true;
      this._notifyConnection(true);
      console.log('[ESP32] ✅ Connecté en Bluetooth');
      
      // Envoyer un message de bienvenue
      bluetoothService.sendMessage('status', { status: 'connected' });
    }
    
    return connected;
  }

  disconnect() {
    bluetoothService.disconnect();
    this._isConnected = false;
    this._notifyConnection(false);
    console.log('[ESP32] Déconnecté');
  }

  // ===== ENVOI =====

  sendResponse(text: string): boolean {
    return bluetoothService.sendMessage('response', { text });
  }

  sendCommand(command: string, params?: any): boolean {
    return bluetoothService.sendMessage('command', { action: command, params });
  }

  sendPhoto(base64Data: string): boolean {
    return bluetoothService.sendMessage('photo', { data: base64Data });
  }

  private _send(data: string): boolean {
    return bluetoothService.send(data);
  }

  // ===== MODE ROBOT =====

  get robotMode(): boolean {
    return this._robotMode;
  }

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

  // ===== HANDLERS =====

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  // ===== PRIVE =====

  private _handleMessage(raw: any) {
    try {
      const msg = raw.type ? raw : { type: 'text', payload: raw };
      
      // Si c'est une commande
      if (msg.type === 'command') {
        console.log('[ESP32] Commande reçue:', msg.payload);
      }
      
      this.messageHandlers.forEach(h => h(msg));

      // Mode robot
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
    } catch (error) {
      console.log('[ESP32] Erreur traitement message:', error);
    }
  }

  private _notifyConnection(connected: boolean) {
    this.connectionHandlers.forEach(h => h(connected));
  }
}

// Singleton
export const esp32Manager = new ESP32Manager();
