
import { Language, DictionaryEntry, StudyLog } from '../types';

const DB_NAME = 'LinguistFlowDB';
const DB_VERSION = 2; // Incremented for schema change
const DICT_STORE = 'dictionary';
const LOGS_STORE = 'study_logs';
const CHUNK_SIZE = 2000;

export class DictionaryDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(DICT_STORE)) {
          db.createObjectStore(DICT_STORE, { keyPath: ['language', 'word'] });
        }
        if (!db.objectStoreNames.contains(LOGS_STORE)) {
          const logStore = db.createObjectStore(LOGS_STORE, { keyPath: 'id' });
          logStore.createIndex('language', 'language', { unique: false });
          logStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // --- Dictionary Methods ---

  async importBatch(entries: DictionaryEntry[], language: Language, onProgress?: (percent: number) => void): Promise<void> {
    if (!this.db) await this.init();
    
    const validEntries = entries.filter(e => e.word && e.translation);
    const total = validEntries.length;
    const importTimestamp = Date.now();
    
    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = validEntries.slice(i, i + CHUNK_SIZE);
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction(DICT_STORE, 'readwrite');
        const store = transaction.objectStore(DICT_STORE);
        for (const entry of chunk) {
          store.put({ 
            language, 
            word: entry.word.toLowerCase().trim(), 
            original: entry.word,
            translation: entry.translation,
            importedAt: importTimestamp 
          });
        }
        transaction.oncomplete = () => {
          if (onProgress) onProgress(Math.min(100, Math.round(((i + chunk.length) / total) * 100)));
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      });
    }
  }

  async getCache(language: Language): Promise<Map<string, string>> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(DICT_STORE, 'readonly');
      const store = transaction.objectStore(DICT_STORE);
      const range = IDBKeyRange.bound([language, ''], [language, '\uffff']);
      const request = store.openCursor(range);
      const cache = new Map<string, string>();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cache.set(cursor.value.word, cursor.value.translation);
          cursor.continue();
        } else {
          resolve(cache);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async count(language: Language): Promise<number> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(DICT_STORE, 'readonly');
      const store = transaction.objectStore(DICT_STORE);
      const range = IDBKeyRange.bound([language, ''], [language, '\uffff']);
      const request = store.count(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clear(language: Language): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(DICT_STORE, 'readwrite');
      const store = transaction.objectStore(DICT_STORE);
      const range = IDBKeyRange.bound([language, ''], [language, '\uffff']);
      const request = store.delete(range);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Study Logs Methods ---

  async logSession(log: StudyLog): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(LOGS_STORE, 'readwrite');
      const store = transaction.objectStore(LOGS_STORE);
      store.put(log);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getLogs(language: Language): Promise<StudyLog[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(LOGS_STORE, 'readonly');
      const store = transaction.objectStore(LOGS_STORE);
      const index = store.index('language');
      const request = index.getAll(language);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
}

export const db = new DictionaryDB();
