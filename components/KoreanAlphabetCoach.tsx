
import React, { useState } from 'react';
import { db } from '../services/db';
import { getAIPronunciation } from '../services/gemini';

// Standard Unicode Medial (Jungseong) indices for the 10 vowels in the phonics chart
const VOWELS = [
  { char: 'ㅏ', pinyin: 'a', idx: 0 },
  { char: 'ㅑ', pinyin: 'ya', idx: 2 },
  { char: 'ㅓ', pinyin: 'eo', idx: 4 },
  { char: 'ㅕ', pinyin: 'yeo', idx: 6 },
  { char: 'ㅗ', pinyin: 'o', idx: 8 },
  { char: 'ㅛ', pinyin: 'yo', idx: 12 },
  { char: 'ㅜ', pinyin: 'u', idx: 13 },
  { char: 'ㅠ', pinyin: 'yu', idx: 17 },
  { char: 'ㅡ', pinyin: 'eu', idx: 18 },
  { char: 'ㅣ', pinyin: 'i', idx: 20 }
];

// Standard Unicode Initial (Choseong) indices for the 14 consonants
const CONSONANTS = [
  { char: 'ㄱ', pinyin: 'g', idx: 0 },
  { char: 'ㄴ', pinyin: 'n', idx: 2 },
  { char: 'ㄷ', pinyin: 'd', idx: 3 },
  { char: 'ㄹ', pinyin: 'l', idx: 5 },
  { char: 'ㅁ', pinyin: 'm', idx: 6 },
  { char: 'ㅂ', pinyin: 'b', idx: 7 },
  { char: 'ㅅ', pinyin: 's', idx: 9 },
  { char: 'ㅇ', pinyin: 'a', idx: 11 }, // side label 'a' for vowel-only sound
  { char: 'ㅈ', pinyin: 'z', idx: 12 },
  { char: 'ㅊ', pinyin: 'c', idx: 14 },
  { char: 'ㅋ', pinyin: 'k', idx: 15 },
  { char: 'ㅌ', pinyin: 't', idx: 16 },
  { char: 'ㅍ', pinyin: 'p', idx: 17 },
  { char: 'ㅎ', pinyin: 'h', idx: 18 }
];

const KoreanAlphabetCoach: React.FC = () => {
  const [loadingChar, setLoadingChar] = useState<string | null>(null);
  const [cachedChars, setCachedChars] = useState<Set<string>>(new Set());
  const [pendingVerification, setPendingVerification] = useState<{char: string, data: string} | null>(null);

  const getCombinedChar = (cIdx: number, vIdx: number) => {
    // Hangul syllable = 0xAC00 + (Initial * 588) + (Medial * 28) + Final (0)
    const code = 0xAC00 + (cIdx * 588) + (vIdx * 28);
    return String.fromCharCode(code);
  };

  const playAndVerify = async (char: string) => {
    const cachedData = await db.getAudioCache(char);
    if (cachedData) {
      const audio = new Audio(cachedData);
      audio.play();
      setCachedChars(prev => new Set(prev).add(char));
      return;
    }

    setLoadingChar(char);
    try {
        const aiAudioData = await getAIPronunciation(char);
        const audio = new Audio(aiAudioData);
        audio.play();
        setPendingVerification({ char, data: aiAudioData });
    } catch (e) {
        const utterance = new SpeechSynthesisUtterance(char);
        utterance.lang = 'ko-KR';
        window.speechSynthesis.speak(utterance);
    } finally {
        setLoadingChar(null);
    }
  };

  const handleSaveCache = async () => {
    if (!pendingVerification) return;
    await db.setAudioCache(pendingVerification.char, pendingVerification.data);
    setCachedChars(prev => new Set(prev).add(pendingVerification.char));
    setPendingVerification(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Verification Bar: No scroll bar, fixed at top of view context */}
      {pendingVerification && (
        <div className="bg-white p-4 rounded-2xl border-2 border-green-500 flex items-center justify-between shadow-lg sticky top-24 z-50">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-black text-[#c08457]">{pendingVerification.char}</span>
            <div>
              <p className="text-sm font-bold text-slate-800">确认 AI 模拟发音</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">确认后将永久保存至本地</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPendingVerification(null)} className="px-4 py-2 text-xs font-bold text-slate-400">取消</button>
            <button onClick={handleSaveCache} className="px-6 py-2 bg-green-500 text-white text-xs font-bold rounded-xl">保存本地</button>
          </div>
        </div>
      )}

      {/* Main Phonics Chart: No internal scroll bars, pure layout */}
      <div className="bg-white rounded-3xl border border-[#e2f2e5] shadow-sm overflow-hidden">
        <div className="p-8 text-center border-b border-[#e2f2e5] bg-[#fafff5]">
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">韩语四十音拼读表</h2>
          <p className="text-slate-400 text-[10px] mt-2 font-bold uppercase tracking-[0.2em]">Native AI Simulation • Local Storage Cache</p>
        </div>
        
        <table className="w-full border-collapse table-fixed bg-white">
          <thead>
            <tr className="bg-[#fafff5]">
              <th className="border border-[#e2f2e5] p-2 relative w-16 h-16">
                <div className="absolute top-1 right-2 text-[9px] font-bold text-slate-400">元音</div>
                <div className="absolute bottom-1 left-2 text-[9px] font-bold text-slate-400">辅音</div>
                <div className="w-full h-px bg-[#e2f2e5] absolute top-1/2 left-0 -rotate-[45deg]"></div>
              </th>
              {VOWELS.map(v => (
                <th key={v.char} className="border border-[#e2f2e5] p-2 text-center">
                  <div className="text-2xl font-bold text-slate-800">{v.char}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase">{v.pinyin}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONSONANTS.map(c => (
              <tr key={c.char}>
                <td className="border border-[#e2f2e5] p-2 bg-[#fafff5] text-center">
                  <div className="text-2xl font-bold text-slate-800">{c.char}</div>
                  <div className="text-[9px] font-black text-slate-500 uppercase">{c.pinyin}</div>
                </td>
                {VOWELS.map(v => {
                  const combined = getCombinedChar(c.idx, v.idx);
                  const rom = (c.char === 'ㅇ' ? '' : c.pinyin) + v.pinyin;
                  const isBusy = loadingChar === combined;
                  const isCached = cachedChars.has(combined);
                  
                  return (
                    <td 
                      key={v.char} 
                      onClick={() => !isBusy && playAndVerify(combined)}
                      className={`border border-[#e2f2e5] p-2 text-center cursor-pointer relative group
                        ${isBusy ? 'bg-green-50' : 'hover:bg-[#fafff5] active:bg-[#e2f2e5]'}
                      `}
                    >
                      <div className="text-2xl font-black text-[#c08457] leading-tight">{combined}</div>
                      <div className="text-[9px] font-bold text-slate-900 opacity-60 uppercase">{rom}</div>
                      
                      {/* Cached Indicator */}
                      <div className="absolute top-1 right-1">
                        {isCached && <div className="w-1.5 h-1.5 rounded-full bg-green-500 border border-white" />}
                        {isBusy && <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping" />}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-[#fafff5] p-4 rounded-2xl border border-[#e2f2e5] text-center">
        <p className="text-slate-400 text-[10px] font-bold tracking-wider">点击单元格首次激活 AI 母语模拟，确认后将不再消耗云端流量。</p>
      </div>
    </div>
  );
};

export default KoreanAlphabetCoach;
