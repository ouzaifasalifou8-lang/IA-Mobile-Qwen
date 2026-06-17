import {makeAutoObservable} from 'mobx';
import * as RNFS from '@dr.pogodin/react-native-fs';

export interface RagDocument {
  id: string;
  name: string;
  content: string;
  paragraphs: string[];
}

class RagStore {
  documents: RagDocument[] = [];

  constructor() {
    makeAutoObservable(this);
    this.loadDocuments();
  }

  get docsDir() {
    return `${RNFS.DocumentDirectoryPath}/rag_documents`;
  }

  async loadDocuments() {
    try {
      const exists = await RNFS.exists(this.docsDir);
      if (!exists) {
        await RNFS.mkdir(this.docsDir);
        return;
      }
      const files = await RNFS.readDir(this.docsDir);
      const docs: RagDocument[] = [];
      for (const file of files) {
        if (file.isFile()) {
          const content = await RNFS.readFile(file.path, 'utf8');
          docs.push({
            id: file.name,
            name: file.name,
            content,
            paragraphs: content.split('\n').filter(p => p.trim().length > 10),
          });
        }
      }
      this.documents = docs;
    } catch (e) {
      console.warn('[RagStore] load failed', e);
    }
  }

  async addDocument(name: string, content: string) {
    try {
      const exists = await RNFS.exists(this.docsDir);
      if (!exists) {
        await RNFS.mkdir(this.docsDir);
      }
      const path = `${this.docsDir}/${name}`;
      await RNFS.writeFile(path, content, 'utf8');
      await this.loadDocuments();
    } catch (e) {
      console.warn('[RagStore] add failed', e);
    }
  }

  async removeDocument(id: string) {
    try {
      const path = `${this.docsDir}/${id}`;
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
      }
      await this.loadDocuments();
    } catch (e) {
      console.warn('[RagStore] remove failed', e);
    }
  }

  // Recherche par mots-clés - rapide, pas de calcul vectoriel
  search(query: string, maxResults: number = 3): string[] {
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);

    if (queryWords.length === 0) {
      return [];
    }

    const scored: {text: string; score: number}[] = [];

    for (const doc of this.documents) {
      for (const para of doc.paragraphs) {
        const paraLower = para.toLowerCase();
        let score = 0;
        for (const word of queryWords) {
          if (paraLower.includes(word)) {
            score += 1;
          }
        }
        if (score > 0) {
          scored.push({text: para, score});
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map(s => s.text);
  }

  get hasDocuments() {
    return this.documents.length > 0;
  }
}

export const ragStore = new RagStore();
