
import { Language, DictionaryEntry, StudyLog, DictionarySource, User, CEFRLevel } from '../types';

const DB_NAME = 'LinguistFlowDB';
const DB_VERSION = 6; 
const DICT_META_STORE = 'dict_meta';
const HUB_ENTRIES_STORE = 'dict_entries'; 
const LOGS_STORE = 'study_logs';
const USERS_STORE = 'users';
const AUDIO_CACHE_STORE = 'audio_cache';

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
        
        if (!db.objectStoreNames.contains(USERS_STORE)) {
          db.createObjectStore(USERS_STORE, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(LOGS_STORE)) {
          const logStore = db.createObjectStore(LOGS_STORE, { keyPath: 'id' });
          logStore.createIndex('userId', 'userId', { unique: false });
          logStore.createIndex('language', 'language', { unique: false });
          logStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(DICT_META_STORE)) {
           const metaStore = db.createObjectStore(DICT_META_STORE, { keyPath: 'id' });
           metaStore.createIndex('language', 'language', { unique: false });
        }

        if (!db.objectStoreNames.contains(HUB_ENTRIES_STORE)) {
            const hubStore = db.createObjectStore(HUB_ENTRIES_STORE, { keyPath: ['dictId', 'word'] });
            hubStore.createIndex('word', 'word', { unique: false }); 
            hubStore.createIndex('dictId', 'dictId', { unique: false });
        }

        if (!db.objectStoreNames.contains(AUDIO_CACHE_STORE)) {
          db.createObjectStore(AUDIO_CACHE_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  async getAudioCache(key: string): Promise<string | null> {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db!.transaction(AUDIO_CACHE_STORE, 'readonly');
      const req = tx.objectStore(AUDIO_CACHE_STORE).get(key);
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => resolve(null);
    });
  }

  async setAudioCache(key: string, data: string): Promise<void> {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(AUDIO_CACHE_STORE, 'readwrite');
    tx.objectStore(AUDIO_CACHE_STORE).put({ key, data });
  }

  async getUsers(): Promise<User[]> {
    if (!this.db) await this.init();
    return new Promise(resolve => {
      const tx = this.db!.transaction(USERS_STORE, 'readonly');
      const req = tx.objectStore(USERS_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
    });
  }

  async saveUser(user: User): Promise<void> {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(USERS_STORE, 'readwrite');
    tx.objectStore(USERS_STORE).put(user);
  }

  async getLogs(language: Language, userId: string): Promise<StudyLog[]> {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(LOGS_STORE, 'readonly');
    const index = tx.objectStore(LOGS_STORE).index('userId');
    const req = index.getAll(userId);
    return new Promise(resolve => {
      req.onsuccess = () => {
        const all = (req.result || []) as StudyLog[];
        resolve(all.filter(l => l.language === language));
      };
    });
  }

  async logSession(log: StudyLog): Promise<void> {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(LOGS_STORE, 'readwrite');
    tx.objectStore(LOGS_STORE).put(log);
  }

  async getDictionaries(language: Language): Promise<DictionarySource[]> {
      if (!this.db) await this.init();
      return new Promise((resolve) => {
          const tx = this.db!.transaction(DICT_META_STORE, 'readonly');
          const index = tx.objectStore(DICT_META_STORE).index('language');
          const req = index.getAll(language);
          req.onsuccess = () => {
              const res = req.result as DictionarySource[];
              resolve(res.sort((a, b) => a.priority - b.priority));
          };
      });
  }

  async updateDictionaryMeta(dict: DictionarySource): Promise<void> {
      if (!this.db) await this.init();
      const tx = this.db!.transaction(DICT_META_STORE, 'readwrite');
      tx.objectStore(DICT_META_STORE).put(dict);
  }

  async createDictionary(name: string, language: Language, type: 'IMPORTED' | 'SYSTEM' = 'IMPORTED'): Promise<string> {
      if (!this.db) await this.init();
      const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const existing = await this.getDictionaries(language);
      const maxPrio = existing.length > 0 ? Math.max(...existing.map(d => d.priority)) : 0;
      const newDict: DictionarySource = { id, name, language, priority: maxPrio + 1, enabled: true, count: 0, importedAt: Date.now(), type };
      await this.updateDictionaryMeta(newDict);
      return id;
  }

  async importBatchToDict(entries: Partial<DictionaryEntry>[], dictId: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
        const tx = this.db!.transaction([HUB_ENTRIES_STORE, DICT_META_STORE], 'readwrite');
        const store = tx.objectStore(HUB_ENTRIES_STORE);
        entries.forEach(entry => {
            if (entry.word) {
                store.put({ dictId, word: entry.word.toLowerCase().trim(), translation: entry.translation || '', metadata: entry.metadata });
            }
        });
        const metaStore = tx.objectStore(DICT_META_STORE);
        const getMeta = metaStore.get(dictId);
        getMeta.onsuccess = () => {
            if (getMeta.result) {
                const meta = getMeta.result;
                meta.count += entries.length;
                metaStore.put(meta);
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
  }

  async clearDictionaryEntries(dictId: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([HUB_ENTRIES_STORE, DICT_META_STORE], 'readwrite');
      const store = tx.objectStore(HUB_ENTRIES_STORE);
      const index = store.index('dictId');
      const req = index.openKeyCursor(IDBKeyRange.only(dictId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      const metaStore = tx.objectStore(DICT_META_STORE);
      const getMeta = metaStore.get(dictId);
      getMeta.onsuccess = () => {
          if (getMeta.result) {
              const meta = getMeta.result;
              meta.count = 0;
              metaStore.put(meta);
          }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteDictionary(dictId: string): Promise<void> {
    if (!this.db) await this.init();
    const tx = this.db!.transaction([DICT_META_STORE, HUB_ENTRIES_STORE], 'readwrite');
    tx.objectStore(DICT_META_STORE).delete(dictId);
    const index = tx.objectStore(HUB_ENTRIES_STORE).index('dictId');
    const req = index.openKeyCursor(IDBKeyRange.only(dictId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        tx.objectStore(HUB_ENTRIES_STORE).delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  }
}

export const db = new DictionaryDB();
