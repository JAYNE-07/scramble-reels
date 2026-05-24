// Word-scramble entry builder.
//
// Each entry pairs a SCRAMBLED string with the original ANSWER. Letters
// are shuffled deterministically via mulberry32-seeded Fisher-Yates; if a
// shuffle accidentally lands on the original order we re-roll up to a few
// times so the puzzle never shows an already-unscrambled word.
//
// Only 4-7 letter words are used: shorter than 4 makes the scramble
// trivial, longer than 7 wraps off the side of a 1080-wide phone canvas.

import { wordsForTheme as themesWordsForTheme, resolveCategory } from './themes';

export interface ScrambleEntry {
  scrambled: string;
  answer: string;
}

export interface Scramble {
  entries: ScrambleEntry[];
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scrambleOne(word: string, rng: () => number): string {
  const letters = word.split('');
  // Up to 8 retries — single-letter words and palindromic anagrams can
  // collapse back to the input, but at >=4 letters this is extremely rare.
  for (let attempt = 0; attempt < 8; attempt++) {
    const arr = letters.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const out = arr.join('');
    if (out !== word) return out;
  }
  // Fallback: cyclic rotation guarantees a different string when len>=2.
  return word.slice(1) + word[0];
}

/** Build a Scramble from a pool of candidate words. Each candidate is
 *  upper-cased, filtered to 4-7 letters, and de-duplicated. The first N
 *  words (caller decides N by trimming the result) are scrambled with a
 *  mulberry32-seeded Fisher-Yates pass. */
export function buildScramble(words: string[], seed: number): Scramble {
  const rng = mulberry32(seed || 1);
  const seen = new Set<string>();
  const entries: ScrambleEntry[] = [];
  for (const raw of words) {
    const w = raw.toUpperCase().replace(/[^A-Z]/g, '');
    if (w.length < 4 || w.length > 7) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    entries.push({ scrambled: scrambleOne(w, rng), answer: w });
  }
  return { entries };
}

/** Pick `n` words from the theme matching `theme` (case-insensitive),
 *  deterministically shuffled by `seed`, restricted to 4-7 letter words
 *  so the row fits on a 1080-wide phone canvas. */
export function wordsForTheme(theme: string, n: number, seed: number): string[] {
  return themesWordsForTheme(theme, n, seed, 7, 4);
}

/** Convenience: theme display name uppercased, used as title. */
export function themeTitle(theme: string): string {
  const key = theme.trim().toLowerCase();
  const cat = resolveCategory(key);
  return (cat ?? key).toUpperCase();
}
