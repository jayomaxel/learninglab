
import React, { useMemo, useState, useEffect } from 'react';
import { Language, VocabularyItem, StudyLog, DictionarySource } from '../types';
import { calculateProficiency, calculateLexicalPower, calculateStreak, getChartData, getMasteryGainHeatmap } from '../services/stats';
import { db } from '../services/db';
import { getDailyReviewList } from '../services/scheduler';

interface DashboardProps {
  language: Language;
  vocabulary: VocabularyItem[];
  onStartReview: () => void;
}

const Firework: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    {[...Array(20)].map((_, i) => (
      <div key={i} className="absolute animate-firework" style={{
        left: '50%', top: '50%',
        backgroundColor: ['#F87171', '#60A5FA', '#34D399', '#FBBF24'][i % 4],
        width: '6px', height: '6px', borderRadius: '50%',
        transform: `rotate(${i * 18}deg) translate(0, 0)`,
        opacity: 0
      }}></div>
    ))}
    <style>{`
      @keyframes firework {
        0% { transform: rotate(var(--r)) translate(0, 0); opacity: 1; }
        100% { transform: rotate(var(--r)) translate(100px, 0); opacity: 0; }
      }
      .animate-firework {
        --r: 0deg;
        animation: firework 1s ease-out forwards;
      }
      .animate-firework:nth-child(1) { --r: 0deg; }
      .animate-firework:nth-child(2) { --r: 18deg; }
    `}</style>
  </div>
);

const RadarChart: React.FC<{ progress: Record<Language, number> }> = ({ progress }) => {
    const points = [
        { lang: 'EN', angle: -90, val: progress.EN },
        { lang: 'FR', angle: 30, val: progress.FR },
        { lang: 'KR', angle: 150, val: progress.KR }
    ];
    const getCoord = (angle: number, val: number) => {
        const rad = angle * (Math.PI / 180);
        const r = (val / 100) * 40;
        return `${50 + r * Math.cos(rad)},${50 + r * Math.sin(rad)}`;
    };
    const polyPoints = points.map(p => getCoord(p.angle, p.val)).join(' ');
    return (
        <div className="relative w-full aspect-square max-w-[200px] mx-auto">
            <svg viewBox="0 0 100 100" className="w-full h-full">
                {[20, 40].map(r => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="2 2" />)}
                {points.map((p, i) => <line key={i} x1="50" y1="50" x2={getCoord(p.angle, 100).split(',')[0]} y2={getCoord(p.angle, 100).split(',')[1]} stroke="#cbd5e1" strokeWidth="0.5" />)}
                <polygon points={polyPoints} fill="rgba(74, 222, 128, 0.2)" stroke="#22c55e" strokeWidth="2" />
                <text x="50" y="8" textAnchor="middle" className="text-[6px] font-bold fill-slate-500">EN</text>
                <text x="88" y="75" textAnchor="middle" className="text-[6px] font-bold fill-slate-500">FR</text>
                <text x="12" y="75" textAnchor="middle" className="text-[6px] font-bold fill-slate-500">KR</text>
            </svg>
        </div>
    );
};

