
import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import ListeningLab from './components/ListeningLab';
import SpeedReader from './components/SpeedReader';
import VocabularyBank from './components/VocabularyBank';
import Dashboard from './components/Dashboard';
import SettingsModal from './components/SettingsModal';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import { Language, VocabularyItem, AppState } from './types';
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
  
  // Level 1: Memory (User's Vocabulary)
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>(() => {
    const saved = localStorage.getItem('linguistflow_vocab');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Known words set
  const [knownWords, setKnownWords] = useState<Set<string>>(new Set());

  const loadKnownWords = useCallback(async () => {
        const userWords = new Set(vocabulary.filter(v => v.language === language).map(v => v.word.toLowerCase()));
        setKnownWords(userWords);
  }, [language, vocabulary]);

  useEffect(() => {
    loadKnownWords();
  }, [loadKnownWords]);

  useEffect(() => {
    localStorage.setItem('linguistflow_vocab', JSON.stringify(vocabulary));
  }, [vocabulary]);

  // THE WATERFALL: Memory -> Hub (Priority) -> AI
  const handleAddWord = async (word: string, contextSentence: string) => {
    const cleanWord = word.replace(/^[.,!?;:()"'«»\s]+|[.,!?;:()"'«»\s]+$/g, '');
    if (!cleanWord) return;
    
    // Level 1: Already in User List?
    const exists = vocabulary.some(v => 
        v.word.toLowerCase() === cleanWord.toLowerCase() && 
        v.language === language
    );
    if (exists) return;

    if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(cleanWord);
        u.lang = language === 'EN' ? 'en-US' : language === 'FR' ? 'fr-FR' : 'ko-KR';
        window.speechSynthesis.speak(u);
    }

    const newItem: VocabularyItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      word: cleanWord,
      language: language,
      contextSentence: contextSentence,
      translation: undefined, 
      timestamp: Date.now(),
      strength: 0,
      lastReview: Date.now(),
      nextReview: Date.now(), 
      reviewHistory: []
    };

    setVocabulary(prev => [newItem, ...prev]);

    try {
        let definition: string | undefined;
        let metadata: any = {};
        let found = false;

        // Level 2: Scoped Parallel Search (Exact Match)
        let cascadeResults = await db.lookupCascade(language, cleanWord);
        
        // Level 3: Smart Lemmatization Bridge (If Exact Match Failed)
        if (cascadeResults.length === 0) {
            const candidates = getLemmaCandidates(cleanWord, language);
            // Skip the first candidate if it matches the original cleanWord (redundant check)
            for (const candidate of candidates) {
                if (candidate.toLowerCase() === cleanWord.toLowerCase()) continue;
                
                const lemmaResults = await db.lookupCascade(language, candidate);
                if (lemmaResults.length > 0) {
                    cascadeResults = lemmaResults;
                    metadata.rootWord = candidate; // Mark the bridge
                    break; 
                }
            }
        }

        if (cascadeResults.length > 0) {
            const topResult = cascadeResults[0];
            definition = topResult.entry.translation;
            
            // Format richer metadata for UI Hierarchy
            const allDefinitions = cascadeResults.map(r => ({
                source: r.source.name,
                text: r.entry.translation,
                priority: r.source.priority
            }));

            metadata = { 
                ...metadata,
                ...topResult.entry.metadata, 
                source: topResult.source.name,
                allDefinitions // Store the hierarchy
            };
            
            found = true;
        }

        if (found && definition) {
            updateWordDefinition(newItem.id, definition, metadata);
        } else {
            // Level 4: AI Fallback
            handleAskAI(newItem);
        }

    } catch (e) {
        console.error("Waterfall lookup failed", e);
    }
  };

  const updateWordDefinition = (id: string, translation: string, metadata?: any) => {
      setVocabulary(prev => prev.map(v => 
          v.id === id ? { ...v, translation, metadata } : v
      ));
  };

  const handleRemoveWord = (id: string) => {
    setVocabulary(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateStrength = (id: string, newStrength: number) => {
      setVocabulary(prev => prev.map(v => {
          if (v.id === id) {
              const now = Date.now();
              const isImprovement = newStrength > v.strength;
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
          
          const metadata = {
              gender: result.gender,
              nuance: result.nuance,
              cognate: result.cognate,
              hanja: result.hanja,
              source: 'Gemini AI',
              allDefinitions: [{ source: 'Gemini AI', text: result.translation }]
          };

          updateWordDefinition(item.id, result.translation, metadata);

          if (result.translation && !result.translation.includes("失败")) {
              await db.saveDefinition(language, item.word, result.translation, metadata);
          }

          await db.logSession({
              id: Date.now().toString(),
              type: 'REVIEW',
              language,
              score: 1,
              duration: 0,
              timestamp: Date.now()
          });
      } catch (err) {
          console.error("AI Definition Failed");
      }
  };

  const startDailyReview = () => {
      setIsReviewMode(true);
      setCurrentTab('VOCAB');
  };

  const currentLanguageVocab = vocabulary.filter(v => 
      v.language === language || (!v.language && language === 'EN') 
  );

  const displayedVocab = isReviewMode 
     ? getDailyReviewList(currentLanguageVocab)
     : currentLanguageVocab;

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

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
      if (e.key === '?') {
        setShowShortcuts(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
      if (isReviewMode && displayedVocab.length === 0) {
          setIsReviewMode(false);
      }
  }, [displayedVocab.length, isReviewMode]);

  return (
    <div className="min-h-screen relative pb-20 overflow-x-hidden bg-white text-slate-900 selection:bg-green-100 selection:text-green-800">
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
              {currentTab === 'LISTENING' ? 'Listening Lab' : currentTab === 'READER' ? 'Speed Reader' : currentTab === 'VOCAB' ? (isReviewMode ? 'SRS Review' : 'Vocabulary Bank') : 'Analytics'}
            </h2>
            <p className="text-slate-500 text-sm sm:text-base font-medium">
              {currentTab === 'LISTENING' ? 'Master native pronunciation via active dictation and flow state loops.' 
               : currentTab === 'READER' ? 'Absorb content faster using RSVP technology with Smart Pacing.'
               : currentTab === 'VOCAB' ? (isReviewMode ? 'Time for your daily spaced repetition session.' : 'Your personal context-aware dictionary.')
               : 'Visualize your acquisition metrics and cognitive patterns.'}
            </p>
          </div>
          <button onClick={() => setShowShortcuts(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900 transition-all shadow-sm">
            <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px]">?</kbd>
            Shortcuts
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
            currentAppLanguage={language}
            onCacheRefreshNeeded={() => {}} 
        />
      )}

      {showShortcuts && (
        <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
};

export default App;
