import { Language } from '../types';

const sanitize = (word: string): string =>
  word.toLowerCase().trim().replace(/[.,!?;:()"'`]/g, '');

/**
 * Generates possible lemma/base-form candidates for a token.
 */
export const getLemmaCandidates = (word: string, language: Language): string[] => {
  const w = sanitize(word);
  const candidates = new Set<string>();

  if (!w) return [];
  candidates.add(w);

  if (language === 'EN') {
    if (w.endsWith('s') && w.length > 3) candidates.add(w.slice(0, -1));
    if (w.endsWith('es') && w.length > 4) candidates.add(w.slice(0, -2));
    if (w.endsWith('ies') && w.length > 4) candidates.add(`${w.slice(0, -3)}y`);

    if (w.endsWith('ing') && w.length > 5) {
      candidates.add(w.slice(0, -3));
      candidates.add(`${w.slice(0, -3)}e`);
      if (w[w.length - 4] === w[w.length - 5]) candidates.add(w.slice(0, -4));
    }

    if (w.endsWith('ed') && w.length > 4) {
      candidates.add(w.slice(0, -2));
      candidates.add(`${w.slice(0, -2)}e`);
      if (w[w.length - 3] === w[w.length - 4]) candidates.add(w.slice(0, -3));
      if (w.endsWith('ied')) candidates.add(`${w.slice(0, -3)}y`);
    }

    if (w.endsWith('ly') && w.length > 4) candidates.add(w.slice(0, -2));
  } else if (language === 'FR') {
    if (w.endsWith('s') && w.length > 3) candidates.add(w.slice(0, -1));
    if (w.endsWith('x') && w.length > 3) candidates.add(w.slice(0, -1));
    if (w.endsWith('aux') && w.length > 4) candidates.add(`${w.slice(0, -3)}al`);

    const erEndings = [
      'e',
      'es',
      'ons',
      'ez',
      'ent',
      'ai',
      'as',
      'a',
      'ais',
      'ait',
      'ions',
      'iez',
      'aient',
      'erai',
      'eras',
      'era',
      'é',
      'ée',
      'és',
      'ées',
    ];
    for (const suffix of erEndings) {
      if (w.endsWith(suffix) && w.length > suffix.length + 2) {
        candidates.add(`${w.slice(0, -suffix.length)}er`);
      }
    }

    const irEndings = ['is', 'it', 'issons', 'issez', 'issent', 'irai', 'iras', 'i'];
    for (const suffix of irEndings) {
      if (w.endsWith(suffix) && w.length > suffix.length + 2) {
        candidates.add(`${w.slice(0, -suffix.length)}ir`);
      }
    }
  } else if (language === 'KR') {
    const particles = [
      '은',
      '는',
      '이',
      '가',
      '을',
      '를',
      '에',
      '에서',
      '에게',
      '께',
      '과',
      '와',
      '의',
      '도',
      '만',
      '로',
      '으로',
      '까지',
      '부터',
    ];
    for (const p of particles) {
      if (w.endsWith(p) && w.length > p.length) candidates.add(w.slice(0, -p.length));
    }

    const politeEndings = ['입니다', '합니다', '해요', '아요', '어요', '였다', '했다', '다'];
    for (const suffix of politeEndings) {
      if (w.endsWith(suffix) && w.length > suffix.length) {
        candidates.add(w.slice(0, -suffix.length));
      }
    }
  }

  return Array.from(candidates).filter(Boolean);
};

export interface KoreanStructure {
  root: string;
  particle: string;
  function: string;
}

/**
 * Splits a Korean token into root + particle if one is detected.
 */
export const analyzeKoreanStructure = (word: string): KoreanStructure | null => {
  const w = sanitize(word);
  if (!w) return null;

  const particleMap: Record<string, string> = {
    은: 'Topic Marker',
    는: 'Topic Marker',
    이: 'Subject Marker',
    가: 'Subject Marker',
    을: 'Object Marker',
    를: 'Object Marker',
    에: 'Location/Time Marker',
    에서: 'Location (Action) Marker',
    에게: 'Dative Marker',
    께: 'Honorific Dative Marker',
    과: 'And/With Marker',
    와: 'And/With Marker',
    의: 'Possessive Marker',
    도: 'Additive Marker',
    만: 'Limiter Marker',
    로: 'Direction/Instrument Marker',
    으로: 'Direction/Instrument Marker',
    까지: 'Until Marker',
    부터: 'From Marker',
  };

  const particles = Object.keys(particleMap).sort((a, b) => b.length - a.length);
  for (const p of particles) {
    if (w.endsWith(p) && w.length > p.length) {
      return {
        root: w.slice(0, -p.length),
        particle: p,
        function: particleMap[p],
      };
    }
  }

  return null;
};

