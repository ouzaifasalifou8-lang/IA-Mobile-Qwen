# PocketPal ESP32 Firmware

## Installation

1. Ouvrir Arduino IDE
2. Installer les bibliothèques (Outils > Gérer les bibliothèques):
   - AsyncTCP
   - ESPAsyncWebServer  
   - ArduinoJson
   - NimBLE-Arduino

3. Sélectionner carte: ESP32 Dev Module
4. Téléverser le fichier pocketpal_esp32.ino

## Connexion depuis l'app

### WiFi (Access Point):
- Connecter votre téléphone au WiFi: OUZAIF-AI
- Mot de passe: tahoua2024
- Dans l'app > Connexion > Scanner WiFi
- Ou entrer manuellement: 192.168.4.1:80

### Bluetooth:
- Dans l'app > Connexion > Scanner Bluetooth
- Sélectionner "PocketPal-ESP32"

## Commandes supportées

| Commande | Action |
|----------|--------|
| led_bleu_on/off | LED bleue |
| led_rouge_on/off | LED rouge |
| relais_on/off | Relais |
| blink | Clignoter LED bleue |
| status | État de tous les pins |

## Auteur
OUZAIF - Tahoua, Niger
