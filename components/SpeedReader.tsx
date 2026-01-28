
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Language, DifficultyAnalysis } from '../types';
import { translateText, fetchReadingMaterial, analyzeTextDifficulty } from '../services/gemini';
import { parseLocalFile } from '../services/fileParser';
import { db } from '../services/db'; // Update to save study logs
import DifficultyWarmup from './DifficultyWarmup';

interface SpeedReaderProps { 
  language: Language; 
  onSaveWord: (word: string, context: string) => void;
  knownWords?: Set<string>; // For Visual Hints
}

// Helper to determine the "Optimal Recognition Point" index
const getORPIndex = (text: string): number => {
  const len = text.length;
  if (len <= 1) return 0;
  if (len <= 5) return Math.ceil(len / 2) - 1;
  // For longer phrases, anchor slightly left of center
  return Math.floor(len * 0.4); 
};

const SpeedReader: React.FC<SpeedReaderProps> = ({ language, onSaveWord, knownWords = new Set() }) => {
  const [text, setText] = useState('');
  
  // Settings
  const [wpm, setWpm] = useState(300);
  const [chunkSize, setChunkSize] = useState(2); // Words per chunk
  
  // State
  const [chunks, setChunks] = useState<string[]>([]);
  const [currentChunkIdx, setCurrentChunkIdx] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Analysis State
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DifficultyAnalysis | null>(null);
  const [showWarmup, setShowWarmup] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  // 1. Smart Chunking Algorithm
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

      // Break chunk if: size reached, punctuation found, or end of text
      if (isFull || hasPunctuation || isLast) {
        newChunks.push(tempChunk.join(' '));
        tempChunk = [];
      }
    }
    return newChunks;
  }, []);

  const prepareToRead = useCallback(async () => {
    // Before starting, analyze text if not already analyzed
    if (!analysisResult && text.length > 50) {
        setAnalyzing(true);
        const result = await analyzeTextDifficulty(text, language, knownWords);
        setAnalyzing(false);
        setAnalysisResult(result);
        
        // Show warmup if it's hard OR if there are distinct difficult words found
        if (result.suggestion === 'HARD' || result.difficultWords.length > 0) {
            setShowWarmup(true);
            return; // Stop here, wait for user to click "Proceed" in Warmup
        }
    }
    
    // Proceed to reading
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

  const startReading = useCallback(() => {
     prepareToRead();
  }, [prepareToRead]);

  const togglePlayback = useCallback(() => {
    if (chunks.length === 0 && text) {
      startReading();
    } else if (chunks.length > 0) {
      setIsPlaying(prev => !prev);
    }
  }, [chunks.length, text, startReading]);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentChunkIdx(-1);
    setChunks([]);
    setAnalysisResult(null); // Clear analysis on full reset
    setShowWarmup(false);
  }, []);

  useEffect(() => {
    if (text && !isPlaying && currentChunkIdx === -1) {
       // Allow changing chunk size to re-process text if not playing
    }
  }, [chunkSize]);

  // Translation Logic
  useEffect(() => {
    setTranslation(null);
    // Reset analysis when text changes manually
    if (text) setAnalysisResult(null);
  }, [text]);

  const handleTranslate = useCallback(async () => {
    if (!text.trim()) return;
    setTranslating(true);
    setTranslation(null);
    try {
      const resp = await translateText(text);
      setTranslation(resp);
      
      // Log interaction
      await db.logSession({
          id: Date.now().toString(),
          type: 'READER',
          language,
          score: 1, // Interaction count
          duration: 0,
          timestamp: Date.now()
      });

    } catch (err) { 
      setTranslation("翻译出错，请稍后再试。"); 
    } finally { 
      setTranslating(false); 
    }
  }, [text, language]);

  // Context Capture: Expanded to neighbors
  const saveCurrentChunk = useCallback(() => {
    if (currentChunkIdx >= 0 && chunks.length > 0) {
        const chunkText = chunks[currentChunkIdx];
        // Clean punctuation for the "Word" field, keep context
        const cleanWord = chunkText.replace(/[.,!?;:()"'«»]/g, '').trim();
        
        // Grab Context: 2 previous + current + 2 next chunks to simulate a sentence/DOM line
        const start = Math.max(0, currentChunkIdx - 2);
        const end = Math.min(chunks.length, currentChunkIdx + 3);
        const context = chunks.slice(start, end).join(' ');
        
        onSaveWord(cleanWord, context);
    }
  }, [currentChunkIdx, chunks, onSaveWord]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (showWarmup) return; // Disable shortcuts during warmup

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

  // AI & File Handlers
  const handleGenerateContent = async () => {
    if (!aiInput) return;
    setLoading(true);
    try {
      const content = await fetchReadingMaterial(aiInput, language);
      setText(content);
      reset();
    } catch (err) { alert("AI 提取内容失败"); }
    finally { setLoading(false); }
  };
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      try {
        const content = await parseLocalFile(file);
        if (!content) {
            alert("文件为空或无法提取文本。");
        } else {
            setText(content);
            reset();
        }
      } catch (err: any) {
        alert(err.message || "读取文件失败");
      } finally {
        setLoading(false);
      }
    }
  };

  // 3. Dynamic Pausing Engine
  useEffect(() => {
    if (isPlaying && currentChunkIdx < chunks.length) {
      const currentText = chunks[currentChunkIdx];
      const wordCount = currentText.split(' ').length;
      
      // Base delay: time per word * number of words in chunk
      // 60 seconds / WPM = seconds per word
      let delay = (60 / wpm) * 1000 * wordCount;

      // Dynamic Punctuation Penalty
      if (/[.!?]/.test(currentText)) {
        delay *= 2.2; // Long pause for sentences
      } else if (/[,:;]/.test(currentText)) {
        delay *= 1.5; // Short pause for clauses
      } else if (currentText.length > 12) {
        delay *= 1.1; // Slight pause for long phrases
      }

      timerRef.current = window.setTimeout(() => {
        if (currentChunkIdx < chunks.length - 1) {
          setCurrentChunkIdx(prev => prev + 1);
        } else {
          setIsPlaying(false);
        }
      }, delay);
    }
    
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, currentChunkIdx, wpm, chunks]);

  // 2. ORP Rendering Logic with Visual Hints
  const renderORP = (chunkText: string) => {
    if (!chunkText) return null;
    
    const orpIndex = getORPIndex(chunkText);
    const leftPart = chunkText.substring(0, orpIndex);
    const pivotChar = chunkText[orpIndex];
    const rightPart = chunkText.substring(orpIndex + 1);
    
    // Check if the base word exists in our dictionary
    const cleanWord = chunkText.replace(/[.,!?;:()"'«»]/g, '').toLowerCase().trim();
    const isKnown = knownWords.has(cleanWord);

    return (
      <div className="flex items-baseline w-full justify-center select-none cursor-default">
        {/* Left Side: Right aligned, pushes content to center */}
        <div className="flex-1 text-right font-mono text-3xl sm:text-6xl tracking-tighter text-slate-800 whitespace-nowrap overflow-hidden">
          {leftPart}
        </div>
        
        {/* Pivot: Fixed Width, Colored, Bold. 
            If known, add .has-definition (green underline in CSS) 
        */}
        <div className={`font-mono text-3xl sm:text-6xl font-black mx-0.5 ${isKnown ? 'has-definition' : ''} ${isKnown ? 'text-green-600' : 'text-red-500'}`}>
          {pivotChar}
        </div>
        
        {/* Right Side: Left aligned */}
        <div className="flex-1 text-left font-mono text-3xl sm:text-6xl tracking-tighter text-slate-800 whitespace-nowrap overflow-hidden">
          {rightPart}
        </div>
        
        {/* Visual Guide Lines (Optional, subtle) */}
        <div className={`absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 pointer-events-none ${isKnown ? 'bg-green-500/20' : 'bg-red-500/10'}`} />
        <div className="absolute top-1/2 left-10 right-10 h-px bg-slate-200 -translate-y-1/2 pointer-events-none" />
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom duration-700 relative">
      {/* WARMUP OVERLAY */}
      {showWarmup && analysisResult && (
        <DifficultyWarmup 
            analysis={analysisResult} 
            onProceed={handleWarmupProceed} 
            onCancel={() => setShowWarmup(false)}
        />
      )}

      {/* Controls Bar */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 flex flex-wrap items-center gap-4 group focus-within:border-green-400 transition-all shadow-sm">
        <input 
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          placeholder="粘贴链接或主题，AI 提取正文..."
          className="flex-1 bg-transparent border-none py-2 text-sm outline-none font-medium min-w-[200px]"
        />
        <div className="flex gap-2">
            <input 
                type="file" 
                accept=".txt,.md,.pdf" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileUpload} 
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors whitespace-nowrap"
            >
                {loading ? '解析中...' : '导入文件'}
            </button>
            <button 
                onClick={handleGenerateContent} 
                disabled={loading || !aiInput} 
                className="bg-green-400 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-green-500 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
                {loading ? '提取中...' : '开始提取'}
            </button>
        </div>
      </div>

      {/* Main Reader Display */}
      <div className="bg-white rounded-[40px] p-10 sm:p-20 relative overflow-hidden border border-slate-200 shadow-sm min-h-[350px] flex flex-col justify-between">
        
        {/* Star Rating Display */}
        {analysisResult?.starRating && (
            <div className="absolute top-6 right-6 flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
                {[1,2,3,4,5].map(star => (
                    <span key={star} className={`text-lg ${star <= analysisResult.starRating! ? 'text-yellow-400' : 'text-slate-200'}`}>★</span>
                ))}
                <span className="text-xs font-bold text-slate-400 ml-2">Readability</span>
            </div>
        )}

        {/* ORP Display Area */}
        <div className="relative flex-1 flex items-center justify-center w-full max-w-4xl mx-auto">
          {analyzing ? (
              <div className="flex flex-col items-center gap-4 text-slate-400">
                  <div className="w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="font-bold text-sm tracking-widest uppercase">Analyzing i+1 Difficulty...</span>
              </div>
          ) : currentChunkIdx >= 0 && currentChunkIdx < chunks.length ? (
            renderORP(chunks[currentChunkIdx])
          ) : (
            <div className="text-slate-300 font-bold italic text-xl animate-pulse text-center">
              按下 空格键 开始
            </div>
          )}
        </div>

        {/* Controls & Progress */}
        <div className="mt-8 flex flex-col items-center gap-6 relative z-10 w-full max-w-2xl mx-auto">
          {/* Progress Bar */}
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
             <div 
               className="h-full bg-green-400 transition-all duration-200 ease-linear" 
               style={{ width: `${chunks.length ? ((currentChunkIdx + 1) / chunks.length) * 100 : 0}%` }} 
             />
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-6 sm:gap-10">
            <button onClick={reset} className="p-4 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 border border-slate-200 transition-all" title="Reset">
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
            
            <button 
              onClick={togglePlayback} 
              disabled={analyzing}
              className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg ${isPlaying ? 'bg-white border-2 border-slate-200 text-slate-800' : 'bg-green-400 text-white shadow-green-200'} disabled:opacity-50`}
            >
              {isPlaying ? (
                <svg className="w-8 h-8 sm:w-10 sm:h-10 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
              ) : (
                <svg className="w-8 h-8 sm:w-10 sm:h-10 ml-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            
            <button 
                onClick={saveCurrentChunk} 
                disabled={currentChunkIdx < 0}
                className={`p-4 rounded-full border transition-all ${currentChunkIdx >= 0 ? 'bg-white text-yellow-500 border-yellow-200 hover:border-yellow-400' : 'bg-slate-50 text-slate-200 border-slate-100'}`}
                title="收藏当前意群 (S)"
            >
               <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3v18l7-3 7 3V3H5z" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Settings & Text Input */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             {/* WPM Control */}
             <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-28">
               <div className="flex justify-between items-start">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Speed (WPM)</span>
                 <span className="text-2xl font-black text-slate-800">{wpm}</span>
               </div>
               <input 
                 type="range" min="50" max="800" step="25" 
                 value={wpm} onChange={(e) => setWpm(parseInt(e.target.value))} 
                 className="w-full accent-green-400 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" 
               />
             </div>
             
             {/* Chunk Size Control */}
             <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between h-28">
               <div className="flex justify-between items-start">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Chunk Size</span>
                 <span className="text-2xl font-black text-slate-800">{chunkSize} <span className="text-sm text-slate-400 font-medium">words</span></span>
               </div>
               <div className="flex gap-2">
                 {[1, 2, 3, 4].map(size => (
                   <button 
                     key={size}
                     onClick={() => setChunkSize(size)}
                     className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${chunkSize === size ? 'bg-green-400 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                   >
                     {size}
                   </button>
                 ))}
               </div>
             </div>
          </div>

          <textarea 
            value={text} 
            onChange={(e) => setText(e.target.value)} 
            placeholder="在此粘贴文本，导入TXT/PDF，或使用上方 AI 提取..." 
            className="w-full h-64 bg-white border border-slate-200 rounded-[32px] p-8 text-slate-800 text-lg leading-relaxed outline-none focus:border-green-400 transition-all resize-none font-medium shadow-sm" 
          />
        </div>

        <div className="bg-white rounded-[32px] p-8 border border-slate-200 overflow-hidden flex flex-col min-h-[500px] shadow-sm">
           <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">全文翻译</h3>
              {translating && <div className="w-2 h-2 bg-green-400 rounded-full animate-ping" />}
           </div>
           <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
             {translating ? (
               <div className="space-y-3 animate-pulse">
                 <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                 <div className="h-4 bg-slate-100 rounded w-full"></div>
                 <div className="h-4 bg-slate-100 rounded w-5/6"></div>
               </div>
             ) : translation ? (
                <div className="text-slate-700 leading-relaxed font-medium text-sm whitespace-pre-wrap">
                  {translation}
                </div>
             ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 text-center">
                  <p className="text-sm">点击“全文翻译”<br/>或按下 Esc 键</p>
                </div>
             )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default SpeedReader;
