import { DictionaryEntry, TranscriptionSegment } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs';

// Worker code for heavy lifting
const workerCode = `
class SimpleCuckooFilter {
    constructor(capacity = 100000, bucketSize = 4) {
        this.capacity = capacity;
        this.bucketSize = bucketSize;
        this.buckets = Array.from({ length: capacity }, () => new Uint8Array(bucketSize));
    }
    hash(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
    }
    getFingerprint(str) { return (this.hash(str) & 0xFF) || 1; }
    getHash1(str) { return this.hash(str) % this.capacity; }
    getHash2(i1, f) { return (i1 ^ this.hash(f.toString())) % this.capacity; }
    add(str) {
        const f = this.getFingerprint(str);
        const i1 = this.getHash1(str);
        const i2 = this.getHash2(i1, f);
        if (this.insert(i1, f) || this.insert(i2, f)) return true;
        let i = Math.random() < 0.5 ? i1 : i2;
        for (let n = 0; n < 200; n++) {
            const b = this.buckets[i];
            const idx = Math.floor(Math.random() * this.bucketSize);
            const kickedF = b[idx]; b[idx] = f;
            const newF = kickedF; i = this.getHash2(i, newF);
            if (this.insert(i, newF)) return true;
        }
        return false;
    }
    insert(idx, f) {
        const b = this.buckets[idx];
        for (let j = 0; j < this.bucketSize; j++) { if (b[j] === 0) { b[j] = f; return true; } }
        return false;
    }
    getBuffer() { 
        const flat = new Uint8Array(this.capacity * this.bucketSize);
        for(let i=0; i<this.capacity; i++) flat.set(this.buckets[i], i * this.bucketSize);
        return flat.buffer; 
    }
}

let streamLeftover = '';
let currentBatch = [];
let processedCount = 0;
const BATCH_SIZE = 3000;
const cuckoo = new SimpleCuckooFilter(100000);
const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

function processLines(lines) {
  for (const line of lines) {
     if (!line.trim()) continue;
     
     let parts;
     if (line.includes('\t')) parts = line.split('\t');
     else if (line.includes(',')) parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); 
     else parts = line.split('，');

  if (typeof line !== 'string' || !line.trim()) continue;
  let parts;
  if (line.includes('\t')) parts = line.split('\t');
  else if (line.includes(',')) parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
  else parts = line.split('，');

  if (parts.length >= 2) {
         let word = parts[0].trim().replace(/^"|"$/g, '');
         let translation = parts.slice(1).join(',').trim().replace(/^"|"$/g, '');
         
         if (word && translation) {
            let metadata = {};
            // Optional: Parse Hanja if in CSV (e.g., column 3)
            if (parts.length > 2) {
                 const extra = parts[2].trim().replace(/^"|"$/g, '');
                 if (extra && extra.match(/[\u4e00-\u9fa5]/)) {
                     metadata.hanja = extra;
                 }
            }
             
             cuckoo.add(word.toLowerCase());
             currentBatch.push({ word, translation, metadata });

             if (currentBatch.length >= BATCH_SIZE) {
                 self.postMessage({ type: 'batch', entries: currentBatch });
                 processedCount += currentBatch.length;
                 currentBatch = [];
             }
         }
     }
  }
}

self.onmessage = async (e) => {
  const { type, file } = e.data;

  // --- FILE MODE ---
  if (file) {
      const CHUNK_SIZE = 1024 * 1024; 
      let offset = 0;
      let leftover = ''; 
      const fileSize = file.size;

      function readNextChunk() {
        if (offset >= fileSize) {
          if (leftover && leftover.trim()) processLines([leftover]);
          if (currentBatch.length > 0) {
             self.postMessage({ type: 'batch', entries: currentBatch });
             processedCount += currentBatch.length;
          }
          const buffer = cuckoo.getBuffer();
          self.postMessage({ type: 'done', total: processedCount, bloomBuffer: buffer }, [buffer]);
          return;
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const reader = new FileReader();

        reader.onload = (e) => {
          const buffer = e.target.result;
          const textChunk = decoder.decode(buffer, { stream: true });
          const combined = leftover + textChunk;
          const lines = combined.split(/\\r?\\n/);
          
          leftover = lines.pop() || ''; 
          processLines(lines);
            leftover = Array.isArray(lines) && lines.length ? lines.pop() : '';
            if (!Array.isArray(lines)) return;
            processLines(lines);

          const progress = Math.min(100, Math.round(((offset + CHUNK_SIZE) / fileSize) * 100));
          self.postMessage({ type: 'progress', value: progress, count: processedCount });

          offset += CHUNK_SIZE;
          setTimeout(readNextChunk, 0); 
        };
        reader.onerror = () => self.postMessage({ type: 'error', error: 'Read error' });
        reader.readAsArrayBuffer(slice);
      }
      readNextChunk();
  }

  // --- STREAM MODE ---
  if (type === 'streamData') {
      const { chunk } = e.data;
      const textChunk = decoder.decode(chunk, { stream: true });
      const combined = streamLeftover + textChunk;
      const lines = combined.split(/\\r?\\n/);
      streamLeftover = lines.pop() || '';
      processLines(lines);
      streamLeftover = Array.isArray(lines) && lines.length ? lines.pop() : '';
      if (!Array.isArray(lines)) return;
      processLines(lines);
      // We rely on the main thread to calculate download progress, 
      // but we report count back for UI
      self.postMessage({ type: 'progress', value: 0, count: processedCount }); 
  }

  if (type === 'streamEnd') {
      if (streamLeftover && streamLeftover.trim()) processLines([streamLeftover]);
      if (currentBatch.length > 0) {
          self.postMessage({ type: 'batch', entries: currentBatch });
          processedCount += currentBatch.length;
      }
      const buffer = cuckoo.getBuffer();
      self.postMessage({ type: 'done', total: processedCount, bloomBuffer: buffer }, [buffer]);
  }
};
`;

