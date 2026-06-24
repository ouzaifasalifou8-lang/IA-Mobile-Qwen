import {makeAutoObservable} from 'mobx';

class MockApiStore {
  chatMode = 'local';
  selectedProvider = 'openai';
  configs = {};
  isLoading = false;
  lastError = '';

  get currentConfig() { return null; }
  get hasApiKey() { return false; }
  get isApiMode() { return false; }

  setChatMode = jest.fn();
  setProvider = jest.fn();
  saveApiKey = jest.fn().mockResolvedValue(true);
  deleteApiKey = jest.fn().mockResolvedValue(true);
  loadConfigs = jest.fn();
  sendToApi = jest.fn().mockResolvedValue('Mock API response');
  fetchModels = jest.fn().mockResolvedValue([]);
  getProviderDefaults = jest.fn().mockReturnValue({});
  getAllProviders = jest.fn().mockReturnValue([]);

  constructor() {
    makeAutoObservable(this);
  }
}

export const mockApiStore = new MockApiStore();
export const apiStore = mockApiStore;
