
export type Language = 'EN' | 'FR' | 'KR';

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
  word: string;
  language: Language; 
  contextSentence: string;
  translation?: string;
  metadata?: {
    gender?: string;
    nuance?: string;
    cognate?: string;
    hanja?: string;
    source?: string; // Dictionary Name
    rootWord?: string;
    allDefinitions?: DefinitionSource[];
  };
  strength: number; 
  lastReview: number; 
  nextReview: number; 
  reviewHistory?: number[]; 
  timestamp: number;
  audioPath?: string; 
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
  starRating?: number; 
}

export interface DictionarySource {
  id: string;
  name: string;
  language: Language;
  priority: number;
  enabled: boolean;
  count: number;
  importedAt: number;
  type: 'USER' | 'IMPORTED' | 'SYSTEM';
}

export interface DictionaryEntry {
  dictId: string; 
  word: string;
  translation: string;
  metadata?: {
    gender?: string;
    nuance?: string;
    cognate?: string;
    hanja?: string;
  };
  audioPath?: string;
}

export interface StudyLog {
  id: string;
  type: 'DICTATION' | 'READER' | 'REVIEW';
  language: Language;
  score: number; 
  duration: number; 
  timestamp: number;
}

export interface AppState {
  currentTab: 'LISTENING' | 'READER' | 'VOCAB' | 'STATS' | 'REVIEW';
  language: Language;
}
