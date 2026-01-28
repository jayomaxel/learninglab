
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
  translation?: string; // Optional user note or segment translation
  timestamp: number;
}

export interface AppState {
  currentTab: 'LISTENING' | 'READER' | 'VOCAB';
  language: Language;
}
