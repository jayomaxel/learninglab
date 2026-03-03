
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

const normalizeToken = (value: string): string => value.toLowerCase().replace(/[.,!?;:()"'`]/g, '').trim();

const getORPIndex = (text: string, language?: Language): number => {
  const core = text.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
  const len = core.length;
  if (len <= 0) return 0;

  let coreIdx = 0;
  if (language === 'KR') {
    if (len <= 2) coreIdx = 0;
    else if (len <= 4) coreIdx = 1;
    else coreIdx = 2;
  } else {
    coreIdx = len <= 5 ? Math.ceil(len / 2) - 1 : Math.floor(len * 0.4);
  }

  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (!/[.,/#!$%^&*;:{}=\-_`~() ]/.test(text[i])) { // Ignore punctuation for position
      if (count === coreIdx) return i;
      count++;
    }
  }
  return 0;
};

const SpeedReader: React.FC<SpeedReaderProps> = ({ language, onSaveWord, knownWords = new Set(), userId, level, onTaskComplete }) => {
  const isBeginner = level.startsWith('A');
  const [text, setText] = useState('');
  const [wpm, setWpm] = useState(isBeginner ? 180 : 300);
  const [chunkSize, setChunkSize] = useState(1);
  const [chunks, setChunks] = useState<string[]>([]);
  const [currentChunkIdx, _setCurrentChunkIdx] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const pivotRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ isPlaying: false, currentIdx: -1, chunks: [] as string[] });
  const lastTimestampRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const setCurrentChunkIdx = (idx: number) => {
    stateRef.current.currentIdx = idx;
    _setCurrentChunkIdx(idx);
    updateDisplay(idx);
  };

  const updateDisplay = (idx: number) => {
    const chunk = stateRef.current.chunks[idx];
    if (!chunk) return;
    const orpIndex = getORPIndex(chunk, language);
    if (leftRef.current) leftRef.current.textContent = chunk.substring(0, orpIndex).replace(/ /g, "\u00a0");
    if (pivotRef.current) pivotRef.current.textContent = chunk[orpIndex];
    if (rightRef.current) rightRef.current.textContent = chunk.substring(orpIndex + 1).replace(/ /g, "\u00a0");
    if (progressBarRef.current) progressBarRef.current.style.width = `${((idx + 1) / stateRef.current.chunks.length) * 100}%`;
  };
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DifficultyAnalysis | null>(null);
  const [showWarmup, setShowWarmup] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  // Sync state to ref for high-perf access
  useEffect(() => { stateRef.current.isPlaying = isPlaying; }, [isPlaying]);
  useEffect(() => { stateRef.current.chunks = chunks; }, [chunks]);

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
    if (processed.length > 0) {
      setChunks(processed);
      stateRef.current.chunks = processed;
      setCurrentChunkIdx(0);
      setIsPlaying(true);
    }
  }, [text, chunkSize, language, analysisResult, processTextIntoChunks]);

  const handleWarmupProceed = () => {
    setShowWarmup(false);
    const processed = processTextIntoChunks(text, chunkSize);
    if (processed.length > 0) {
      setChunks(processed);
      stateRef.current.chunks = processed;
      setCurrentChunkIdx(0);
      setIsPlaying(true);
    }
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
    } catch (err) { setTranslation("翻译失败，请稍后重试。"); } finally { setTranslating(false); }
  }, [text, userId, onTaskComplete]);
  const handleGenerateReading = useCallback(async () => {
    if (!aiInput.trim()) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchReadingMaterial(aiInput, language);
      setText(result.text || '');
      setTranslation(null);
      setChunks([]);
      stateRef.current.chunks = [];
      setCurrentChunkIdx(-1);
      setIsPlaying(false);
    } catch (err: any) {
      setLoadError(err?.message || '素材生成失败，请稍后再试。');
    } finally {
      setLoading(false);
    }
  }, [aiInput, language]);

  const calculateDelay = useCallback((chunk: string) => {
    const baseDelay = (60 / wpm) * 1000 * chunk.split(' ').length;
    let multiplier = 1.0;
    if (chunk.length > 8) multiplier *= 1.2;
    if (/[,:;]$/.test(chunk)) multiplier *= 2.0;
    if (/[.!?]$/.test(chunk)) multiplier *= 3.0;
    return baseDelay * multiplier;
  }, [wpm]);

  useEffect(() => {
    let lastTime = 0;
    const loop = (time: number) => {
      if (!stateRef.current.isPlaying) return;
      const currentIdx = stateRef.current.currentIdx;
      const chunks = stateRef.current.chunks;
      if (currentIdx >= 0 && currentIdx < chunks.length) {
        const delay = calculateDelay(chunks[currentIdx]);
        if (time - lastTime >= delay) {
          lastTime = time;
          if (currentIdx < chunks.length - 1) setCurrentChunkIdx(currentIdx + 1);
          else { setIsPlaying(false); onTaskComplete?.(); }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    if (isPlaying) {
      lastTime = performance.now();
      rafRef.current = requestAnimationFrame(loop);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, calculateDelay, onTaskComplete]);

  const currentChunk = currentChunkIdx >= 0 ? chunks[currentChunkIdx] : '';
  const isCurrentKnown = currentChunk ? knownWords.has(normalizeToken(currentChunk)) : false;

  return (
    <div className="space-y-6">
      {showWarmup && analysisResult && (
        <DifficultyWarmup analysis={analysisResult} onProceed={handleWarmupProceed} onCancel={() => setShowWarmup(false)} />
      )}

      <div className="bg-white p-6 rounded-xl border border-green-200 flex flex-wrap gap-4 items-center">
        <input
          value={aiInput} onChange={(e) => setAiInput(e.target.value)}
          placeholder="杈撳叆闃呰涓婚鎴栭摼鎺?.." className="flex-1 bg-green-50 px-4 py-2 rounded-lg border border-green-100 text-sm"
        />
        <div className="flex gap-2">
          <button onClick={handleGenerateReading} disabled={loading || !aiInput} className="bg-green-600 text-white px-6 py-2 rounded-lg text-xs font-bold disabled:opacity-50">{loading ? '处理中...' : '开始提取'}</button>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 font-semibold">
          {loadError}
        </div>
      )}
      <div className="bg-white rounded-3xl p-12 border border-green-200 min-h-[350px] flex flex-col justify-between">
        <div className="flex-1 flex items-center justify-center relative">
          {analyzing ? <span className="text-slate-400 font-bold uppercase tracking-widest">鍒嗘瀽涓?..</span> :
            currentChunkIdx >= 0 && currentChunkIdx < chunks.length ? (
              <div className="flex items-baseline justify-center w-full font-mono text-4xl sm:text-6xl text-slate-700">
                <div ref={leftRef} className="flex-1 text-right"></div>
                <div ref={pivotRef} className="flex-none font-black text-red-500 mx-0.5"></div>
                <div ref={rightRef} className="flex-1 text-left"></div>
              </div>
            ) :
              <span className="text-slate-300 font-bold text-xl italic">鍑嗗灏辩华</span>}
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-green-500/10 pointer-events-none" />
        </div>

        <div className="mt-8 flex flex-col items-center gap-6">
          <div className="w-full h-1.5 bg-green-50 rounded-full overflow-hidden border border-green-100">
            <div ref={progressBarRef} className="h-full bg-green-500" style={{ width: `0%` }} />
          </div>
          <div className="flex items-center gap-8">
            <button onClick={() => { setIsPlaying(false); setCurrentChunkIdx(-1); }} className="p-3 bg-slate-50 text-slate-500 rounded-full border border-slate-200">閲嶇疆</button>
            <button onClick={togglePlayback} className={`w-16 h-16 rounded-full flex items-center justify-center ${isPlaying ? 'bg-slate-100 text-slate-800 border border-slate-200' : 'bg-green-500 text-white'}`}>
              {isPlaying ? <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg> : <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
            </button>
            <button
              onClick={() => { if (currentChunkIdx >= 0 && !isCurrentKnown) onSaveWord(chunks[currentChunkIdx], text); }}
              disabled={isCurrentKnown}
              className="p-3 bg-green-50 text-green-600 rounded-full border border-green-200 disabled:opacity-50"
            >
              {isCurrentKnown ? '已收藏' : '收藏'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-green-200 grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase">闃呰閫熷害 (WPM): {wpm}</label>
              <input type="range" min="50" max="800" step="25" value={wpm} onChange={(e) => setWpm(parseInt(e.target.value))} className="w-full accent-green-600" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase">鍒嗘澶у皬: {chunkSize}</label>
              <div className="flex gap-2">
                {[1, 2, 3].map(size => <button key={size} onClick={() => setChunkSize(size)} className={`flex-1 py-1 rounded-lg text-xs font-bold ${chunkSize === size ? 'bg-green-500 text-white' : 'bg-green-50 text-green-600'}`}>{size}</button>)}
              </div>
            </div>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="绮樿创鏂囨湰鎴栧鍏ョ礌鏉?.." className="w-full h-64 bg-white border border-green-200 rounded-2xl p-6 text-slate-700 text-lg outline-none focus:border-green-500 resize-none" />
        </div>
        <div className="bg-white rounded-2xl p-6 border border-green-200 flex flex-col min-h-[400px]">
          <button onClick={handleTranslate} disabled={translating} className="w-full py-2 bg-green-50 text-green-700 font-bold rounded-lg border border-green-100 mb-4">{translating ? '缈昏瘧涓?..' : '鏌ョ湅鍏ㄦ枃缈昏瘧'}</button>
          <div className="flex-1 text-sm text-slate-600 leading-relaxed overflow-y-auto">{translation}</div>
        </div>
      </div>
    </div>
  );
};

export default SpeedReader;



