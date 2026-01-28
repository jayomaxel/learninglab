
import { db } from './db';
import { createDictionaryStreamParser } from './fileParser';
import { globalBloomFilter, BloomFilter } from './bloomFilter';
import { Language } from '../types';

export const downloadAndImportDictionary = async (
    url: string,
    name: string,
    language: Language,
    onProgress: (status: string, percent: number) => void
): Promise<void> => {
    try {
        onProgress('Connecting to Cloud...', 0);
        
        // 1. Fetch
        const response = await fetch(url);
        if (!response.body) throw new Error("ReadableStream not supported in this browser.");
        
        const contentLength = response.headers.get('content-length');
        const totalLength = contentLength ? parseInt(contentLength, 10) : 0;
        
        const reader = response.body.getReader();
        let receivedLength = 0;
        
        // 2. Initialize DB & Parser
        const dictId = await db.createDictionary(name, language, 'IMPORTED');
        const parser = createDictionaryStreamParser(
            (count) => {
                // This callback runs on worker progress (count only)
                // We rely on the download loop for percentage
            },
            async (batch) => {
                await db.importBatchToDict(batch, dictId);
            }
        );

        // 3. Stream & Push to Worker
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (value) {
                parser.push(value);
                receivedLength += value.length;
                
                if (totalLength > 0) {
                    const percent = Math.round((receivedLength / totalLength) * 100);
                    onProgress(`Downloading & Parsing... (${(receivedLength/1024/1024).toFixed(1)}MB)`, percent);
                } else {
                    onProgress(`Downloading & Parsing... ${(receivedLength/1024/1024).toFixed(1)}MB`, 50);
                }
            }
        }

        // 4. Finalize
        onProgress('Finalizing Index...', 100);
        const { total, bloomBuffer } = await parser.end();
        
        // 5. Merge Bloom Filter
        if (bloomBuffer) {
            const newFilter = new BloomFilter(2000000, bloomBuffer);
            globalBloomFilter.merge(newFilter);
        }

        onProgress(`Done! ${total.toLocaleString()} entries added.`, 100);

    } catch (e: any) {
        throw new Error(`Sync failed: ${e.message}`);
    }
};
