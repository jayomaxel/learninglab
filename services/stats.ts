
import { Language, StudyLog, VocabularyItem } from '../types';

// CEFR/TOPIK Standard Reference Counts (Cumulative)
const PROFICIENCY_TARGETS: Record<Language, Record<string, number>> = {
    'EN': { 'A1': 500, 'A2': 1500, 'B1': 3000, 'B2': 5000, 'C1': 8000 },
    'FR': { 'A1': 500, 'A2': 1200, 'B1': 2500, 'B2': 4000, 'C1': 7000 },
    'KR': { 'L1': 800, 'L2': 1500, 'L3': 3000, 'L4': 5000, 'L5': 7000 }
};

export const calculateLexicalPower = (vocab: VocabularyItem[]): number => {
    // Score = Sum of (Word * (Strength + 1))
    // A word at max strength is worth 6 points. 1000 mastered words = 6000 power.
    return vocab.reduce((acc, item) => acc + (item.strength + 1), 0);
};

export const calculateProficiency = (vocab: VocabularyItem[], language: Language) => {
    const uniqueWords = new Set(vocab.map(v => v.word.toLowerCase())).size;
    const targets = PROFICIENCY_TARGETS[language];
    
    // Determine current level and progress to next
    let currentLevel = 'Beginner';
    let progress = 0;
    let nextTarget = 0;

    const levels = Object.entries(targets);
    for (let i = 0; i < levels.length; i++) {
        const [lvl, count] = levels[i];
        if (uniqueWords < count) {
            currentLevel = i === 0 ? 'Pre-A1' : levels[i-1][0];
            const prevCount = i === 0 ? 0 : levels[i-1][1];
            nextTarget = count;
            progress = Math.round(((uniqueWords - prevCount) / (count - prevCount)) * 100);
            return { level: lvl, progress, count: uniqueWords, nextTarget: count };
        }
    }
    
    return { level: 'Master', progress: 100, count: uniqueWords, nextTarget: uniqueWords };
};

export const calculateStreak = (logs: StudyLog[]): number => {
    if (logs.length === 0) return 0;
    
    // Sort logs by timestamp desc
    const sortedLogs = [...logs].sort((a, b) => b.timestamp - a.timestamp);
    const today = new Date().setHours(0,0,0,0);
    
    let currentStreak = 0;
    let checkDate = today;
    
    // Use a set of unique dates present in logs
    const logDates = new Set(sortedLogs.map(l => new Date(l.timestamp).setHours(0,0,0,0)));

    // Check if user studied today
    if (logDates.has(today)) {
        currentStreak++;
        checkDate -= 86400000; // Move to yesterday
    } else {
        // If not studied today, check if streak is broken or active from yesterday
        // For this logic, if no study today, streak is 0? Or we allow it to persist until end of day?
        // Standard streak logic: If yesterday is missing, streak is 0.
        // Let's assume strict streak.
    }

    // Iterate backwards
    while (true) {
        if (logDates.has(checkDate)) {
            currentStreak++;
            checkDate -= 86400000;
        } else {
            break;
        }
    }
    
    return currentStreak;
};

export const getChartData = (logs: StudyLog[], type: 'DICTATION' | 'READER'): number[] => {
    // Returns last 7 days of scores/activity
    const data = new Array(7).fill(0);
    const today = new Date().setHours(0,0,0,0);
    const relevantLogs = logs.filter(l => l.type === type);
    
    for (let i = 0; i < 7; i++) {
        const date = today - (i * 86400000);
        // Find logs for this date
        const dayLogs = relevantLogs.filter(l => {
            const lDate = new Date(l.timestamp).setHours(0,0,0,0);
            return lDate === date;
        });
        
        if (dayLogs.length > 0) {
            // Avg score for dictation, or count for reader
            if (type === 'DICTATION') {
                const sum = dayLogs.reduce((acc, l) => acc + l.score, 0);
                data[6-i] = Math.round(sum / dayLogs.length);
            } else {
                data[6-i] = dayLogs.length; // activity count
            }
        }
    }
    return data;
};

export const getMasteryGainHeatmap = (vocab: VocabularyItem[]) => {
    // Calculates "Strength Gained" per day
    // Logic: Every item with strength > 0 contributes its strength to its lastReview date
    const activity: Record<string, number> = {};
    
    vocab.forEach(item => {
        if (item.reviewHistory && item.reviewHistory.length > 0) {
            // Sophisticated: Use history to plot gains
            item.reviewHistory.forEach(ts => {
                 const date = new Date(ts).toISOString().split('T')[0];
                 activity[date] = (activity[date] || 0) + 1; // +1 point for a review event
            });
        } else {
             // Fallback: Creation
             const date = new Date(item.timestamp).toISOString().split('T')[0];
             activity[date] = (activity[date] || 0) + 1;
        }
    });
    return activity;
};
