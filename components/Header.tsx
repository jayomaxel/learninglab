import React from 'react';
import { Language, AppState } from '../types';

interface HeaderProps {
  currentTab: AppState['currentTab'];
  onTabChange: (tab: AppState['currentTab']) => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onOpenSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  currentTab, 
  onTabChange, 
  language, 
  onLanguageChange, 
  onOpenSettings 
}) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 p-2 sm:p-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between bg-white rounded-2xl p-2 px-3 sm:px-6 border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight hidden xs:block">
            LinguistFlow
          </h1>
        </div>

        <nav className="flex items-center bg-slate-50 p-1 rounded-xl overflow-x-auto border border-slate-100">
          {(['LISTENING', 'READER', 'VOCAB', 'STATS'] as const).map((tab) => (
             <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[12px] sm:text-sm font-bold transition-all whitespace-nowrap ${
                currentTab === tab 
                  ? 'bg-white text-green-600 border border-slate-200 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab === 'LISTENING' ? '听力' : tab === 'READER' ? '阅读' : tab === 'VOCAB' ? '生词' : '看板'}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden md:flex bg-slate-50 p-1 rounded-lg border border-slate-100">
            {(['EN', 'FR', 'KR'] as Language[]).map((lang) => (
              <button
                key={lang}
                onClick={() => onLanguageChange(lang)}
                className={`w-8 sm:w-10 py-1 sm:py-1.5 rounded text-[10px] sm:text-xs font-bold transition-all ${
                  language === lang ? 'bg-white text-green-600 border border-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          <button 
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-900 transition-all border border-slate-200"
            title="设置"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;