import React, {useState} from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {Text} from 'react-native-paper';
import {observer} from 'mobx-react';
import {apiStore, ApiProvider, ChatMode, CustomProviderConfig} from '../../store';
import {useTheme} from '../../hooks';

const PROVIDERS: {id: ApiProvider; label: string; url: string}[] = [
  {id: 'openai', label: 'OpenAI (ChatGPT)', url: 'https://api.openai.com/v1'},
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    url: 'https://api.anthropic.com/v1',
  },
  {
    id: 'groq',
    label: 'Groq (Rapide & Gratuit)',
    url: 'https://api.groq.com/openai/v1',
  },
  {id: 'mistral', label: 'Mistral AI', url: 'https://api.mistral.ai/v1'},
  {id: 'together', label: 'Together AI', url: 'https://api.together.xyz/v1'},
  {id: 'custom', label: 'API Personnalisee', url: ''},
];

export const ApiSettingsScreen: React.FC = observer(() => {
  const theme = useTheme();
  const [selectedProvider, setSelectedProvider] = useState<ApiProvider>(
    apiStore.selectedProvider,
  );
  const [apiKey, setApiKey] = useState(
    apiStore.configs[selectedProvider]?.apiKey || '',
  );
  const [customUrl, setCustomUrl] = useState(
    apiStore.configs[selectedProvider]?.baseUrl || '',
  );
  const [customModel, setCustomModel] = useState(
    apiStore.configs[selectedProvider]?.model || '',
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderLabel, setNewProviderLabel] = useState('');
  const [newProviderUrl, setNewProviderUrl] = useState('');
  const [newProviderModel, setNewProviderModel] = useState('');
  const [newProviderFormat, setNewProviderFormat] = useState<'openai' | 'anthropic' | 'auto'>('auto');
  const currentMode = apiStore.chatMode;

  const handleSelectProvider = (p: ApiProvider) => {
    setSelectedProvider(p);
    apiStore.setProvider(p);
    setApiKey(apiStore.configs[p]?.apiKey || '');
    setCustomUrl(apiStore.configs[p]?.baseUrl || '');
    setCustomModel(apiStore.configs[p]?.model || '');
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer une cle API.');
      return;
    }
    setSaving(true);
    const url = selectedProvider === 'custom' ? customUrl : undefined;
    const model = selectedProvider === 'custom' ? customModel : undefined;
    const ok = await apiStore.saveApiKey(
      selectedProvider,
      apiKey.trim(),
      model,
      url,
    );
    setSaving(false);
    if (ok) {
      Alert.alert('Succes', 'Cle API sauvegardee!');
    } else {
      Alert.alert('Erreur', 'Impossible de sauvegarder.');
    }
  };

  const handleDelete = () => {
    Alert.alert('Supprimer', 'Confirmer la suppression?', [
      {text: 'Annuler', style: 'cancel'},
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await apiStore.deleteApiKey(selectedProvider);
          setApiKey('');
        },
      },
    ]);
  };

  const handleAddProvider = () => {
    if (!newProviderLabel.trim() || !newProviderUrl.trim()) {
      Alert.alert('Erreur', 'Nom et URL requis.');
      return;
    }
    const id = 'custom_' + Date.now();
    const config: CustomProviderConfig = {
      id,
      label: newProviderLabel.trim(),
      baseUrl: newProviderUrl.trim(),
      model: newProviderModel.trim() || 'default',
      apiKeyRequired: true,
      format: newProviderFormat,
    };
    apiStore.addCustomProvider(config);
    handleSelectProvider(id as ApiProvider);
    setShowAddProvider(false);
    setNewProviderLabel('');
    setNewProviderUrl('');
    setNewProviderModel('');
    Alert.alert('Succès', 'Provider ajouté ! Entrez votre clé API.');
  };

  const handleFetchModels = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Erreur', 'Entrez une cle API dabord.');
      return;
    }
    setLoadingModels(true);
    await apiStore.saveApiKey(selectedProvider, apiKey.trim(), customModel || undefined, customUrl || undefined);
    const list = await apiStore.fetchModels(selectedProvider);
    setModels(list);
    setLoadingModels(false);
    if (list.length === 0) {
      Alert.alert('Info', 'Aucun modele trouve ou API non compatible.');
    }
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Erreur', 'Entrez une cle API dabord.');
      return;
    }
    setTesting(true);
    setTestResult('');
    try {
      await apiStore.saveApiKey(selectedProvider, apiKey.trim(), customModel || undefined, customUrl || undefined);
      const result = await apiStore.sendToApi([
        {role: 'user', content: 'Dis juste "OK" en un mot.'},
      ]);
      setTestResult('✅ ' + result.slice(0, 100));
    } catch (e: any) {
      setTestResult('❌ ' + (e?.message || 'Erreur inconnue'));
    } finally {
      setTesting(false);
    }
  };

  const setMode = (mode: ChatMode) => apiStore.setChatMode(mode);

  return (
    <View
      style={[styles.container, {backgroundColor: theme.colors.background}]}>
      <ScrollView style={styles.scroll}>
        {/* MODE */}
        <View style={styles.section}>
          <Text style={[styles.title, {color: theme.colors.onSurface}]}>
            Mode de Chat
          </Text>
          <View style={styles.modeRow}>
            {(['local', 'api', 'hybrid'] as ChatMode[]).map(mode => (
              <TouchableOpacity
                key={mode}
                onPress={() => setMode(mode)}
                style={[
                  styles.modeBtn,
                  {
                    backgroundColor:
                      currentMode === mode
                        ? theme.colors.primary
                        : theme.colors.surfaceVariant,
                  },
                ]}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: 'bold',
                    color:
                      currentMode === mode
                        ? theme.colors.onPrimary
                        : theme.colors.onSurfaceVariant,
                  }}>
                  {mode === 'local'
                    ? '🤖 Local'
                    : mode === 'api'
                      ? '🌐 API'
                      : '⚡ Hybride'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.tip, {color: theme.colors.onSurfaceVariant}]}>
            {currentMode === 'local' &&
              "Qwen2 tourne sur votre telephone. Pas d'internet requis."}
            {currentMode === 'api' &&
              "Vos messages sont envoyes a l'API. Internet requis."}
            {currentMode === 'hybrid' &&
              "Qwen2 repond d'abord, l'API enrichit ensuite."}
          </Text>
        </View>

        {/* PROVIDERS */}
        <View style={styles.section}>
          <Text
            style={[styles.subtitle, {color: theme.colors.onSurfaceVariant}]}>
            Fournisseur API
          </Text>
          {[...PROVIDERS, ...apiStore.customProviders.map(cp => ({id: cp.id as ApiProvider, label: cp.label, url: cp.baseUrl}))].map(p => (
            <TouchableOpacity
              key={p.id}
              onPress={() => handleSelectProvider(p.id)}
              style={[
                styles.provCard,
                {
                  backgroundColor:
                    selectedProvider === p.id
                      ? theme.colors.primaryContainer
                      : theme.colors.surfaceVariant,
                  borderWidth: selectedProvider === p.id ? 2 : 0,
                  borderColor: theme.colors.primary,
                },
              ]}>
              <View style={styles.provRow}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: 'bold',
                    color:
                      selectedProvider === p.id
                        ? theme.colors.onPrimaryContainer
                        : theme.colors.onSurfaceVariant,
                    flex: 1,
                  }}>
                  {p.label}
                </Text>
                {apiStore.configs[p.id]?.apiKey && (
                  <View style={styles.dotGreen} />
                )}
              </View>
              <Text
                style={[
                  styles.provUrl,
                  {color: theme.colors.onSurfaceVariant},
                ]}>
                {p.url || 'URL personnalisee'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* AJOUTER PROVIDER */}
        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => setShowAddProvider(!showAddProvider)}
            style={[styles.modeBtn, {flex: 0, paddingHorizontal: 16, backgroundColor: theme.colors.surfaceVariant}]}>
            <Text style={{color: theme.colors.onSurfaceVariant, fontWeight: 'bold'}}>
              {showAddProvider ? '✕ Annuler' : '＋ Ajouter une API personnalisée'}
            </Text>
          </TouchableOpacity>

          {showAddProvider && (
            <View style={{marginTop: 12}}>
              <Text style={[styles.label, {color: theme.colors.onSurfaceVariant}]}>Nom du provider</Text>
              <TextInput
                style={[styles.input, {backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurface}]}
                value={newProviderLabel}
                onChangeText={setNewProviderLabel}
                placeholder="Ex: Mon API locale"
                placeholderTextColor={theme.colors.onSurfaceVariant}
              />
              <Text style={[styles.label, {color: theme.colors.onSurfaceVariant}]}>URL de base</Text>
              <TextInput
                style={[styles.input, {backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurface}]}
                value={newProviderUrl}
                onChangeText={setNewProviderUrl}
                placeholder="http://192.168.1.100:11434/v1"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                autoCapitalize="none"
              />
              <Text style={[styles.label, {color: theme.colors.onSurfaceVariant}]}>Modèle par défaut</Text>
              <TextInput
                style={[styles.input, {backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurface}]}
                value={newProviderModel}
                onChangeText={setNewProviderModel}
                placeholder="llama3, gpt-4, mistral..."
                placeholderTextColor={theme.colors.onSurfaceVariant}
                autoCapitalize="none"
              />
              <Text style={[styles.label, {color: theme.colors.onSurfaceVariant}]}>Format API</Text>
              <View style={{flexDirection: 'row', gap: 8, marginBottom: 10}}>
                {(['auto', 'openai', 'anthropic'] as const).map(f => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setNewProviderFormat(f)}
                    style={[styles.modeBtn, {flex: 1, backgroundColor: newProviderFormat === f ? theme.colors.primary : theme.colors.surfaceVariant}]}>
                    <Text style={{fontSize: 11, color: newProviderFormat === f ? theme.colors.onPrimary : theme.colors.onSurfaceVariant}}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, {backgroundColor: theme.colors.primary}]}
                onPress={handleAddProvider}>
                <Text style={[styles.saveTxt, {color: theme.colors.onPrimary}]}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* CONFIG */}
        <View style={styles.section}>
          <Text
            style={[styles.subtitle, {color: theme.colors.onSurfaceVariant}]}>
            Configuration
          </Text>

          <View
            style={[
              styles.statusRow,
              {backgroundColor: theme.colors.surfaceVariant},
            ]}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: apiStore.configs[selectedProvider]?.apiKey
                    ? '#00cc66'
                    : '#ff4444',
                },
              ]}
            />
            <Text style={[styles.statusTxt, {color: theme.colors.onSurface}]}>
              {apiStore.configs[selectedProvider]?.apiKey
                ? 'Cle API configuree'
                : 'Aucune cle API'}
            </Text>
          </View>

          <Text style={[styles.label, {color: theme.colors.onSurfaceVariant}]}>
              Modele
            </Text>
            <TextInput
              style={[styles.input, {backgroundColor: theme.colors.surfaceVariant, color: theme.colors.onSurface}]}
              value={customModel || apiStore.configs[selectedProvider]?.model || apiStore.getProviderDefaults(selectedProvider).model}
              onChangeText={setCustomModel}
              placeholder={apiStore.getProviderDefaults(selectedProvider).model}
              placeholderTextColor={theme.colors.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
            />

          <TouchableOpacity
            style={[styles.saveBtn, {backgroundColor: '#2a2a4a', marginTop: 0, marginBottom: 4}]}
            onPress={handleFetchModels}
            disabled={loadingModels}>
            <Text style={[styles.saveTxt, {color: '#aaaaff'}]}>
              {loadingModels ? 'Chargement...' : '📋 Charger les modèles'}
            </Text>
          </TouchableOpacity>

          {models.length > 0 && (
            <View style={{marginBottom: 10}}>
              {models.map(m => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setCustomModel(m)}
                  style={{
                    padding: 8,
                    backgroundColor: customModel === m ? '#1a472a' : theme.colors.surfaceVariant,
                    borderRadius: 6,
                    marginBottom: 4,
                  }}>
                  <Text style={{color: theme.colors.onSurface, fontSize: 12}}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {selectedProvider === 'custom' && (
            <>
              <Text
                style={[styles.label, {color: theme.colors.onSurfaceVariant}]}>
                URL de base
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surfaceVariant,
                    color: theme.colors.onSurface,
                  },
                ]}
                value={customUrl}
                onChangeText={setCustomUrl}
                placeholder="https://api.example.com/v1"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text
                style={[styles.label, {color: theme.colors.onSurfaceVariant}]}>
                Modele
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surfaceVariant,
                    color: theme.colors.onSurface,
                  },
                ]}
                value={customModel}
                onChangeText={setCustomModel}
                placeholder="nom-du-modele"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          <Text style={[styles.label, {color: theme.colors.onSurfaceVariant}]}>
            Cle API
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surfaceVariant,
                color: theme.colors.onSurface,
              },
            ]}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="sk-... ou votre cle API"
            placeholderTextColor={theme.colors.onSurfaceVariant}
            secureTextEntry={true}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.saveBtn, {backgroundColor: theme.colors.primary}]}
            onPress={handleSave}
            disabled={saving}>
            <Text style={[styles.saveTxt, {color: theme.colors.onPrimary}]}>
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, {backgroundColor: '#1a3a4a', marginTop: 0}]}
            onPress={handleTest}
            disabled={testing}>
            <Text style={[styles.saveTxt, {color: '#00ff88'}]}>
              {testing ? 'Test en cours...' : '🔌 Tester la connexion'}
            </Text>
          </TouchableOpacity>

          {testResult ? (
            <Text style={{color: testResult.startsWith('✅') ? '#00cc66' : '#ff4444', marginBottom: 10, fontSize: 13}}>
              {testResult}
            </Text>
          ) : null}

          {apiStore.configs[selectedProvider]?.apiKey && (
            <TouchableOpacity
              style={[
                styles.deleteBtn,
                {backgroundColor: theme.colors.errorContainer},
              ]}
              onPress={handleDelete}>
              <Text style={[styles.deleteTxt, {color: theme.colors.error}]}>
                Supprimer la cle
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {flex: 1},
  scroll: {padding: 16},
  section: {marginBottom: 24},
  title: {fontSize: 18, fontWeight: 'bold', marginBottom: 16},
  subtitle: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  modeRow: {flexDirection: 'row', gap: 8, marginBottom: 8},
  modeBtn: {flex: 1, padding: 12, borderRadius: 8, alignItems: 'center'},
  tip: {fontSize: 12, fontStyle: 'italic', marginTop: 4},
  provCard: {padding: 12, borderRadius: 8, marginBottom: 8},
  provRow: {flexDirection: 'row', alignItems: 'center'},
  provUrl: {fontSize: 11, marginTop: 2},
  dotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00cc66',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  dot: {width: 10, height: 10, borderRadius: 5, marginRight: 8},
  statusTxt: {fontSize: 13, flex: 1},
  label: {fontSize: 12, marginBottom: 4},
  input: {borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 10},
  saveBtn: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  saveTxt: {fontWeight: 'bold', fontSize: 15},
  deleteBtn: {padding: 12, borderRadius: 8, alignItems: 'center'},
  deleteTxt: {fontWeight: 'bold'},
});
