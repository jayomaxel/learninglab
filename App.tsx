
import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import MissionCenter from './components/MissionCenter';
import ListeningLab from './components/ListeningLab';
import SpeedReader from './components/SpeedReader';
import VocabularyBank from './components/VocabularyBank';
import Dashboard from './components/Dashboard';
import SettingsModal from './components/SettingsModal';
import KoreanAlphabetCoach from './components/KoreanAlphabetCoach';
import { Language, VocabularyItem, AppState, User, CEFRLevel, DailyMission } from './types';
import { db } from './services/db';
import { defineWord } from './services/gemini';
import { getDailyReviewList } from './services/scheduler';

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<AppState['currentTab']>('MISSION');
  const [language, setLanguage] = useState<Language>('EN');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [knownWords, setKnownWords] = useState<Set<string>>(new Set());

  useEffect(() => {
    const initUsers = async () => {
      let existingUsers = await db.getUsers();
      if (existingUsers.length === 0) {
        const defaultUser: User = {
          id: 'default_user',
          name: '学习者',
          levels: { EN: 'A0', FR: 'A0', KR: 'A0' },
          preferences: { theme: 'light', speechRate: 1.0, guidedMode: true },
          missionStatus: {}
        };
        await db.saveUser(defaultUser);
        existingUsers = [defaultUser];
      }
      setUsers(existingUsers);
      setCurrentUser(existingUsers[0]);
    };
    initUsers();
  }, []);

  useEffect(() => {
    if (currentTab === 'ALPHABET' && language !== 'KR') {
      setCurrentTab('MISSION');
    }
  }, [language, currentTab]);

  useEffect(() => {
    if (!currentUser) return;
    const savedVocab = localStorage.getItem(`vocab_${currentUser.id}`);
    if (savedVocab) setVocabulary(JSON.parse(savedVocab));
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(`vocab_${currentUser.id}`, JSON.stringify(vocabulary));
    const userWords = new Set(vocabulary.filter(v => v.language === language).map(v => v.word.toLowerCase()));
    setKnownWords(userWords);
  }, [vocabulary, language, currentUser]);

  const updateMission = (update: Partial<DailyMission>) => {
    if (!currentUser) return;
    const dateKey = new Date().toISOString().split('T')[0];
    const key = `${dateKey}_${currentUser.id}`;
    const currentMission = currentUser.missionStatus[key] || { wordsCount: 0, listeningDone: false, readingDone: false };
    const updatedUser = {
      ...currentUser,
      missionStatus: {
        ...currentUser.missionStatus,
        [key]: { ...currentMission, ...update }
      }
    };
    setCurrentUser(updatedUser);
    db.saveUser(updatedUser);
  };

  const handleLevelChange = async (lang: Language, newLevel: CEFRLevel) => {
    if (!currentUser) return;
    const updated = { ...currentUser, levels: { ...currentUser.levels, [lang]: newLevel } };
    setCurrentUser(updated);
    await db.saveUser(updated);
    setCurrentTab('MISSION');
  };

  const handleAddWord = async (word: string, contextSentence: string) => {
    if (!currentUser) return;
    const cleanWord = word.replace(/^[.,!?;:()"'«»\s]+|[.,!?;:()"'«»\s]+$/g, '');
    if (!cleanWord || vocabulary.some(v => v.word.toLowerCase() === cleanWord.toLowerCase() && v.language === language)) return;

    const newItem: VocabularyItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      word: cleanWord,
      language: language,
      contextSentence: contextSentence,
      timestamp: Date.now(),
      strength: 0,
      lastReview: Date.now(),
      nextReview: Date.now()
    };

    setVocabulary(prev => [newItem, ...prev]);
    updateMission({ wordsCount: (currentUser.missionStatus[`${new Date().toISOString().split('T')[0]}_${currentUser.id}`]?.wordsCount || 0) + 1 });

    try {
        const result = await defineWord(newItem.word, newItem.contextSentence, language, currentUser.levels[language]);
        setVocabulary(prev => prev.map(v => v.id === newItem.id ? { ...v, translation: result.translation, metadata: { ...result } } : v));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen pb-20 bg-[#fafff5] text-slate-800">
      <style>{`
        * { 
          box-shadow: none !important; 
          animation: none !important; 
          transition: none !important; 
        }
        body { background-color: #fafff5 !important; }
        .bg-white { background-color: #ffffff !important; border-color: #e2f2e5 !important; }
        .border-green-200 { border-color: #e2f2e5 !important; }
        .bg-green-50 { background-color: #f0fff4 !important; }
        .text-green-600 { color: #16a34a !important; }
        input, textarea, button, select { border: 1px solid #e2f2e5 !important; border-radius: 8px !important; }
        nav { background: #f0fff4 !important; border: 1px solid #e2f2e5 !important; }
      `}</style>

      <Header 
        currentTab={currentTab} 
        onTabChange={(t) => { setCurrentTab(t); setIsReviewMode(false); }} 
        language={language} 
        onLanguageChange={(l) => { setLanguage(l); setIsReviewMode(false); }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        currentUser={currentUser}
        onUserChange={setCurrentUser}
        users={users}
        onLevelChange={handleLevelChange}
      />

      <main className="container mx-auto px-4 pt-24 max-w-6xl">
        {currentUser && (
          <>
            {currentTab === 'MISSION' && (
              <MissionCenter user={currentUser} language={language} onStartTask={setCurrentTab} />
            )}

            {currentTab === 'ALPHABET' && language === 'KR' && (
              <KoreanAlphabetCoach />
            )}

            <div style={{ display: currentTab === 'LISTENING' ? 'block' : 'none' }}>
              <ListeningLab 
                language={language} 
                onSaveWord={handleAddWord} 
                level={currentUser.levels[language]} 
                userId={currentUser.id}
                onTaskComplete={() => updateMission({ listeningDone: true })}
              />
            </div>
            
            <div style={{ display: currentTab === 'READER' ? 'block' : 'none' }}>
              <SpeedReader 
                language={language} 
                onSaveWord={handleAddWord} 
                knownWords={knownWords} 
                userId={currentUser.id}
                level={currentUser.levels[language]}
                onTaskComplete={() => updateMission({ readingDone: true })}
              />
            </div>

            {currentTab === 'VOCAB' && (
              <VocabularyBank 
                items={isReviewMode ? getDailyReviewList(vocabulary.filter(v => v.language === language)) : vocabulary.filter(v => v.language === language)} 
                onRemove={(id) => setVocabulary(v => v.filter(i => i.id !== id))} 
                onAskAI={(item) => defineWord(item.word, item.contextSentence, language, currentUser.levels[language]).then(r => setVocabulary(v => v.map(vi => vi.id === item.id ? { ...vi, ...r } : vi)))}
                onUpdateStrength={(id, s) => {
                  setVocabulary(prev => prev.map(v => v.id === id ? { ...v, strength: s, lastReview: Date.now() } : v));
                }}
                level={currentUser.levels[language]}
              />
            )}

            {currentTab === 'STATS' && (
              <Dashboard language={language} vocabulary={vocabulary} onStartReview={() => { setIsReviewMode(true); setCurrentTab('VOCAB'); }} user={currentUser} />
            )}
          </>
        )}
      </main>
      
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} currentAppLanguage={language} onCacheRefreshNeeded={() => {}} />}
    </div>
  );
};

export default App;
