import {makeAutoObservable, runInAction} from 'mobx';
import * as RNFS from '@dr.pogodin/react-native-fs';

export interface RagDocument {
  id: string;
  name: string;
  content: string;
  paragraphs: string[];
}

// Index inversé: mot -> [{docId, paraIdx, tf}]
interface IndexEntry {
  docId: string;
  paraIdx: number;
  tf: number; // term frequency
}

// Cache LRU simple
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    const val = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  set(key: K, val: V) {
    if (this.cache.size >= this.maxSize) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, val);
  }
}

class RagStore {
  documents: RagDocument[] = [];
  isIndexing = false;
  
  // Index inversé en mémoire
  private invertedIndex = new Map<string, IndexEntry[]>();
  // IDF pré-calculé
  private idfCache = new Map<string, number>();
  // Cache des recherches récentes
  private searchCache = new LRUCache<string, string[]>(200);
  // Paragraphes indexés {docId_paraIdx -> texte}
  private paraMap = new Map<string, string>();

  constructor() {
    makeAutoObservable(this);
    this.loadDocuments();
  }

  get docsDir() {
    return `${RNFS.DocumentDirectoryPath}/rag_documents`;
  }

  // Normaliser un mot (stemming simple)
  private normalize(word: string): string {
    return word
      .toLowerCase()
      .replace(/[^a-zàâäéèêëîïôùûüç0-9]/g, '')
      .replace(/tion$/, '')
      .replace(/ment$/, '')
      .replace(/eux$/, 'eu')
      .replace(/aux$/, 'au');
  }

  // Tokeniser un texte
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[\s,;:.!?()\[\]{}'"\n\t]+/)
      .map(w => this.normalize(w))
      .filter(w => w.length > 2);
  }

  // Mots vides français/haoussa à ignorer
  private stopWords = new Set([
    'les', 'des', 'une', 'est', 'que', 'qui', 'dans', 'pas', 'sur',
    'par', 'avec', 'pour', 'mais', 'son', 'ses', 'leur', 'tout',
    'plus', 'aussi', 'comme', 'bien', 'très', 'même', 'après',
    'the', 'and', 'for', 'are', 'was', 'were', 'has', 'have',
  ]);

  // Construire l'index inversé
  private buildIndex() {
    const startTime = Date.now();
    this.invertedIndex.clear();
    this.idfCache.clear();
    this.paraMap.clear();

    const totalParas = this.documents.reduce((sum, d) => sum + d.paragraphs.length, 0);
    
    // Compter les documents contenant chaque terme (pour IDF)
    const docFreq = new Map<string, number>();

    for (const doc of this.documents) {
      for (let i = 0; i < doc.paragraphs.length; i++) {
        const para = doc.paragraphs[i];
        const key = `${doc.id}_${i}`;
        this.paraMap.set(key, para);

        const words = this.tokenize(para).filter(w => !this.stopWords.has(w));
        const wordCount = new Map<string, number>();
        
        // Compter fréquence de chaque mot
        for (const word of words) {
          wordCount.set(word, (wordCount.get(word) || 0) + 1);
        }

        const seenInDoc = new Set<string>();
        for (const [word, count] of wordCount) {
          const tf = count / words.length;
          
          if (!this.invertedIndex.has(word)) {
            this.invertedIndex.set(word, []);
          }
          this.invertedIndex.get(word)!.push({docId: doc.id, paraIdx: i, tf});

          if (!seenInDoc.has(word)) {
            docFreq.set(word, (docFreq.get(word) || 0) + 1);
            seenInDoc.add(word);
          }
        }
      }
    }

    // Pré-calculer IDF
    for (const [word, df] of docFreq) {
      this.idfCache.set(word, Math.log(totalParas / (df + 1)) + 1);
    }

    console.log(`[RAG] Index construit en ${Date.now() - startTime}ms - ${this.invertedIndex.size} termes, ${totalParas} paragraphes`);
  }

