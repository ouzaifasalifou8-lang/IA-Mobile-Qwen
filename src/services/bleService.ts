// Service Bluetooth via module natif Android custom
import {NativeModules, NativeEventEmitter, Platform, PermissionsAndroid} from 'react-native';

const {BluetoothModule} = NativeModules;
const bleEmitter = BluetoothModule ? new NativeEventEmitter(BluetoothModule) : null;

export interface BLEDevice {
  id: string;
  name: string;
  address: string;
  rssi?: number;
}

class BLEService {
  private listeners: any[] = [];
  private connectedId: string | null = null;

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const grants = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(grants).every(
        r => r === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch {
      return false;
    }
  }

  // Obtenir les appareils déjà couplés
  async getPairedDevices(): Promise<BLEDevice[]> {
    if (!BluetoothModule) return [];
    try {
      const devices = await BluetoothModule.getPairedDevices();
      return devices || [];
    } catch {
      return [];
    }
  }

  // Scanner les appareils Bluetooth
  async scan(
    duration: number = 5000,
    onDeviceFound: (device: BLEDevice) => void
  ): Promise<void> {
    if (!BluetoothModule) {
      console.warn('[BLE] Module natif non disponible');
      return;
    }

    const ok = await this.requestPermissions();
    if (!ok) return;

    // Écouter les appareils découverts
    const listener = bleEmitter?.addListener('BLEDeviceFound', (device: BLEDevice) => {
      onDeviceFound(device);
    });
    if (listener) this.listeners.push(listener);

    try {
      await BluetoothModule.startScan();
      // Arrêter après duration ms
      setTimeout(() => this.stopScan(), duration);
    } catch (e) {
      console.warn('[BLE] Scan failed:', e);
    }
  }

  async stopScan(): Promise<void> {
    this.listeners.forEach(l => l?.remove());
    this.listeners = [];
  }

  async connect(deviceId: string): Promise<boolean> {
    if (!BluetoothModule) return false;
    try {
      await BluetoothModule.connect(deviceId);
      this.connectedId = deviceId;
      return true;
    } catch (e) {
      console.warn('[BLE] Connect failed:', e);
      return false;
    }
  }

  async disconnect(deviceId?: string): Promise<void> {
    if (!BluetoothModule) return;
    try {
      await BluetoothModule.disconnect();
      this.connectedId = null;
    } catch {}
  }

  async sendText(text: string): Promise<boolean> {
    if (!BluetoothModule || !this.connectedId) return false;
    try {
      await BluetoothModule.write(text);
      return true;
    } catch {
      return false;
    }
  }

  onDataReceived(callback: (data: string) => void): () => void {
    const listener = bleEmitter?.addListener('BLEDataReceived', ({data}: {data: string}) => {
      callback(data);
    });
    if (listener) this.listeners.push(listener);
    return () => listener?.remove();
  }

  isConnected(): boolean {
    return this.connectedId !== null;
  }

  getConnectedId(): string | null {
    return this.connectedId;
  }
}

export const bleService = new BLEService();