const Sparkline: React.FC<{ data: number[], color: string }> = ({ data, color }) => {
    if (data.length < 2) return null;
    const max = Math.max(...data, 10);
    const min = 0;
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 100 - ((d - min) / (max - min)) * 100;
        return `${x},${y}`;
    }).join(' ');
    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-12 overflow-visible">
            <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {data.map((d, i) => <circle key={i} cx={(i / (data.length - 1)) * 100} cy={100 - ((d - min) / (max - min)) * 100} r="2" fill="#ffffff" stroke={color} strokeWidth="2" />)}
        </svg>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ language, vocabulary, onStartReview }) => {
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [dictionaries, setDictionaries] = useState<DictionarySource[]>([]);
  const [showFireworks, setShowFireworks] = useState(false);
  
  useEffect(() => { 
      db.getLogs(language).then(setLogs);
      db.getDictionaries(language).then(setDictionaries);
  }, [language]);
  
  const { lexicalPower, proficiency, reviewCount, streak, dictationTrend, readingTrend, dictCoverage } = useMemo(() => {
     // Filter vocabulary for the CURRENT language context
     const currentLangVocab = vocabulary.filter(v => v.language === language || (!v.language && language === 'EN'));

     // Calculate Dictionary Coverage
     const dictCoverage = dictionaries.filter(d => d.type === 'IMPORTED').map(dict => {
         // This is an approximation. Ideally we check if word exists in dict, but counting source matches is faster
         const masteredInSource = currentLangVocab.filter(v => 
             v.metadata?.source === dict.name && v.strength >= 3
         ).length;
         
         const total = dict.count || 1;
         const percent = Math.min(100, Math.round((masteredInSource / total) * 100));
         return { name: dict.name, percent, count: masteredInSource, total };
     });

     return {
         lexicalPower: calculateLexicalPower(currentLangVocab),
         proficiency: calculateProficiency(currentLangVocab, language),
         reviewCount: getDailyReviewList(currentLangVocab).length,
         streak: calculateStreak(logs),
         dictationTrend: getChartData(logs, 'DICTATION'),
         readingTrend: getChartData(logs, 'READER'),
         dictCoverage
     };
  }, [vocabulary, logs, language, dictionaries]);
  
  // Calculate specific proficiency for each language for Radar Chart
  const radarData = useMemo(() => {
     const getScore = (lang: Language) => {
         const langVocab = vocabulary.filter(v => v.language === lang || (!v.language && lang === 'EN'));
         return calculateProficiency(langVocab, lang).progress;
     };
     return {
         EN: getScore('EN'),
         FR: getScore('FR'),
         KR: getScore('KR')
     };
  }, [vocabulary]);
  
  useEffect(() => { 
      if (proficiency.progress >= 100) {
          setShowFireworks(true); 
          const timer = setTimeout(() => setShowFireworks(false), 3000); 
          return () => clearTimeout(timer);
      }
  }, [proficiency.progress]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-8 relative overflow-hidden border border-slate-200 shadow-sm">
                {showFireworks && <Firework />}
                <div className="relative z-10 flex justify-between items-start">
                    <div>
                        <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">Lexical Power</h3>
                        <div className="text-5xl font-black text-slate-900">
                            {lexicalPower.toLocaleString()} <span className="text-lg text-yellow-500 font-medium">⚡</span>
                        </div>
                        <p className="text-slate-400 text-xs mt-2 font-medium">Weighted Score (Word Count × Mastery)</p>
                    </div>
                    <div className="text-right">
                        <div className="inline-block bg-slate-50 border border-slate-100 rounded-lg px-3 py-1 mb-2">
                             <span className="text-orange-500 font-bold">🔥 {streak} Day Streak</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-center items-start">
                 <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-2">Spaced Repetition</h3>
                 <div className="flex items-baseline gap-2 mb-4">
                     <span className="text-4xl font-black text-slate-900">{reviewCount}</span>
                     <span className="text-sm font-bold text-slate-400">words due for review</span>
                 </div>
                 <button onClick={onStartReview} disabled={reviewCount === 0} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-bold transition-all disabled:shadow-none shadow-lg shadow-indigo-100">
                    {reviewCount > 0 ? 'Start Daily Review' : 'All Caught Up!'}
                 </button>
            </div>
        </div>

        {/* Dictionary Mastery Section */}
        {dictCoverage.length > 0 && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <h4 className="text-sm font-bold text-slate-600 mb-4">Dictionary Mastery (Words &gt; Str 3)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dictCoverage.map(dict => (
                        <div key={dict.name} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-slate-700 truncate max-w-[150px]" title={dict.name}>{dict.name}</span>
                                <span className="text-[10px] font-mono text-slate-400">{dict.count} / {dict.total}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${dict.percent}%` }}></div>
                                </div>
                                <span className="text-xs font-black text-indigo-600 w-8 text-right">{dict.percent}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col items-center">
                <h4 className="text-sm font-bold text-slate-600 mb-4 w-full text-left">Level Radar</h4>
                <RadarChart progress={radarData} />
                <div className="mt-4 text-center">
                    <span className="px-3 py-1 bg-green-50 text-green-600 rounded-full text-xs font-bold border border-green-200">{language}: {proficiency.level} ({proficiency.progress}%)</span>
                </div>
            </div>
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between md:col-span-2">
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-bold text-slate-600">Dictation Accuracy (7 Days)</h4>
                        <span className="text-xs font-bold text-green-600">{dictationTrend[6]}% Last</span>
                    </div>
                    <div className="w-[70%] mx-auto"><Sparkline data={dictationTrend} color="#4ade80" /></div>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-2">
                         <h4 className="text-sm font-bold text-slate-600">Reading Volume (7 Days)</h4>
                         <span className="text-xs font-bold text-blue-500">{readingTrend[6]} Sessions</span>
                    </div>
                    <div className="w-[70%] mx-auto"><Sparkline data={readingTrend} color="#60a5fa" /></div>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
             <div className="flex justify-between items-center mb-4">
                 <h4 className="text-sm font-bold text-slate-600">Mastery Heatmap (Strength Gained)</h4>
                 <div className="flex gap-1">
                     {[1,2,3,4].map(l => <div key={l} className={`w-3 h-3 rounded-sm ${l===1?'bg-green-100':l===2?'bg-green-300':l===3?'bg-green-500':'bg-green-600'}`}></div>)}
                 </div>
             </div>
             <div className="overflow-x-auto pb-2 custom-scrollbar">
                 <div className="grid grid-rows-6 grid-flow-col gap-1 w-max">
                     {(() => {
                         const map = getMasteryGainHeatmap(vocabulary);
                         const days = []; const today = new Date(); const totalDays = 180;
                         for(let i=0; i<=totalDays; i++) {
                             const d = new Date(today); d.setDate(today.getDate() - i); const k = d.toISOString().split('T')[0]; const val = map[k] || 0;
                             const level = val === 0 ? 0 : val < 3 ? 1 : val < 6 ? 2 : val < 10 ? 3 : 4; days.push({k, level, date: d});
                         }
                         return days.map(d => (
                             <div key={d.k} title={`${d.k}\n+${map[d.k]||0} strength`} className={`w-3 h-3 sm:w-4 sm:h-4 rounded-sm border border-slate-50/50 ${d.level===0?'bg-slate-100':d.level===1?'bg-green-100':d.level===2?'bg-green-300':d.level===3?'bg-green-500':'bg-green-600'}`}></div>
                         ));
                     })()}
                 </div>
             </div>
        </div>
    </div>
  );
};

export default Dashboard;
