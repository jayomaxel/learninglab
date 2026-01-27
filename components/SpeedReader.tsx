
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language } from '../types';
import { explainText, fetchReadingMaterial } from '../services/gemini';

interface SpeedReaderProps { language: Language; }

const SpeedReader: React.FC<SpeedReaderProps> = ({ language }) => {
  const [text, setText] = useState('');
  const [words, setWords] = useState<string[]>([]);
  const [currentWordIdx, setCurrentWordIdx] = useState(-1);
  const [wpm, setWpm] = useState(300);
  const [isPlaying, setIsPlaying] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [loading, setLoading] = useState(false);

  const timerRef = useRef<number | null>(null);

  const startReading = useCallback(() => {
    const splitWords = text.trim().split(/\s+/);
    if (splitWords.length > 0 && splitWords[0] !== '') {
      setWords(splitWords);
      setCurrentWordIdx(0);
      setIsPlaying(true);
    }
  }, [text]);

  const togglePlayback = useCallback(() => {
    if (words.length === 0) {
      startReading();
    } else {
      setIsPlaying(prev => !prev);
    }
  }, [words.length, startReading]);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentWordIdx(-1);
    setWords([]);
    setExplanation(null);
  }, []);

  const handleExplain = useCallback(async () => {
    if (currentWordIdx < 0 || words.length === 0) return;
    setExplaining(true);
    setExplanation(null);
    try {
      const context = words.slice(Math.max(0, currentWordIdx - 3), currentWordIdx + 4).join(' ');
      const resp = await explainText(context, language);
      setExplanation(resp);
    } catch (err) { 
      setExplanation("解析出错，请稍后再试。"); 
    } finally { 
      setExplaining(false); 
    }
  }, [currentWordIdx, words, language]);

  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === ' ') { e.preventDefault(); togglePlayback(); }
      if (e.key === 'Escape') { e.preventDefault(); handleExplain(); }
      if (e.ctrlKey && e.key === 'ArrowUp') { e.preventDefault(); setWpm(prev => Math.min(prev + 50, 1500)); }
      if (e.ctrlKey && e.key === 'ArrowDown') { e.preventDefault(); setWpm(prev => Math.max(prev - 50, 50)); }
      if (e.ctrlKey && e.key === 'Backspace') { e.preventDefault(); reset(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback, handleExplain, reset]);

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

  useEffect(() => {
    if (isPlaying && currentWordIdx < words.length - 1) {
      const interval = (60 / wpm) * 1000;
      const word = words[currentWordIdx];
      let multiplier = word.length > 8 ? 1.2 : 1;
      if (/[.,!?;]/.test(word)) multiplier = 1.5;
      timerRef.current = window.setTimeout(() => {
        setCurrentWordIdx(prev => prev + 1);
      }, interval * multiplier);
    } else if (currentWordIdx >= words.length - 1 && words.length > 0) {
      setIsPlaying(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, currentWordIdx, wpm, words]);

  const renderWordWithORP = (word: string) => {
    if (!word) return null;
    let orpIndex = Math.floor((word.length - 1) * 0.3);
    const left = word.substring(0, orpIndex);
    const center = word[orpIndex];
    const right = word.substring(orpIndex + 1);
    return (
      <div className="flex w-full font-mono font-black text-4xl sm:text-7xl tracking-tighter">
        <div className="flex-1 text-right text-slate-300 pr-[0.1em]">{left}</div>
        <div className="text-green-500 min-w-[0.6em] text-center">{center}</div>
        <div className="flex-1 text-left text-slate-900 pl-[0.1em]">{right}</div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom duration-700">
      <div className="bg-white p-5 rounded-3xl border border-slate-200 flex items-center gap-4 group focus-within:border-green-400 transition-all">
        <input 
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          placeholder="粘贴链接或主题，AI 提取正文..."
          className="flex-1 bg-transparent border-none py-2 text-sm outline-none"
        />
        <button 
          onClick={handleGenerateContent} 
          disabled={loading || !aiInput} 
          className="bg-green-400 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-green-500 disabled:opacity-50"
        >
          {loading ? '提取中...' : '开始提取'}
        </button>
      </div>

      <div className="bg-white rounded-[40px] p-10 sm:p-24 relative overflow-hidden border border-slate-200">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-slate-50 opacity-50" />
        <div className="relative h-24 flex items-center justify-center">
          {currentWordIdx >= 0 ? renderWordWithORP(words[currentWordIdx]) : (
            <div className="text-slate-300 font-bold italic text-xl animate-pulse">按下 空格键 开始</div>
          )}
        </div>
        <div className="mt-16 flex flex-col items-center gap-8 relative z-10">
          <div className="w-full max-w-lg h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
             <div className="h-full bg-green-400" style={{ width: `${words.length ? ((currentWordIdx + 1) / words.length) * 100 : 0}%` }} />
          </div>
          <div className="flex items-center gap-8">
            <button onClick={reset} className="p-4 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 border border-slate-200 transition-all">
               重置
            </button>
            <button onClick={togglePlayback} className="w-24 h-24 bg-green-400 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
              {isPlaying ? '暂停' : '播放'}
            </button>
            <button onClick={handleExplain} disabled={currentWordIdx < 0} className={`p-4 rounded-full border transition-all ${currentWordIdx >= 0 ? 'bg-white text-green-600 border-green-200' : 'bg-slate-50 text-slate-200 border-slate-100'}`}>
               AI 解析
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200">
            <div className="flex flex-col">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">WPM</span>
               <span className="text-3xl font-black text-slate-800">{wpm}</span>
            </div>
            <input type="range" min="50" max="1500" step="50" value={wpm} onChange={(e) => setWpm(parseInt(e.target.value))} className="flex-1 max-w-xs ml-8 accent-green-400" />
          </div>
          <textarea 
            value={text} 
            onChange={(e) => setText(e.target.value)} 
            placeholder="在此粘贴文本..." 
            className="w-full h-80 bg-white border border-slate-200 rounded-[32px] p-8 text-slate-800 text-lg leading-relaxed outline-none focus:border-green-400 transition-all resize-none font-medium" 
          />
        </div>

        <div className="bg-white rounded-[32px] p-8 border border-slate-200 overflow-hidden flex flex-col min-h-[500px]">
           <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">AI 深度洞察</h3>
           <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
             {explaining ? '正在解析...' : explanation ? (
                <div className="text-slate-700 leading-relaxed font-medium text-sm" dangerouslySetInnerHTML={{ __html: explanation.replace(/\n/g, '<br/>') }} />
             ) : '按下 Esc 获取解析。'}
           </div>
        </div>
      </div>
    </div>
  );
};

export default SpeedReader;
