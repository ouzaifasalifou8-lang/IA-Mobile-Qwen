import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useESP32 } from '../hooks/useESP32';

export const ESP32Controls: React.FC = () => {
  const esp32 = useESP32();

  const handleTestConnection = async () => {
    const connected = await esp32.testConnection();
    Alert.alert(
      connected ? '✅ Robot connecté !' : '❌ Robot non trouvé',
      connected 
        ? 'L\'ESP32 est prêt à recevoir des commandes.' 
        : 'Vérifiez que l\'ESP32 est allumé et connecté au réseau.'
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🤖 Robot ESP32</Text>
        <TouchableOpacity 
          style={[styles.testButton, esp32.isConnected ? styles.connected : styles.disconnected]} 
          onPress={handleTestConnection}
        >
          <Text style={styles.testButtonText}>
            {esp32.isConnected ? '✅ Connecté' : '🔌 Tester'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity 
          style={styles.ledButton}
          onPress={() => esp32.controlLED('bleu', 'on')}
        >
          <Text style={styles.ledButtonText}>💙 ON</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.ledButton, styles.ledOffButton]}
          onPress={() => esp32.controlLED('bleu', 'off')}
        >
          <Text style={styles.ledButtonText}>💙 OFF</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.ledButton, styles.redButton]}
          onPress={() => esp32.controlLED('rouge', 'on')}
        >
          <Text style={styles.ledButtonText}>❤️ ON</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.ledButton, styles.redButton, styles.ledOffButton]}
          onPress={() => esp32.controlLED('rouge', 'off')}
        >
          <Text style={styles.ledButtonText}>❤️ OFF</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity 
          style={[styles.ledButton, styles.clignoterButton]}
          onPress={() => esp32.controlLED('all', 'clignoter')}
        >
          <Text style={styles.ledButtonText}>✨ Clignoter</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.ledButton, styles.stopButton]}
          onPress={() => esp32.controlLED('all', 'stop')}
        >
          <Text style={styles.ledButtonText}>⏹ Stop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    margin: 16,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#00ff88',
    fontSize: 16,
    fontWeight: 'bold',
  },
  testButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  connected: {
    backgroundColor: '#1a472a',
  },
  disconnected: {
    backgroundColor: '#333',
  },
  testButtonText: {
    color: '#fff',
    fontSize: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  ledButton: {
    flex: 1,
    backgroundColor: '#003366',
    padding: 10,
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  ledOffButton: {
    backgroundColor: '#001122',
  },
  redButton: {
    backgroundColor: '#330000',
  },
  clignoterButton: {
    backgroundColor: '#332200',
  },
  stopButton: {
    backgroundColor: '#222',
  },
  ledButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