const createWorker = () => {
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
};

export const createDictionaryStreamParser = (
  onProgress: (count: number) => void,
  onBatch: (entries: Partial<DictionaryEntry>[]) => Promise<void>
) => {
  const worker = createWorker();

  worker.onmessage = async (e) => {
    const { type, count, entries, total, bloomBuffer, error } = e.data;
    if (type === 'progress') {
      onProgress(count);
    } else if (type === 'batch') {
      await onBatch(entries);
    } else if (type === 'done') {
      // Stream finished
    } else if (type === 'error') {
      console.error(error);
    }
  };

  return {
    push: (chunk: Uint8Array) => {
      worker.postMessage({ type: 'streamData', chunk }, [chunk.buffer]);
    },
    end: () => {
      return new Promise<{ total: number, bloomBuffer: ArrayBuffer }>((resolve) => {
        const finalListener = (e: MessageEvent) => {
          if (e.data.type === 'done') {
            worker.removeEventListener('message', finalListener);
            worker.terminate();
            resolve({ total: e.data.total, bloomBuffer: e.data.bloomBuffer });
          }
        };
        worker.addEventListener('message', finalListener);
        worker.postMessage({ type: 'streamEnd' });
      });
    }
  };
};

export const parseDictionaryFileStream = (
  file: File,
  onProgress: (percent: number, count: number) => void,
  onBatch: (entries: Partial<DictionaryEntry>[]) => Promise<void>
): Promise<{ total: number, bloomBuffer: ArrayBuffer }> => {
  return new Promise((resolve, reject) => {
    const worker = createWorker();

    worker.onmessage = async (e) => {
      const { type, value, count, entries, error, total, bloomBuffer } = e.data;

      if (type === 'progress') {
        onProgress(value, count);
      } else if (type === 'batch') {
        try {
          await onBatch(entries);
        } catch (err) {
          console.error("Batch insert failed", err);
        }
      } else if (type === 'done') {
        resolve({ total, bloomBuffer });
        worker.terminate();
      } else if (type === 'error') {
        reject(new Error(error));
        worker.terminate();
      }
    };

    worker.postMessage({ file });
    });
  }

/**
 * Reads the first 2KB of a file to generate a preview of how it will be parsed.
 */
export const previewDictionaryFile = async (file: File): Promise<{ word: string, translation: string }[]> => {
  return new Promise((resolve, reject) => {
    const slice = file.slice(0, 2048); // Read first 2KB
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).slice(0, 6); // Take first 6 lines
      const previewData: { word: string, translation: string }[] = [];

      for (const line of lines) {
        if (typeof line !== 'string' || !line.trim()) continue;
        let parts;
        if (line.includes('\t')) parts = line.split('\t');
        else if (line.includes(',')) parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        else parts = line.split('，');

        if (parts.length >= 2) {
          const word = parts[0].trim().replace(/^"|"$/g, '');
          const translation = parts.slice(1).join(',').trim().replace(/^"|"$/g, '');
          previewData.push({ word, translation });
        }
      }
      resolve(previewData);
    };
    reader.onerror = (e) => {
      reject(e);
    };
    reader.readAsText(slice);
  });
};
