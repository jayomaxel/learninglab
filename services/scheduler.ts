
import { VocabularyItem } from '../types';

/**
 * A simplified SuperMemo-2 / Leitner hybrid for review scheduling.
 * 
 * Strength 0: New
 * Strength 1: Interval 1 day
 * Strength 2: Interval 3 days
 * Strength 3: Interval 7 days
 * Strength 4: Interval 14 days
 * Strength 5: Interval 30 days
 */
export const calculateNextReview = (currentStrength: number, lastReview: number, isCorrect: boolean): { strength: number, nextReview: number } => {
    const intervals = [0, 1, 3, 7, 14, 30];
    const msPerDay = 86400000;

    let newStrength = currentStrength;
    if (isCorrect) {
        newStrength = Math.min(5, currentStrength + 1);
    } else {
        newStrength = Math.max(0, currentStrength - 1);
    }

    const daysToAdd = intervals[newStrength];
    const nextReview = Date.now() + (daysToAdd * msPerDay);

    return { strength: newStrength, nextReview };
};

export const getDailyReviewList = (vocabulary: VocabularyItem[]): VocabularyItem[] => {
    const now = Date.now();
    return vocabulary.filter(item => {
        // If nextReview is not set, treat as "due now" if strength < 3, otherwise check timestamp
        const dueTime = item.nextReview || (item.timestamp + 86400000); 
        return dueTime <= now;
    }).sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0)); // Oldest due first
};
