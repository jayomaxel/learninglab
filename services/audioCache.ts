
/**
 * Audio Cache Service
 * Implementation of Cache API for AI-generated audio persistence.
 */

const CACHE_NAME = 'linguist-flow-audio-v1';

export const saveAudioToCache = async (key: string, blob: Blob): Promise<void> => {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = new Response(blob, {
            headers: { 'Content-Type': 'audio/wav', 'Content-Length': blob.size.toString() }
        });
        await cache.put(key, response);
    } catch (e) {
        console.warn('Failed to save to audio cache', e);
    }
};

export const getAudioFromCache = async (key: string): Promise<Blob | null> => {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(key);
        if (response) {
            return await response.blob();
        }
    } catch (e) {
        console.warn('Failed to get from audio cache', e);
    }
    return null;
};

export const clearAudioCache = async (): Promise<void> => {
    await caches.delete(CACHE_NAME);
};
