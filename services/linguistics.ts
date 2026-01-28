
import { Language } from '../types';

/**
 * Generates potential base forms (lemmas) for a given word based on language rules.
 */
export const getLemmaCandidates = (word: string, language: Language): string[] => {
    const w = word.toLowerCase().trim().replace(/[.,!?;:()"'«»]/g, ''); 
    const candidates = new Set<string>();
    
    candidates.add(w);
    
    if (language === 'EN') {
        if (w.endsWith('s') && w.length > 3) candidates.add(w.slice(0, -1));
        if (w.endsWith('es') && w.length > 4) candidates.add(w.slice(0, -2));
        if (w.endsWith('ies') && w.length > 4) candidates.add(w.slice(0, -3) + 'y');
        if (w.endsWith('ing')) {
            if (w.length > 4) candidates.add(w.slice(0, -3));
            if (w.length > 5 && w[w.length-4] === w[w.length-5]) candidates.add(w.slice(0, -4));
            if (w.length > 4) candidates.add(w.slice(0, -3) + 'e');
        }
        if (w.endsWith('ed')) {
             if (w.length > 3) candidates.add(w.slice(0, -2));
             if (w.length > 4 && w[w.length-3] === w[w.length-4]) candidates.add(w.slice(0, -3));
             if (w.length > 3) candidates.add(w.slice(0, -1));
             if (w.endsWith('ied')) candidates.add(w.slice(0, -3) + 'y');
        }
        if (w.endsWith('ly') && w.length > 4) candidates.add(w.slice(0, -2));
    } 
    else if (language === 'FR') {
        if (w.endsWith('s')) candidates.add(w.slice(0, -1));
        if (w.endsWith('x')) candidates.add(w.slice(0, -1));
        if (w.endsWith('aux')) candidates.add(w.slice(0, -3) + 'al');
        
        const erEndings = ['e', 'es', 'ons', 'ez', 'ent', 'ai', 'as', 'a', 'âmes', 'âtes', 'èrent', 'ais', 'ait', 'ions', 'iez', 'aient', 'erai', 'eras', 'era'];
        erEndings.forEach(suffix => {
            if (w.endsWith(suffix) && w.length > suffix.length + 2) {
                candidates.add(w.slice(0, -suffix.length) + 'er');
            }
        });
        if (w.endsWith('eons')) candidates.add(w.slice(0, -4) + 'er');
        
        const irEndings = ['is', 'it', 'issons', 'issez', 'issent', 'irai', 'iras'];
        irEndings.forEach(suffix => {
            if (w.endsWith(suffix) && w.length > suffix.length + 2) {
                candidates.add(w.slice(0, -suffix.length) + 'ir');
            }
        });
        if (w.endsWith('é')) candidates.add(w.slice(0, -1) + 'er');
        if (w.endsWith('ée')) candidates.add(w.slice(0, -2) + 'er');
        if (w.endsWith('és')) candidates.add(w.slice(0, -2) + 'er');
        if (w.endsWith('i')) candidates.add(w.slice(0, -1) + 'ir');
    }
    else if (language === 'KR') {
        const particles = [
            '은', '는', '이', '가', 
            '을', '를', 
            '에', '에서', '에게', '한테', '께',
            '로', '으로',
            '의', 
            '와', '과', '하고', '이랑',
            '도', '만', '까지', '조차', '부터'
        ];
        particles.forEach(p => {
            if (w.endsWith(p) && w.length > p.length) {
                candidates.add(w.slice(0, -p.length));
            }
        });
        if (w.endsWith('요')) candidates.add(w.slice(0, -1));
        if (w.endsWith('습니다')) candidates.add(w.slice(0, -3) + '다');
        if (w.endsWith('입니다')) candidates.add(w.slice(0, -3) + '다');
        if (w.endsWith('니까')) candidates.add(w.slice(0, -2) + '다');
        if (w.endsWith('고')) candidates.add(w.slice(0, -1) + '다');
    }
    
    return Array.from(candidates);
};

export interface KoreanStructure {
    root: string;
    particle: string;
    function: string; // e.g. "Subject Marker"
}

/**
 * Analyzes a Korean word to separate the root noun from its particle.
 * Visual Logic: 사과를 -> 사과 (Root) + 를 (Object Marker)
 */
export const analyzeKoreanStructure = (word: string): KoreanStructure | null => {
    const w = word.trim();
    
    // Map of particles to their grammatical function
    const particleMap: Record<string, string> = {
        '은': 'Topic Marker', '는': 'Topic Marker',
        '이': 'Subject Marker', '가': 'Subject Marker',
        '을': 'Object Marker', '를': 'Object Marker',
        '에': 'Time/Location', '에서': 'Location (Action)',
        '에게': 'Dative (To)', '한테': 'Dative (To)',
        '로': 'Instrument/Direction', '으로': 'Instrument/Direction',
        '의': 'Possessive',
        '와': 'Connective (And)', '과': 'Connective (And)',
        '도': 'Additive (Also)', '만': 'Limiter (Only)'
    };

    // Sort keys by length desc to match longest particle first (e.g., 에서 before 서)
    const sortedParticles = Object.keys(particleMap).sort((a, b) => b.length - a.length);

    for (const p of sortedParticles) {
        if (w.endsWith(p) && w.length > p.length) {
            return {
                root: w.slice(0, -p.length),
                particle: p,
                function: particleMap[p]
            };
        }
    }

    return null;
};
