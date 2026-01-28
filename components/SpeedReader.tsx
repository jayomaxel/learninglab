
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Language } from '../types';
import { translateText, fetchReadingMaterial } from '../services/gemini';
import { parseLocalFile } from '../services/fileParser';

interface SpeedReaderProps { 
  language: Language; 
  onSaveWord: (word: string, context: string) => void;
}

const SpeedReader: React.FC<SpeedReaderProps> = ({ language, onSaveWord }) => {
  const [text, setText] = useState('');
  const [words, setWords] = useState<string[]>([]);
  const [currentWordIdx, setCurrentWordIdx] = useState(-1);
  const [wpm, setWpm] = useState(300);
  const [isPlaying, setIsPlaying] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  }, []);

  // 重置翻译当文本改变
  useEffect(() => {
    setTranslation(null);
  }, [text]);

  const handleTranslate = useCallback(async () => {
    if (!text.trim()) return;
    setTranslating(true);
    setTranslation(null);
    try {
      const resp = await translateText(text);
      setTranslation(resp);
    } catch (err) { 
      setTranslation("翻译出错，请稍后再试。"); 
    } finally { 
      setTranslating(false); 
    }
  }, [text]);

  const saveCurrentWord = useCallback(() => {
    if (currentWordIdx >= 0 && words.length > 0) {
        const word = words[currentWordIdx];
        // Grab context: 5 words before and 5 words after
        const start = Math.max(0, currentWordIdx - 5);
        const end = Math.min(words.length, currentWordIdx + 6);
        const context = words.slice(start, end).join(' ');
        onSaveWord(word, `...${context}...`);
    }
  }, [currentWordIdx, words, onSaveWord]);

  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === ' ') { e.preventDefault(); togglePlayback(); }
      if (e.key === 'Escape') { e.preventDefault(); handleTranslate(); }
      if (e.ctrlKey && e.key === 'ArrowUp') { e.preventDefault(); setWpm(prev => Math.min(prev + 25, 400)); }
      if (e.ctrlKey && e.key === 'ArrowDown') { e.preventDefault(); setWpm(prev => Math.max(prev - 25, 25)); }
      if (e.ctrlKey && e.key === 'Backspace') { e.preventDefault(); reset(); }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrentWord(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback, handleTranslate, reset, saveCurrentWord]);

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
            alert("文件为空或无法提取文本（如果是纯图片 PDF，请先进行 OCR）。");
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

  const renderWord = (word: string) => {
    if (!word) return null;
    return (
      <div className="w-full text-center font-mono font-black text-4xl sm:text-7xl tracking-tighter text-slate-900">
        {word}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom duration-700">
      <div className="bg-white p-5 rounded-3xl border border-slate-200 flex items-center gap-4 group focus-within:border-green-400 transition-all shadow-sm">
        <input 
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          placeholder="粘贴链接或主题，AI 提取正文..."
          className="flex-1 bg-transparent border-none py-2 text-sm outline-none font-medium"
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
                className="bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
            >
                {loading ? '解析中...' : '导入 文件'}
            </button>
            <button 
                onClick={handleGenerateContent} 
                disabled={loading || !aiInput} 
                className="bg-green-400 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
                {loading ? '提取中...' : '开始提取'}
            </button>
        </div>
      </div>

      <div className="bg-white rounded-[40px] p-10 sm:p-24 relative overflow-hidden border border-slate-200 shadow-sm">
        <div className="relative h-24 flex items-center justify-center">
          {currentWordIdx >= 0 ? renderWord(words[currentWordIdx]) : (
            <div className="text-slate-300 font-bold italic text-xl animate-pulse">按下 空格键 开始</div>
          )}
        </div>
        <div className="mt-16 flex flex-col items-center gap-8 relative z-10">
          <div className="w-full max-w-lg h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
             <div className="h-full bg-green-400 transition-all duration-300 ease-linear" style={{ width: `${words.length ? ((currentWordIdx + 1) / words.length) * 100 : 0}%` }} />
          </div>
          <div className="flex items-center gap-8">
            <button onClick={reset} className="p-4 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 border border-slate-200 transition-all">
               重置
            </button>
            <button onClick={togglePlayback} className="w-24 h-24 bg-green-400 text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-green-200">
              {isPlaying ? '暂停' : '播放'}
            </button>
            <button 
                onClick={saveCurrentWord} 
                disabled={currentWordIdx < 0}
                className={`p-4 rounded-full border transition-all ${currentWordIdx >= 0 ? 'bg-white text-yellow-500 border-yellow-200 hover:border-yellow-400' : 'bg-slate-50 text-slate-200 border-slate-100'}`}
                title="收藏当前单词 (S)"
            >
               <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3v18l7-3 7 3V3H5z" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex flex-col">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">速度 (WPM)</span>
               <span className="text-3xl font-black text-slate-800">{wpm}</span>
            </div>
            <input type="range" min="25" max="400" step="25" value={wpm} onChange={(e) => setWpm(parseInt(e.target.value))} className="flex-1 max-w-xs ml-8 accent-green-400" />
          </div>
          <textarea 
            value={text} 
            onChange={(e) => setText(e.target.value)} 
            placeholder="在此粘贴文本，导入TXT/PDF，或使用上方 AI 提取..." 
            className="w-full h-80 bg-white border border-slate-200 rounded-[32px] p-8 text-slate-800 text-lg leading-relaxed outline-none focus:border-green-400 transition-all resize-none font-medium shadow-sm" 
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
