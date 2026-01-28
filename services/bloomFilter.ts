
export class BloomFilter {
  size: number;
  bitArray: Uint8Array;

  constructor(size: number = 2000000, buffer?: ArrayBuffer) {
    this.size = size;
    if (buffer) {
        this.bitArray = new Uint8Array(buffer);
    } else {
        this.bitArray = new Uint8Array(Math.ceil(size / 8));
    }
  }

  // FNV-1a Hash Function (Fast & Simple)
  hash(str: string) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  add(str: string) {
    const h = this.hash(str);
    const k = 3; // Number of hash functions (simulated by shifts)
    for (let i = 0; i < k; i++) {
      const idx = (h + i * 0x5bd1e995) % this.size;
      const byteIdx = Math.floor(idx / 8);
      const bitIdx = idx % 8;
      this.bitArray[byteIdx] |= (1 << bitIdx);
    }
  }

  test(str: string) {
    const h = this.hash(str);
    const k = 3;
    for (let i = 0; i < k; i++) {
      const idx = (h + i * 0x5bd1e995) % this.size;
      const byteIdx = Math.floor(idx / 8);
      const bitIdx = idx % 8;
      if ((this.bitArray[byteIdx] & (1 << bitIdx)) === 0) return false;
    }
    return true;
  }
  
  merge(other: BloomFilter) {
      if (other.size !== this.size) return;
      for(let i=0; i<this.bitArray.length; i++) {
          this.bitArray[i] |= other.bitArray[i];
      }
  }
  
  getBuffer(): ArrayBuffer {
      return this.bitArray.buffer;
  }
}

export const globalBloomFilter = new BloomFilter();
