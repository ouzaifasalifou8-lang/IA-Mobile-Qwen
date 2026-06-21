import {makeAutoObservable, runInAction} from 'mobx';
import * as Keychain from 'react-native-keychain';

export type ApiProvider =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'mistral'
  | 'together'
  | 'custom';

export type ChatMode = 'local' | 'api' | 'hybrid';

export interface ApiConfig {
  provider: ApiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
}

const PROVIDER_DEFAULTS: Record<ApiProvider, Omit<ApiConfig, 'apiKey'>> = {
  openai: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    label: 'OpenAI (ChatGPT)',
  },
  anthropic: {
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-4-5-20251001',
    label: 'Anthropic (Claude)',
  },
  groq: {
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-8b-instant',
    label: 'Groq (rapide)',
  },
  mistral: {
    provider: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    label: 'Mistral AI',
  },
  together: {
    provider: 'together',
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3-8b-chat-hf',
    label: 'Together AI',
  },
  custom: {
    provider: 'custom',
    baseUrl: 'https://api.example.com/v1',
    model: 'custom-model',
    label: 'API Personnalisee',
  },
};

const KEYCHAIN_SERVICE = 'ouzaif_api_keys';

class ApiStore {
  chatMode: ChatMode = 'local';
  selectedProvider: ApiProvider = 'openai';
  configs: Partial<Record<ApiProvider, ApiConfig>> = {};
  customBaseUrl = '';
  customModel = '';
  isLoading = false;
  lastError = '';

  constructor() {
    makeAutoObservable(this);
    this.loadConfigs();
  }

  get currentConfig(): ApiConfig | null {
    return this.configs[this.selectedProvider] || null;
  }

  get hasApiKey(): boolean {
    return !!this.currentConfig?.apiKey;
  }

  get isApiMode(): boolean {
    return this.chatMode === 'api' || this.chatMode === 'hybrid';
  }

  setChatMode(mode: ChatMode) {
    this.chatMode = mode;
  }

  setProvider(provider: ApiProvider) {
    this.selectedProvider = provider;
  }

  async saveApiKey(
    provider: ApiProvider,
    apiKey: string,
    model?: string,
    baseUrl?: string,
  ) {
    const defaults = PROVIDER_DEFAULTS[provider];
    const config: ApiConfig = {
      ...defaults,
      apiKey,
      model: model || defaults.model,
      baseUrl: baseUrl || defaults.baseUrl,
    };

    runInAction(() => {
      this.configs[provider] = config;
      this.isLoading = true;
    });

    try {
      // Sauvegarder toutes les configs en JSON dans le keychain
      const allConfigs = {...this.configs, [provider]: config};
      await Keychain.setGenericPassword(
        'api_configs',
        JSON.stringify(allConfigs),
        {service: KEYCHAIN_SERVICE},
      );
      runInAction(() => {
        this.isLoading = false;
        this.lastError = '';
      });
      return true;
    } catch {
      runInAction(() => {
        this.isLoading = false;
        this.lastError = 'Erreur sauvegarde cle API';
      });
      return false;
    }
  }

  async deleteApiKey(provider: ApiProvider) {
    runInAction(() => {
      delete this.configs[provider];
    });
    try {
      const remaining = {...this.configs};
      delete remaining[provider];
      await Keychain.setGenericPassword(
        'api_configs',
        JSON.stringify(remaining),
        {service: KEYCHAIN_SERVICE},
      );
      return true;
    } catch {
      return false;
    }
  }

  async loadConfigs() {
    try {
      const creds = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE,
      });
      if (creds && creds.password) {
        const parsed = JSON.parse(creds.password);
        runInAction(() => {
          this.configs = parsed;
        });
      }
    } catch {
      // Pas de configs sauvegardees, on continue
    }
  }

  // Envoyer un message via l'API externe
  async sendToApi(
    messages: Array<{role: string; content: string}>,
    onChunk?: (text: string) => void,
  ): Promise<string> {
    const config = this.currentConfig;
    if (!config) {
      throw new Error('Aucune API configuree');
    }

    if (config.provider === 'anthropic') {
      return this._sendToAnthropic(config, messages, onChunk);
    }
    return this._sendOpenAICompatible(config, messages, onChunk);
  }

  private async _sendOpenAICompatible(
    config: ApiConfig,
    messages: Array<{role: string; content: string}>,
    onChunk?: (text: string) => void,
  ): Promise<string> {
    const resp = await fetch(config.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.apiKey,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: !!onChunk,
        max_tokens: 1024,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error('Erreur API ' + config.provider + ': ' + err);
    }

    if (onChunk) {
      // Streaming
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      if (reader) {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
          for (const line of lines) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullText += delta;
                onChunk(delta);
              }
            } catch {}
          }
        }
      }
      return fullText;
    } else {
      const data = await resp.json();
      return data.choices?.[0]?.message?.content || '';
    }
  }

  private async _sendToAnthropic(
    config: ApiConfig,
    messages: Array<{role: string; content: string}>,
    onChunk?: (text: string) => void,
  ): Promise<string> {
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role !== 'system');

    const resp = await fetch(config.baseUrl + '/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1024,
        system: systemMsg || undefined,
        messages: userMsgs,
        stream: !!onChunk,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error('Erreur Anthropic: ' + err);
    }

    if (onChunk) {
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      if (reader) {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line.slice(6));
              const delta = parsed.delta?.text || '';
              if (delta) {
                fullText += delta;
                onChunk(delta);
              }
            } catch {}
          }
        }
      }
      return fullText;
    } else {
      const data = await resp.json();
      return data.content?.[0]?.text || '';
    }
  }

  getProviderDefaults(provider: ApiProvider) {
    return PROVIDER_DEFAULTS[provider];
  }

  getAllProviders() {
    return Object.values(PROVIDER_DEFAULTS);
  }
}

export const apiStore = new ApiStore();
