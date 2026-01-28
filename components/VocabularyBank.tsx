
import React, { useState } from 'react';
import { VocabularyItem } from '../types';
import { analyzeKoreanStructure } from '../services/linguistics';

interface VocabularyBankProps {
  items: VocabularyItem[];
  onRemove: (id: string) => void;
  onAskAI: (item: VocabularyItem) => void;
  onUpdateStrength?: (id: string, newStrength: number) => void;
}

const VocabularyBank: React.FC<VocabularyBankProps> = ({ items, onRemove, onAskAI, onUpdateStrength }) => {
  const [mode, setMode] = useState<'LIST' | 'REVIEW'>('LIST');
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString();

  const handleAskAI = async (item: VocabularyItem) => {
    setLoadingId(item.id);
    await onAskAI(item);
    setLoadingId(null);
  };

  const handleReviewResult = (e: React.MouseEvent, item: VocabularyItem, success: boolean) => {
      e.stopPropagation();
      if (!onUpdateStrength) return;
      
      let newStrength = item.strength || 0;
      if (success) {
          newStrength = Math.min(5, newStrength + 1);
      } else {
          newStrength = Math.max(0, newStrength - 1);
      }
      onUpdateStrength(item.id, newStrength);
      setRevealedId(null);
  };

  const renderKoreanWord = (item: VocabularyItem) => {
      const parts = analyzeKoreanStructure(item.word);
      const hanja = item.metadata?.hanja;
      
      return (
          <div className="flex flex-col">
              <span className="inline-flex items-baseline">
                  <span className="font-black text-slate-900">{parts ? parts.root : item.word}</span>
                  {parts && (
                      <span className="mx-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold border border-slate-200">
                          {parts.particle}
                      </span>
                  )}
              </span>
              {hanja && <span className="text-[10px] text-slate-400 font-serif mt-0.5">{hanja}</span>}
          </div>
      );
  };

  const renderStrength = (strength: number) => (
      <div className="flex gap-0.5 mt-1">
          {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className={`h-1 w-3 rounded-full ${i <= strength ? 'bg-green-400' : 'bg-slate-100'}`} />
          ))}
      </div>
  );

  const handleExportAnki = () => {
      const csvContent = items.map(item => {
          let trans = item.translation || '';
          if (item.metadata?.gender) trans += ` [${item.metadata.gender}]`;
          if (item.metadata?.nuance) trans += ` (${item.metadata.nuance})`;
          if (item.metadata?.hanja) trans += ` {${item.metadata.hanja}}`;
          const word = `"${item.word.replace(/"/g, '""')}"`;
          const meaning = `"${trans.replace(/"/g, '""')}"`;
          const context = `"${item.contextSentence.replace(/"/g, '""')}"`;
          return `${word},${meaning},${context}`;
      }).join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `linguistflow_anki_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleBackupJSON = () => {
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `linguistflow_backup_${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 text-center">
         <h3 className="text-xl font-bold text-slate-800">生词本为空</h3>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex-wrap gap-4">
        <h3 className="text-lg font-bold text-slate-800 ml-2">
          已收藏 {items.length} 个单词
        </h3>
        
        <div className="flex items-center gap-2">
             <button onClick={handleExportAnki} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold transition-all border border-indigo-100">Anki 导出</button>
             <button onClick={handleBackupJSON} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition-all border border-slate-200">JSON 备份</button>
             <div className="w-px h-6 bg-slate-200 mx-1"></div>
             <div className="flex bg-slate-100 p-1 rounded-xl">
               <button onClick={() => setMode('LIST')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'LIST' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400'}`}>列表</button>
               <button onClick={() => setMode('REVIEW')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'REVIEW' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400'}`}>回顾</button>
            </div>
        </div>
      </div>

      {mode === 'LIST' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-green-300 transition-all group relative">
              <button onClick={() => onRemove(item.id)} className="absolute top-4 right-4 text-slate-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              
              <div className="flex items-start justify-between mb-3">
                 <div>
                    <div className="flex items-center gap-2 mb-1">
                        {renderKoreanWord(item)}
                        {item.metadata?.gender && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${item.metadata.gender === 'F' ? 'text-pink-600 bg-pink-50 border-pink-100' : 'text-blue-600 bg-blue-50 border-blue-100'}`}>{item.metadata.gender}</span>}
                        {item.metadata?.nuance && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">{item.metadata.nuance}</span>}
                    </div>
                    
                    {renderStrength(item.strength || 0)}

                    {item.translation ? (
                        <>
                          <span className="text-sm font-bold text-indigo-500 block mt-2">{item.translation}</span>
                          {item.metadata?.cognate && (
                             <span className="block mt-1 text-xs font-semibold text-slate-500 flex items-center gap-1">
                               <span className="text-yellow-500">💡</span> Cognate: {item.metadata.cognate}
                             </span>
                          )}
                        </>
                    ) : (
                        <button onClick={() => handleAskAI(item)} disabled={loadingId === item.id} className="mt-2 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded hover:bg-green-100 transition-colors">
                          {loadingId === item.id ? 'Thinking...' : 'Ask AI'}
                        </button>
                    )}
                 </div>
                 <span className="text-[10px] font-bold text-slate-300">{formatDate(item.timestamp)}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-sm text-slate-600 leading-relaxed font-medium">"{item.contextSentence}"</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            const isRevealed = revealedId === item.id;
            return (
              <div 
                key={item.id} 
                className="bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col min-h-[280px] shadow-sm cursor-pointer hover:-translate-y-1 transition-transform duration-300"
                onClick={() => setRevealedId(isRevealed ? null : item.id)}
              >
                <div className={`flex-1 p-8 flex items-center justify-center text-center transition-colors ${isRevealed ? 'bg-green-50' : 'bg-white'}`}>
                  {isRevealed ? (
                    <div onClick={(e) => e.stopPropagation()} className="w-full">
                      <p className="text-xs font-bold text-green-600 mb-2 uppercase tracking-widest">Answer</p>
                      <div className="mb-4">
                          <p className="text-3xl font-black text-slate-900">{item.word}</p>
                          {item.translation && <p className="text-lg font-bold text-indigo-600 mt-2">{item.translation}</p>}
                          {item.metadata?.hanja && <p className="text-sm font-serif text-slate-400 mt-1">{item.metadata.hanja}</p>}
                      </div>
                      <div className="flex gap-2 justify-center mt-4 pt-4 border-t border-green-100">
                          <button onClick={(e) => handleReviewResult(e, item, false)} className="flex-1 py-2 rounded-lg bg-red-100 text-red-600 font-bold text-xs hover:bg-red-200">忘了</button>
                          <button onClick={(e) => handleReviewResult(e, item, true)} className="flex-1 py-2 rounded-lg bg-green-100 text-green-600 font-bold text-xs hover:bg-green-200">记得</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Guess the word</p>
                       <p className="text-lg text-slate-700 font-medium leading-relaxed">
                         {item.contextSentence.split(item.word).map((part, i, arr) => (
                             <span key={i}>
                                 {part}
                                 {i < arr.length - 1 && <span className="border-b-2 border-green-500 text-transparent bg-green-50 px-1 select-none">????</span>}
                             </span>
                         ))}
                       </p>
                    </div>
                  )}
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 text-center flex justify-between items-center">
                  {renderStrength(item.strength || 0)}
                  <span className="text-xs font-bold text-slate-400">{isRevealed ? '评估记忆' : '点击显示'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VocabularyBank;
