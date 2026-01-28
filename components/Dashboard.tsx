import React, { useMemo, useState, useEffect } from 'react';
import { Language, VocabularyItem, StudyLog } from '../types';
import { calculateProficiency, calculateLexicalPower, calculateStreak, getChartData, getMasteryGainHeatmap } from '../services/stats';
import { db } from '../services/db';
import { getDailyReviewList } from '../services/scheduler';

interface DashboardProps {
  language: Language;
  vocabulary: VocabularyItem[];
  onStartReview: () => void;
}

// --- Visual Components ---

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
      /* ... simplified for brevity, in real impl use JS to set var */
    `}</style>
  </div>
);

const RadarChart: React.FC<{ progress: Record<Language, number> }> = ({ progress }) => {
    // 3 Axis: EN (Top), FR (Right-Down), KR (Left-Down)
    // Center: 50, 50. Radius: 40.
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
                {/* Background Grid */}
                {[20, 40].map(r => (
                    <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2 2" />
                ))}
                {/* Axes */}
                {points.map((p, i) => (
                    <line key={i} x1="50" y1="50" x2={getCoord(p.angle, 100).split(',')[0]} y2={getCoord(p.angle, 100).split(',')[1]} stroke="#e2e8f0" strokeWidth="0.5" />
                ))}
                {/* Data Polygon */}
                <polygon points={polyPoints} fill="rgba(74, 222, 128, 0.2)" stroke="#4ade80" strokeWidth="2" />
                {/* Labels */}
                <text x="50" y="8" textAnchor="middle" className="text-[6px] font-bold fill-slate-400">EN</text>
                <text x="88" y="75" textAnchor="middle" className="text-[6px] font-bold fill-slate-400">FR</text>
                <text x="12" y="75" textAnchor="middle" className="text-[6px] font-bold fill-slate-400">KR</text>
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
            {data.map((d, i) => (
                 <circle key={i} cx={(i / (data.length - 1)) * 100} cy={100 - ((d - min) / (max - min)) * 100} r="2" fill="white" stroke={color} strokeWidth="2" />
            ))}
        </svg>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ language, vocabulary, onStartReview }) => {
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [showFireworks, setShowFireworks] = useState(false);

  useEffect(() => {
    db.getLogs(language).then(setLogs);
  }, [language]);

  const { lexicalPower, proficiency, reviewCount, streak, dictationTrend, readingTrend } = useMemo(() => {
     return {
         lexicalPower: calculateLexicalPower(vocabulary),
         proficiency: calculateProficiency(vocabulary, language),
         reviewCount: getDailyReviewList(vocabulary).length,
         streak: calculateStreak(logs),
         dictationTrend: getChartData(logs, 'DICTATION'),
         readingTrend: getChartData(logs, 'READER')
     };
  }, [vocabulary, logs, language]);

  // Mock multi-lang data for radar (In real app, fetch all vocab)
  const radarData = {
      EN: language === 'EN' ? proficiency.progress : 65,
      FR: language === 'FR' ? proficiency.progress : 30,
      KR: language === 'KR' ? proficiency.progress : 15
  };

  useEffect(() => {
      if (proficiency.progress >= 100) setShowFireworks(true);
  }, [proficiency.progress]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        {/* Top Hero: Lexical Power & Daily Review */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-8 relative overflow-hidden shadow-sm border border-slate-200">
                {showFireworks && <Firework />}
                <div className="relative z-10 flex justify-between items-start">
                    <div>
                        <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">Lexical Power</h3>
                        <div className="text-5xl font-black text-slate-800">
                            {lexicalPower.toLocaleString()} <span className="text-lg text-yellow-500 font-medium">⚡</span>
                        </div>
                        <p className="text-slate-400 text-xs mt-2 font-medium">Weighted Score (Word Count × Mastery)</p>
                    </div>
                    <div className="text-right">
                        <div className="inline-block bg-slate-100 rounded-lg px-3 py-1 mb-2">
                             <span className="text-orange-500 font-bold">🔥 {streak} Day Streak</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-center items-start hover:border-indigo-300 transition-colors">
                 <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-2">Spaced Repetition</h3>
                 <div className="flex items-baseline gap-2 mb-4">
                     <span className="text-4xl font-black text-slate-800">{reviewCount}</span>
                     <span className="text-sm font-bold text-slate-500">words due for review</span>
                 </div>
                 <button 
                    onClick={onStartReview}
                    disabled={reviewCount === 0}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-100 disabled:shadow-none"
                 >
                    {reviewCount > 0 ? 'Start Daily Review' : 'All Caught Up!'}
                 </button>
            </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Radar Chart */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col items-center">
                <h4 className="text-sm font-bold text-slate-700 mb-4 w-full text-left">Level Radar</h4>
                <RadarChart progress={radarData} />
                <div className="mt-4 text-center">
                    <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-100">
                        {language}: {proficiency.level} ({proficiency.progress}%)
                    </span>
                </div>
            </div>

            {/* Trends */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between md:col-span-2">
                <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="text-sm font-bold text-slate-700">Dictation Accuracy (7 Days)</h4>
                        <span className="text-xs font-bold text-green-600">{dictationTrend[6]}% Last</span>
                    </div>
                    <div className="w-[70%] mx-auto">
                        <Sparkline data={dictationTrend} color="#4ade80" />
                    </div>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-2">
                         <h4 className="text-sm font-bold text-slate-700">Reading Volume (7 Days)</h4>
                         <span className="text-xs font-bold text-blue-600">{readingTrend[6]} Sessions</span>
                    </div>
                    <div className="w-[70%] mx-auto">
                        <Sparkline data={readingTrend} color="#60a5fa" />
                    </div>
                </div>
            </div>
        </div>

        {/* Heatmap (Mastery Gain) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
             <div className="flex justify-between items-center mb-4">
                 <h4 className="text-sm font-bold text-slate-700">Mastery Heatmap (Strength Gained)</h4>
                 <div className="flex gap-1">
                     {[1,2,3,4].map(l => <div key={l} className={`w-3 h-3 rounded-sm ${l===1?'bg-green-200':l===2?'bg-green-400':l===3?'bg-green-600':'bg-green-800'}`}></div>)}
                 </div>
             </div>
             <div className="overflow-x-auto pb-2">
                 <div className="grid grid-rows-6 grid-flow-col gap-1 w-max">
                     {(() => {
                         const map = getMasteryGainHeatmap(vocabulary);
                         const days = [];
                         const today = new Date();
                         // Show ~180 days (approx 30 cols * 6 rows)
                         // Reversed loop order to put NEW dates on the LEFT (col 1)
                         const totalDays = 180;
                         for(let i=0; i<=totalDays; i++) {
                             const d = new Date(today);
                             d.setDate(today.getDate() - i);
                             const k = d.toISOString().split('T')[0];
                             const val = map[k] || 0;
                             const level = val === 0 ? 0 : val < 3 ? 1 : val < 6 ? 2 : val < 10 ? 3 : 4;
                             days.push({k, level, date: d});
                         }
                         return days.map(d => (
                             <div 
                               key={d.k} 
                               title={`${d.k}\n+${map[d.k]||0} strength`} 
                               className={`w-3 h-3 sm:w-4 sm:h-4 rounded-sm cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-300 transition-all ${
                                 d.level===0?'bg-slate-100':d.level===1?'bg-green-200':d.level===2?'bg-green-400':d.level===3?'bg-green-600':'bg-green-800'
                               }`}
                             ></div>
                         ));
                     })()}
                 </div>
             </div>
        </div>
    </div>
  );
};

export default Dashboard;
