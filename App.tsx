
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import ListeningLab from './components/ListeningLab';
import SpeedReader from './components/SpeedReader';
import VocabularyBank from './components/VocabularyBank';
import Dashboard from './components/Dashboard';
import SettingsModal from './components/SettingsModal';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import { Language, VocabularyItem, DictionaryEntry, AppState } from './types';
import { db } from './services/db';
import { getLemmaCandidates } from './services/linguistics';
import { defineWord } from './services/gemini';
import { calculateNextReview, getDailyReviewList } from './services/scheduler';

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<AppState['currentTab']>('LISTENING');
  const [language, setLanguage] = useState<Language>('EN');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  // Review Mode State
  const [isReviewMode, setIsReviewMode] = useState(false);
  
  // Load initial vocab from local storage
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>(() => {
    const saved = localStorage.getItem('linguistflow_vocab');
    return saved ? JSON.parse(saved) : [];
  });

  const [dictCount, setDictCount] = useState<number>(0);
  const dictCacheRef = useRef<Map<string, string>>(new Map());
  const [knownWords, setKnownWords] = useState<Set<string>>(new Set());

  useEffect(() => {
    const init = async () => {
        await db.init();
        const count = await db.count(language);
        setDictCount(count);
        
        if (count > 0) {
            console.time('LoadDictCache');
            const cache = await db.getCache(language);
            dictCacheRef.current = cache;
            setKnownWords(new Set(cache.keys()));
            console.timeEnd('LoadDictCache');
        } else {
            dictCacheRef.current = new Map();
            setKnownWords(new Set());
        }
    };
    init();
  }, [language]);

  useEffect(() => {
    localStorage.setItem('linguistflow_vocab', JSON.stringify(vocabulary));
  }, [vocabulary]);

  const handleImportDictionary = async (entries: DictionaryEntry[], onProgress: (p: number) => void) => {
    await db.importBatch(entries, language, onProgress);
    const count = await db.count(language);
    setDictCount(count);
    const cache = await db.getCache(language);
    dictCacheRef.current = cache;
    setKnownWords(new Set(cache.keys()));
  };

  const handleClearDictionary = async () => {
      if (confirm(`确定要清空 ${language} 的本地词库吗？`)) {
          await db.clear(language);
          setDictCount(0);
          dictCacheRef.current = new Map();
          setKnownWords(new Set());
      }
  };

  const handleAddWord = async (word: string, contextSentence: string) => {
    const cleanWord = word.replace(/^[.,!?;:()"'«»\s]+|[.,!?;:()"'«»\s]+$/g, '');
    if (!cleanWord) return;
    
    // French Unification: Try to find lemma in dictionary first
    // If lemma exists, we could theoretically map this word to the lemma.
    // For this simple implementation, we just check existence.
    const candidates = getLemmaCandidates(cleanWord, language);
    const cache = dictCacheRef.current;
    
    let targetWord = cleanWord;
    let localTranslation: string | null = null;
    
    for (const candidate of candidates) {
        if (cache.has(candidate)) {
            const definition = cache.get(candidate);
            if (candidate.toLowerCase() !== cleanWord.toLowerCase()) {
                localTranslation = `[${candidate}] ${definition}`;
                // Optional: Store under lemma? For now store original but show lemma info.
            } else {
                localTranslation = definition || null;
            }
            break;
        }
    }
    
    const exists = vocabulary.some(v => v.word.toLowerCase() === targetWord.toLowerCase());
    if (exists) {
        // Optional: Alert or just shake UI
        return;
    }

    if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(cleanWord);
        u.lang = language === 'EN' ? 'en-US' : language === 'FR' ? 'fr-FR' : 'ko-KR';
        window.speechSynthesis.speak(u);
    }
    
    const newItem: VocabularyItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      word: targetWord,
      contextSentence: contextSentence,
      translation: localTranslation || undefined,
      timestamp: Date.now(),
      strength: 0,
      lastReview: Date.now(),
      nextReview: Date.now(), // Due immediately
      reviewHistory: []
    };

    setVocabulary(prev => [newItem, ...prev]);
  };

  const handleRemoveWord = (id: string) => {
    setVocabulary(prev => prev.filter(item => item.id !== id));
  };

  // SRS Update
  const handleUpdateStrength = (id: string, newStrength: number) => {
      setVocabulary(prev => prev.map(v => {
          if (v.id === id) {
              const now = Date.now();
              const isImprovement = newStrength > v.strength;
              
              // Calculate Next Review based on SRS algorithm
              const { nextReview } = calculateNextReview(v.strength, v.lastReview, isImprovement);

              return { 
                  ...v, 
                  strength: newStrength,
                  lastReview: now,
                  nextReview: nextReview,
                  reviewHistory: [...(v.reviewHistory || []), now]
              };
          }
          return v;
      }));
  };

  const handleAskAI = async (item: VocabularyItem) => {
      try {
          const result = await defineWord(item.word, item.contextSentence, language);
          setVocabulary(prev => prev.map(v => 
              v.id === item.id ? { 
                  ...v, 
                  translation: result.translation,
                  metadata: {
                      gender: result.gender,
                      nuance: result.nuance,
                      cognate: result.cognate,
                      hanja: result.hanja
                  }
              } : v
          ));
          
          // Log interaction
          await db.logSession({
              id: Date.now().toString(),
              type: 'REVIEW',
              language,
              score: 1,
              duration: 0,
              timestamp: Date.now()
          });

      } catch (err) {
          alert("AI Definition Failed");
      }
  };

  const startDailyReview = () => {
      setIsReviewMode(true);
      setCurrentTab('VOCAB');
  };

  // Filter vocab for Review Mode
  const displayedVocab = isReviewMode 
     ? getDailyReviewList(vocabulary)
     : vocabulary;

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '1') setLanguage('EN');
      if (e.ctrlKey && e.key === '2') setLanguage('FR');
      if (e.ctrlKey && e.key === '3') setLanguage('KR');
      if (e.ctrlKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setCurrentTab(prev => {
            if (prev === 'LISTENING') return 'READER';
            if (prev === 'READER') return 'VOCAB';
            if (prev === 'VOCAB') return 'STATS';
            return 'LISTENING';
        });
      }
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setShowShortcuts(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Exit review mode if list empty
  useEffect(() => {
      if (isReviewMode && displayedVocab.length === 0) {
          setIsReviewMode(false);
      }
  }, [displayedVocab.length, isReviewMode]);

  return (
    <div className="min-h-screen relative pb-20 overflow-x-hidden bg-slate-50 selection:bg-green-100 selection:text-green-900">
      <Header 
        currentTab={currentTab} 
        onTabChange={(t) => { setCurrentTab(t); setIsReviewMode(false); }} 
        language={language} 
        onLanguageChange={setLanguage}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className="container mx-auto px-4 pt-28 sm:pt-32 max-w-6xl relative z-10">
        <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
              {currentTab === 'LISTENING' ? '听力实验室' : currentTab === 'READER' ? '极速阅读' : currentTab === 'VOCAB' ? (isReviewMode ? '今日复习' : '语境生词本') : '量化成果'}
            </h2>
            <p className="text-slate-500 text-sm sm:text-base font-medium">
              {currentTab === 'LISTENING' ? '通过主动听写和精准断句掌握地道发音。' 
               : currentTab === 'READER' ? '利用 RSVP 技术提升阅读速度和理解力。'
               : currentTab === 'VOCAB' ? (isReviewMode ? 'Spaced Repetition Review Session' : '基于上下文的单词回顾与闪卡记忆。')
               : '追踪你的语言习得进程与强度分布。'}
            </p>
          </div>
          <button onClick={() => setShowShortcuts(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 transition-all">
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px]">?</kbd>
            键盘快捷键
          </button>
        </div>

        <div style={{ display: currentTab === 'LISTENING' ? 'block' : 'none' }}>
          <ListeningLab language={language} onSaveWord={handleAddWord} />
        </div>
        
        <div style={{ display: currentTab === 'READER' ? 'block' : 'none' }}>
          <SpeedReader language={language} onSaveWord={handleAddWord} knownWords={knownWords} />
        </div>

        {currentTab === 'VOCAB' && (
          <VocabularyBank 
            items={displayedVocab} 
            onRemove={handleRemoveWord} 
            onAskAI={handleAskAI}
            onUpdateStrength={handleUpdateStrength}
          />
        )}

        {currentTab === 'STATS' && (
           <Dashboard 
             language={language} 
             vocabulary={vocabulary} 
             onStartReview={startDailyReview}
           />
        )}
      </main>
      
      {isSettingsOpen && (
        <SettingsModal 
            onClose={() => setIsSettingsOpen(false)} 
            localDictSize={dictCount}
            onImportDict={handleImportDictionary}
            onClearDict={handleClearDictionary}
        />
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
