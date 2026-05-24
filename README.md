# Word Scramble Reels Generator

Produces 9:16 Instagram reels promoting the [word-search book](https://jayne-07.github.io/wordsearch-generator/).
Each 14 s reel: rotating banner hook fades in, 4 themed words appear scrambled
with blank answer slots, viewers get ~5 s of think time, a big 3-2-1 countdown
plays, the unscrambled answers fill into the blanks one letter at a time, and a
CTA card pops in. Every reel uses a different brand palette.

**Live site:** https://jayne-07.github.io/scramble-reels/

## Run locally

```sh
npm install
npm run dev
```

## How it works

- A small inline theme dictionary covers ~14 keywords (animals, fruits,
  vegetables, countries, space, ocean, sports, colors, instruments,
  weather, flowers, gemstones, trees, cars) plus a generic fallback —
  expanded by `themes.ts` to 165 canonical keywords.
- `buildScramble()` shuffles each word's letters with a mulberry32-seeded
  Fisher-Yates pass, retrying until the scrambled order differs from the
  source. Only 4-7 letter words are used (short enough to read on a phone).
- Canvas renders 1080×1920 frames at 30 fps; `MediaRecorder` captures the
  stream to MP4 (or WebM where MP4 isn't supported).
- Each reel is downloadable as a video file ready to upload to Instagram.
  Recording is real-time, so 10 reels ≈ 150 s.

## Note

Instagram prefers MP4. Recent Chrome/Edge/Safari on macOS produce MP4
directly; Firefox falls back to WebM (drag into CloudConvert or QuickTime
to convert).
