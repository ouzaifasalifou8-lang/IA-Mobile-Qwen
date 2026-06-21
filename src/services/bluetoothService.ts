import { Platform } from 'react-native';
import BluetoothSerial from 'react-native-bluetooth-serial';

export interface BluetoothDevice {
  id: string;
  name: string;
}

class BluetoothService {
  private isEnabled = false;
  private isConnected = false;

  // Initialiser le Bluetooth
  async init(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const granted = await BluetoothSerial.requestPermission();
        if (!granted) {
          console.log('Permission Bluetooth refusée');
          return false;
        }
      }
      
      const enabled = await BluetoothSerial.isEnabled();
      if (!enabled) {
        await BluetoothSerial.enable();
      }
      
      this.isEnabled = true;
      console.log('✅ Bluetooth initialisé');
      return true;
    } catch (error) {
      console.error('Erreur init Bluetooth:', error);
      return false;
    }
  }

  // Scanne les appareils Bluetooth
  async scanDevices(): Promise<BluetoothDevice[]> {
    try {
      const devices = await BluetoothSerial.list();
      return devices.map(d => ({
        id: d.id,
        name: d.name || d.id,
      }));
    } catch (error) {
      console.error('Erreur scan Bluetooth:', error);
      return [];
    }
  }

  // Se connecter à un appareil
  async connect(deviceId: string): Promise<boolean> {
    try {
      await BluetoothSerial.connect(deviceId);
      this.isConnected = true;
      console.log('✅ Connecté à', deviceId);
      
      // Écouter les messages
      BluetoothSerial.on('data', (data) => {
        this.handleData(data);
      });
      
      return true;
    } catch (error) {
      console.error('Erreur connexion Bluetooth:', error);
      this.isConnected = false;
      return false;
    }
  }

  // Déconnecter
  disconnect(): void {
    BluetoothSerial.disconnect();
    this.isConnected = false;
    BluetoothSerial.removeAllListeners('data');
  }

  // Envoyer des données
  async send(data: string): Promise<boolean> {
    if (!this.isConnected) {
      console.log('❌ Non connecté');
      return false;
    }
    try {
      await BluetoothSerial.write(data);
      return true;
    } catch (error) {
      console.error('Erreur envoi:', error);
      return false;
    }
  }

  // Envoyer un message JSON
  async sendMessage(type: string, payload: any): Promise<boolean> {
    const msg = JSON.stringify({ type, payload, timestamp: Date.now() });
    return this.send(msg + '\n');
  }

  // Gestionnaire de données reçues
  private handleData(data: any) {
    try {
      // Le data peut être un Buffer ou string
      const text = typeof data === 'string' ? data : data.toString();
      console.log('📩 Recu:', text);
      
      // Essayer de parser en JSON
      try {
        const msg = JSON.parse(text);
        this.onMessageReceived(msg);
      } catch {
        // C'est du texte brut
        this.onMessageReceived({ type: 'text', payload: text });
      }
    } catch (error) {
      console.error('Erreur traitement données:', error);
    }
  }

  // Callback pour les messages reçus
  private messageHandler: ((msg: any) => void) | null = null;

  onMessage(handler: (msg: any) => void): void {
    this.messageHandler = handler;
  }

  private onMessageReceived(msg: any): void {
    if (this.messageHandler) {
      this.messageHandler(msg);
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get enabled(): boolean {
    return this.isEnabled;
  }
}

export const bluetoothService = new BluetoothService();
