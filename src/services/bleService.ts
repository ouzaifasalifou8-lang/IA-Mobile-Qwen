// Service Bluetooth via react-native-ble-manager
import {NativeEventEmitter, NativeModules, Platform, PermissionsAndroid} from 'react-native';

// Import conditionnel pour éviter les erreurs si le module n'est pas lié
let BleManager: any = null;
let bleEmitter: any = null;

try {
  BleManager = require('react-native-ble-manager').default;
  bleEmitter = new NativeEventEmitter(NativeModules.BleManager);
} catch {
  console.warn('[BLE] react-native-ble-manager non disponible');
}

export interface BLEDevice {
  id: string;
  name: string;
  rssi: number;
}

class BLEService {
  private scanning = false;
  private devices: Map<string, BLEDevice> = new Map();
  private listeners: any[] = [];
  private initialized = false;

  async init(): Promise<boolean> {
    if (!BleManager) return false;
    try {
      await BleManager.start({showAlert: false});
      this.initialized = true;
      return true;
    } catch {
      return false;
    }
  }

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

  async scan(
    duration: number = 5,
    onDeviceFound: (device: BLEDevice) => void
  ): Promise<void> {
    if (!BleManager || !this.initialized) {
      await this.init();
    }
    if (!BleManager) return;

    const ok = await this.requestPermissions();
    if (!ok) return;

    this.devices.clear();
    this.scanning = true;

    // Écouter les appareils découverts
    const discoverListener = bleEmitter?.addListener(
      'BleManagerDiscoverPeripheral',
      (device: any) => {
        const bleDevice: BLEDevice = {
          id: device.id,
          name: device.name || device.advertising?.localName || 'Inconnu',
          rssi: device.rssi || 0,
        };
        this.devices.set(device.id, bleDevice);
        onDeviceFound(bleDevice);
      }
    );

    const stopListener = bleEmitter?.addListener(
      'BleManagerStopScan',
      () => { this.scanning = false; }
    );

    if (discoverListener) this.listeners.push(discoverListener);
    if (stopListener) this.listeners.push(stopListener);

    try {
      await BleManager.scan([], duration, true);
    } catch (e) {
      console.warn('[BLE] Scan failed:', e);
      this.scanning = false;
    }
  }

  async stopScan(): Promise<void> {
    if (!BleManager) return;
    try {
      await BleManager.stopScan();
      this.scanning = false;
    } catch {}
  }

  async connect(deviceId: string): Promise<boolean> {
    if (!BleManager) return false;
    try {
      await BleManager.connect(deviceId);
      await BleManager.retrieveServices(deviceId);
      return true;
    } catch (e) {
      console.warn('[BLE] Connect failed:', e);
      return false;
    }
  }

  async disconnect(deviceId: string): Promise<void> {
    if (!BleManager) return;
    try {
      await BleManager.disconnect(deviceId);
    } catch {}
  }

  async write(
    deviceId: string,
    serviceUUID: string,
    characteristicUUID: string,
    data: number[]
  ): Promise<boolean> {
    if (!BleManager) return false;
    try {
      await BleManager.write(deviceId, serviceUUID, characteristicUUID, data);
      return true;
    } catch {
      return false;
    }
  }

  // Envoyer du texte via UART Nordic
  async sendText(deviceId: string, text: string): Promise<boolean> {
    const SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    const TX_CHAR = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
    const bytes = Array.from(new TextEncoder().encode(text));
    return this.write(deviceId, SERVICE, TX_CHAR, bytes);
  }

  isScanning(): boolean { return this.scanning; }

  getDevices(): BLEDevice[] {
    return Array.from(this.devices.values());
  }

  destroy() {
    this.listeners.forEach(l => l?.remove());
    this.listeners = [];
  }
}

export const bleService = new BLEService();
