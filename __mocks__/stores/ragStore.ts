import {makeAutoObservable} from 'mobx';

interface RagDocument {
  id: string;
  name: string;
  content: string;
}

class MockRagStore {
  documents: RagDocument[] = [];

  get hasDocuments(): boolean {
    return this.documents.length > 0;
  }

  loadDocuments: jest.Mock;
  addDocument: jest.Mock;
  removeDocument: jest.Mock;
  search: jest.Mock;

  constructor() {
    makeAutoObservable(this, {
      loadDocuments: false,
      addDocument: false,
      removeDocument: false,
      search: false,
    });
    this.loadDocuments = jest.fn().mockResolvedValue(undefined);
    this.addDocument = jest.fn().mockResolvedValue(undefined);
    this.removeDocument = jest.fn().mockResolvedValue(undefined);
    this.search = jest.fn().mockReturnValue([]);
  }
}

export const mockRagStore = new MockRagStore();
