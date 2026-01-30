
import React, { useMemo, useState, useEffect } from 'react';
import { Language, VocabularyItem, StudyLog, User, CEFRLevel } from '../types';
import { calculateProficiency, calculateLexicalPower, calculateStreak } from '../services/stats';
import { db } from '../services/db';

interface DashboardProps {
  language: Language;
  vocabulary: VocabularyItem[];
  onStartReview: () => void;
  user: User;
}

const Dashboard: React.FC<DashboardProps> = ({ language, vocabulary, onStartReview, user }) => {
  const [logs, setLogs] = useState<StudyLog[]>([]);
  
  useEffect(() => { db.getLogs(language, user.id).then(setLogs); }, [language, user.id]);
  
  const stats = useMemo(() => {
     const currentLangVocab = vocabulary.filter(v => v.language === language);
     return {
         lexicalPower: calculateLexicalPower(currentLangVocab),
         streak: calculateStreak(logs)
     };
  }, [vocabulary, logs, language]);

  return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-8 border border-green-200">
                <h3 className="text-green-700 font-bold text-[10px] uppercase tracking-widest mb-2">词汇战力</h3>
                <div className="text-5xl font-black text-slate-800 leading-none mb-4">{stats.lexicalPower} <span className="text-green-500 text-3xl">LXP</span></div>
                <div className="inline-block bg-green-50 text-green-600 px-3 py-1 rounded-full text-xs font-bold border border-green-100">连续学习 {stats.streak} 天</div>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-green-200 flex flex-col justify-center">
                 <h3 className="text-green-700 font-bold text-[10px] uppercase tracking-widest mb-4">掌握进度</h3>
                 <div className="space-y-4">
                     {(['EN', 'FR', 'KR'] as Language[]).map(lang => (
                        <div key={lang} className="space-y-1">
                          <div className="flex justify-between text-[10px] font-bold text-slate-500"><span>{lang}</span><span>{user.levels[lang]}</span></div>
                          <div className="h-2 bg-green-50 rounded-full border border-green-100 overflow-hidden">
                             <div className="h-full bg-green-500" style={{ width: `${(['A0','A1','A2','B1','B2','C1','C2'].indexOf(user.levels[lang]) + 1) * 14}%` }}></div>
                          </div>
                        </div>
                     ))}
                 </div>
            </div>
        </div>

        <div className="bg-green-600 rounded-3xl p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-6 border border-green-700">
            <div>
                <h3 className="text-2xl font-bold mb-1">温故而知新</h3>
                <p className="text-green-50 text-sm">定期复习是克服遗忘曲线的最佳方式。</p>
            </div>
            <button onClick={onStartReview} className="px-8 py-3 bg-white text-green-600 rounded-xl font-bold border border-green-100">开始今日复习</button>
        </div>
    </div>
  );
};

export default Dashboard;
