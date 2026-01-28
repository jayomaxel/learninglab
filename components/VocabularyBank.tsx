
import React, { useState } from 'react';
import { VocabularyItem } from '../types';

interface VocabularyBankProps {
  items: VocabularyItem[];
  onRemove: (id: string) => void;
}

const VocabularyBank: React.FC<VocabularyBankProps> = ({ items, onRemove }) => {
  const [mode, setMode] = useState<'LIST' | 'REVIEW'>('LIST');
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString();

  // Robust Cloze Generator:
  // Finds the target word in the sentence. Verifies if it's a whole word by checking surrounding characters.
  // Supports English, French (accents), and other languages by defining a "word character" strictly.
  const createCloze = (sentence: string, targetWord: string) => {
    if (!targetWord) return sentence;

    const lowerSentence = sentence.toLowerCase();
    const lowerTarget = targetWord.toLowerCase();
    const len = targetWord.length;
    
    // We will build an array of React Nodes
    const nodes: React.ReactNode[] = [];
    
    let lastIndex = 0;
    let index = lowerSentence.indexOf(lowerTarget);
    
    // Check if a character is a "word character" (Letter, Number, Underscore, or specific accents)
    // This is a simple approximation. For production, regex \p{L} is better but we use manual checks for speed/simplicity here.
    const isWordChar = (char: string | undefined) => {
        if (!char) return false;
        return /[\p{L}\p{N}_]/u.test(char);
    };

    while (index !== -1) {
      // Check boundaries
      const charBefore = sentence[index - 1];
      const charAfter = sentence[index + len];
      
      const isStartBoundary = index === 0 || !isWordChar(charBefore);
      const isEndBoundary = (index + len === sentence.length) || !isWordChar(charAfter);
      
      if (isStartBoundary && isEndBoundary) {
        // Match found!
        // Push text before match
        if (index > lastIndex) {
            nodes.push(<span key={`text-${lastIndex}`}>{sentence.substring(lastIndex, index)}</span>);
        }
        // Push Cloze Box
        nodes.push(
            <span key={`cloze-${index}`} className="border-b-2 border-green-500 text-transparent select-none bg-green-50 px-1 min-w-[50px] inline-block">
                {sentence.substring(index, index + len)}
            </span>
        );
        lastIndex = index + len;
      } else {
        // Not a whole word match (e.g. "he" in "The"), skip this occurrence but keep text
        // We don't push text yet, just advance search
      }
      
      index = lowerSentence.indexOf(lowerTarget, index + 1);
    }
    
    // Push remaining text
    if (lastIndex < sentence.length) {
        nodes.push(<span key={`text-end`}>{sentence.substring(lastIndex)}</span>);
    }

    // If no match was found/processed (e.g. substring only), fallback to showing full sentence but alert user visually? 
    // Actually, the above logic reconstructs the string perfectly. 
    // If no replacement occurred, nodes will contain just the full sentence (via last push).
    
    return nodes;
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 text-center">
        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 text-slate-300">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">生词本为空</h3>
        <p className="text-slate-500 max-w-xs">在听力或阅读时，点击单词或使用“收藏”按钮将生词加入此处。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 ml-2">
          已收藏 {items.length} 个单词
        </h3>
        <div className="flex bg-slate-100 p-1 rounded-xl">
           <button 
             onClick={() => setMode('LIST')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'LIST' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400'}`}
           >
             列表视图
           </button>
           <button 
             onClick={() => setMode('REVIEW')}
             className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'REVIEW' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400'}`}
           >
             闪卡回顾
           </button>
        </div>
      </div>

      {mode === 'LIST' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-green-300 transition-all group relative">
              <button 
                onClick={() => onRemove(item.id)}
                className="absolute top-4 right-4 text-slate-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="移除"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              
              <div className="flex items-baseline justify-between mb-3">
                 <span className="text-2xl font-black text-slate-800">{item.word}</span>
                 <span className="text-[10px] font-bold text-slate-300">{formatDate(item.timestamp)}</span>
              </div>
              
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                  "{item.contextSentence}"
                </p>
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
                className="bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col min-h-[240px] shadow-sm cursor-pointer hover:-translate-y-1 transition-transform duration-300"
                onClick={() => setRevealedId(isRevealed ? null : item.id)}
              >
                <div className={`flex-1 p-8 flex items-center justify-center text-center transition-colors ${isRevealed ? 'bg-green-50' : 'bg-white'}`}>
                  {isRevealed ? (
                    <div>
                      <p className="text-xs font-bold text-green-600 mb-2 uppercase tracking-widest">Answer</p>
                      <p className="text-3xl font-black text-slate-900">{item.word}</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Guess the word</p>
                       <p className="text-lg text-slate-700 font-medium leading-relaxed">
                         {createCloze(item.contextSentence, item.word)}
                       </p>
                    </div>
                  )}
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
                  <span className="text-xs font-bold text-slate-400">
                    {isRevealed ? '点击隐藏' : '点击显示答案'}
                  </span>
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
