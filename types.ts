
export type Language = 'EN' | 'FR' | 'KR';

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  translation: string;
}

export interface AppState {
  currentTab: 'LISTENING' | 'READER';
  language: Language;
}
