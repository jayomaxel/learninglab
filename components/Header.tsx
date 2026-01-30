
import React, { useState } from 'react';
import { Language, AppState, User, CEFRLevel } from '../types';

interface HeaderProps {
  currentTab: AppState['currentTab'];
  onTabChange: (tab: AppState['currentTab']) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onOpenSettings: () => void;
  currentUser: User | null;
  onUserChange: (user: User) => void;
  users: User[];
  onLevelChange: (lang: Language, level: CEFRLevel) => void;
}

const Header: React.FC<HeaderProps> = ({ 
  currentTab, onTabChange, language, onLanguageChange, onOpenSettings, 
  currentUser, onUserChange, users, onLevelChange 
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const currentLevel = currentUser?.levels[language] || 'A0';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 p-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between bg-white border border-green-200 rounded-xl p-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold text-slate-800 leading-none">LinguistFlow</h1>
            {currentUser && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-green-100 bg-green-50 text-green-700 uppercase tracking-widest mt-1 inline-block">{currentLevel}-{language}</span>}
          </div>
        </div>

        <nav className="flex items-center bg-green-50 rounded-lg border border-green-100 p-1">
          {(['MISSION', 'LISTENING', 'READER', 'VOCAB', 'STATS'] as const).map((tab) => (
             <button key={tab} onClick={() => onTabChange(tab)} className={`px-3 py-1.5 rounded-md text-xs font-bold ${currentTab === tab ? 'bg-white text-green-600 border border-green-100' : 'text-slate-500 hover:text-green-700'}`}>
              {tab === 'MISSION' ? '主页' : tab === 'LISTENING' ? '听力' : tab === 'READER' ? '阅读' : tab === 'VOCAB' ? '词汇' : '统计'}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex bg-green-50 p-1 rounded-lg border border-green-100">
            {(['EN', 'FR', 'KR'] as Language[]).map((lang) => (
              <button key={lang} onClick={() => onLanguageChange(lang)} className={`w-10 py-1 rounded text-xs font-bold ${language === lang ? 'bg-white text-green-600 border border-green-100' : 'text-slate-400 hover:text-green-600'}`}>
                {lang}
              </button>
            ))}
          </div>

          <div className="relative">
            <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="w-10 h-10 rounded-full bg-green-100 border border-green-200 flex items-center justify-center text-green-700 hover:bg-green-200">
                <span className="text-xs font-bold">{currentUser?.name.substring(0, 1)}</span>
            </button>
            {userMenuOpen && (
              <div className="absolute top-12 right-0 w-48 bg-white rounded-xl border border-green-200 p-2">
                <div className="p-2 border-b border-green-50 mb-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">设定等级</p>
                    <select value={currentLevel} onChange={(e) => onLevelChange(language, e.target.value as CEFRLevel)} className="w-full mt-1 text-sm font-bold bg-green-50 border-none rounded p-1 text-green-800">
                        {['A0','A1','A2','B1','B2','C1','C2'].map(l => <option key={l} value={l}>{l} 水平</option>)}
                    </select>
                </div>
                {users.map(u => (
                  <button key={u.id} onClick={() => { onUserChange(u); setUserMenuOpen(false); }} className={`w-full text-left p-2 rounded-lg text-sm font-bold ${currentUser?.id === u.id ? 'bg-green-50 text-green-600' : 'text-slate-600 hover:bg-green-50'}`}>
                    {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
