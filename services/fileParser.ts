
import { TranscriptionSegment, DictionaryEntry } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs';

// --- Worker Logic as String ---
const workerCode = `
self.onmessage = async (e) => {
  const { file } = e.data;
  const reader = new FileReader();

  reader.onprogress = (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 50); // Reading is first 50%
      self.postMessage({ type: 'progress', value: percent });
    }
  };

  reader.onload = () => {
    const text = reader.result;
    const extension = file.name.split('.').pop().toLowerCase();
    
    try {
      let entries = [];
      let skippedCount = 0;
      self.postMessage({ type: 'progress', value: 60, status: 'Parsing text...' });

      if (extension === 'json') {
        try {
          const json = JSON.parse(text);
          if (Array.isArray(json)) {
            entries = json.map(item => {
              if (!item.word || (!item.translation && !item.definition && !item.meaning)) {
                skippedCount++;
                return null;
              }
              return {
                word: item.word || item.term,
                translation: item.translation || item.definition || item.meaning
              };
            }).filter(Boolean);
          } else if (typeof json === 'object') {
            entries = Object.entries(json).map(([key, value]) => ({
              word: key,
              translation: String(value)
            }));
          }
        } catch (jsonErr) {
          throw new Error("Invalid JSON format");
        }
      } 
      else if (extension === 'csv' || extension === 'txt') {
        const lines = text.split('\\n');
        const totalLines = lines.length;
        
        for (let i = 0; i < totalLines; i++) {
           if (i % 5000 === 0) {
             const p = 60 + Math.round((i / totalLines) * 30); // Parsing is next 30%
             self.postMessage({ type: 'progress', value: p });
           }
           
           try {
             const line = lines[i].trim();
             if (!line) continue;
             
             // Smart split: tabs, comma, or chinese comma
             const parts = line.split(/,|，|\\t/);
             
             if (parts.length >= 2) {
               const word = parts[0].trim();
               const translation = parts.slice(1).join(',').trim();
               if (word && translation) {
                 entries.push({ word, translation });
               } else {
                 skippedCount++;
               }
             } else {
               skippedCount++;
             }
           } catch (lineErr) {
             skippedCount++;
             continue; // Skip malformed lines
           }
        }
      }
      
      self.postMessage({ type: 'progress', value: 90, status: 'Finalizing...' });
      
      const statusMsg = skippedCount > 0 
        ? \`Parsed \${entries.length} items (Skipped \${skippedCount} errors)\` 
        : null;

      self.postMessage({ type: 'done', result: entries, status: statusMsg });

    } catch (err) {
      self.postMessage({ type: 'error', error: err.message });
    }
  };

  reader.onerror = () => {
    self.postMessage({ type: 'error', error: 'Failed to read file' });
  };

  reader.readAsText(file);
};
`;

// Helper to create worker from string
const createWorker = () => {
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
};

export const parseDictionaryFileInWorker = (file: File, onProgress: (p: number, s?: string) => void): Promise<DictionaryEntry[]> => {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    
    worker.onmessage = (e) => {
      const { type, value, status, result, error } = e.data;
      if (type === 'progress') {
        onProgress(value, status);
      } else if (type === 'done') {
        if (status) console.log(status);
        resolve(result);
        worker.terminate();
      } else if (type === 'error') {
        reject(new Error(error));
        worker.terminate();
      }
    };

    worker.postMessage({ file });
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

export const parseDictionaryFile = async (file: File): Promise<DictionaryEntry[]> => {
  return parseDictionaryFileInWorker(file, () => {});
};
