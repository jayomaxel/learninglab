
import React, { useState } from 'react';
import { VocabularyItem, CEFRLevel } from '../types';

const GenderBadge: React.FC<{ gender: 'M' | 'F' }> = ({ gender }) => (
    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ml-2 ${gender === 'F' ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-green-600 bg-green-50 border-green-200'}`}>
        {gender === 'F' ? '阴性' : '阳性'}
    </span>
);

const SpeechLevelBadge: React.FC<{ level: string }> = ({ level }) => (
    <span className="px-2 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 text-[9px] font-bold uppercase ml-2">
        {level === 'Formal' ? '敬语' : level === 'Polite' ? '口语' : '平语'}
    </span>
);

interface VocabularyBankProps {
  items: VocabularyItem[];
  onRemove: (id: string) => void;
  onAskAI: (item: VocabularyItem) => void;
  onUpdateStrength: (id: string, s: number) => void;
  level: CEFRLevel;
}

const VocabularyBank: React.FC<VocabularyBankProps> = ({ items, onRemove, onAskAI, onUpdateStrength, level }) => {
  const [revealed, setRevealed] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((item) => {
          const isRevealed = revealed === item.id;
          return (
            <div key={item.id} onClick={() => setRevealed(isRevealed ? null : item.id)} className={`p-6 rounded-2xl border-2 transition-all cursor-pointer min-h-[200px] flex flex-col justify-between bg-white ${isRevealed ? 'border-green-500' : 'border-green-100 hover:border-green-300'}`}>
               <div className="flex justify-between items-start">
                  <div className="flex items-center flex-wrap gap-1">
                      <span className="text-xl font-bold text-slate-800">{item.word}</span>
                      {item.metadata?.gender && <GenderBadge gender={item.metadata.gender} />}
                      {item.metadata?.speechLevel && <SpeechLevelBadge level={item.metadata.speechLevel} />}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onRemove(item.id); }} className="text-slate-300 hover:text-red-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
               </div>

               <div className="mt-4 flex-1">
                  {isRevealed ? (
                      <div className="space-y-3">
                         <p className="text-green-600 font-bold text-lg">{item.translation || '正在获取释义...'}</p>
                         {item.metadata?.nuance && <p className="text-[10px] text-slate-500 italic">"{item.metadata.nuance}"</p>}
                         <div className="flex gap-2 pt-2">
                             <button onClick={(e) => { e.stopPropagation(); onUpdateStrength(item.id, Math.max(0, item.strength - 1)); setRevealed(null); }} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-400 hover:bg-slate-50">模糊</button>
                             <button onClick={(e) => { e.stopPropagation(); onUpdateStrength(item.id, Math.min(5, item.strength + 1)); setRevealed(null); }} className="flex-1 py-1.5 rounded-lg bg-green-600 text-white text-[10px] font-bold">记住了</button>
                         </div>
                      </div>
                  ) : (
                      <p className="text-sm text-slate-500 italic leading-relaxed line-clamp-3">"{item.contextSentence}"</p>
                  )}
               </div>
               
               {!item.translation && !isRevealed && <button onClick={(e) => { e.stopPropagation(); onAskAI(item); }} className="mt-4 py-1.5 bg-green-50 text-green-600 text-[10px] font-bold rounded-lg border border-green-200">AI 解析</button>}
            </div>
          );
      })}
    </div>
  );
};

export default VocabularyBank;
