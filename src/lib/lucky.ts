/**
 * Four lucky numbers, 1-49, derived from the fortune itself. The same fortune
 * always yields the same numbers — they belong to that slip, so re-reading it
 * or seeing it again should not reshuffle them.
 *
 * FNV-1a for the seed, then xorshift to walk it, rejecting duplicates.
 */
export function luckyNumbers(fortune: string): number[] {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < fortune.length; i++) {
    hash ^= fortune.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  const picked: number[] = [];
  while (picked.length < 4) {
    hash ^= hash << 13;
    hash >>>= 0;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    hash >>>= 0;
    const n = (hash % 49) + 1;
    if (!picked.includes(n)) picked.push(n);
  }
  return picked.sort((a, b) => a - b);
}
