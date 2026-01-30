
export type Language = 'EN' | 'FR' | 'KR';
export type CEFRLevel = 'A0' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface User {
  id: string;
  name: string;
  avatar?: string;
  levels: Record<Language, CEFRLevel>;
  preferences: {
    theme: 'light' | 'dark';
    speechRate: number;
    guidedMode: boolean; // New: Toggle between Mission and Explore
  };
  missionStatus: Record<string, DailyMission>; // Keyed by YYYY-MM-DD_UserID
}

export interface DailyMission {
  wordsCount: number;
  listeningDone: boolean;
  readingDone: boolean;
  alphabetMastery?: number; // For A0 users
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  translation: string;
}

export interface DefinitionSource {
  source: string;
  text: string;
  priority?: number;
}

export interface VocabularyItem {
  id: string;
  userId: string;
  word: string;
  language: Language; 
  contextSentence: string;
  translation?: string;
  metadata?: {
    gender?: 'M' | 'F';
    speechLevel?: 'Formal' | 'Polite' | 'Informal';
    nuance?: string;
    etymology?: string; // For C-Levels
    synonyms?: string[]; // For C-Levels
    cognate?: string;
    hanja?: string;
    source?: string;
    rootWord?: string;
  };
  strength: number; 
  lastReview: number; 
  nextReview: number; 
  reviewHistory?: number[]; 
  timestamp: number;
}

export interface DifficultWord {
  word: string;
  phonetic?: string;
  translation: string;
  definition: string;
}

export interface DifficultyAnalysis {
  density: number;
  level: string;
  difficultWords: DifficultWord[];
  suggestion: 'EASY' | 'OPTIMAL' | 'HARD';
  starRating?: number;
}

export interface AppState {
  currentTab: 'MISSION' | 'LISTENING' | 'READER' | 'VOCAB' | 'STATS' | 'ALPHABET';
  language: Language;
  currentUser: User | null;
}

export interface DictionarySource {
  id: string;
  name: string;
  language: Language;
  priority: number;
  enabled: boolean;
  count: number;
  importedAt: number;
  type: 'IMPORTED' | 'SYSTEM' | 'USER';
}

export interface DictionaryEntry {
  dictId: string;
  word: string;
  translation: string;
  metadata?: any;
}

export interface StudyLog {
  id: string;
  userId: string;
  type: 'DICTATION' | 'READER';
  language: Language;
  score: number;
  duration: number;
  timestamp: number;
}