  // Recherche ultra-rapide avec TF-IDF
  search(query: string, maxResults: number = 5): string[] {
    const cacheKey = `${query}_${maxResults}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;

    if (this.documents.length === 0) return [];

    const startTime = Date.now();
    const queryWords = this.tokenize(query)
      .filter(w => !this.stopWords.has(w) && w.length > 2);

    if (queryWords.length === 0) return [];

    // Scoring TF-IDF
    const scores = new Map<string, number>();

    for (const word of queryWords) {
      const entries = this.invertedIndex.get(word) || [];
      const idf = this.idfCache.get(word) || 1;

      for (const entry of entries) {
        const key = `${entry.docId}_${entry.paraIdx}`;
        const tfidf = entry.tf * idf;
        scores.set(key, (scores.get(key) || 0) + tfidf);
      }
    }

    // Bonus pour les correspondances exactes de phrases
    const queryLower = query.toLowerCase();
    for (const [key, para] of this.paraMap) {
      if (para.toLowerCase().includes(queryLower)) {
        scores.set(key, (scores.get(key) || 0) + 10);
      }
    }

    // Trier et retourner les meilleurs résultats
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxResults)
      .map(([key]) => this.paraMap.get(key) || '');

    console.log(`[RAG] Recherche "${query.slice(0, 30)}" en ${Date.now() - startTime}ms - ${sorted.length} résultats`);
    
    this.searchCache.set(cacheKey, sorted);
    return sorted;
  }

  // Recherche avec contexte élargi (paragraphes adjacents)
  searchWithContext(query: string, maxResults: number = 3): string[] {
    const cacheKey = `ctx_${query}_${maxResults}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;

    const results = this.search(query, maxResults);
    const withContext: string[] = [];

    for (const result of results) {
      // Trouver le paragraphe dans les documents
      for (const doc of this.documents) {
        const idx = doc.paragraphs.indexOf(result);
        if (idx >= 0) {
          // Ajouter le paragraphe précédent et suivant pour le contexte
          const before = idx > 0 ? doc.paragraphs[idx - 1] : '';
          const after = idx < doc.paragraphs.length - 1 ? doc.paragraphs[idx + 1] : '';
          withContext.push([before, result, after].filter(Boolean).join(' '));
          break;
        }
      }
    }

    this.searchCache.set(cacheKey, withContext);
    return withContext;
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
            paragraphs: content
              .split(/\n{2,}|(?<=\.\s)(?=[A-Z])|(?<=!\s)(?=[A-Z])/)
              .map(p => p.trim())
              .filter(p => p.length > 20),
          });
        }
      }
      runInAction(() => { this.documents = docs; });
      // Construire l'index en arrière-plan
      setTimeout(() => this.buildIndex(), 100);
    } catch (e) {
      console.warn('[RagStore] load failed', e);
    }
  }

  async addDocument(name: string, content: string) {
    try {
      const exists = await RNFS.exists(this.docsDir);
      if (!exists) await RNFS.mkdir(this.docsDir);
      const path = `${this.docsDir}/${name}`;
      await RNFS.writeFile(path, content, 'utf8');
      const doc: RagDocument = {
        id: name, name, content,
        paragraphs: content
          .split(/\n{2,}/)
          .map(p => p.trim())
          .filter(p => p.length > 20),
      };
      runInAction(() => { this.documents = [...this.documents, doc]; });
      // Reconstruire l'index
      setTimeout(() => this.buildIndex(), 50);
    } catch (e) {
      console.warn('[RagStore] add failed', e);
    }
  }

  async removeDocument(id: string) {
    try {
      const path = `${this.docsDir}/${id}`;
      await RNFS.unlink(path);
      runInAction(() => { this.documents = this.documents.filter(d => d.id !== id); });
      this.searchCache = new LRUCache(200);
      setTimeout(() => this.buildIndex(), 50);
    } catch (e) {
      console.warn('[RagStore] remove failed', e);
    }
  }

  get hasDocuments() {
    return this.documents.length > 0;
  }

  get stats() {
    const totalParas = this.documents.reduce((sum, d) => sum + d.paragraphs.length, 0);
    const totalWords = this.invertedIndex.size;
    return {docs: this.documents.length, paragraphs: totalParas, indexedWords: totalWords};
  }
}

export const ragStore = new RagStore();
