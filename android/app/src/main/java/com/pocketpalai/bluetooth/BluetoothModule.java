package com.pocketpalai.bluetooth;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;

import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

public class BluetoothModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "BluetoothModule";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothSocket socket;
    private OutputStream outputStream;
    private InputStream inputStream;
    private Thread readThread;
    private ReactApplicationContext reactContext;

    public BluetoothModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
    }

    @Override
    public String getName() { return MODULE_NAME; }

    // Scanner les appareils couplés
    @ReactMethod
    public void getPairedDevices(Promise promise) {
        if (bluetoothAdapter == null) {
            promise.reject("BT_ERROR", "Bluetooth non disponible");
            return;
        }
        WritableArray devices = Arguments.createArray();
        Set<BluetoothDevice> paired = bluetoothAdapter.getBondedDevices();
        for (BluetoothDevice device : paired) {
            WritableMap map = Arguments.createMap();
            map.putString("id", device.getAddress());
            map.putString("name", device.getName() != null ? device.getName() : "Inconnu");
            map.putString("address", device.getAddress());
            devices.pushMap(map);
        }
        promise.resolve(devices);
    }

    // Démarrer le scan
    @ReactMethod
    public void startScan(Promise promise) {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            promise.reject("BT_ERROR", "Bluetooth désactivé");
            return;
        }
        bluetoothAdapter.startDiscovery();
        
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (BluetoothDevice.ACTION_FOUND.equals(intent.getAction())) {
                    BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    int rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE);
                    if (device != null) {
                        WritableMap map = Arguments.createMap();
                        map.putString("id", device.getAddress());
                        map.putString("name", device.getName() != null ? device.getName() : "Inconnu");
                        map.putString("address", device.getAddress());
                        map.putInt("rssi", rssi);
                        sendEvent("BLEDeviceFound", map);
                    }
                }
            }
        };
        IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
        reactContext.registerReceiver(receiver, filter);
        promise.resolve(true);
    }

    // Connecter à un appareil via SPP (Serial Port Profile)
    @ReactMethod
    public void connect(String address, Promise promise) {
        try {
            BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
            bluetoothAdapter.cancelDiscovery();
            socket.connect();
            outputStream = socket.getOutputStream();
            inputStream = socket.getInputStream();
            startReading();
            promise.resolve(true);
        } catch (IOException e) {
            promise.reject("CONNECT_ERROR", e.getMessage());
        }
    }

    // Envoyer des données
    @ReactMethod
    public void write(String data, Promise promise) {
        if (outputStream == null) {
            promise.reject("NOT_CONNECTED", "Non connecté");
            return;
        }
        try {
            outputStream.write(data.getBytes());
            promise.resolve(true);
        } catch (IOException e) {
            promise.reject("WRITE_ERROR", e.getMessage());
        }
    }

    // Déconnecter
    @ReactMethod
    public void disconnect(Promise promise) {
        try {
            if (socket != null) socket.close();
            promise.resolve(true);
        } catch (IOException e) {
            promise.reject("DISCONNECT_ERROR", e.getMessage());
        }
    }

    private void startReading() {
        readThread = new Thread(() -> {
            byte[] buffer = new byte[1024];
            int bytes;
            while (true) {
                try {
                    bytes = inputStream.read(buffer);
                    String data = new String(buffer, 0, bytes);
                    WritableMap map = Arguments.createMap();
                    map.putString("data", data);
                    sendEvent("BLEDataReceived", map);
                } catch (IOException e) {
                    break;
                }
            }
        });
        readThread.start();
    }

    private void sendEvent(String eventName, WritableMap params) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, params);
    }
}
