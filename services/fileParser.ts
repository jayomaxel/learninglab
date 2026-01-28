
import { TranscriptionSegment } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.mjs';

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
    // Load the document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    
    // Iterate over all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Extract text items and join them
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
        
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
  // Handle formats: HH:MM:SS,ms or HH:MM:SS.ms or MM:SS.ms
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
  // Normalize line endings
  const cleanContent = content.replace(/\r\n/g, '\n');
  
  const blocks = cleanContent.split(/\n\n+/);
  
  blocks.forEach(block => {
    // Regex for timestamp line (SRT or VTT style)
    const timeMatch = block.match(/(\d{1,2}:)?\d{1,2}:\d{1,2}[.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{1,2}[.,]\d{3}/);
    if (timeMatch) {
      const times = timeMatch[0].split('-->');
      const start = timeToSeconds(times[0].trim());
      const end = timeToSeconds(times[1].trim());
      
      const lines = block.split('\n');
      const timeLineIndex = lines.findIndex(line => line.includes('-->'));
      
      if (timeLineIndex !== -1 && timeLineIndex < lines.length - 1) {
        // Collect text lines after timestamp
        const textLines = lines.slice(timeLineIndex + 1);
        // Clean text: remove tags, etc.
        const text = textLines.join(' ')
          .replace(/<[^>]+>/g, '') // HTML/XML tags
          .replace(/\{[^}]+\}/g, '') // SSA/ASS tags
          .trim();
          
        if (text) {
          segments.push({
            start,
            end,
            text,
            translation: '（无翻译）' 
          });
        }
      }
    }
  });
  
  return segments;
};
