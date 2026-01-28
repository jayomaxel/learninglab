
import React, { useState } from 'react';
import { VocabularyItem, Language, DefinitionSource } from '../types';
import { analyzeKoreanStructure } from '../services/linguistics';

interface VocabularyBankProps {
  items: VocabularyItem[];
  onRemove: (id: string) => void;
  onAskAI: (item: VocabularyItem) => void;
  onUpdateStrength?: (id: string, newStrength: number) => void;
}

// Small Hanja Badge Component
const HanjaLink: React.FC<{ hanja: string }> = ({ hanja }) => (
    <span className="inline-flex items-center justify-center bg-stone-100 text-stone-600 border border-stone-200 rounded px-1.5 text-[10px] font-serif font-medium ml-2" title="Hanja (Chinese Character)">
        {hanja}
    </span>
);

const DefinitionView: React.FC<{ 
    text: string, 
    source?: string, 
    allDefinitions?: DefinitionSource[] 
}> = ({ text, source, allDefinitions }) => {
    // If we have rich data (VFS), render hierarchy
    if (allDefinitions && allDefinitions.length > 0) {
        const primary = allDefinitions[0];
        const secondaries = allDefinitions.slice(1);
        const [showSecondary, setShowSecondary] = useState(false);

        return (
            <div className="mt-2">
                <div className="text-sm font-bold text-indigo-600">
                    {primary.text}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="inline-block text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-bold uppercase tracking-wider">
                        {primary.source}
                    </span>
                    {secondaries.length > 0 && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setShowSecondary(!showSecondary); }}
                            className="text-[10px] text-indigo-500 font-bold hover:underline"
                        >
                            {showSecondary ? 'Hide others' : `+${secondaries.length} more from ${secondaries.map(s => s.source).join(', ')}`}
                        </button>
                    )}
                </div>
                
                {showSecondary && (
                    <div className="mt-2 pl-2 border-l-2 border-indigo-100 space-y-2 animate-in slide-in-from-top-1">
                        {secondaries.map((sec, idx) => (
                            <div key={idx}>
                                <div className="text-xs text-slate-600 font-medium">{sec.text}</div>
                                <span className="text-[9px] text-slate-400 font-bold uppercase">{sec.source}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // Legacy Fallback
    const definitions = text.split(' ||| ');
    const [expanded, setExpanded] = useState(false);

    if (definitions.length === 1) {
        return (
            <div className="mt-2">
                <span className="text-sm font-bold text-indigo-600 block">{text}</span>
                {source && <span className="inline-block mt-1 text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 font-medium">via {source}</span>}
            </div>
        );
    }

    const primary = definitions[0];
    const others = definitions.slice(1);

    return (
        <div className="mt-2">
            <div className="text-sm font-bold text-indigo-600 flex items-center justify-between">
                <span>{primary}</span>
                <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded text-indigo-400 font-bold ml-2">
                    {expanded ? 'Hide' : `+${others.length}`}
                </button>
            </div>
            {source && <span className="inline-block mt-0.5 text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 font-medium">via {source}</span>}
            {expanded && (
                <div className="mt-2 space-y-1 pl-2 border-l-2 border-indigo-100">
                    {others.map((def, idx) => (
                        <div key={idx} className="text-xs text-slate-500">{def}</div>
                    ))}
                </div>
            )}
        </div>
    );
};

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
      if (success) { newStrength = Math.min(5, newStrength + 1); } else { newStrength = Math.max(0, newStrength - 1); }
      onUpdateStrength(item.id, newStrength);
      setRevealedId(null);
  };

  const playAudio = (item: VocabularyItem) => {
    if (item.audioPath) {
        const audio = new Audio(item.audioPath);
        audio.play().catch(err => {
            console.warn("Audio file play failed, falling back to TTS", err);
            speakTTS(item.word, item.language);
        });
    } else {
        speakTTS(item.word, item.language);
    }
  };
  
  const speakTTS = (text: string, lang: Language) => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); 
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang === 'EN' ? 'en-US' : lang === 'FR' ? 'fr-FR' : 'ko-KR';
        window.speechSynthesis.speak(u);
    }
  };

  const renderKoreanWord = (item: VocabularyItem) => {
      const parts = analyzeKoreanStructure(item.word);
      return (
          <div className="flex flex-col">
              <span className="inline-flex items-center">
                  <span className="font-black text-slate-900">{parts ? parts.root : item.word}</span>
                  {parts && (
                      <span className="mx-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold border border-slate-200">
                          {parts.particle}
                      </span>
                  )}
                  {item.metadata?.hanja && <HanjaLink hanja={item.metadata.hanja} />}
              </span>
          </div>
      );
  };

  const renderStrength = (strength: number) => (
      <div className="flex gap-0.5 mt-1">
          {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className={`h-1 w-3 rounded-full ${i <= strength ? 'bg-green-500' : 'bg-slate-200'}`} />
          ))}
      </div>
  );

  const handleExportAnki = () => {
      const rows = items.map(item => {
          let trans = item.translation || '';
          if (item.metadata?.gender) trans += ` [${item.metadata.gender}]`;
          
          const word = `"${item.word.replace(/"/g, '""')}"`;
          const meaning = `"${trans.replace(/"/g, '""')}"`;
          const context = `"${item.contextSentence.replace(/"/g, '""')}"`;
          const source = `"${(item.metadata?.source || '').replace(/"/g, '""')}"`;
          const hanja = `"${(item.metadata?.hanja || '').replace(/"/g, '""')}"`;
          
          return `${word},${meaning},${context},${source},${hanja}`;
      });
      
      const csvContent = "Word,Meaning,Context,Source,Hanja\n" + rows.join('\n');
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `linguistflow_anki_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 text-center">
         <h3 className="text-xl font-bold text-slate-400">生词本为空</h3>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 flex-wrap gap-4">
        <h3 className="text-lg font-bold text-slate-700 ml-2">已收藏 {items.length} 个单词</h3>
        <div className="flex items-center gap-2">
             <button onClick={handleExportAnki} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold transition-all border border-indigo-100 hover:bg-indigo-100">Anki 导出 (含Hanja)</button>
             <div className="w-px h-6 bg-slate-200 mx-1"></div>
             <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
               <button onClick={() => setMode('LIST')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'LIST' ? 'bg-white text-green-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}>列表</button>
               <button onClick={() => setMode('REVIEW')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'REVIEW' ? 'bg-white text-green-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}>回顾</button>
            </div>
        </div>
      </div>

      {mode === 'LIST' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-green-300 transition-all group relative">
              <button onClick={() => onRemove(item.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              
              <div className="flex items-start justify-between mb-3">
                 <div>
                    <div className="flex items-center gap-2 mb-1">
                        {renderKoreanWord(item)}
                        <button onClick={() => playAudio(item)} className="p-1 rounded-full text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors" title="Listen">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                        </button>
                        {item.metadata?.gender && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${item.metadata.gender === 'F' ? 'text-pink-600 bg-pink-50 border-pink-200' : 'text-blue-600 bg-blue-50 border-blue-200'}`}>{item.metadata.gender}</span>}
                        {item.metadata?.rootWord && <span className="text-[10px] text-slate-400 font-medium">from lemma: <span className="font-bold">{item.metadata.rootWord}</span></span>}
                    </div>
                    {renderStrength(item.strength || 0)}
                    {item.translation ? (
                        <>
                          <DefinitionView 
                            text={item.translation} 
                            source={item.metadata?.source} 
                            allDefinitions={item.metadata?.allDefinitions} 
                          />
                          {item.metadata?.cognate && (
                             <span className="block mt-1 text-xs font-semibold text-slate-400 flex items-center gap-1">
                               <span className="text-yellow-500">💡</span> Cognate: {item.metadata.cognate}
                             </span>
                          )}
                        </>
                    ) : (
                        <button onClick={() => handleAskAI(item)} disabled={loadingId === item.id} className="mt-2 text-xs font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded hover:bg-green-100 transition-colors">
                          {loadingId === item.id ? 'Thinking...' : 'Ask AI'}
                        </button>
                    )}
                 </div>
                 <span className="text-[10px] font-bold text-slate-400">{formatDate(item.timestamp)}</span>
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
                          <div className="flex items-center justify-center gap-2">
                             <p className="text-3xl font-black text-slate-900">{item.word}</p>
                             <button onClick={() => playAudio(item)} className="p-1 rounded-full text-green-300 hover:text-green-600 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                             </button>
                          </div>
                          {item.translation && (
                            <DefinitionView 
                                text={item.translation} 
                                source={item.metadata?.source}
                                allDefinitions={item.metadata?.allDefinitions}
                            />
                          )}
                          {item.metadata?.hanja && <div className="mt-2"><HanjaLink hanja={item.metadata.hanja} /></div>}
                      </div>
                      <div className="flex gap-2 justify-center mt-4 pt-4 border-t border-green-200">
                          <button onClick={(e) => handleReviewResult(e, item, false)} className="flex-1 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 font-bold text-xs hover:bg-red-100">忘了</button>
                          <button onClick={(e) => handleReviewResult(e, item, true)} className="flex-1 py-2 rounded-lg bg-green-100 text-green-700 border border-green-200 font-bold text-xs hover:bg-green-200">记得</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Guess</p>
                       <p className="text-lg text-slate-600 font-medium leading-relaxed">
                         {item.contextSentence.split(item.word).map((part, i, arr) => (
                             <span key={i}>
                                 {part}
                                 {i < arr.length - 1 && <span className="border-b-2 border-green-300 text-transparent bg-green-50 px-1 select-none">????</span>}
                             </span>
                         ))}
                       </p>
                    </div>
                  )}
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
