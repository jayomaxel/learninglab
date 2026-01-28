
import React from 'react';
import { DifficultyAnalysis, DifficultWord } from '../types';

interface DifficultyWarmupProps {
  analysis: DifficultyAnalysis;
  onProceed: () => void;
  onCancel: () => void; // Optional: allow user to go back
}

const DifficultyWarmup: React.FC<DifficultyWarmupProps> = ({ analysis, onProceed, onCancel }) => {
  const { density, level, difficultWords, suggestion } = analysis;
  const percentage = Math.round(density * 100);

  // Styling based on difficulty
  const isHard = suggestion === 'HARD';
  const colorClass = isHard ? 'red' : suggestion === 'EASY' ? 'blue' : 'green';
  
  return (
    <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
      <div className="w-full max-w-2xl bg-white rounded-[32px] shadow-xl border border-slate-200 overflow-hidden">
        
        {/* Header Section */}
        <div className={`p-8 bg-${colorClass}-50 border-b border-${colorClass}-100 flex items-center justify-between`}>
           <div>
             <div className="flex items-center gap-3 mb-2">
               <span className={`px-3 py-1 rounded-full text-xs font-black bg-${colorClass}-500 text-white uppercase tracking-widest`}>
                 {isHard ? '高难度预警' : 'i + 1 最佳匹配'}
               </span>
               <span className="text-slate-500 font-mono text-sm font-bold">Level {level}</span>
             </div>
             <h3 className={`text-2xl font-black text-${colorClass}-900`}>
               {isHard ? '生词密度过高' : '准备好进入心流了吗？'}
             </h3>
             <p className={`text-${colorClass}-700 mt-1 font-medium`}>
               {isHard 
                 ? `当前文本包含 ${percentage}% 的生词，超出了 15% 的最佳学习区。` 
                 : `生词密度为 ${percentage}%，非常适合目前的你。`}
             </p>
           </div>
           
           {/* Gauge Chart Visual */}
           <div className="relative w-20 h-20 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="8" fill="transparent" 
                  className={`text-${colorClass}-500 transition-all duration-1000 ease-out`}
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={`${2 * Math.PI * 36 * (1 - density)}`}
                />
              </svg>
              <span className={`absolute text-lg font-black text-${colorClass}-600`}>{percentage}%</span>
           </div>
        </div>

        {/* Vocabulary Cards */}
        <div className="p-8 bg-white">
           <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
             {isHard ? '建议先预习以下关键词' : '快速扫视生词'}
           </h4>
           
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
             {difficultWords.slice(0, 6).map((item, idx) => (
               <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:border-green-200 transition-colors">
                 <div className="flex justify-between items-baseline mb-1">
                   <span className="font-bold text-lg text-slate-800">{item.word}</span>
                   <span className="text-xs text-slate-400">{item.phonetic}</span>
                 </div>
                 <div className="text-sm font-bold text-green-600 mb-1">{item.translation}</div>
                 <p className="text-xs text-slate-500 leading-relaxed">{item.definition}</p>
               </div>
             ))}
             {difficultWords.length > 6 && (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-400 text-sm font-bold">
                   以及其他 {difficultWords.length - 6} 个生词...
                </div>
             )}
           </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
           <button 
             onClick={onCancel}
             className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition-colors"
           >
             换一篇
           </button>
           <button 
             onClick={onProceed}
             className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg shadow-${colorClass}-200 transform hover:scale-105 transition-all
               ${isHard ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}
             `}
           >
             {isHard ? '接受挑战 (预习完毕)' : '开始学习'}
           </button>
        </div>
      </div>
    </div>
  );
};

export default DifficultyWarmup;
