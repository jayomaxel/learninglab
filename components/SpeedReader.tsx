
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language, DifficultyAnalysis } from '../types';
import { translateText, fetchReadingMaterial, analyzeTextDifficulty } from '../services/gemini';
import { parseLocalFile } from '../services/fileParser';
import { globalBloomFilter } from '../services/bloomFilter'; // Import global BF
import { db } from '../services/db'; 
import DifficultyWarmup from './DifficultyWarmup';

interface SpeedReaderProps { 
  language: Language; 
  onSaveWord: (word: string, context: string) => void;
  knownWords?: Set<string>; // Kept for backwards compatibility but BF is preferred
}

const getORPIndex = (text: string): number => {
  const len = text.length;
  if (len <= 1) return 0;
  if (len <= 5) return Math.ceil(len / 2) - 1;
  const idx = Math.floor(len * 0.4);
  // Optimization: Try not to land on a space if possible, shift to next char
  if (text[idx] === ' ' && idx < len - 1) return idx + 1;
  return idx;
};

const SpeedReader: React.FC<SpeedReaderProps> = ({ language, onSaveWord, knownWords = new Set() }) => {
  const [text, setText] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [wpm, setWpm] = useState(300);
  const [chunkSize, setChunkSize] = useState(1); 
  const [chunks, setChunks] = useState<string[]>([]);
  const [currentChunkIdx, setCurrentChunkIdx] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DifficultyAnalysis | null>(null);
  const [showWarmup, setShowWarmup] = useState(false);
  
  const [isSmartPacing, setIsSmartPacing] = useState(true); 
  const [showContext, setShowContext] = useState(true); 

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  // Check if word is known using Bloom Filter OR Set
  const isWordKnown = useCallback((word: string) => {
      const w = word.toLowerCase().trim().replace(/[.,!?;:()"'«»]/g, '');
      // Check Set first (User Memory) then Bloom Filter (IndexedDB/External)
      return knownWords.has(w) || globalBloomFilter.test(w);
  }, [knownWords]);

  const processTextIntoChunks = useCallback((rawText: string, size: number) => {
    const rawWords = rawText.trim().split(/\s+/);
    const newChunks: string[] = [];
    let tempChunk: string[] = [];
    for (let i = 0; i < rawWords.length; i++) {
      const word = rawWords[i];
      tempChunk.push(word);
      const hasPunctuation = /[.!?;:,]$/.test(word);
      const isFull = tempChunk.length >= size;
      const isLast = i === rawWords.length - 1;
      if (isFull || hasPunctuation || isLast) {
        newChunks.push(tempChunk.join(' '));
        tempChunk = [];
      }
    }
    return newChunks;
  }, []);

  const prepareToRead = useCallback(async () => {
    // Optimization: If analysisResult exists, don't re-analyze
    if (!analysisResult && text.length > 50) {
        setAnalyzing(true);
        // Note: analyzeTextDifficulty still uses simple check, logic there might need update to use BF if we pass it
        // but for now we stick to knownWords set for API call to save bandwidth
        const result = await analyzeTextDifficulty(text, language, knownWords);
        setAnalyzing(false);
        setAnalysisResult(result);
        if (result.suggestion === 'HARD' || result.difficultWords.length > 0) {
            setShowWarmup(true);
            return;
        }
    }
    const processed = processTextIntoChunks(text, chunkSize);
    if (processed.length > 0) {
      setChunks(processed);
      setCurrentChunkIdx(0);
      setIsPlaying(true);
    }
  }, [text, chunkSize, language, analysisResult, processTextIntoChunks, knownWords]);

  const handleWarmupProceed = () => {
      setShowWarmup(false);
      const processed = processTextIntoChunks(text, chunkSize);
      if (processed.length > 0) {
        setChunks(processed);
        setCurrentChunkIdx(0);
        setIsPlaying(true);
      }
  };

  const startReading = useCallback(() => { prepareToRead(); }, [prepareToRead]);
  const togglePlayback = useCallback(() => {
    if (chunks.length === 0 && text) { startReading(); } else if (chunks.length > 0) { setIsPlaying(prev => !prev); }
  }, [chunks.length, text, startReading]);

  // FIX: Reset shouldn't clear analysisResult if text is same.
  // The useEffect on [text] handles clearing analysisResult when content changes.
  const reset = useCallback(() => { 
      setIsPlaying(false); 
      setCurrentChunkIdx(-1); 
      setChunks([]); 
      setShowWarmup(false); 
      // Removed setAnalysisResult(null) to prevent re-fetching on simple reset
  }, []);

  useEffect(() => { setTranslation(null); if (text) setAnalysisResult(null); }, [text]);

  const handleTranslate = useCallback(async () => {
    if (!text.trim()) return;
    setTranslating(true); setTranslation(null);
    try {
      const resp = await translateText(text);
      setTranslation(resp);
      await db.logSession({ id: Date.now().toString(), type: 'READER', language, score: 1, duration: 0, timestamp: Date.now() });
    } catch (err) { setTranslation("翻译出错，请稍后再试。"); } finally { setTranslating(false); }
  }, [text, language]);

  const saveCurrentChunk = useCallback(() => {
    if (currentChunkIdx >= 0 && chunks.length > 0) {
        const chunkText = chunks[currentChunkIdx];
        const cleanWord = chunkText.replace(/[.,!?;:()"'«»]/g, '').trim();
        const start = Math.max(0, currentChunkIdx - 2);
        const end = Math.min(chunks.length, currentChunkIdx + 3);
        const context = chunks.slice(start, end).join(' ');
        onSaveWord(cleanWord, context);
    }
  }, [currentChunkIdx, chunks, onSaveWord]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (showWarmup) return;
      if (e.key === ' ') { e.preventDefault(); togglePlayback(); }
      if (e.key === 'Escape') { e.preventDefault(); handleTranslate(); }
      if (e.ctrlKey && e.key === 'ArrowUp') { e.preventDefault(); setWpm(prev => Math.min(prev + 25, 800)); }
      if (e.ctrlKey && e.key === 'ArrowDown') { e.preventDefault(); setWpm(prev => Math.max(prev - 25, 50)); }
      if (e.ctrlKey && e.key === 'Backspace') { e.preventDefault(); reset(); }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrentChunk(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback, handleTranslate, reset, saveCurrentChunk, showWarmup]);

  const handleGenerateContent = async () => {
    if (!aiInput) return;
    setLoading(true);
    setSources([]); 
    try { 
        const result = await fetchReadingMaterial(aiInput, language); 
        setText(result.text); 
        setSources(result.sources);
        reset(); 
    } catch (err) { alert("AI 提取内容失败"); } finally { setLoading(false); }
  };
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      setSources([]);
      try { const content = await parseLocalFile(file); if (!content) { alert("文件为空"); } else { setText(content); reset(); } } catch (err: any) { alert(err.message || "读取文件失败"); } finally { setLoading(false); }
    }
  };

  const calculateDelay = (chunk: string, baseWpm: number) => {
      const baseDelay = (60 / baseWpm) * 1000 * chunk.split(' ').length;
      if (!isSmartPacing) return baseDelay;

      let factor = 1.0;
      const clean = chunk.toLowerCase().replace(/[^\w]/g, '');

      // Check Bloom Filter for familiarity
      if (isWordKnown(clean)) factor -= 0.2; 

      if (chunk.length > 12) factor += 0.4; 
      else if (chunk.length < 4) factor -= 0.1; 

      if (/[.!?]$/.test(chunk)) factor += 1.5; 
      else if (/[,:;]$/.test(chunk)) factor += 0.6; 
      else if (/[)"]$/.test(chunk)) factor += 0.4; 

      return baseDelay * factor;
  };

  useEffect(() => {
    if (isPlaying && currentChunkIdx < chunks.length) {
      const currentText = chunks[currentChunkIdx];
      const delay = calculateDelay(currentText, wpm);
      
      timerRef.current = window.setTimeout(() => { 
          if (currentChunkIdx < chunks.length - 1) setCurrentChunkIdx(prev => prev + 1); 
          else setIsPlaying(false); 
      }, delay);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, currentChunkIdx, wpm, chunks, isSmartPacing, isWordKnown]); 

  // FIX: ORP Alignment using Flexbox and whitespace-pre for spaces
  const renderORP = (chunkText: string, isCenter: boolean = true) => {
    if (!chunkText) return null;
    const orpIndex = getORPIndex(chunkText);
    const leftPart = chunkText.substring(0, orpIndex);
    const pivotChar = chunkText[orpIndex];
    const rightPart = chunkText.substring(orpIndex + 1);
    
    // Bloom Filter Highlight Logic
    const cleanWord = chunkText.replace(/[.,!?;:()"'«»]/g, '').toLowerCase().trim();
    const isKnown = isWordKnown(cleanWord);
    
    const baseClass = isCenter 
        ? "text-3xl sm:text-6xl tracking-tighter text-slate-800" 
        : "text-2xl sm:text-4xl tracking-tighter text-slate-400 blur-[1px] opacity-40 scale-90";

    const pivotClass = isCenter
        ? `text-3xl sm:text-6xl font-black mx-0.5 ${isKnown ? 'has-definition text-green-600' : 'text-red-500'}`
        : "text-2xl sm:text-4xl font-bold mx-0.5 text-slate-400 opacity-40";

    // Use Flexbox with flex-1 on sides to ensure absolute centering of the pivot
    // whitespace-pre ensures leading/trailing spaces (gaps between words) are preserved visualy
    return (
      <div className={`flex items-baseline justify-center w-full select-none cursor-default whitespace-pre transition-all duration-200 ${!isCenter ? 'grayscale' : ''}`}>
        <div className={`flex-1 text-right overflow-hidden font-mono ${baseClass}`}>{leftPart}</div>
        <div className={`flex-none font-mono ${pivotClass}`}>{pivotChar}</div>
        <div className={`flex-1 text-left overflow-hidden font-mono ${baseClass}`}>{rightPart}</div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom duration-700 relative">
      {showWarmup && analysisResult && (
        <DifficultyWarmup analysis={analysisResult} onProceed={handleWarmupProceed} onCancel={() => setShowWarmup(false)} />
      )}
      
      <div className="bg-white p-5 rounded-3xl border border-slate-200 flex flex-wrap items-center gap-4 group focus-within:border-green-500 transition-all">
        <input 
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          placeholder="粘贴链接或主题，AI 提取正文..."
          className="flex-1 bg-transparent border-none py-2 text-sm outline-none font-medium text-slate-900 placeholder-slate-400 min-w-[200px]"
        />
        <div className="flex gap-2">
            <input type="file" accept=".txt,.md,.pdf" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-200 hover:text-slate-800 transition-colors whitespace-nowrap">
                {loading ? '解析中...' : '导入文件'}
            </button>
            <button onClick={handleGenerateContent} disabled={loading || !aiInput} className="bg-green-500 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-green-600 disabled:opacity-50 transition-colors whitespace-nowrap">
                {loading ? '提取中...' : '开始提取'}
            </button>
        </div>
      </div>
      
      {sources.length > 0 && (
          <div className="px-2">
             <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
                <span className="font-bold uppercase tracking-widest text-slate-500 mr-1">Sources:</span>
                {sources.map((src, i) => (
                    <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="hover:text-green-600 hover:underline truncate max-w-[200px]">
                        {new URL(src).hostname}
                    </a>
                ))}
             </div>
          </div>
      )}

      <div className="bg-white rounded-[40px] p-10 sm:p-20 relative overflow-hidden border border-slate-200 min-h-[350px] flex flex-col justify-between">
        {analysisResult?.starRating && (
            <div className="absolute top-6 right-6 flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                {[1,2,3,4,5].map(star => (
                    <span key={star} className={`text-lg ${star <= analysisResult.starRating! ? 'text-yellow-500' : 'text-slate-300'}`}>★</span>
                ))}
                <span className="text-xs font-bold text-slate-400 ml-2">Readability</span>
            </div>
        )}
        
        <div className="absolute top-6 left-6 flex flex-col gap-2 z-20">
             <button 
                onClick={() => setIsSmartPacing(!isSmartPacing)} 
                className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 ${isSmartPacing ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
             >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Smart Pacing {isSmartPacing ? 'ON' : 'OFF'}
             </button>
             <button 
                onClick={() => setShowContext(!showContext)} 
                className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 ${showContext ? 'bg-teal-50 text-teal-600 border-teal-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
             >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Visual Guide {showContext ? 'ON' : 'OFF'}
             </button>
        </div>

        <div className="relative flex-1 flex items-center justify-center w-full max-w-5xl mx-auto h-[120px]">
          {analyzing ? (
              <div className="flex flex-col items-center gap-4 text-slate-500">
                  <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-bold text-sm tracking-widest uppercase">Analyzing i+1 Difficulty...</span>
              </div>
          ) : currentChunkIdx >= 0 && currentChunkIdx < chunks.length ? (
            <div className="relative w-full flex items-center justify-center">
                {showContext && currentChunkIdx > 0 && (
                    <div className="absolute left-0 w-[30%] flex justify-end pr-8 pointer-events-none select-none hidden md:flex">
                        {renderORP(chunks[currentChunkIdx - 1], false)}
                    </div>
                )}
                
                <div className="relative z-10 scale-100 transform transition-transform w-full max-w-3xl">
                     {renderORP(chunks[currentChunkIdx], true)}
                     <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 pointer-events-none bg-red-500/10" />
                     <div className="absolute top-1/2 left-[-100px] right-[-100px] h-px bg-slate-200 -translate-y-1/2 pointer-events-none" />
                </div>

                {showContext && currentChunkIdx < chunks.length - 1 && (
                    <div className="absolute right-0 w-[30%] flex justify-start pl-8 pointer-events-none select-none hidden md:flex">
                        {renderORP(chunks[currentChunkIdx + 1], false)}
                    </div>
                )}
            </div>
          ) : (
            <div className="text-slate-400 font-bold italic text-xl animate-pulse text-center">按下 空格键 开始</div>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-6 relative z-10 w-full max-w-2xl mx-auto">
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
             <div className="h-full bg-green-500 transition-all duration-200 ease-linear" style={{ width: `${chunks.length ? ((currentChunkIdx + 1) / chunks.length) * 100 : 0}%` }} />
          </div>
          <div className="flex items-center gap-6 sm:gap-10">
            <button onClick={reset} className="p-4 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 border border-slate-200 transition-all" title="Reset">
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            <button onClick={togglePlayback} disabled={analyzing} className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all ${isPlaying ? 'bg-slate-100 border-2 border-slate-200 text-slate-900' : 'bg-green-500 text-white'} disabled:opacity-50`}>
              {isPlaying ? <svg className="w-8 h-8 sm:w-10 sm:h-10 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg> : <svg className="w-8 h-8 sm:w-10 sm:h-10 ml-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <button onClick={saveCurrentChunk} disabled={currentChunkIdx < 0} className={`p-4 rounded-full border transition-all ${currentChunkIdx >= 0 ? 'bg-yellow-50 text-yellow-600 border-yellow-200 hover:border-yellow-400' : 'bg-slate-50 text-slate-400 border-slate-200'}`} title="收藏当前意群 (S)">
               <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3v18l7-3 7 3V3H5z" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-28">
               <div className="flex justify-between items-start">
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Speed (WPM)</span>
                 <span className="text-2xl font-black text-slate-900">{wpm}</span>
               </div>
               <input type="range" min="50" max="800" step="25" value={wpm} onChange={(e) => setWpm(parseInt(e.target.value))} className="w-full accent-green-500 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
             </div>
             <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-28">
               <div className="flex justify-between items-start">
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Chunk Size</span>
                 <span className="text-2xl font-black text-slate-900">{chunkSize} <span className="text-sm text-slate-500 font-medium">words</span></span>
               </div>
               <div className="flex gap-2">
                 {[1, 2, 3, 4].map(size => (
                   <button key={size} onClick={() => setChunkSize(size)} className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${chunkSize === size ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                     {size}
                   </button>
                 ))}
               </div>
             </div>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="在此粘贴文本，导入TXT/PDF，或使用上方 AI 提取..." className="w-full h-64 bg-white border border-slate-200 rounded-[32px] p-8 text-slate-700 text-lg leading-relaxed outline-none focus:border-green-500 transition-all resize-none font-medium shadow-sm placeholder-slate-400" />
        </div>
        <div className="bg-white rounded-[32px] p-8 border border-slate-200 overflow-hidden flex flex-col min-h-[500px] shadow-sm">
           <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">全文翻译</h3>
              {translating && <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />}
           </div>
           <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
             {translating ? (
               <div className="space-y-3 animate-pulse">
                 <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                 <div className="h-4 bg-slate-100 rounded w-full"></div>
                 <div className="h-4 bg-slate-100 rounded w-5/6"></div>
               </div>
             ) : translation ? (
                <div className="text-slate-700 leading-relaxed font-medium text-sm whitespace-pre-wrap">{translation}</div>
             ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center"><p className="text-sm">点击“全文翻译”<br/>或按下 Esc 键</p></div>
             )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default SpeedReader;
