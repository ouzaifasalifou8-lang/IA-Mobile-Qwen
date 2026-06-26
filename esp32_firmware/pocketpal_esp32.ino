/*
 * PocketPal AI - Firmware ESP32
 * Compatible avec l'app Android PocketPal AI
 * 
 * Fonctionnalités:
 * - Serveur WebSocket WiFi (port 81)
 * - Serveur BLE UART (Nordic UUID)
 * - Réception messages IA en temps réel
 * - Contrôle LED/relais via commandes
 * 
 * Bibliothèques requises (Gestionnaire de bibliothèques Arduino):
 * - AsyncTCP (par dvarrel)
 * - ESPAsyncWebServer (par lacamera)
 * - ArduinoJson (par bblanchon)
 * - NimBLE-Arduino (par h2zero)
 * 
 * Auteur: OUZAIF - Tahoua, Niger
 */

#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <NimBLEServer.h>
#include <NimBLEUtils.h>

// ============ CONFIGURATION ============
// Mode WiFi: ACCESS_POINT (ESP32 crée son propre réseau)
// ou STATION (ESP32 se connecte à votre box)
#define WIFI_MODE ACCESS_POINT  // Changer en STATION si besoin

// Si mode STATION, entrez vos infos WiFi
const char* WIFI_SSID = "OUZAIF-AI";
const char* WIFI_PASSWORD = "tahoua2024";

// Nom de l'appareil
const char* DEVICE_NAME = "PocketPal-ESP32";

// Pins LED (optionnel)
#define LED_BLEU_PIN 2
#define LED_ROUGE_PIN 4
#define RELAIS_PIN 5

// ============ UUIDs BLE Nordic UART ============
#define SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_UUID_RX "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_UUID_TX "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

// ============ Variables globales ============
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
NimBLEServer* pBleServer = nullptr;
NimBLECharacteristic* pTxCharacteristic = nullptr;
bool bleConnected = false;
bool wifiConnected = false;
String lastAiResponse = "";

// ============ Envoi message à l'app ============
void sendToApp(String type, String payload, String metadata = "{}") {
  // Créer message JSON
  StaticJsonDocument<1024> doc;
  doc["type"] = type;
  doc["payload"] = payload;
  doc["metadata"] = serialized(metadata);
  doc["timestamp"] = millis();
  
  String message;
  serializeJson(doc, message);
  
  // Envoyer via WebSocket WiFi
  if (ws.count() > 0) {
    ws.textAll(message);
  }
  
  // Envoyer via BLE si connecté
  if (bleConnected && pTxCharacteristic) {
    // BLE a une limite de 512 bytes par paquet
    int len = message.length();
    for (int i = 0; i < len; i += 200) {
      String chunk = message.substring(i, min(i + 200, len));
      pTxCharacteristic->setValue(chunk.c_str());
      pTxCharacteristic->notify();
      delay(10);
    }
  }
}

// ============ Traitement des commandes reçues ============
void handleCommand(String jsonStr) {
  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, jsonStr);
  
  if (error) {
    Serial.println("Erreur JSON: " + String(error.c_str()));
    return;
  }
  
  String type = doc["type"] | "text";
  String payload = doc["payload"] | "";
  
  Serial.println("Reçu [" + type + "]: " + payload.substring(0, 50));
  
  if (type == "command") {
    // Commandes de contrôle hardware
    if (payload == "led_bleu_on") {
      digitalWrite(LED_BLEU_PIN, HIGH);
      sendToApp("response", "LED bleue allumée");
    }
    else if (payload == "led_bleu_off") {
      digitalWrite(LED_BLEU_PIN, LOW);
      sendToApp("response", "LED bleue éteinte");
    }
    else if (payload == "led_rouge_on") {
      digitalWrite(LED_ROUGE_PIN, HIGH);
      sendToApp("response", "LED rouge allumée");
    }
    else if (payload == "led_rouge_off") {
      digitalWrite(LED_ROUGE_PIN, LOW);
      sendToApp("response", "LED rouge éteinte");
    }
    else if (payload == "relais_on") {
      digitalWrite(RELAIS_PIN, HIGH);
      sendToApp("response", "Relais activé");
    }
    else if (payload == "relais_off") {
      digitalWrite(RELAIS_PIN, LOW);
      sendToApp("response", "Relais désactivé");
    }
    else if (payload == "status") {
      // Envoyer état de tous les pins
      StaticJsonDocument<256> status;
      status["led_bleu"] = digitalRead(LED_BLEU_PIN);
      status["led_rouge"] = digitalRead(LED_ROUGE_PIN);
      status["relais"] = digitalRead(RELAIS_PIN);
      status["wifi_clients"] = ws.count();
      status["ble_connected"] = bleConnected;
      String statusStr;
      serializeJson(status, statusStr);
      sendToApp("status", statusStr);
    }
    else if (payload == "blink") {
      // Clignoter LED bleue
      for (int i = 0; i < 5; i++) {
        digitalWrite(LED_BLEU_PIN, HIGH); delay(200);
        digitalWrite(LED_BLEU_PIN, LOW); delay(200);
      }
      sendToApp("response", "Clignotement terminé");
    }
  }
  else if (type == "ai_response") {
    // Réponse IA reçue - afficher sur Serial et traiter
    lastAiResponse = payload;
    Serial.println("=== RÉPONSE IA ===");
    Serial.println(payload);
    Serial.println("==================");
    // Ici vous pouvez utiliser la réponse pour contrôler des actionneurs
    // Par exemple: synthèse vocale, affichage LCD, etc.
    sendToApp("ack", "Réponse IA reçue");
  }
  else if (type == "text") {
    // Message texte simple
    Serial.println("Message: " + payload);
    // Echo
    sendToApp("text", "ESP32 reçu: " + payload);
  }
}

