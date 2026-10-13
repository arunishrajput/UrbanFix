const POPCOUNT_NIBBLE = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** Hamming distance between two equal-length hex strings (e.g. 64-bit perceptual hashes). */
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('hash length mismatch');
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    d += POPCOUNT_NIBBLE[parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)]!;
  }
  return d;
}

/** 1 for identical hashes, ~0.5 for unrelated images. */
export function phashSimilarity(a: string, b: string): number {
  return 1 - hammingHex(a, b) / (a.length * 4);
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
