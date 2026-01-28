
import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ListeningLab from './components/ListeningLab';
import SpeedReader from './components/SpeedReader';
import VocabularyBank from './components/VocabularyBank';
import SettingsModal from './components/SettingsModal';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import { Language, VocabularyItem } from './types';

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<'LISTENING' | 'READER' | 'VOCAB'>('LISTENING');
  const [language, setLanguage] = useState<Language>('EN');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  // Load initial vocab from local storage
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>(() => {
    const saved = localStorage.getItem('linguistflow_vocab');
    return saved ? JSON.parse(saved) : [];
  });

  // Persist vocab changes
  useEffect(() => {
    localStorage.setItem('linguistflow_vocab', JSON.stringify(vocabulary));
  }, [vocabulary]);

  const handleAddWord = (word: string, contextSentence: string) => {
    // Only strip punctuation from the start and end of the word.
    // Preserves internal apostrophes (don't, l'ami) or hyphens.
    const cleanWord = word.replace(/^[.,!?;:()"'«»\s]+|[.,!?;:()"'«»\s]+$/g, '');
    
    if (!cleanWord) return;
    
    // Avoid duplicates based on word + context (loose check)
    const exists = vocabulary.some(v => v.word.toLowerCase() === cleanWord.toLowerCase());
    
    if (exists) {
        alert(`"${cleanWord}" 已经在您的生词本中了。`);
        return;
    }

    const newItem: VocabularyItem = {
      // Use timestamp + random string to ensure uniqueness
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      word: cleanWord,
      contextSentence: contextSentence,
      timestamp: Date.now(),
    };

    setVocabulary(prev => [newItem, ...prev]);
  };

  const handleRemoveWord = (id: string) => {
    setVocabulary(prev => prev.filter(item => item.id !== id));
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl + 1/2/3 切换语言
      if (e.ctrlKey && e.key === '1') setLanguage('EN');
      if (e.ctrlKey && e.key === '2') setLanguage('FR');
      if (e.ctrlKey && e.key === '3') setLanguage('KR');
      
      // Ctrl + T 切换标签 (Rotate)
      if (e.ctrlKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setCurrentTab(prev => {
            if (prev === 'LISTENING') return 'READER';
            if (prev === 'READER') return 'VOCAB';
            return 'LISTENING';
        });
      }

      // / 键显示快捷键帮助 (非输入状态)
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setShowShortcuts(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className="min-h-screen relative pb-20 overflow-x-hidden bg-slate-50 selection:bg-green-100 selection:text-green-900">
      <Header 
        currentTab={currentTab} 
        onTabChange={setCurrentTab} 
        language={language} 
        onLanguageChange={setLanguage}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className="container mx-auto px-4 pt-28 sm:pt-32 max-w-6xl relative z-10">
        <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
              {currentTab === 'LISTENING' ? '听力实验室' : currentTab === 'READER' ? '极速阅读' : '语境生词本'}
            </h2>
            <p className="text-slate-500 text-sm sm:text-base font-medium">
              {currentTab === 'LISTENING' 
                ? '通过主动听写和精准断句掌握地道发音。' 
                : currentTab === 'READER' 
                ? '利用 RSVP 技术提升阅读速度和理解力。'
                : '基于上下文的单词回顾与闪卡记忆。'}
            </p>
          </div>
          <button 
            onClick={() => setShowShortcuts(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 transition-all"
          >
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px]">?</kbd>
            键盘快捷键
          </button>
        </div>

        {/* Use hidden styles instead of conditional rendering to persist state when switching tabs */}
        <div style={{ display: currentTab === 'LISTENING' ? 'block' : 'none' }}>
          <ListeningLab language={language} onSaveWord={handleAddWord} />
        </div>
        
        <div style={{ display: currentTab === 'READER' ? 'block' : 'none' }}>
          <SpeedReader language={language} onSaveWord={handleAddWord} />
        </div>

        {currentTab === 'VOCAB' && (
          <VocabularyBank items={vocabulary} onRemove={handleRemoveWord} />
        )}
      </main>
      
      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}

      {showShortcuts && (
        <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />
      )}

      <div className="fixed bottom-6 left-0 right-0 text-center pointer-events-none opacity-30 hidden sm:block">
        <span className="text-xs uppercase tracking-[0.3em] text-slate-400 font-bold">LinguistFlow AI</span>
      </div>
    </div>
  );
};

export default App;
