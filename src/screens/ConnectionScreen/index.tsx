import React, {useState, useEffect} from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react';
import {useTheme} from '../../hooks';
import {connectionStore, DeviceInfo} from '../../services/connection/connectionStore';

export const ConnectionScreen: React.FC = observer(() => {
  const theme = useTheme();
  const [customIp, setCustomIp] = useState('192.168.4.1');
  const [customPort, setCustomPort] = useState('80');
  const [showCustom, setShowCustom] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const unsub = connectionStore.onMessage(msg => {
      setMessages(prev => [...prev.slice(-20), `[${msg.sender}] ${msg.payload}`]);
    });
    return unsub;
  }, []);

  const handleScan = async () => {
    await connectionStore.scanWifi();
  };

  const handleConnect = async (device: DeviceInfo) => {
    if (device.type === 'bluetooth') {
      await connectionStore.connectBluetooth(device);
    } else {
      await connectionStore.connect(device);
    }
    if (connectionStore.status === 'connected') {
      Alert.alert('Connecte!', `Connecte a ${device.name}`);
    } else {
      Alert.alert('Erreur', connectionStore.error || 'Connexion echouee');
    }
  };

  const handleConnectCustom = async () => {
    if (!customIp.trim()) return;
    const device: DeviceInfo = {
      id: `${customIp}:${customPort}`,
      name: `Appareil ${customIp}`,
      address: `${customIp}:${customPort}`,
      type: 'wifi',
    };
    await handleConnect(device);
  };

  const handleDisconnect = () => {
    connectionStore.disconnect();
  };

  const handleSendTest = () => {
    const sent = connectionStore.send('text', 'Test depuis PocketPal AI');
    if (!sent) Alert.alert('Erreur', 'Non connecte');
  };

  const statusColor = {
    disconnected: '#888',
    scanning: '#ffaa00',
    connecting: '#ffaa00',
    connected: '#00cc66',
    error: '#ff4444',
  }[connectionStore.status];

  const statusLabel = {
    disconnected: 'Deconnecte',
    scanning: 'Scan en cours...',
    connecting: 'Connexion...',
    connected: `Connecte - ${connectionStore.connectedDevice?.name}`,
    error: `Erreur: ${connectionStore.error}`,
  }[connectionStore.status];

  return (
    <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
      {/* Status Bar */}
      <View style={[styles.statusBar, {backgroundColor: statusColor + '22', borderColor: statusColor}]}>
        <View style={[styles.statusDot, {backgroundColor: statusColor}]} />
        <Text style={[styles.statusText, {color: statusColor}]}>{statusLabel}</Text>
        {(connectionStore.status === 'scanning' || connectionStore.status === 'connecting') && (
          <ActivityIndicator size="small" color={statusColor} style={{marginLeft: 8}} />
        )}
      </View>

      <ScrollView style={styles.scroll}>
        {/* Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, {color: theme.colors.onSurfaceVariant}]}>
            CONNEXION WIFI
          </Text>

          {connectionStore.status !== 'connected' ? (
            <>
              <TouchableOpacity
                style={[styles.btn, {backgroundColor: theme.colors.primary}]}
                onPress={handleScan}
                disabled={connectionStore.status === 'scanning'}>
                <Text style={[styles.btnText, {color: theme.colors.onPrimary}]}>
                  📡 Scanner le reseau WiFi local
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, {backgroundColor: '#1a3a6a'}]}
                onPress={() => connectionStore.scanBluetooth()}
                disabled={connectionStore.status === 'scanning'}>
                <Text style={[styles.btnText, {color: '#4488ff'}]}>
                  🔵 Scanner Bluetooth (5 sec)
                </Text>
              </TouchableOpacity>

              {/* Connexion manuelle */}
              <TouchableOpacity
                onPress={() => setShowCustom(!showCustom)}
                style={[styles.btn, {backgroundColor: theme.colors.surfaceVariant}]}>
                <Text style={{color: theme.colors.onSurfaceVariant, fontWeight: 'bold'}}>
                  ✏️ Entrer une adresse manuellement
                </Text>
              </TouchableOpacity>

              {showCustom && (
                <View style={styles.customContainer}>
                  <View style={{flexDirection: 'row', gap: 8}}>
                    <TextInput
                      style={[styles.input, {flex: 3, backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurface}]}
                      value={customIp}
                      onChangeText={setCustomIp}
                      placeholder="192.168.4.1"
                      placeholderTextColor={theme.colors.onSurfaceVariant}
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[styles.input, {flex: 1, backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurface}]}
                      value={customPort}
                      onChangeText={setCustomPort}
                      placeholder="80"
                      placeholderTextColor={theme.colors.onSurfaceVariant}
                      keyboardType="numeric"
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.btn, {backgroundColor: theme.colors.primary}]}
                    onPress={handleConnectCustom}>
                    <Text style={[styles.btnText, {color: theme.colors.onPrimary}]}>
                      🔌 Connecter
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <View style={{gap: 8}}>
              <TouchableOpacity
                style={[styles.btn, {backgroundColor: '#1a472a'}]}
                onPress={handleSendTest}>
                <Text style={[styles.btnText, {color: '#00ff88'}]}>
                  📤 Envoyer message test
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, {backgroundColor: theme.colors.errorContainer}]}
                onPress={handleDisconnect}>
                <Text style={[styles.btnText, {color: theme.colors.error}]}>
                  ❌ Deconnecter
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Appareils trouvés */}
        {connectionStore.devices.length > 0 && connectionStore.status !== 'connected' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, {color: theme.colors.onSurfaceVariant}]}>
              APPAREILS TROUVES ({connectionStore.devices.length})
            </Text>
            {connectionStore.devices.map(device => (
              <TouchableOpacity
                key={device.id}
                style={[styles.deviceCard, {backgroundColor: theme.colors.surfaceVariant}]}
                onPress={() => handleConnect(device)}>
                <View style={styles.deviceRow}>
                  <Text style={{fontSize: 20}}>{device.type === 'wifi' ? '📶' : '🔵'}</Text>
                  <View style={{flex: 1, marginLeft: 8}}>
                    <Text style={[styles.deviceName, {color: theme.colors.onSurface}]}>
                      {device.name}
                    </Text>
                    <Text style={[styles.deviceAddr, {color: theme.colors.onSurfaceVariant}]}>
                      {device.address}
                      {device.rssi ? ` • Signal: ${device.rssi} dBm` : ''}
                    </Text>
                  </View>
                  <Text style={{color: theme.colors.primary, fontWeight: 'bold'}}>→</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Messages reçus */}
        {messages.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, {color: theme.colors.onSurfaceVariant}]}>
              MESSAGES RECUS
            </Text>
            {messages.map((msg, i) => (
              <View key={i} style={[styles.msgCard, {backgroundColor: theme.colors.surfaceVariant}]}>
                <Text style={{color: theme.colors.onSurface, fontSize: 12}}>{msg}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Info protocole */}
        <View style={[styles.section, {backgroundColor: theme.colors.surfaceVariant, borderRadius: 8, padding: 12}]}>
          <Text style={[styles.sectionTitle, {color: theme.colors.onSurfaceVariant}]}>
            PROTOCOLE SUPPORTE
          </Text>
          {['💬 Texte en temps reel', '🤖 Reponses IA automatiques', '📁 Transfert de fichiers', '🎵 Audio (base64)', '📹 Video (base64)', '⚡ Commandes ESP32', '🔵 BLE UART (Nordic UUID)'].map((item, i) => (
            <Text key={i} style={{color: theme.colors.onSurface, fontSize: 13, marginVertical: 2}}>
              {item}
            </Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {flex: 1},
  scroll: {flex: 1, padding: 16},
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    margin: 16,
    marginBottom: 0,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: {width: 10, height: 10, borderRadius: 5, marginRight: 8},
  statusText: {flex: 1, fontWeight: 'bold', fontSize: 13},
  section: {marginBottom: 20},
  sectionTitle: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  btn: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnText: {fontWeight: 'bold', fontSize: 14},
  customContainer: {gap: 8},
  input: {
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    marginBottom: 4,
  },
  deviceCard: {padding: 12, borderRadius: 8, marginBottom: 8},
  deviceRow: {flexDirection: 'row', alignItems: 'center'},
  deviceName: {fontWeight: 'bold', fontSize: 14},
  deviceAddr: {fontSize: 12},
  msgCard: {padding: 8, borderRadius: 6, marginBottom: 4},
});
