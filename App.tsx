import React, { useState, useEffect, useMemo } from 'react';
import Header from './components/Header';
import MissionCenter from './components/MissionCenter';
import ListeningLab from './components/ListeningLab';
import SpeedReader from './components/SpeedReader';
import VocabularyBank from './components/VocabularyBank';
import VocabularyManagerTable, { VocabularyManagerRow, VocabularyManagerSourceItem } from './components/VocabularyManagerTable';
import Dashboard from './components/Dashboard';
import SettingsModal from './components/SettingsModal';
import KoreanAlphabetCoach from './components/KoreanAlphabetCoach';
import { Language, VocabularyItem, AppState, User, CEFRLevel, DailyMission, DictionaryEntry, DictionarySource } from './types';
import { db } from './services/db';
import { calculateNextReview, getDailyReviewList } from './services/scheduler';
import { analyzeKoreanStructure, getLemmaCandidates } from './services/linguistics';

const normalizeForMatch = (value: string): string => value.toLowerCase().trim();
const MEANING_SPLITTER = /[;；|、/，,]+/;
const GENERIC_IMPORTED_CONTEXT = 'Imported from vocabulary file';
const DAILY_REVIEW_LIMIT = 120;
const MANAGER_SOURCE_ALL = '__ALL__';
const MANAGER_SOURCE_LOCAL = '__LOCAL__';

const shuffleBySeed = <T,>(input: T[], seed: number): T[] => {
  const arr = [...input];
  if (arr.length <= 1) return arr;

  let t = seed | 0;
  const random = () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

type ManagerWordRecord = {
  id: string;
  word: string;
  translation?: string;
  contextSentence?: string;
  sourceId: string;
  sourceName: string;
  pos?: string;
  localItemId?: string;
};

const normalizeMeaning = (value: string): string =>
  value
    .trim()
    .replace(/^[\[\(（【][^\]\)）】]{1,60}[\]\)）】]\s*/, '')
    .replace(/^\d+[\.\)、\-\s]*/, '')
    .replace(/\s+/g, ' ');

const splitMeanings = (translation?: string): string[] =>
  (translation || '')
    .split(MEANING_SPLITTER)
    .map(normalizeMeaning)
    .filter(Boolean);

