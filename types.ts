
export type Language = 'EN' | 'FR' | 'KR';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  translation: string;
}

export interface VocabularyItem {
  id: string;
  word: string;
  contextSentence: string;
  translation?: string;
  metadata?: {
    gender?: string;
    nuance?: string;
    cognate?: string;
    hanja?: string; // Korean Hanja root
  };
  // Mastery & SRS System
  strength: number; // 0-5 (Mastery Level)
  lastReview: number; // timestamp
  nextReview: number; // timestamp for SRS
  reviewHistory?: number[]; // timestamp of reviews
  timestamp: number;
}

export interface DifficultWord {
  word: string;
  translation: string;
  definition: string;
  phonetic?: string;
}

export interface DifficultyAnalysis {
  density: number;
  level: string;
  difficultWords: DifficultWord[];
  suggestion: 'EASY' | 'OPTIMAL' | 'HARD';
  starRating?: number; // 1-5 stars based on user's known vocab
}

export interface DictionaryEntry {
  word: string;
  translation: string;
}

export interface StudyLog {
  id: string;
  type: 'DICTATION' | 'READER' | 'REVIEW';
  language: Language;
  score: number; // Accuracy % or Words Reviewed count
  duration: number; // seconds
  timestamp: number;
}

export interface AppState {
  currentTab: 'LISTENING' | 'READER' | 'VOCAB' | 'STATS' | 'REVIEW';
  language: Language;
}