// ============ Gestionnaire WebSocket ============
void onWebSocketEvent(AsyncWebSocket* server, AsyncWebSocketClient* client,
                       AwsEventType type, void* arg, uint8_t* data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      Serial.printf("WebSocket client #%u connecté depuis %s\n", 
                    client->id(), client->remoteIP().toString().c_str());
      // Envoyer info de bienvenue
      sendToApp("info", "{"name":"" + String(DEVICE_NAME) + "","version":"1.0","wifi":true}");
      break;
    case WS_EVT_DISCONNECT:
      Serial.printf("WebSocket client #%u déconnecté\n", client->id());
      break;
    case WS_EVT_DATA:
      AwsFrameInfo* info = (AwsFrameInfo*)arg;
      if (info->final && info->index == 0 && info->len == len) {
        if (info->opcode == WS_TEXT) {
          String message = "";
          for (size_t i = 0; i < len; i++) {
            message += (char)data[i];
          }
          handleCommand(message);
        }
      }
      break;
    default:
      break;
  }
}

// ============ Callbacks BLE ============
class BleServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer) {
    bleConnected = true;
    Serial.println("BLE: Client connecté");
    sendToApp("info", "{"ble":true,"name":"" + String(DEVICE_NAME) + ""}");
  }
  void onDisconnect(NimBLEServer* pServer) {
    bleConnected = false;
    Serial.println("BLE: Client déconnecté");
    // Redémarrer l'advertising
    NimBLEDevice::startAdvertising();
  }
};

class BleRxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pCharacteristic) {
    String rxValue = pCharacteristic->getValue().c_str();
    if (rxValue.length() > 0) {
      handleCommand(rxValue);
    }
  }
};

// ============ Setup WiFi ============
void setupWifi() {
  #if WIFI_MODE == ACCESS_POINT
    WiFi.mode(WIFI_AP);
    WiFi.softAP(WIFI_SSID, WIFI_PASSWORD);
    Serial.println("Point d'accès WiFi créé:");
    Serial.println("  SSID: " + String(WIFI_SSID));
    Serial.println("  IP: " + WiFi.softAPIP().toString());
  #else
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connexion WiFi");
    while (WiFi.status() != WL_CONNECTED) {
      delay(500); Serial.print(".");
    }
    Serial.println("\nConnecté! IP: " + WiFi.localIP().toString());
  #endif
  wifiConnected = true;
}

// ============ Setup BLE ============
void setupBLE() {
  NimBLEDevice::init(DEVICE_NAME);
  pBleServer = NimBLEDevice::createServer();
  pBleServer->setCallbacks(new BleServerCallbacks());

  NimBLEService* pService = pBleServer->createService(SERVICE_UUID);

  // Caractéristique TX (envoyer données à l'app)
  pTxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_TX,
    NIMBLE_PROPERTY::NOTIFY
  );

  // Caractéristique RX (recevoir données de l'app)
  NimBLECharacteristic* pRxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_RX,
    NIMBLE_PROPERTY::WRITE
  );
  pRxCharacteristic->setCallbacks(new BleRxCallbacks());

  pService->start();

  NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->start();
  Serial.println("BLE démarré - " + String(DEVICE_NAME));
}

// ============ Setup Serveur Web ============
void setupWebServer() {
  // Route info (pour scan WiFi de l'app)
  server.on("/info", HTTP_GET, [](AsyncWebServerRequest* request) {
    StaticJsonDocument<256> doc;
    doc["name"] = DEVICE_NAME;
    doc["type"] = "esp32";
    doc["version"] = "1.0";
    doc["wifi"] = true;
    doc["ble"] = true;
    String response;
    serializeJson(doc, response);
    request->send(200, "application/json", response);
  });

  // Route status LED
  server.on("/led", HTTP_GET, [](AsyncWebServerRequest* request) {
    String action = request->getParam("action") ? request->getParam("action")->value() : "";
    String pin = request->getParam("pin") ? request->getParam("pin")->value() : "bleu";
    
    int pinNum = (pin == "rouge") ? LED_ROUGE_PIN : LED_BLEU_PIN;
    if (action == "on") digitalWrite(pinNum, HIGH);
    else if (action == "off") digitalWrite(pinNum, LOW);
    
    request->send(200, "text/plain", "OK");
  });

  // WebSocket
  ws.onEvent(onWebSocketEvent);
  server.addHandler(&ws);
  server.begin();
  Serial.println("Serveur Web démarré sur port 80");
}

// ============ SETUP ============
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== PocketPal ESP32 ===");
  
  // Configurer les pins
  pinMode(LED_BLEU_PIN, OUTPUT);
  pinMode(LED_ROUGE_PIN, OUTPUT);
  pinMode(RELAIS_PIN, OUTPUT);
  
  // Signal de démarrage
  digitalWrite(LED_BLEU_PIN, HIGH); delay(500);
  digitalWrite(LED_BLEU_PIN, LOW);
  
  // Démarrer WiFi
  setupWifi();
  
  // Démarrer BLE
  setupBLE();
  
  // Démarrer serveur Web + WebSocket
  setupWebServer();
  
  Serial.println("=== Prêt! ===");
  Serial.println("Connectez l'app PocketPal via WiFi ou Bluetooth");
}

// ============ LOOP ============
void loop() {
  ws.cleanupClients();
  
  // Heartbeat toutes les 30 secondes
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat > 30000) {
    lastHeartbeat = millis();
    sendToApp("heartbeat", String(millis()));
  }
  
  delay(10);
}