const mergeMeaningText = (existing?: string, incoming?: string): string | undefined => {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const meaning of [...splitMeanings(existing), ...splitMeanings(incoming)]) {
    const key = normalizeForMatch(meaning);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(meaning);
    }
  }
  return merged.length > 0 ? merged.join('；') : undefined;
};

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<AppState['currentTab']>('MISSION');
  const [language, setLanguage] = useState<Language>('EN');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [vocabulary, setVocabulary] = useState<VocabularyItem[]>([]);
  const [dictionaryVocabulary, setDictionaryVocabulary] = useState<VocabularyItem[]>([]);
  const [knownWords, setKnownWords] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [dictionaryRefreshTick, setDictionaryRefreshTick] = useState(0);
  const [showVocabManager, setShowVocabManager] = useState(false);
  const [managerSourceId, setManagerSourceId] = useState<string>(MANAGER_SOURCE_ALL);
  const [managerSearch, setManagerSearch] = useState('');
  const [managerLoading, setManagerLoading] = useState(false);
  const [dictionarySources, setDictionarySources] = useState<DictionarySource[]>([]);
  const [dictionaryManagerEntries, setDictionaryManagerEntries] = useState<
    (DictionaryEntry & { dictName?: string; dictEnabled?: boolean })[]
  >([]);
  const [reviewSeed, setReviewSeed] = useState<number>(Date.now());

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
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (!detail?.message) return;
      setToastMessage(detail.message);
    };
    window.addEventListener('app-toast', handler as EventListener);
    return () => window.removeEventListener('app-toast', handler as EventListener);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(`vocab_${currentUser.id}`, JSON.stringify(vocabulary));
    const userWords = new Set<string>();
    vocabulary
      .filter(v => v.language === language)
      .forEach((item) => {
        const candidates = getLemmaCandidates(item.word, language).map(normalizeForMatch).filter(Boolean);
        if (candidates.length === 0) {
          userWords.add(normalizeForMatch(item.word));
          return;
        }
        candidates.forEach(c => userWords.add(c));
      });
    setKnownWords(userWords);
  }, [vocabulary, language, currentUser]);

  useEffect(() => {
    let cancelled = false;
    const loadDictionaryVocabulary = async () => {
      try {
        const entries = await db.getEnabledDictionaryEntries(language, 15000);
        if (cancelled) return;
        const now = Date.now();
        const mapped: VocabularyItem[] = entries.map((entry, index) => ({
          id: `dict:${entry.dictId}:${entry.word}`,
          userId: currentUser?.id || 'dictionary',
          word: entry.word,
          language,
          contextSentence: entry.translation || `Imported from ${entry.dictName || 'dictionary'}`,
          translation: entry.translation,
          metadata: {
            ...(entry.metadata || {}),
            ...(entry.dictName ? { source: entry.dictName } : {}),
          },
          timestamp: now - index,
          strength: 0,
          lastReview: now,
          nextReview: now,
        }));
        setDictionaryVocabulary(mapped);
      } catch (err) {
        console.error('Failed to load dictionary entries for vocabulary page:', err);
        if (!cancelled) setDictionaryVocabulary([]);
      }
    };

    void loadDictionaryVocabulary();
    return () => {
      cancelled = true;
    };
  }, [language, currentUser, dictionaryRefreshTick]);

  useEffect(() => {
    if (!showVocabManager) return;
    let cancelled = false;

    const loadManagerData = async () => {
      setManagerLoading(true);
      try {
        const [sources, entries] = await Promise.all([
          db.getDictionaries(language),
          db.getDictionaryEntriesByLanguage(language, { includeDisabled: true, limit: 50000 }),
        ]);
        if (cancelled) return;
        setDictionarySources(sources);
        setDictionaryManagerEntries(entries);
      } catch (err) {
        console.error('Failed to load dictionary manager data:', err);
        if (!cancelled) {
          setDictionarySources([]);
          setDictionaryManagerEntries([]);
          setToastMessage('词库加载失败，请重试。');
        }
      } finally {
        if (!cancelled) {
          setManagerLoading(false);
        }
      }
    };

    void loadManagerData();
    return () => {
      cancelled = true;
    };
  }, [showVocabManager, language, dictionaryRefreshTick]);

  useEffect(() => {
    if (managerSourceId === MANAGER_SOURCE_ALL || managerSourceId === MANAGER_SOURCE_LOCAL) return;
    if (!dictionarySources.some((source) => source.id === managerSourceId)) {
      setManagerSourceId(MANAGER_SOURCE_ALL);
    }
  }, [dictionarySources, managerSourceId]);

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

  const handleAddWord = (word: string, contextSentence: string) => {
    if (!currentUser) return;
    const cleanWord = word.replace(/^[.,!?;:()"'芦禄\s]+|[.,!?;:()"'芦禄\s]+$/g, '');
    if (!cleanWord) return;

    const incomingCandidates = getLemmaCandidates(cleanWord, language).map(normalizeForMatch).filter(Boolean);
    if (incomingCandidates.length === 0) incomingCandidates.push(normalizeForMatch(cleanWord));
    const incomingSet = new Set(incomingCandidates);

    const duplicateExists = vocabulary.some(v => {
      if (v.language !== language) return false;
      const existing = getLemmaCandidates(v.word, language).map(normalizeForMatch).filter(Boolean);
      if (existing.length === 0) existing.push(normalizeForMatch(v.word));
      return existing.some(candidate => incomingSet.has(candidate));
    });
    if (duplicateExists) return;

    const metadataSeed: VocabularyItem['metadata'] = {};
    if (language === 'KR') {
      const structure = analyzeKoreanStructure(cleanWord);
      if (structure) {
        metadataSeed.rootWord = structure.root;
        metadataSeed.nuance = `${structure.particle} (${structure.function})`;
      }
    }

    const newItem: VocabularyItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      word: cleanWord,
      language: language,
      contextSentence: contextSentence,
      ...(Object.keys(metadataSeed).length > 0 ? { metadata: metadataSeed } : {}),
      timestamp: Date.now(),
      strength: 0,
      lastReview: Date.now(),
      nextReview: Date.now()
    };

    setVocabulary(prev => [newItem, ...prev]);
    updateMission({ wordsCount: (currentUser.missionStatus[`${new Date().toISOString().split('T')[0]}_${currentUser.id}`]?.wordsCount || 0) + 1 });

  };

  const currentLanguageVocabulary = vocabulary.filter(v => v.language === language);
  const mergedVocabularyForView = useMemo(() => {
    const byWord = new Map<string, VocabularyItem>();

    for (const item of dictionaryVocabulary) {
      byWord.set(normalizeForMatch(item.word), item);
    }
    for (const item of currentLanguageVocabulary) {
      byWord.set(normalizeForMatch(item.word), item);
    }

    return Array.from(byWord.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [dictionaryVocabulary, currentLanguageVocabulary]);

  const dayStartTs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const reviewedTodayCount = useMemo(
    () => currentLanguageVocabulary.filter((item) => item.lastReview >= dayStartTs).length,
    [currentLanguageVocabulary, dayStartTs]
  );

  const reviewQueue = useMemo(
    () => getDailyReviewList(mergedVocabularyForView).slice(0, DAILY_REVIEW_LIMIT),
    [mergedVocabularyForView]
  );
  const needReviewCount = reviewQueue.length;
  const basePracticeQueue = useMemo(
    () => (reviewQueue.length > 0 ? reviewQueue : mergedVocabularyForView.slice(0, DAILY_REVIEW_LIMIT)),
    [reviewQueue, mergedVocabularyForView]
  );
  const practiceQueue = useMemo(
    () => shuffleBySeed(basePracticeQueue, reviewSeed),
    [basePracticeQueue, reviewSeed]
  );
  const vocabViewItems = isReviewMode ? practiceQueue : mergedVocabularyForView;
  const dueCount = needReviewCount;
  const totalDeckCount = mergedVocabularyForView.length;

  const localManagerRecords = useMemo<ManagerWordRecord[]>(
    () =>
      currentLanguageVocabulary.map((item) => ({
        id: item.id,
        word: item.word,
        translation: item.translation,
        contextSentence: item.contextSentence,
        sourceId: MANAGER_SOURCE_LOCAL,
        sourceName: '我的词库',
        pos: typeof (item.metadata as Record<string, any> | undefined)?.pos === 'string'
          ? (item.metadata as Record<string, any>).pos
          : undefined,
        localItemId: item.id,
      })),
    [currentLanguageVocabulary]
  );

  const dictionaryRecords = useMemo<ManagerWordRecord[]>(
    () =>
      dictionaryManagerEntries.map((entry) => {
        const metadata = (entry.metadata || {}) as Record<string, any>;
        const posCandidate = metadata.pos ?? metadata.partOfSpeech;
        return {
          id: `dict:${entry.dictId}:${entry.word}`,
          word: entry.word,
          translation: entry.translation,
          sourceId: entry.dictId,
          sourceName: entry.dictName || entry.dictId,
          pos: typeof posCandidate === 'string' ? posCandidate : undefined,
        };
      }),
    [dictionaryManagerEntries]
  );

  const allManagerRecords = useMemo(
    () => [...localManagerRecords, ...dictionaryRecords],
    [localManagerRecords, dictionaryRecords]
  );

  const managerSourceItems = useMemo<VocabularyManagerSourceItem[]>(() => {
    const countUniqueWords = (records: ManagerWordRecord[]) => new Set(records.map((r) => normalizeForMatch(r.word))).size;
    const byDictCount = new Map<string, number>();
    for (const record of dictionaryRecords) {
      const key = record.sourceId;
      byDictCount.set(key, (byDictCount.get(key) || 0) + 1);
    }

    return [
      {
        id: MANAGER_SOURCE_ALL,
        name: '全部词库（合并）',
        count: countUniqueWords(allManagerRecords),
        type: 'ALL',
      },
      {
        id: MANAGER_SOURCE_LOCAL,
        name: '我的词库',
        count: countUniqueWords(localManagerRecords),
        type: 'LOCAL',
      },
      ...dictionarySources.map((dict) => ({
        id: dict.id,
        name: dict.name,
        count: byDictCount.get(dict.id) || 0,
        type: 'DICT' as const,
        enabled: dict.enabled,
      })),
    ];
  }, [allManagerRecords, localManagerRecords, dictionaryRecords, dictionarySources]);

  const managerScopedRecords = useMemo(() => {
    if (managerSourceId === MANAGER_SOURCE_ALL) return allManagerRecords;
    if (managerSourceId === MANAGER_SOURCE_LOCAL) return localManagerRecords;
    return dictionaryRecords.filter((record) => record.sourceId === managerSourceId);
  }, [managerSourceId, allManagerRecords, localManagerRecords, dictionaryRecords]);

  const managerRows = useMemo<VocabularyManagerRow[]>(() => {
    const rowMap = new Map<
      string,
      {
        id: string;
        word: string;
        pos?: string;
        example?: string;
        sourceMeanings: Map<string, { sourceName: string; meanings: Set<string> }>;
        localItemIds: Set<string>;
      }
    >();

    for (const record of managerScopedRecords) {
      const key = normalizeForMatch(record.word);
      if (!key) continue;

      let row = rowMap.get(key);
      if (!row) {
        row = {
          id: key,
          word: record.word,
          pos: record.pos,
          example:
            record.contextSentence && record.contextSentence !== GENERIC_IMPORTED_CONTEXT
              ? record.contextSentence
              : undefined,
          sourceMeanings: new Map(),
          localItemIds: new Set<string>(),
        };
        rowMap.set(key, row);
      } else {
        if (!row.pos && record.pos) row.pos = record.pos;
        if (!row.example && record.contextSentence && record.contextSentence !== GENERIC_IMPORTED_CONTEXT) {
          row.example = record.contextSentence;
        }
      }

      if (record.localItemId) row.localItemIds.add(record.localItemId);

      const existingSource = row.sourceMeanings.get(record.sourceId) || {
        sourceName: record.sourceName,
        meanings: new Set<string>(),
      };

      const meanings = splitMeanings(record.translation);
      if (meanings.length === 0 && record.translation?.trim()) {
        existingSource.meanings.add(record.translation.trim());
      } else {
        meanings.forEach((meaning) => existingSource.meanings.add(meaning));
      }
      row.sourceMeanings.set(record.sourceId, existingSource);
    }

    let rows = Array.from(rowMap.values()).map((row) => {
      const meanings = Array.from(row.sourceMeanings.entries())
        .map(([sourceId, value]) => ({
          sourceId,
          sourceName: value.sourceName,
          meanings: Array.from(value.meanings),
        }))
        .sort((a, b) => a.sourceName.localeCompare(b.sourceName));
      return {
        id: row.id,
        word: row.word,
        pos: row.pos,
        meanings,
        sources: meanings.map((m) => m.sourceName),
        example: row.example,
        localItemIds: Array.from(row.localItemIds),
      } satisfies VocabularyManagerRow;
    });

    rows = rows.sort((a, b) => a.word.localeCompare(b.word));
    const keyword = normalizeForMatch(managerSearch);
    if (!keyword) return rows;

    return rows.filter((row) => {
      const haystack = [
        row.word,
        row.pos || '',
        row.example || '',
        ...row.sources,
        ...row.meanings.flatMap((group) => group.meanings),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [managerScopedRecords, managerSearch]);

  const handleRemoveVocabulary = (id: string) => {
    if (id.startsWith('dict:')) {
      setToastMessage('词典词条请在“词典中心”禁用/清空/删除。');
      return;
    }
    setVocabulary((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRemoveLocalWords = (ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setVocabulary((prev) => prev.filter((item) => !idSet.has(item.id)));
    setToastMessage(`已删除 ${ids.length} 条本地词条。`);
  };

  const handleUpdateVocabularyStrength = (id: string, isCorrect: boolean) => {
    if (!currentUser) return;

    const target = mergedVocabularyForView.find((item) => item.id === id);
    if (!target) return;

    const now = Date.now();
    setVocabulary((prev) => {
      const normalized = normalizeForMatch(target.word);
      const existingIndex = prev.findIndex(
        (item) => item.language === language && (item.id === id || normalizeForMatch(item.word) === normalized)
      );

      const base: VocabularyItem =
        existingIndex >= 0
          ? prev[existingIndex]
          : {
              ...target,
              id: `${now}_${Math.random().toString(36).slice(2, 10)}`,
              userId: currentUser.id,
              language,
              contextSentence: target.contextSentence || target.translation || GENERIC_IMPORTED_CONTEXT,
              translation: mergeMeaningText(undefined, target.translation),
              timestamp: now,
              strength: target.strength || 0,
              lastReview: target.lastReview || now,
              nextReview: target.nextReview || now,
            };

      const { strength, nextReview } = calculateNextReview(base.strength, base.lastReview, isCorrect);
      let safeNextReview = nextReview;
      if (isCorrect && safeNextReview <= now) {
        safeNextReview = now + 86400000;
      }
      if (!isCorrect && safeNextReview <= now) {
        // Anki-like relearning step: failed cards return after a short delay instead of immediately.
        safeNextReview = now + (10 * 60 * 1000);
      }
      const updated: VocabularyItem = {
        ...base,
        translation: mergeMeaningText(base.translation, target.translation),
        strength,
        lastReview: now,
        nextReview: safeNextReview,
        reviewHistory: [...(base.reviewHistory || []), now],
      };

      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = updated;
        return next;
      }
      return [updated, ...prev];
    });

    setToastMessage(isCorrect ? '已标记为“认识”，已安排下次复习。' : '已标记为“模糊”，将更快再次出现。');
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

      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] px-4 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-sm font-semibold shadow">
          {toastMessage}
        </div>
      )}

      <Header 
        currentTab={currentTab} 
        onTabChange={(t) => { setCurrentTab(t); setIsReviewMode(false); setShowVocabManager(false); }} 
        language={language} 
        onLanguageChange={(l) => { setLanguage(l); setIsReviewMode(false); setShowVocabManager(false); }}
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
              <section className="space-y-4">
                {!isReviewMode ? (
                  <>
                    <div className="bg-white border border-green-200 rounded-2xl p-6">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Deck</p>
                      <h2 className="text-2xl font-black text-slate-900 mt-1">背诵模式</h2>
                      <p className="text-sm text-slate-500 mt-1">词库默认隐藏。点击“开始背诵”进入单词卡；点击“管理词库”再查看和维护词条。</p>

                      <div className="grid grid-cols-3 gap-3 mt-5">
                        <div className="rounded-xl border border-green-100 bg-green-50 p-3">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">需背</p>
                          <p className="text-2xl font-black text-green-700">{needReviewCount}</p>
                        </div>
                        <div className="rounded-xl border border-green-100 bg-white p-3">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">已背</p>
                          <p className="text-2xl font-black text-slate-700">{reviewedTodayCount}</p>
                        </div>
                        <div className="rounded-xl border border-green-100 bg-white p-3">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Total</p>
                          <p className="text-2xl font-black text-slate-700">{totalDeckCount}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-5">
                        <button
                          onClick={() => {
                            if (totalDeckCount <= 0) {
                              setToastMessage('当前没有可背诵单词，请先导入词表或在听力/阅读中收藏。');
                              return;
                            }
                            if (dueCount <= 0) {
                              setToastMessage('今天没有到期卡片，已进入练习模式。');
                            }
                            setReviewSeed(Date.now());
                            setIsReviewMode(true);
                            setShowVocabManager(false);
                          }}
                          className="px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-black"
                        >
                          开始背诵
                        </button>
                        <button
                          onClick={() => {
                            const next = !showVocabManager;
                            setShowVocabManager(next);
                            if (next) {
                              setManagerSourceId(MANAGER_SOURCE_ALL);
                              setManagerSearch('');
                            }
                          }}
                          className="px-5 py-2.5 rounded-xl border border-green-200 bg-white text-green-700 text-sm font-bold"
                        >
                          {showVocabManager ? '收起词库' : '管理词库'}
                        </button>
                        <button
                          onClick={() => setIsSettingsOpen(true)}
                          className="px-5 py-2.5 rounded-xl border border-green-200 bg-white text-green-700 text-sm font-bold"
                        >
                          词典中心
                        </button>
                      </div>
                    </div>

                    {showVocabManager ? (
                      <VocabularyManagerTable
                        sources={managerSourceItems}
                        selectedSourceId={managerSourceId}
                        onSelectSource={setManagerSourceId}
                        search={managerSearch}
                        onSearchChange={setManagerSearch}
                        rows={managerRows}
                        loading={managerLoading}
                        onRemoveLocalWords={handleRemoveLocalWords}
                      />
                    ) : (
                      <div className="bg-white border-2 border-dashed border-green-200 rounded-xl p-10 text-center">
                        <p className="text-slate-700 font-bold mb-2">词库已隐藏</p>
                        <p className="text-slate-500 text-sm mb-3">点击“开始背诵”进入 Anki 风格卡片学习；需要维护词条时再打开“管理词库”。</p>
                        <p className="text-[11px] text-slate-400">需背 {needReviewCount} · 已背 {reviewedTodayCount} · 总计 {totalDeckCount}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="bg-white border border-green-200 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Session</p>
                        <p className="text-sm font-bold text-slate-700">本轮卡片 {vocabViewItems.length} 张</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">需背 {needReviewCount} · 已背 {reviewedTodayCount}</p>
                      </div>
                      <button
                        onClick={() => setIsReviewMode(false)}
                        className="px-4 py-2 rounded-lg border border-green-200 bg-white text-green-700 text-xs font-bold"
                      >
                        结束背诵
                      </button>
                    </div>

                    <VocabularyBank
                      items={vocabViewItems}
                      onRemove={handleRemoveVocabulary}
                      onUpdateStrength={handleUpdateVocabularyStrength}
                      level={currentUser.levels[language]}
                      reviewMode={true}
                    />
                  </>
                )}
              </section>
            )}

            {currentTab === 'STATS' && (
              <Dashboard
                language={language}
                vocabulary={vocabulary}
                onStartReview={() => { setReviewSeed(Date.now()); setIsReviewMode(true); setShowVocabManager(false); setCurrentTab('VOCAB'); }}
                user={currentUser}
              />
            )}
          </>
        )}
      </main>
      
      {isSettingsOpen && (
        <SettingsModal
          onClose={() => setIsSettingsOpen(false)}
          currentAppLanguage={language}
          onCacheRefreshNeeded={() => setDictionaryRefreshTick((v) => v + 1)}
        />
      )}
    </div>
  );
};

export default App;
