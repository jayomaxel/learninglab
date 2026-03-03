import { DictionaryEntry } from '../types';
import { BloomFilter } from './bloomFilter';
import { CuckooFilter } from './cuckooFilter';

const normalizeWord = (raw: string): string => raw.toLowerCase().trim();

export interface DedupResult {
  entries: Partial<DictionaryEntry>[];
  dropped: number;
}

/**
 * Deduplicates dictionary entries during an import session.
 *
 * Strategy:
 * - Use Cuckoo Filter as the primary membership structure.
 * - Keep Bloom Filter in sync for fallback and future migration path.
 * - If Cuckoo insertion starts failing due load, fallback to Bloom-only mode.
 */
export class DictionaryImportDeduper {
  private cuckoo: CuckooFilter;
  private bloom: BloomFilter;
  private bloomOnly = false;

  constructor(cuckooCapacity: number = 100000, bloomSize: number = 2000000) {
    this.cuckoo = new CuckooFilter(cuckooCapacity);
    this.bloom = new BloomFilter(bloomSize);
  }

  private isDuplicate(word: string): boolean {
    if (this.bloomOnly) {
      return this.bloom.test(word);
    }
    return this.cuckoo.test(word);
  }

  private remember(word: string): void {
    if (this.bloomOnly) {
      this.bloom.add(word);
      return;
    }

    const inserted = this.cuckoo.add(word);
    if (!inserted) {
      // Cuckoo reached a pathological state (high load/kick loops).
      // Continue with Bloom as best-effort to keep import moving.
      this.bloomOnly = true;
    }
    this.bloom.add(word);
  }

  dedupeBatch(entries: Partial<DictionaryEntry>[]): DedupResult {
    const unique: Partial<DictionaryEntry>[] = [];
    let dropped = 0;

    for (const entry of entries) {
      const rawWord = entry.word || '';
      const normalizedWord = normalizeWord(rawWord);
      if (!normalizedWord) {
        dropped++;
        continue;
      }

      if (this.isDuplicate(normalizedWord)) {
        dropped++;
        continue;
      }

      this.remember(normalizedWord);
      unique.push({
        ...entry,
        word: normalizedWord,
      });
    }

    return { entries: unique, dropped };
  }
}

