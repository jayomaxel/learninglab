
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Language, TranscriptionSegment, DifficultyAnalysis, CEFRLevel } from '../types';
import { generateAIPractice, generatePracticeFromUrl, analyzeTextDifficulty, isRateLimitError } from '../services/gemini';
import { db } from '../services/db';
import DifficultyWarmup from './DifficultyWarmup';

interface ListeningLabProps {
  language: Language;
  onSaveWord: (word: string, context: string) => void;
  level: CEFRLevel;
  userId: string;
  onTaskComplete?: () => void;
}

const ListeningLab: React.FC<ListeningLabProps> = ({ language, onSaveWord, level, userId, onTaskComplete }) => {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [aiPrompt, setAiPrompt] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [inputMode, setInputMode] = useState<'PROMPT' | 'URL'>('PROMPT');
  const [isFullPlaying, setIsFullPlaying] = useState(false);
  const [flowMode, setFlowMode] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<DifficultyAnalysis | null>(null);
  const [showWarmup, setShowWarmup] = useState(false);

  const sessionStartTimeRef = useRef<number>(Date.now());
  const correctWordsCountRef = useRef<number>(0);
  const totalWordsCountRef = useRef<number>(0);
  const isFullPlayingRef = useRef(false);
  const currentSegmentRef = useRef<TranscriptionSegment | null>(null);
  const lastKeystrokeTimeRef = useRef<number>(0);
  const keystrokeIntervalsRef = useRef<number[]>([]);
  const dynamicBaselineRef = useRef<number>(1200);
  const silenceMapRef = useRef<number[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const loopAnchorTimeRef = useRef<number | null>(null);
  const localObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (mediaUrl) {
      const analyzeSilence = async () => {
        try {
          const res = await fetch(mediaUrl);
          const blob = await res.blob();
          const buffer = await blob.arrayBuffer();
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const audioBuffer = await ctx.decodeAudioData(buffer);
          const data = audioBuffer.getChannelData(0);
          const sr = audioBuffer.sampleRate;
          const points: number[] = [];
          const step = Math.floor(sr * 0.05); // 50ms window
          for (let i = 0; i < data.length; i += step) {
            let rms = 0;
            for (let j = 0; j < Math.min(step, data.length - i); j++) rms += data[i + j] * data[i + j];
            if (Math.sqrt(rms / step) < 0.01) points.push(i / sr);
          }
          silenceMapRef.current = points;
          await ctx.close();
        } catch (e) { console.warn("Silence Map failed", e); }
      };
      analyzeSilence();
    }
  }, [mediaUrl]);
  const [wordInputs, setWordInputs] = useState<string[]>([]);
  const [wordResults, setWordResults] = useState<('pending' | 'correct' | 'wrong')[]>([]);
  const wordResultsRef = useRef(wordResults);

  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentSegment = segments[currentIndex];

  useEffect(() => { wordResultsRef.current = wordResults; }, [wordResults]);
  useEffect(() => { isFullPlayingRef.current = isFullPlaying; }, [isFullPlaying]);
  useEffect(() => { currentSegmentRef.current = currentSegment; }, [currentSegment]);

  useEffect(() => {
    if (segments.length > 0 && !analysisResult && !analyzing) {
      const fullText = segments.map(s => s.text).join(' ');
      if (fullText.length > 50) {
        setAnalyzing(true);
        analyzeTextDifficulty(fullText, language).then(result => {
          setAnalyzing(false);
          setAnalysisResult(result);
          if (result.suggestion === 'HARD' || result.difficultWords.length > 0) {
            setShowWarmup(true);
          }
        });
      }
    }
  }, [segments, language]);

  const segmentWords = useMemo(() => (!currentSegment ? [] : currentSegment.text.trim().split(/\s+/)), [currentSegment]);

  const clearLocalObjectUrl = useCallback(() => {
    if (localObjectUrlRef.current) {
      URL.revokeObjectURL(localObjectUrlRef.current);
      localObjectUrlRef.current = null;
    }
  }, []);

  const resetPracticeState = useCallback(() => {
    setCurrentIndex(0);
    setShowHint(false);
    setAnalysisResult(null);
    setShowWarmup(false);
    setWordInputs([]);
    setWordResults([]);
    setIsFullPlaying(false);
    sessionStartTimeRef.current = Date.now();
    correctWordsCountRef.current = 0;
    totalWordsCountRef.current = 0;
  }, []);

  const handleLocalMediaUpload = useCallback((file: File) => {
    clearLocalObjectUrl();
    const objectUrl = URL.createObjectURL(file);
    localObjectUrlRef.current = objectUrl;
    setMediaUrl(objectUrl);
    setSegments([]);
    resetPracticeState();
  }, [clearLocalObjectUrl, resetPracticeState]);

  useEffect(() => {
    return () => {
      clearLocalObjectUrl();
    };
  }, [clearLocalObjectUrl]);

  useEffect(() => {
    if (segmentWords.length > 0) {
      setWordInputs(new Array(segmentWords.length).fill(''));
      setWordResults(new Array(segmentWords.length).fill('pending'));
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    }
  }, [segmentWords]);

  const finishSession = async () => {
    const endTime = Date.now();
    const duration = (endTime - sessionStartTimeRef.current) / 1000;
    const totalWords = totalWordsCountRef.current;
    const correct = correctWordsCountRef.current;
    const accuracy = totalWords > 0 ? Math.round((correct / totalWords) * 100) : 0;
    if (totalWords > 0) {
      await db.logSession({ id: Date.now().toString(), userId, type: 'DICTATION', language, score: accuracy, duration, timestamp: endTime });
      onTaskComplete?.();
      alert(`缁冧範缁撴潫锛佹纭巼: ${accuracy}%`);
    } else { alert("练习结束。"); }
    sessionStartTimeRef.current = Date.now();
    correctWordsCountRef.current = 0;
    totalWordsCountRef.current = 0;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.preservesPitch = true; // 纭繚鍙橀€熶笉鍙樿皟

    const loop = () => {
      if (showWarmup) { if (!video.paused) video.pause(); return; }

      if (!isFullPlayingRef.current) {
        const seg = currentSegmentRef.current;
        if (seg && video.currentTime >= seg.end) {
          video.pause();
          video.currentTime = seg.end;
          const firstPending = wordResultsRef.current.findIndex(r => r !== 'correct');
          if (firstPending !== -1) inputRefs.current[firstPending]?.focus();
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          return;
        }
      } else if (flowMode) {
        const now = Date.now();
        const timeSinceKey = now - lastKeystrokeTimeRef.current;
        const seg = currentSegmentRef.current;
        if (seg) {
          const isSegmentFinished = wordResultsRef.current.every(r => r === 'correct');
          const isAtEnd = video.currentTime >= seg.end - 0.2;

          const getSmartLoopStart = (target: number) => {
            const raw = Math.max(seg.start, target);
            const silence = silenceMapRef.current.filter(t => t >= seg.start && t <= raw + 0.2).pop();
            return silence !== undefined ? silence : raw;
          };

          if (isAtEnd && !isSegmentFinished) {
            const loopStart = getSmartLoopStart(video.currentTime - 2.0);
            if (video.currentTime >= seg.end || video.currentTime < loopStart) video.currentTime = loopStart;
          } else {
            const baseline = dynamicBaselineRef.current;
            const targetRate = timeSinceKey < baseline * 1.5 ? 1.0 : 0.5;
            if (video.playbackRate !== targetRate) video.playbackRate = targetRate;

            if (timeSinceKey >= baseline * 3) {
              const loopStart = getSmartLoopStart(video.currentTime - 2.0);
              if (video.currentTime >= seg.end || video.currentTime < loopStart) video.currentTime = loopStart;
            }
          }
          if (isSegmentFinished && video.currentTime >= seg.end) {
            const newIndex = segments.findIndex(s => s.start >= seg.end - 0.1);
            if (newIndex !== -1 && newIndex !== currentIndex) setCurrentIndex(newIndex);
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    const handlePlay = () => { rafRef.current = requestAnimationFrame(loop); };
    const handlePause = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [flowMode, currentIndex, segments, isFullPlaying, showWarmup]);

  const playCurrentSegment = useCallback(() => {
    if (showWarmup || !videoRef.current || !currentSegment) return;
    setIsFullPlaying(false);
    videoRef.current.currentTime = currentSegment.start;
    videoRef.current.play().catch(() => { });
  }, [currentSegment, showWarmup]);

  const playFullAudio = useCallback(() => {
    if (showWarmup || !videoRef.current) return;
    setIsFullPlaying(true);
    videoRef.current.currentTime = currentIndex > 0 && segments[currentIndex] ? segments[currentIndex].start : 0;
    videoRef.current.play().catch(() => { });
    lastKeystrokeTimeRef.current = Date.now();
  }, [currentIndex, segments, showWarmup]);

  const normalize = (word: string) => word.toLowerCase().replace(/[.,!?;:()"'芦禄]/g, '').trim();

  const handleWordChange = (index: number, value: string) => {
    const now = Date.now();
    if (lastKeystrokeTimeRef.current > 0) {
      const interval = now - lastKeystrokeTimeRef.current;
      if (interval < 4000) { // Ignore very long pauses
        keystrokeIntervalsRef.current.push(interval);
        if (keystrokeIntervalsRef.current.length > 20) keystrokeIntervalsRef.current.shift();

        // Use last 10-20 strokes to establish a "Baseline" for speed threshold
        if (keystrokeIntervalsRef.current.length >= 10) {
          const avg = keystrokeIntervalsRef.current.reduce((a, b) => a + b, 0) / keystrokeIntervalsRef.current.length;
          dynamicBaselineRef.current = Math.max(400, Math.min(2500, avg));
        }
      }
    }
    lastKeystrokeTimeRef.current = now;
    const newInputs = [...wordInputs];
    newInputs[index] = value;
    setWordInputs(newInputs);
    const target = segmentWords[index];
    const isMatch = normalize(value) === normalize(target);
    if (isMatch) {
      if (wordResults[index] !== 'correct') { correctWordsCountRef.current += 1; totalWordsCountRef.current += 1; }
      const newResults = [...wordResults];
      newResults[index] = 'correct';
      setWordResults(newResults);
      if (index < segmentWords.length - 1) inputRefs.current[index + 1]?.focus();
      else if (!isFullPlaying) {
        if (currentIndex < segments.length - 1) setTimeout(() => setCurrentIndex(prev => prev + 1), 400);
        else finishSession();
      } else if (currentIndex === segments.length - 1) finishSession();
    } else if (value.length >= target.length && !isMatch) {
      if (wordResults[index] !== 'wrong') totalWordsCountRef.current += 1;
      const newResults = [...wordResults];
      newResults[index] = 'wrong';
      setWordResults(newResults);
    }
  };

  const handleAISubmit = async () => {
    setLoading(true);
    try {
      let result = inputMode === 'PROMPT' ? await generateAIPractice(aiPrompt, language, level) : await generatePracticeFromUrl(urlInput, language, level);
      if (result?.audioUrl) {
        clearLocalObjectUrl();
        setMediaUrl(result.audioUrl);
        setSegments(result.segments);
        resetPracticeState();
      }
    } catch (err) {
      if (!isRateLimitError(err)) {
        alert("AI 生成失败，请稍后重试。");
      }
    } finally { setLoading(false); }
  };

  return (
    <section className="space-y-6">
      {showWarmup && analysisResult && (
        <DifficultyWarmup
          analysis={analysisResult}
          onProceed={() => setShowWarmup(false)}
          onCancel={() => {
            setShowWarmup(false);
            clearLocalObjectUrl();
            setMediaUrl(null);
            setSegments([]);
            resetPracticeState();
          }}
        />
      )}

      <div className="bg-white p-6 rounded-xl border border-green-200 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex bg-green-50 p-1 rounded-lg border border-green-100">
            <button onClick={() => setInputMode('PROMPT')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${inputMode === 'PROMPT' ? 'bg-white text-green-600 border border-green-100' : 'text-slate-500 hover:text-slate-900'}`}>涓婚鐢熸垚</button>
            <button onClick={() => setInputMode('URL')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${inputMode === 'URL' ? 'bg-white text-green-600 border border-green-100' : 'text-slate-500 hover:text-slate-900'}`}>閾炬帴瑙ｆ瀽</button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-white text-green-600 border border-green-200"
            >
              涓婁紶鏈湴濯掍綋
            </button>
            <button onClick={() => setFlowMode(!flowMode)} className={`px-4 py-2 rounded-lg text-xs font-bold border ${flowMode ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white text-slate-500 border-green-100'}`}>
              Flow Sync {flowMode ? 'ON' : 'OFF'}
            </button>
            <button onClick={playFullAudio} disabled={!mediaUrl || showWarmup} className="px-4 py-2 rounded-lg text-xs font-bold bg-green-500 text-white disabled:opacity-50">
              {isFullPlaying ? '正在听写' : '开始听写'}
            </button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.mp4,.webm,.mov"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleLocalMediaUpload(file);
              e.currentTarget.value = '';
            }}
          />
        </div>

        <div className="flex items-center gap-3 bg-green-50 p-1 rounded-lg border border-green-100">
          <input
            value={inputMode === 'PROMPT' ? aiPrompt : urlInput}
            onChange={(e) => inputMode === 'PROMPT' ? setAiPrompt(e.target.value) : setUrlInput(e.target.value)}
            placeholder={inputMode === 'PROMPT' ? "杈撳叆缁冧範涓婚..." : "绮樿创濯掍綋閾炬帴..."}
            className="flex-1 bg-transparent border-none px-4 py-2 text-sm outline-none font-medium text-slate-900"
          />
          <button onClick={handleAISubmit} disabled={loading} className="bg-green-600 text-white px-6 py-2 rounded-lg text-xs font-bold disabled:opacity-50">
            {loading ? '处理中...' : '生成素材'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-green-50 rounded-2xl aspect-video relative flex items-center justify-center border border-green-100">
            {mediaUrl ? (
              <video key={mediaUrl} ref={videoRef} src={mediaUrl} className="w-full h-full object-contain" controls={isFullPlaying || segments.length === 0} />
            ) : (
              <div className="text-center p-8">
                <p className="text-slate-500 font-bold mb-4">鏆傛棤绱犳潗锛岃鍏堢敓鎴愭垨涓婁紶</p>
                <button onClick={() => fileInputRef.current?.click()} className="px-6 py-2 bg-white text-green-600 rounded-lg text-xs font-bold border border-green-200">涓婁紶濯掍綋鏂囦欢</button>
              </div>
            )}
          </div>

          {currentSegment && (
            <div className="bg-white p-6 rounded-xl border border-green-200 border-l-4 border-l-green-500">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">涓枃璇戞枃</span>
                <button onClick={() => setShowHint(!showHint)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">{showHint ? "闅愯棌鍘熸枃" : "鎻愮ず鍘熸枃"}</button>
              </div>
              <p className="text-lg text-slate-800 font-bold leading-relaxed">{currentSegment.translation || '锛堟殏鏃犵炕璇戯級'}</p>
              {showHint && (
                <div className="bg-green-50 p-3 rounded-lg mt-3 border border-green-100">
                  <p className="text-sm text-slate-600 italic">
                    {segmentWords.map((word, i) => {
                      const isHard = currentSegment.hardWords?.some(hw => hw.word.toLowerCase() === normalize(word));
                      return (
                        <span
                          key={i}
                          onClick={() => onSaveWord(word, currentSegment.text)}
                          className={`hover:text-green-700 cursor-pointer ${isHard ? 'underline decoration-orange-400 decoration-2 underline-offset-4' : ''}`}
                        >
                          {word}{' '}
                        </span>
                      );
                    })}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-5">
          {segments.length > 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-green-200 flex flex-col min-h-[400px]">
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-1.5">
                  {segments.map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full ${i <= currentIndex ? 'bg-green-500 w-4' : 'bg-green-100 w-1.5'}`} />
                  ))}
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">鍙?{currentIndex + 1} / {segments.length}</span>
              </div>
              <div className="flex-1 flex flex-wrap gap-2 justify-center py-4">
                {segmentWords.map((word, idx) => (
                  <input
                    key={idx}
                    ref={el => { inputRefs.current[idx] = el; }}
                    value={wordInputs[idx] || ''}
                    onChange={(e) => handleWordChange(idx, e.target.value)}
                    style={{ width: `${Math.max(4, word.length + 1)}ch` }}
                    className={`text-center py-2 px-1 text-lg font-mono font-bold rounded-lg border-2 
                        ${wordResults[idx] === 'correct' ? 'bg-green-50 border-green-500 text-green-600' : wordResults[idx] === 'wrong' ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                    autoComplete="off"
                  />
                ))}
              </div>
              <div className="mt-8 grid grid-cols-2 gap-4">
                <button onClick={playCurrentSegment} className="py-3 bg-green-600 text-white rounded-xl font-bold">閲嶅惉鍙ュ瓙</button>
                <button onClick={() => currentIndex < segments.length - 1 && setCurrentIndex(prev => prev + 1)} className="py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">璺宠繃</button>
              </div>
            </div>
          ) : mediaUrl ? (
            <div className="flex-1 bg-white rounded-2xl border border-green-200 flex flex-col items-center justify-center p-12 text-center h-full">
              <p className="text-slate-600 font-bold mb-2">媒体已上传</p>
              <p className="text-slate-400 text-sm">当前没有可听写分段。你可以直接播放媒体，或者在上方用 AI 生成听写内容。</p>
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-2xl border-2 border-dashed border-green-100 flex flex-col items-center justify-center p-12 text-center h-full">
              <p className="text-slate-400 font-bold">请先上传媒体或生成素材开始练习</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ListeningLab;

