export class CuckooFilter {
    capacity: number;
    bucketSize: number;
    fingerprintSize: number;
    buckets: Uint8Array[];
    maxKicks: number = 500;
    count: number = 0;

    constructor(capacity: number = 100000, bucketSize: number = 4) {
        this.capacity = capacity;
        this.bucketSize = bucketSize;
        this.fingerprintSize = 1; // 1 byte fingerprint
        this.buckets = Array.from({ length: capacity }, () => new Uint8Array(bucketSize));
    }

    private hash(str: string): number {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
    }

    private getFingerprint(str: string): number {
        const h = this.hash(str);
        return (h & 0xFF) || 1;
    }

    private getHash1(str: string): number {
        return this.hash(str) % this.capacity;
    }

    private getHash2(i1: number, fingerprint: number): number {
        let hf = this.hash(fingerprint.toString());
        return (i1 ^ hf) % this.capacity;
    }

    public getLoadFactor(): number {
        return this.count / (this.capacity * this.bucketSize);
    }

    add(str: string): boolean {
        const f = this.getFingerprint(str);
        const i1 = this.getHash1(str);
        const i2 = this.getHash2(i1, f);

        if (this.insertIntoBucket(i1, f) || this.insertIntoBucket(i2, f)) {
            this.count++;
            return true;
        }

        let i = Math.random() < 0.5 ? i1 : i2;
        for (let n = 0; n < this.maxKicks; n++) {
            const bucket = this.buckets[i];
            const entryIdx = Math.floor(Math.random() * this.bucketSize);
            const kickedF = bucket[entryIdx];
            bucket[entryIdx] = f;

            const newF = kickedF;
            i = this.getHash2(i, newF);
            if (this.insertIntoBucket(i, newF)) {
                this.count++;
                return true;
            }
        }
        return false;
    }

    private insertIntoBucket(idx: number, f: number): boolean {
        const bucket = this.buckets[idx];
        for (let j = 0; j < this.bucketSize; j++) {
            if (bucket[j] === 0) {
                bucket[j] = f;
                return true;
            }
        }
        return false;
    }

    test(str: string): boolean {
        const f = this.getFingerprint(str);
        const i1 = this.getHash1(str);
        const i2 = this.getHash2(i1, f);
        return this.findInBucket(i1, f) || this.findInBucket(i2, f);
    }

    private findInBucket(idx: number, f: number): boolean {
        const bucket = this.buckets[idx];
        for (let j = 0; j < this.bucketSize; j++) {
            if (bucket[j] === f) return true;
        }
        return false;
    }

    delete(str: string): boolean {
        const f = this.getFingerprint(str);
        const i1 = this.getHash1(str);
        const i2 = this.getHash2(i1, f);
        if (this.removeFromBucket(i1, f) || this.removeFromBucket(i2, f)) {
            this.count--;
            return true;
        }
        return false;
    }

    private removeFromBucket(idx: number, f: number): boolean {
        const bucket = this.buckets[idx];
        for (let j = 0; j < this.bucketSize; j++) {
            if (bucket[j] === f) {
                bucket[j] = 0;
                return true;
            }
        }
        return false;
    }
}

/**
 * Dynamic Cuckoo Filter
 * Automatically adds a new (larger) Cuckoo Filter table when current filters reach 85% capacity.
 */
export class DynamicCuckooFilter {
    filters: CuckooFilter[] = [];
    initialCapacity: number;

    constructor(initialCapacity: number = 100000) {
        this.initialCapacity = initialCapacity;
        this.addFilter();
    }

    private addFilter() {
        const lastCapacity = this.filters.length > 0 ? this.filters[this.filters.length - 1].capacity : this.initialCapacity / 2;
        this.filters.push(new CuckooFilter(lastCapacity * 2));
    }

    add(str: string): boolean {
        // If the newest filter is > 85% full, create a new one to prevent kick-out deadlock.
        const current = this.filters[this.filters.length - 1];
        if (current.getLoadFactor() > 0.85) {
            this.addFilter();
        }

        // Try to add to the newest filter first
        for (let i = this.filters.length - 1; i >= 0; i--) {
            if (this.filters[i].add(str)) return true;
        }

        // If all full, forced expansion
        this.addFilter();
        return this.filters[this.filters.length - 1].add(str);
    }

    test(str: string): boolean {
        return this.filters.some(f => f.test(str));
    }

    delete(str: string): boolean {
        // Find and delete from the first filter that contains it.
        for (const f of this.filters) {
            if (f.delete(str)) return true;
        }
        return false;
    }
}

export const globalCuckooFilter = new DynamicCuckooFilter();
