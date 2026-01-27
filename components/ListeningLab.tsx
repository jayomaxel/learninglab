
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Language, TranscriptionSegment } from '../types';
import { transcribeMedia, generateAIPractice, generatePracticeFromUrl } from '../services/gemini';

interface ListeningLabProps {
  language: Language;
}

const FRENCH_ACCENTS = ['é', 'è', 'ê', 'ë', 'à', 'â', 'î', 'ï', 'ô', 'û', 'ù', 'ç'];

const ListeningLab: React.FC<ListeningLabProps> = ({ language }) => {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [aiPrompt, setAiPrompt] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [inputMode, setInputMode] = useState<'PROMPT' | 'URL'>('PROMPT');
  const [isFullPlaying, setIsFullPlaying] = useState(false);
  
  // 使用 Ref 实时追踪全文播放状态，避免在回调中读取旧的 state
  const isFullPlayingRef = useRef(false);
  const currentSegmentRef = useRef<TranscriptionSegment | null>(null);

  const [wordInputs, setWordInputs] = useState<string[]>([]);
  const [wordResults, setWordResults] = useState<('pending' | 'correct' | 'wrong')[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);

  const currentSegment = segments[currentIndex];

  useEffect(() => {
    isFullPlayingRef.current = isFullPlaying;
  }, [isFullPlaying]);

  useEffect(() => {
    currentSegmentRef.current = currentSegment;
  }, [currentSegment]);

  const segmentWords = useMemo(() => {
    if (!currentSegment) return [];
    return currentSegment.text.trim().split(/\s+/);
  }, [currentSegment]);

  useEffect(() => {
    if (segmentWords.length > 0) {
      setWordInputs(new Array(segmentWords.length).fill(''));
      setWordResults(new Array(segmentWords.length).fill('pending'));
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    }
  }, [segmentWords]);

  const playCurrentSegment = useCallback(() => {
    if (videoRef.current && currentSegment) {
      setIsFullPlaying(false);
      isFullPlayingRef.current = false;
      videoRef.current.pause();
      videoRef.current.currentTime = currentSegment.start;
      videoRef.current.play();
    }
  }, [currentSegment]);

  const playFullAudio = useCallback(() => {
    if (videoRef.current) {
      setIsFullPlaying(true);
      isFullPlayingRef.current = true;
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  }, []);

  // 核心监听逻辑：使用 requestAnimationFrame 确保在每一帧都进行起止时间检测
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const checkTime = () => {
      // 如果开启了全文模式，不执行暂停逻辑
      if (isFullPlayingRef.current) {
        rafRef.current = requestAnimationFrame(checkTime);
        return;
      }

      const seg = currentSegmentRef.current;
      if (seg && video.currentTime >= seg.end) {
        video.pause();
        video.currentTime = seg.end;
        // 自动聚焦第一个未对的框
        const firstPending = wordResults.findIndex(r => r !== 'correct');
        if (firstPending !== -1) {
          inputRefs.current[firstPending]?.focus();
        }
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        return;
      }
      rafRef.current = requestAnimationFrame(checkTime);
    };

    const handlePlay = () => {
      if (!isFullPlayingRef.current) {
        rafRef.current = requestAnimationFrame(checkTime);
      }
    };

    const handlePause = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    // 如果当前已经是播放状态，且不是全文模式，直接开始检测
    if (!video.paused && !isFullPlayingRef.current) {
      rafRef.current = requestAnimationFrame(checkTime);
    }

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [segments, wordResults]); // 只有在素材改变或结果改变时重置，不依赖 isFullPlaying 以防闭包旧值

  const resetState = () => {
    setCurrentIndex(0);
    setWordInputs([]);
    setWordResults([]);
    setShowHint(false);
  };

  const normalize = (word: string) => 
    word.toLowerCase().replace(/[.,!?;:()"'«»]/g, '').trim();

  const handleWordChange = (index: number, value: string) => {
    const newInputs = [...wordInputs];
    newInputs[index] = value;
    setWordInputs(newInputs);

    const target = segmentWords[index];
    if (normalize(value) === normalize(target)) {
      const newResults = [...wordResults];
      newResults[index] = 'correct';
      setWordResults(newResults);
      
      if (index < segmentWords.length - 1) {
        inputRefs.current[index + 1]?.focus();
      } else {
        if (currentIndex < segments.length - 1) {
          setTimeout(() => {
            setCurrentIndex(prev => prev + 1);
          }, 400);
        } else {
          alert("训练完成！您已经听写了整段素材。");
        }
      }
    } else if (value.length >= target.length && normalize(value) !== normalize(target)) {
      const newResults = [...wordResults];
      newResults[index] = 'wrong';
      setWordResults(newResults);
    } else {
      const newResults = [...wordResults];
      newResults[index] = 'pending';
      setWordResults(newResults);
    }
  };

  const handleAISubmit = async () => {
    setLoading(true);
    try {
      let result;
      if (inputMode === 'PROMPT') {
        if (!aiPrompt) return;
        result = await generateAIPractice(aiPrompt, language);
      } else {
        if (!urlInput) return;
        result = await generatePracticeFromUrl(urlInput, language);
      }
      if (result && result.audioUrl) {
        setMediaUrl(result.audioUrl);
        setSegments(result.segments);
        resetState();
      }
    } catch (err) {
      alert("AI 生成失败，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaUrl(URL.createObjectURL(file));
      setLoading(true);
      transcribeMedia(file, language)
        .then(data => {
          setSegments(data);
          resetState();
        })
        .finally(() => setLoading(false));
    }
  };

  return (
    <section className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setInputMode('PROMPT')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${inputMode === 'PROMPT' ? 'bg-white text-green-600' : 'text-slate-400'}`}
            >
              自定义主题
            </button>
            <button 
              onClick={() => setInputMode('URL')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${inputMode === 'URL' ? 'bg-white text-green-600' : 'text-slate-400'}`}
            >
              YouTube / 链接
            </button>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={playFullAudio} 
               className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${isFullPlaying ? 'bg-green-400 text-white border-transparent' : 'bg-slate-900 text-white border-transparent hover:bg-slate-800'}`}
             >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4.5 3a.5.5 0 00-.5.5v13a.5.5 0 00.81.39l8-6.5a.5.5 0 000-.78l-8-6.5A.5.5 0 004.5 3z"/></svg>
                播放完整全文
             </button>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl border border-slate-200 focus-within:border-green-400 transition-all">
          <input 
            value={inputMode === 'PROMPT' ? aiPrompt : urlInput}
            onChange={(e) => inputMode === 'PROMPT' ? setAiPrompt(e.target.value) : setUrlInput(e.target.value)}
            placeholder={inputMode === 'PROMPT' ? "输入主题让 AI 创作练习..." : "粘贴链接..."}
            className="flex-1 bg-transparent border-none px-4 py-2 text-sm outline-none font-medium"
          />
          <button 
            onClick={handleAISubmit}
            disabled={loading}
            className="bg-green-400 text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-green-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'AI 处理中...' : '生成实验室'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 rounded-3xl overflow-hidden aspect-video relative flex items-center justify-center border border-slate-200 shadow-md">
            {mediaUrl ? (
              <video 
                key={mediaUrl} 
                ref={videoRef} 
                src={mediaUrl} 
                className="w-full h-full object-contain" 
                controls={isFullPlaying}
              />
            ) : (
              <div className="text-center p-8 bg-white w-full h-full flex flex-col items-center justify-center">
                <input type="file" accept="video/*,audio/*" onChange={handleFileUpload} className="hidden" id="file-upload" />
                <label htmlFor="file-upload" className="px-10 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full text-sm font-bold cursor-pointer transition-all border border-slate-200">
                  导入本地素材
                </label>
              </div>
            )}
          </div>

          {currentSegment && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-green-400" />
              <div className="flex items-center justify-between mb-2">
                 <span className="text-[10px] font-black text-green-600 uppercase tracking-widest">中文翻译</span>
                 <button onClick={() => setShowHint(!showHint)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors">
                   {showHint ? "隐藏原文" : "显示原文 (Esc)"}
                 </button>
              </div>
              <p className="text-lg text-slate-700 font-bold mb-2 leading-relaxed">{currentSegment.translation}</p>
              {showHint && <p className="text-sm text-slate-400 italic font-mono bg-slate-50 p-3 rounded-xl mt-2 border border-slate-100">{currentSegment.text}</p>}
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          {segments.length > 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 min-h-[400px] flex flex-col shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-1.5">
                  {segments.map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all ${i < currentIndex ? 'bg-green-400 w-4' : i === currentIndex ? 'bg-green-600 w-8' : 'bg-slate-100 w-1.5'}`} />
                  ))}
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">STEP {currentIndex + 1} / {segments.length}</span>
              </div>

              <div className="flex-1">
                <div className="flex flex-wrap gap-x-2 gap-y-3 justify-center py-4">
                  {segmentWords.map((word, idx) => (
                    <div key={idx} className="relative">
                      <input
                        ref={el => { inputRefs.current[idx] = el; }}
                        value={wordInputs[idx] || ''}
                        onChange={(e) => handleWordChange(idx, e.target.value)}
                        placeholder=""
                        className={`
                          w-20 sm:w-24 text-center py-2.5 px-1 text-lg font-mono font-bold rounded-xl border-2 transition-all outline-none
                          ${wordResults[idx] === 'correct' ? 'bg-green-50 border-green-400 text-green-700' : 
                            wordResults[idx] === 'wrong' ? 'bg-red-50 border-red-400 text-red-700' : 
                            'bg-slate-50 border-slate-100 focus:border-green-300 focus:bg-white'}
                        `}
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck="false"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4">
                <button 
                  onClick={playCurrentSegment} 
                  className="py-4 bg-green-400 hover:bg-green-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                  重听本句
                </button>
                <button 
                  onClick={() => {
                    if (currentIndex < segments.length - 1) {
                      setCurrentIndex(prev => prev + 1);
                    }
                  }}
                  className="py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl font-bold transition-all active:scale-95"
                >
                  跳过句子 (Ctrl+→)
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-slate-50 rounded-3xl border-dashed border-2 border-slate-200 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                 <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </div>
              <p className="text-slate-400 font-bold leading-relaxed max-w-xs">
                听力实验室已切换为毫秒级断句模式。<br/>点击“生成实验室”开始练习。
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ListeningLab;
