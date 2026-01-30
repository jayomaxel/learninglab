
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language, DifficultyAnalysis, CEFRLevel } from '../types';
import { translateText, fetchReadingMaterial, analyzeTextDifficulty } from '../services/gemini';
import { db } from '../services/db'; 
import DifficultyWarmup from './DifficultyWarmup';

// Define the missing props interface for SpeedReader
interface SpeedReaderProps {
  language: Language;
  onSaveWord: (word: string, context: string) => void;
  knownWords: Set<string>;
  userId: string;
  level: CEFRLevel;
  onTaskComplete?: () => void;
}

const getORPIndex = (text: string): number => {
  const len = text.length;
  if (len <= 1) return 0;
  if (len <= 5) return Math.ceil(len / 2) - 1;
  return Math.floor(len * 0.4);
};

const SpeedReader: React.FC<SpeedReaderProps> = ({ language, onSaveWord, knownWords = new Set(), userId, level, onTaskComplete }) => {
  const isBeginner = level.startsWith('A');
  const [text, setText] = useState('');
  const [wpm, setWpm] = useState(isBeginner ? 180 : 300);
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
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  const processTextIntoChunks = useCallback((rawText: string, size: number) => {
    const rawWords = rawText.trim().split(/\s+/);
    const newChunks: string[] = [];
    let tempChunk: string[] = [];
    for (let i = 0; i < rawWords.length; i++) {
      tempChunk.push(rawWords[i]);
      if (tempChunk.length >= size || /[.!?;:,]$/.test(rawWords[i]) || i === rawWords.length - 1) {
        newChunks.push(tempChunk.join(' '));
        tempChunk = [];
      }
    }
    return newChunks;
  }, []);

  const prepareToRead = useCallback(async () => {
    if (!analysisResult && text.length > 50) {
        setAnalyzing(true);
        const result = await analyzeTextDifficulty(text, language);
        setAnalyzing(false);
        setAnalysisResult(result);
        if (result.suggestion === 'HARD' || result.difficultWords.length > 0) {
            setShowWarmup(true);
            return;
        }
    }
    const processed = processTextIntoChunks(text, chunkSize);
    if (processed.length > 0) { setChunks(processed); setCurrentChunkIdx(0); setIsPlaying(true); }
  }, [text, chunkSize, language, analysisResult, processTextIntoChunks]);

  const handleWarmupProceed = () => {
      setShowWarmup(false);
      const processed = processTextIntoChunks(text, chunkSize);
      if (processed.length > 0) { setChunks(processed); setCurrentChunkIdx(0); setIsPlaying(true); }
  };

  const togglePlayback = useCallback(() => {
    if (chunks.length === 0 && text) prepareToRead(); else if (chunks.length > 0) setIsPlaying(prev => !prev);
  }, [chunks.length, text, prepareToRead]);

  const handleTranslate = useCallback(async () => {
    if (!text.trim()) return;
    setTranslating(true);
    try {
      const resp = await translateText(text);
      setTranslation(resp);
      await db.logSession({ id: Date.now().toString(), userId, type: 'READER', language, score: 1, duration: 0, timestamp: Date.now() });
      onTaskComplete?.();
    } catch (err) { setTranslation("翻译失败。"); } finally { setTranslating(false); }
  }, [text, userId, onTaskComplete]);

  useEffect(() => {
    if (isPlaying && currentChunkIdx < chunks.length) {
      const delay = (60 / wpm) * 1000 * chunks[currentChunkIdx].split(' ').length;
      timerRef.current = window.setTimeout(() => { 
          if (currentChunkIdx < chunks.length - 1) setCurrentChunkIdx(prev => prev + 1); 
          else { setIsPlaying(false); onTaskComplete?.(); }
      }, delay);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, currentChunkIdx, wpm, chunks, onTaskComplete]); 

  const renderORP = (chunkText: string) => {
    const orpIndex = getORPIndex(chunkText);
    const leftPart = chunkText.substring(0, orpIndex);
    const pivotChar = chunkText[orpIndex];
    const rightPart = chunkText.substring(orpIndex + 1);
    return (
      <div className="flex items-baseline justify-center w-full font-mono text-4xl sm:text-6xl text-slate-700">
        <div className="flex-1 text-right">{leftPart}</div>
        <div className="flex-none font-black text-red-500 mx-0.5">{pivotChar}</div>
        <div className="flex-1 text-left">{rightPart}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {showWarmup && analysisResult && (
        <DifficultyWarmup analysis={analysisResult} onProceed={handleWarmupProceed} onCancel={() => setShowWarmup(false)} />
      )}
      
      <div className="bg-white p-6 rounded-xl border border-green-200 flex flex-wrap gap-4 items-center">
        <input 
          value={aiInput} onChange={(e) => setAiInput(e.target.value)} 
          placeholder="输入阅读主题或链接..." className="flex-1 bg-green-50 px-4 py-2 rounded-lg border border-green-100 text-sm" 
        />
        <div className="flex gap-2">
            <button onClick={() => fetchReadingMaterial(aiInput, language).then(r => setText(r.text))} disabled={loading || !aiInput} className="bg-green-600 text-white px-6 py-2 rounded-lg text-xs font-bold disabled:opacity-50">开始提取</button>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-12 border border-green-200 min-h-[350px] flex flex-col justify-between">
        <div className="flex-1 flex items-center justify-center relative">
          {analyzing ? <span className="text-slate-400 font-bold uppercase tracking-widest">分析中...</span> : 
           currentChunkIdx >= 0 && currentChunkIdx < chunks.length ? renderORP(chunks[currentChunkIdx]) : 
           <span className="text-slate-300 font-bold text-xl italic">准备就绪</span>}
           <div className="absolute top-0 bottom-0 left-1/2 w-px bg-green-500/10 pointer-events-none" />
        </div>

        <div className="mt-8 flex flex-col items-center gap-6">
          <div className="w-full h-1.5 bg-green-50 rounded-full overflow-hidden border border-green-100">
             <div className="h-full bg-green-500" style={{ width: `${chunks.length ? ((currentChunkIdx + 1) / chunks.length) * 100 : 0}%` }} />
          </div>
          <div className="flex items-center gap-8">
            <button onClick={() => { setIsPlaying(false); setCurrentChunkIdx(-1); }} className="p-3 bg-slate-50 text-slate-500 rounded-full border border-slate-200">重置</button>
            <button onClick={togglePlayback} className={`w-16 h-16 rounded-full flex items-center justify-center ${isPlaying ? 'bg-slate-100 text-slate-800 border border-slate-200' : 'bg-green-500 text-white'}`}>
              {isPlaying ? <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg> : <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <button onClick={() => { if (currentChunkIdx >= 0) onSaveWord(chunks[currentChunkIdx], text); }} className="p-3 bg-green-50 text-green-600 rounded-full border border-green-200">收藏</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-green-200 grid grid-cols-2 gap-6">
             <div className="space-y-2">
               <label className="text-[10px] font-bold text-slate-400 uppercase">阅读速度 (WPM): {wpm}</label>
               <input type="range" min="50" max="800" step="25" value={wpm} onChange={(e) => setWpm(parseInt(e.target.value))} className="w-full accent-green-600" />
             </div>
             <div className="space-y-2">
               <label className="text-[10px] font-bold text-slate-400 uppercase">分段大小: {chunkSize}</label>
               <div className="flex gap-2">
                 {[1, 2, 3].map(size => <button key={size} onClick={() => setChunkSize(size)} className={`flex-1 py-1 rounded-lg text-xs font-bold ${chunkSize === size ? 'bg-green-500 text-white' : 'bg-green-50 text-green-600'}`}>{size}</button>)}
               </div>
             </div>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="粘贴文本或导入素材..." className="w-full h-64 bg-white border border-green-200 rounded-2xl p-6 text-slate-700 text-lg outline-none focus:border-green-500 resize-none" />
        </div>
        <div className="bg-white rounded-2xl p-6 border border-green-200 flex flex-col min-h-[400px]">
           <button onClick={handleTranslate} disabled={translating} className="w-full py-2 bg-green-50 text-green-700 font-bold rounded-lg border border-green-100 mb-4">{translating ? '翻译中...' : '查看全文翻译'}</button>
           <div className="flex-1 text-sm text-slate-600 leading-relaxed overflow-y-auto">{translation}</div>
        </div>
      </div>
    </div>
  );
};

export default SpeedReader;
