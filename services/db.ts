
import { Language, DictionaryEntry, StudyLog, DictionarySource } from '../types';

const DB_NAME = 'LinguistFlowDB';
const DB_VERSION = 4; // Upgraded for Hanja Index
const DICT_META_STORE = 'dict_meta';
const HUB_ENTRIES_STORE = 'dict_entries'; 
const LOGS_STORE = 'study_logs';
const OLD_DICT_STORE = 'dictionary'; 

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
        const txn = (event.target as IDBOpenDBRequest).transaction;

        // V1/V2 Legacy Stores
        if (!db.objectStoreNames.contains(OLD_DICT_STORE)) {
          db.createObjectStore(OLD_DICT_STORE, { keyPath: ['language', 'word'] });
        }
        if (!db.objectStoreNames.contains(LOGS_STORE)) {
          const logStore = db.createObjectStore(LOGS_STORE, { keyPath: 'id' });
          logStore.createIndex('language', 'language', { unique: false });
          logStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // V3 Hub Stores (VFS Architecture)
        if (!db.objectStoreNames.contains(DICT_META_STORE)) {
           const metaStore = db.createObjectStore(DICT_META_STORE, { keyPath: 'id' });
           metaStore.createIndex('language', 'language', { unique: false });
        }

        if (!db.objectStoreNames.contains(HUB_ENTRIES_STORE)) {
            // Composite key [dictId, word] for high performance range queries per dictionary
            const hubStore = db.createObjectStore(HUB_ENTRIES_STORE, { keyPath: ['dictId', 'word'] });
            // Index on 'word' alone allows us to query across ALL dictionaries simultaneously
            hubStore.createIndex('word', 'word', { unique: false }); 
            hubStore.createIndex('dictId', 'dictId', { unique: false });
            hubStore.createIndex('hanja', 'metadata.hanja', { unique: false }); // V4 Index
        } else {
            // V4 Upgrade: Add Hanja index if missing
            const hubStore = txn?.objectStore(HUB_ENTRIES_STORE);
            if (hubStore && !hubStore.indexNames.contains('hanja')) {
                hubStore.createIndex('hanja', 'metadata.hanja', { unique: false });
            }
        }
        
        // Initialize Default User Memory Dictionaries if upgrading
        if (event.oldVersion < 3) {
             const metaStore = txn?.objectStore(DICT_META_STORE);
             ['EN', 'FR', 'KR'].forEach(lang => {
                 metaStore?.put({
                     id: `USER_${lang}`,
                     name: 'User Memory',
                     language: lang,
                     priority: 0, // Highest Priority
                     enabled: true,
                     count: 0,
                     importedAt: Date.now(),
                     type: 'USER'
                 });
             });
        }
      };
    });
  }

  // --- Hub Management ---

  async getDictionaries(language: Language): Promise<DictionarySource[]> {
      if (!this.db) await this.init();
      return new Promise((resolve) => {
          const tx = this.db!.transaction(DICT_META_STORE, 'readonly');
          const index = tx.objectStore(DICT_META_STORE).index('language');
          const req = index.getAll(language);
          req.onsuccess = () => {
              const res = req.result as DictionarySource[];
              // Sort by Priority (0 is highest/top)
              resolve(res.sort((a, b) => a.priority - b.priority));
          };
      });
  }

  async updateDictionaryMeta(dict: DictionarySource): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
          const tx = this.db!.transaction(DICT_META_STORE, 'readwrite');
          tx.objectStore(DICT_META_STORE).put(dict);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
      });
  }

  async deleteDictionary(dictId: string): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
          const tx = this.db!.transaction([DICT_META_STORE, HUB_ENTRIES_STORE], 'readwrite');
          
          // 1. Delete Meta
          const metaStore = tx.objectStore(DICT_META_STORE);
          metaStore.delete(dictId);

          // 2. Delete Entries using Index Cursor (Scoped deletion)
          const hubStore = tx.objectStore(HUB_ENTRIES_STORE);
          const index = hubStore.index('dictId');
          const range = IDBKeyRange.only(dictId);
          
          // Using openCursor instead of delete(range) is generally safer for browser compatibility/indexes
          const req = index.openCursor(range);
          
          req.onsuccess = (e) => {
              const cursor = (e.target as IDBRequest).result as IDBCursor;
              if (cursor) {
                  cursor.delete();
                  cursor.continue();
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
          
          const hubStore = tx.objectStore(HUB_ENTRIES_STORE);
          const index = hubStore.index('dictId');
          const range = IDBKeyRange.only(dictId);
          const req = index.openCursor(range);
          
          req.onsuccess = (e) => {
              const cursor = (e.target as IDBRequest).result as IDBCursor;
              if (cursor) {
                  cursor.delete();
                  cursor.continue();
              }
          };

          // Reset count in meta
          const metaStore = tx.objectStore(DICT_META_STORE);
          const metaReq = metaStore.get(dictId);
          metaReq.onsuccess = () => {
              if (metaReq.result) {
                  const updated = { ...metaReq.result, count: 0 };
                  metaStore.put(updated);
              }
          };

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
      });
  }

  async createDictionary(name: string, language: Language, type: 'IMPORTED' | 'SYSTEM' = 'IMPORTED'): Promise<string> {
      if (!this.db) await this.init();
      const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      
      const existing = await this.getDictionaries(language);
      const maxPrio = existing.length > 0 ? Math.max(...existing.map(d => d.priority)) : 0;

      const newDict: DictionarySource = {
          id,
          name,
          language,
          priority: maxPrio + 1,
          enabled: true,
          count: 0,
          importedAt: Date.now(),
          type
      };

      await this.updateDictionaryMeta(newDict);
      return id;
  }

  // --- Pipeline Ingestion ---

  async importBatchToDict(entries: Partial<DictionaryEntry>[], dictId: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
        const tx = this.db!.transaction([HUB_ENTRIES_STORE, DICT_META_STORE], 'readwrite');
        const store = tx.objectStore(HUB_ENTRIES_STORE);

        entries.forEach(entry => {
            if (entry.word) {
                store.put({
                    dictId,
                    word: entry.word.toLowerCase().trim(),
                    original: entry.word,
                    translation: entry.translation || '',
                    metadata: entry.metadata,
                    audioPath: entry.audioPath
                });
            }
        });

        // Update entry count
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

  // --- Scoped Parallel Search Logic ---

  async lookupCascade(language: Language, word: string): Promise<{ entry: DictionaryEntry, source: DictionarySource }[]> {
      if (!this.db) await this.init();
      const cleanWord = word.toLowerCase().trim();

      // 1. Get enabled dictionary configurations
      const dicts = await this.getDictionaries(language);
      const activeDicts = dicts.filter(d => d.enabled);
      
      if (activeDicts.length === 0) return [];

      // 2. Query legacy store (Fallback/Migration support)
      const legacyResult = await this.lookupLegacy(language, cleanWord);
      
      // 3. Query Hub Store (Parallel word + hanja)
      return new Promise((resolve, reject) => {
          const tx = this.db!.transaction(HUB_ENTRIES_STORE, 'readonly');
          const store = tx.objectStore(HUB_ENTRIES_STORE);
          const wordIndex = store.index('word');
          
          const queries: Promise<DictionaryEntry[]>[] = [
              new Promise(r => {
                  const req = wordIndex.getAll(cleanWord);
                  req.onsuccess = () => r(req.result as DictionaryEntry[]);
                  req.onerror = () => r([]);
              })
          ];

          // If looking for Korean, also check Hanja index (Bidirectional mapping)
          if (language === 'KR' && store.indexNames.contains('hanja')) {
               queries.push(new Promise(r => {
                   const req = store.index('hanja').getAll(cleanWord); // Check if input is a Hanja
                   req.onsuccess = () => r(req.result as DictionaryEntry[]);
                   req.onerror = () => r([]);
               }));
          }

          Promise.all(queries).then(results => {
              const allMatches = results.flat();
              
              // Deduplicate matches based on dictId + word
              const uniqueMatches = new Map<string, DictionaryEntry>();
              allMatches.forEach(m => {
                  const key = `${m.dictId}_${m.word}`;
                  if (!uniqueMatches.has(key)) uniqueMatches.set(key, m);
              });
              
              const matches = Array.from(uniqueMatches.values());
              const finalResults: { entry: DictionaryEntry, source: DictionarySource }[] = [];
              
              // Map dictId -> Source Object
              const dictMap = new Map(activeDicts.map(d => [d.id, d]));

              matches.forEach(m => {
                  const source = dictMap.get(m.dictId);
                  if (source) {
                      finalResults.push({ entry: m, source });
                  }
              });

              // Add legacy entry
              if (legacyResult) {
                  const userDict = activeDicts.find(d => d.type === 'USER');
                  if (userDict) {
                      if (!finalResults.some(r => r.source.id === userDict.id)) {
                          finalResults.push({ 
                              entry: { ...legacyResult, dictId: userDict.id }, 
                              source: userDict 
                          });
                      }
                  }
              }

              // Sort by Priority
              finalResults.sort((a, b) => a.source.priority - b.source.priority);

              resolve(finalResults);
          }).catch(reject);
      });
  }

  async lookupLegacy(language: Language, word: string): Promise<DictionaryEntry | null> {
      return new Promise((resolve) => {
          const tx = this.db!.transaction(OLD_DICT_STORE, 'readonly');
          const req = tx.objectStore(OLD_DICT_STORE).get([language, word]);
          req.onsuccess = () => resolve(req.result ? {
              dictId: 'LEGACY',
              word: req.result.original || req.result.word,
              translation: req.result.translation,
              metadata: req.result.metadata
          } : null);
          req.onerror = () => resolve(null);
      });
  }

  async saveDefinition(language: Language, word: string, translation: string, metadata?: any): Promise<void> {
    if (!this.db) await this.init();
    
    const dicts = await this.getDictionaries(language);
    const userDict = dicts.find(d => d.type === 'USER');
    
    if (userDict) {
        // Save to Hub
        await this.importBatchToDict([{ word, translation, metadata }], userDict.id);
    } else {
        // Fallback Legacy
        const tx = this.db!.transaction(OLD_DICT_STORE, 'readwrite');
        tx.objectStore(OLD_DICT_STORE).put({ 
            language, 
            word: word.toLowerCase().trim(), 
            original: word, 
            translation, 
            metadata 
        });
    }
  }

  // --- Logs & Stats ---
  
  async getStorageEstimate(): Promise<{ usage: number; quota: number; percent: number }> {
    if (navigator.storage && navigator.storage.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage || 0,
                quota: estimate.quota || 1,
                percent: Math.round(((estimate.usage || 0) / (estimate.quota || 1)) * 100)
            };
        } catch (e) { console.error(e); }
    }
    return { usage: 0, quota: 0, percent: 0 };
  }

  async logSession(log: StudyLog): Promise<void> {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(LOGS_STORE, 'readwrite');
    tx.objectStore(LOGS_STORE).put(log);
  }

  async getLogs(language: Language): Promise<StudyLog[]> {
    if (!this.db) await this.init();
    const tx = this.db!.transaction(LOGS_STORE, 'readonly');
    const index = tx.objectStore(LOGS_STORE).index('language');
    const req = index.getAll(language);
    return new Promise(resolve => {
        req.onsuccess = () => resolve(req.result || []);
    });
  }
}

export const db = new DictionaryDB();
