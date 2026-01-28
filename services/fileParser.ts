
import { DictionaryEntry, TranscriptionSegment } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs';

// Worker code for heavy lifting
const workerCode = `
class SimpleBloomFilter {
  constructor(size = 2000000) {
    this.size = size;
    this.bitArray = new Uint8Array(Math.ceil(size / 8));
  }
  hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  add(str) {
    const h = this.hash(str);
    const k = 3; 
    for (let i = 0; i < k; i++) {
      const idx = (h + i * 0x5bd1e995) % this.size;
      const byteIdx = Math.floor(idx / 8);
      const bitIdx = idx % 8;
      this.bitArray[byteIdx] |= (1 << bitIdx);
    }
  }
  getBuffer() { return this.bitArray.buffer; }
}

let streamLeftover = '';
let currentBatch = [];
let processedCount = 0;
const BATCH_SIZE = 3000;
const bloom = new SimpleBloomFilter(2000000);
const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

function processLines(lines) {
  for (const line of lines) {
     if (!line.trim()) continue;
     
     let parts;
     if (line.includes('\\t')) parts = line.split('\\t');
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
                 if (extra && extra.match(/[\\u4e00-\\u9fa5]/)) {
                     metadata.hanja = extra;
                 }
            }
             
             bloom.add(word.toLowerCase());
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
          if (leftover.trim()) processLines([leftover]);
          if (currentBatch.length > 0) {
             self.postMessage({ type: 'batch', entries: currentBatch });
             processedCount += currentBatch.length;
          }
          self.postMessage({ type: 'done', total: processedCount, bloomBuffer: bloom.getBuffer() }, [bloom.getBuffer()]);
          return;
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const reader = new FileReader();

        reader.onload = (e) => {
          const buffer = e.target.result;
          const textChunk = decoder.decode(buffer, { stream: true });
          const combined = leftover + textChunk;
          const lines = combined.split(/\\r?\\n/);
          
          leftover = lines.pop(); 
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
      // We rely on the main thread to calculate download progress, 
      // but we report count back for UI
      self.postMessage({ type: 'progress', value: 0, count: processedCount }); 
  }

  if (type === 'streamEnd') {
      if (streamLeftover.trim()) processLines([streamLeftover]);
      if (currentBatch.length > 0) {
          self.postMessage({ type: 'batch', entries: currentBatch });
          processedCount += currentBatch.length;
      }
      self.postMessage({ type: 'done', total: processedCount, bloomBuffer: bloom.getBuffer() }, [bloom.getBuffer()]);
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
};

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
                if (!line.trim()) continue;
                let parts;
                if (line.includes('\t')) parts = line.split('\t');
                else if (line.includes(',')) parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                else parts = line.split('，');

                if (parts.length >= 2) {
                    const word = parts[0].trim().replace(/^"|"$/g, '');
                    const translation = parts.slice(1).join(',').trim().replace(/^"|"$/g, '');
                    if (word && translation) {
                        previewData.push({ word, translation });
                    }
                }
            }
            resolve(previewData);
        };
        reader.onerror = () => reject(new Error("Failed to read file for preview"));
        reader.readAsText(slice);
    });
};

export const readTextFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

export const readPdfFile = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    return fullText.trim();
  } catch (error) {
    console.error("PDF Parsing Error:", error);
    throw new Error("PDF 解析失败，请确保文件未损坏且包含可选文本（非纯图片扫描件）。");
  }
};

export const parseLocalFile = async (file: File): Promise<string> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') {
    return await readPdfFile(file);
  } else {
    return await readTextFile(file);
  }
};

const timeToSeconds = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.replace(',', '.').split(':');
  let seconds = 0;
  if (parts.length === 3) {
    seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return seconds;
};

export const parseSubtitle = (content: string): TranscriptionSegment[] => {
  const segments: TranscriptionSegment[] = [];
  const cleanContent = content.replace(/\r\n/g, '\n');
  const blocks = cleanContent.split(/\n\n+/);
  
  blocks.forEach(block => {
    const timeMatch = block.match(/(\d{1,2}:)?\d{1,2}:\d{1,2}[.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{1,2}[.,]\d{3}/);
    if (timeMatch) {
      const times = timeMatch[0].split('-->');
      const start = timeToSeconds(times[0].trim());
      const end = timeToSeconds(times[1].trim());
      
      const lines = block.split('\n');
      const timeLineIndex = lines.findIndex(line => line.includes('-->'));
      
      if (timeLineIndex !== -1 && timeLineIndex < lines.length - 1) {
        const textLines = lines.slice(timeLineIndex + 1);
        const text = textLines.join(' ')
          .replace(/<[^>]+>/g, '') 
          .replace(/\{[^}]+\}/g, '') 
          .trim();
        if (text) {
          segments.push({ start, end, text, translation: '（无翻译）' });
        }
      }
    }
  });
  return segments;
};
