
import React from 'react';
import { Language, User, CEFRLevel, DailyMission } from '../types';

interface MissionCenterProps {
  user: User;
  language: Language;
  onStartTask: (tab: any) => void;
}

const MissionCenter: React.FC<MissionCenterProps> = ({ user, language, onStartTask }) => {
  const level = user.levels[language];
  const dateKey = new Date().toISOString().split('T')[0];
  const mission = user.missionStatus?.[`${dateKey}_${user.id}`] || { wordsCount: 0, listeningDone: false, readingDone: false };

  const isBeginner = level.startsWith('A');
  const isKorean = language === 'KR';

  const getTaskOneConfig = () => {
    if (isKorean && isBeginner) {
      return {
        title: '韩语字母',
        desc: '基础入门：掌握母语级别的字母发音。',
        target: 'ALPHABET',
        icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'
      };
    }
    const langName = language === 'FR' ? '法语' : language === 'EN' ? '英语' : '韩语';
    return {
      title: `${langName}核心词汇`,
      desc: '基于记忆曲线巩固重点词汇。',
      target: 'VOCAB',
      icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'
    };
  };

  const taskOne = getTaskOneConfig();

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-8 border border-green-200">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">学习中心</span>
          <span className="bg-green-50 px-2 py-0.5 rounded text-[10px] font-bold text-green-700">{level} 模式</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">今日任务, {user.name}</h1>
        <p className="text-slate-500 text-xs leading-relaxed max-w-xl">
          已进入 {language} 学习流。请完成推荐练习以优化记忆。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div onClick={() => onStartTask(taskOne.target)} className="bg-white p-6 rounded-xl border border-green-100 hover:bg-green-50 cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center mb-4 border border-green-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={taskOne.icon} /></svg>
            </div>
            <h3 className="text-md font-bold text-slate-800 mb-1">{taskOne.title}</h3>
            <p className="text-slate-400 text-[10px] mb-4">{taskOne.desc}</p>
            <div className="flex items-center justify-between border-t border-green-50 pt-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase">{mission.wordsCount}/5 词汇</span>
                <div className="w-12 h-1 bg-green-50 rounded-full overflow-hidden border border-green-100"><div className="h-full bg-green-500" style={{ width: `${Math.min(100, (mission.wordsCount/5)*100)}%` }}></div></div>
            </div>
        </div>

        <div onClick={() => onStartTask('LISTENING')} className="bg-white p-6 rounded-xl border border-green-100 hover:bg-green-50 cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center mb-4 border border-green-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
            </div>
            <h3 className="text-md font-bold text-slate-800 mb-1">听力实验</h3>
            <p className="text-slate-400 text-[10px] mb-4">精听速记练习。</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${mission.listeningDone ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                {mission.listeningDone ? '已达成' : '待开始'}
            </span>
        </div>

        <div onClick={() => onStartTask('READER')} className="bg-white p-6 rounded-xl border border-green-100 hover:bg-green-50 cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center mb-4 border border-green-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <h3 className="text-md font-bold text-slate-800 mb-1">极速阅读</h3>
            <p className="text-slate-400 text-[10px] mb-4">RSVP 训练模式。</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${mission.readingDone ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                {mission.readingDone ? '已达成' : '待开始'}
            </span>
        </div>
      </div>
    </div>
  );
};

export default MissionCenter;
