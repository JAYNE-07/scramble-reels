// 9:16 word-scramble reel renderer.
//
// Layout: top banner, four scrambled-word rows stacked vertically (each
// row: scrambled letters → blank answer slots), pause hint, a big 3-2-1
// countdown in the title space, then the answer letters fill into the
// blanks one row at a time, and finally a CTA pop.

import type { Palette } from './palettes';
import type { Scramble, ScrambleEntry } from './scramble';

export interface Scene {
  width: number;
  height: number;
  scramble: Scramble;
  palette: Palette;
  banner: string;
  title: string;        // theme title, uppercase (kept for callers, not drawn)
  cta: string;
  handle: string;
  duration: number;
  seedSalt: number;
}

/** Single source of truth for the reel timeline. */
export const REEL_TIMING = {
  duration: 14,
  bannerStart: 0,
  titleStart: 0.5,
  gridFadeIn: 1.5,        // semantically "entries appear"
  thinkStart: 2.0,
  countdownStart: 7.0,
  countdownEnd: 9.0,
  revealStart: 9.0,
  revealEnd: 11.0,
  ctaStart: 11.0,
  ctaEnd: 11.8,
} as const;

export function buildScene(
  width: number,
  height: number,
  scramble: Scramble,
  palette: Palette,
  banner: string,
  title: string,
  cta: string,
  handle: string,
  duration: number,
  seedSalt = 1,
): Scene {
  return { width, height, scramble, palette, banner, title, cta, handle, duration, seedSalt };
}

// ---------- math helpers ----------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// ---------- layout ----------

interface RowLayout {
  /** Font size used for both scrambled letters and answer slots. Auto-shrunk
   *  per scene so the longest row fits the canvas with side padding. */
  fontSize: number;
  /** Vertical pixel pitch between rows. */
  rowH: number;
  /** Centre Y of the first row. */
  topY: number;
  /** Letter-cell width (scrambled letters AND answer blanks use this so
   *  the reveal "pops" character-aligned). */
  cellW: number;
  /** Gap between the scrambled block and the arrow. */
  arrowGap: number;
  /** Gap between the arrow and the answer block. */
  answerGap: number;
}

function layoutRows(
  width: number,
  height: number,
  entries: ScrambleEntry[],
): RowLayout {
  const sidePad = 60;
  const availW = width - sidePad * 2;
  const longest = entries.reduce(
    (m, e) => Math.max(m, e.scrambled.length, e.answer.length),
    0,
  );

  // Try font sizes top-down. cellW scales with fontSize. arrow eats
  // ~fontSize * 1.2; gaps scale similarly.
  const candidates = [78, 72, 66, 60, 54, 48, 44, 40];
  let pick = candidates[candidates.length - 1];
  for (const fs of candidates) {
    const cellW = fs * 0.78;
    const arrowGap = fs * 0.45;
    const answerGap = fs * 0.45;
    const arrowW = fs * 1.05;
    const rowW = longest * cellW + arrowGap + arrowW + answerGap + longest * cellW;
    if (rowW <= availW) { pick = fs; break; }
    pick = fs;
  }
  const fontSize = pick;
  const cellW = fontSize * 0.78;
  const arrowGap = fontSize * 0.45;
  const answerGap = fontSize * 0.45;

  // Rows live between the banner (~y=250) and the pause-hint (~y=height-240).
  // Vertical center the stack inside that band.
  const bandTop = 360;
  const bandBottom = height - 360;
  const bandH = bandBottom - bandTop;
  const rowH = Math.min(bandH / Math.max(entries.length, 1), fontSize * 2.1);
  const stackH = rowH * (entries.length - 1);
  const topY = bandTop + (bandH - stackH) / 2;
  return { fontSize, rowH, topY, cellW, arrowGap, answerGap };
}

// ---------- per-frame draw ----------

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  t: number,
): void {
  const { width, height, scramble, palette, banner, cta, handle, title } = scene;
  void title;

  // animated background
  const drift = Math.sin(t * 0.6) * 30;
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, palette.bg);
  bg.addColorStop(0.5, mix(palette.bg, palette.bgEnd, 0.5 + drift * 0.002));
  bg.addColorStop(1, palette.bgEnd);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // subtle vignette
  const vg = ctx.createRadialGradient(
    width / 2, height / 2, height * 0.35,
    width / 2, height / 2, height * 0.62,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, width, height);

  const entries = scramble.entries;
  const rowLayout = layoutRows(width, height, entries);

  const {
    gridFadeIn,
    countdownStart,
    countdownEnd,
    revealStart,
    revealEnd,
    ctaStart,
    ctaEnd,
  } = REEL_TIMING;

  // 1) banner — fades in 0..0.5s, sits through ~2s
  const bannerP = clamp01(t / 0.5);
  if (bannerP > 0) {
    drawBanner(ctx, banner, width / 2, 160, bannerP, palette);
  }

  // 2) scrambled rows fade-in
  const rowsP = clamp01((t - gridFadeIn) / 0.6);
  if (rowsP > 0) {
    const popScale = easeOutBack(Math.min(1, rowsP));
    ctx.save();
    ctx.globalAlpha = rowsP;
    const cx = width / 2;
    const cy = rowLayout.topY + (entries.length - 1) * rowLayout.rowH / 2;
    ctx.translate(cx, cy);
    ctx.scale(popScale, popScale);
    ctx.translate(-cx, -cy);
    drawScrambleRows(ctx, entries, rowLayout, width, palette, t);
    ctx.restore();
  }

  // 3) pause-for-time hint — between rows appearing and countdown
  if (t > gridFadeIn + 0.8 && t < countdownStart) {
    const inP = clamp01((t - (gridFadeIn + 0.8)) / 0.3);
    const outP = clamp01((countdownStart - t) / 0.3);
    const alpha = Math.min(inP, outP);
    ctx.save();
    ctx.globalAlpha = alpha * 0.95;
    const { stroke, shadow } = contrast(palette.text);
    ctx.fillStyle = palette.text;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font =
      'italic 600 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
    ctx.shadowColor = shadow;
    ctx.shadowBlur = 12;
    const hint = '⏸  pause for more time';
    const hintY = height - 240;
    ctx.strokeText(hint, width / 2, hintY);
    ctx.fillText(hint, width / 2, hintY);
    ctx.restore();
  }

  // 4) countdown — sits in the banner's old space, big and central
  if (t >= countdownStart && t < countdownEnd) {
    drawCountdown(ctx, t, countdownStart, width, palette);
  }

  // 5) celebrate burst once reveal is done
  if (t > revealEnd + 0.05) {
    const cp = clamp01((t - (revealEnd + 0.05)) / 1.2);
    drawConfetti(
      ctx,
      width / 2,
      rowLayout.topY + (entries.length - 1) * rowLayout.rowH / 2,
      cp,
      scene.seedSalt,
    );
  }

  // 6) CTA pop
  const ctaP = clamp01((t - ctaStart) / (ctaEnd - ctaStart));
  if (ctaP > 0) {
    drawCtaPop(ctx, cta, handle, width / 2, height - 280, ctaP, palette);
  }

  void revealStart;
}

// ---------- scrambled rows ----------

function drawScrambleRows(
  ctx: CanvasRenderingContext2D,
  entries: ScrambleEntry[],
  l: RowLayout,
  width: number,
  palette: Palette,
  t: number,
) {
  const { fontSize, rowH, topY, cellW, arrowGap, answerGap } = l;
  const { revealStart, revealEnd } = REEL_TIMING;
  const totalReveal = Math.max(0.001, revealEnd - revealStart);
  const perRow = totalReveal / Math.max(entries.length, 1);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const y = topY + i * rowH;

    // Row width: scrambled block + arrow + answer block, centered.
    const sLen = e.scrambled.length;
    const aLen = e.answer.length;
    const arrowW = fontSize * 1.05;
    const totalW = sLen * cellW + arrowGap + arrowW + answerGap + aLen * cellW;
    const startX = (width - totalW) / 2;

    drawScrambledLetters(
      ctx,
      e.scrambled,
      startX,
      y,
      cellW,
      fontSize,
      palette,
    );

    const arrowX = startX + sLen * cellW + arrowGap + arrowW / 2;
    drawArrow(ctx, arrowX, y, fontSize, palette);

    const answerX = startX + sLen * cellW + arrowGap + arrowW + answerGap;
    const rowRevealStart = revealStart + i * perRow;
    drawAnswerSlots(
      ctx,
      e.answer,
      answerX,
      y,
      cellW,
      fontSize,
      palette,
      t,
      rowRevealStart,
      perRow,
    );
  }
}

function drawScrambledLetters(
  ctx: CanvasRenderingContext2D,
  word: string,
  startX: number,
  cy: number,
  cellW: number,
  fontSize: number,
  palette: Palette,
) {
  ctx.save();
  const { stroke, shadow } = contrast(palette.text);
  ctx.fillStyle = palette.text;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.12));
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif`;
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 10;
  for (let i = 0; i < word.length; i++) {
    const x = startX + i * cellW + cellW / 2;
    ctx.strokeText(word[i], x, cy);
    ctx.fillText(word[i], x, cy);
  }
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  fontSize: number,
  palette: Palette,
) {
  ctx.save();
  const { shadow } = contrast(palette.ctaBg);
  ctx.fillStyle = palette.ctaBg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(fontSize * 0.95)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif`;
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 10;
  ctx.fillText('→', cx, cy);
  ctx.restore();
}

function drawAnswerSlots(
  ctx: CanvasRenderingContext2D,
  answer: string,
  startX: number,
  cy: number,
  cellW: number,
  fontSize: number,
  palette: Palette,
  t: number,
  rowRevealStart: number,
  perRow: number,
) {
  const len = answer.length;
  // Each letter "pops" in over ~40ms, distributed across this row's slot.
  // Total row reveal span minus the per-letter tail so the last letter
  // finishes inside the slot.
  const letterPop = 0.04;
  const usableSpan = Math.max(0.05, perRow - letterPop);
  const perLetter = usableSpan / Math.max(len, 1);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  // Underline (blank slot) — thicker so it reads as an answer slot, not
  // a typo'd underscore. Drawn for every letter regardless of reveal.
  const blankColor = palette.ctaBg;
  const blankAlpha = 0.85;
  const blankH = Math.max(5, Math.round(fontSize * 0.1));
  const blankYOffset = fontSize * 0.45;
  ctx.save();
  ctx.fillStyle = withAlpha(blankColor, blankAlpha);
  for (let i = 0; i < len; i++) {
    const x = startX + i * cellW + cellW / 2;
    const blankX = x - cellW * 0.4;
    const blankY = cy + blankYOffset;
    ctx.fillRect(blankX, blankY, cellW * 0.8, blankH);
  }
  ctx.restore();

  // Letters as they fill in.
  const { stroke, shadow } = contrast(palette.text);
  ctx.fillStyle = palette.text;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.12));
  ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif`;
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 10;
  for (let i = 0; i < len; i++) {
    const letterStart = rowRevealStart + i * perLetter;
    if (t < letterStart) continue;
    const p = clamp01((t - letterStart) / letterPop);
    const scale = 0.4 + easeOutBack(p) * 0.6;
    const alpha = p;
    const x = startX + i * cellW + cellW / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, cy);
    ctx.scale(scale, scale);
    ctx.translate(-x, -cy);
    ctx.strokeText(answer[i], x, cy);
    ctx.fillText(answer[i], x, cy);
    ctx.restore();
  }
  ctx.restore();
}

// ---------- banner / countdown / cta ----------

function drawBanner(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  p: number,
  palette: Palette,
) {
  ctx.save();
  ctx.globalAlpha = p;
  const { stroke, shadow } = contrast(palette.ctaBg);
  ctx.fillStyle = palette.ctaBg;
  ctx.strokeStyle = stroke;
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = shadow;
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  const single = text.toUpperCase();
  // Auto-shrink so the banner fits the canvas with ~32 px side padding.
  const maxW = cx * 2 - 64;
  let fontSize = 64;
  for (const fs of [64, 58, 52, 46, 40, 36]) {
    ctx.font = `900 ${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif`;
    if (ctx.measureText(single).width <= maxW) { fontSize = fs; break; }
    fontSize = fs;
  }
  ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif`;
  ctx.lineWidth = Math.max(8, Math.round(fontSize * 0.2));
  ctx.strokeText(single, cx, cy);
  ctx.fillText(single, cx, cy);
  ctx.restore();
}

function drawCountdown(
  ctx: CanvasRenderingContext2D,
  t: number,
  countdownStart: number,
  width: number,
  palette: Palette,
) {
  const perDigit = 2 / 3; // 2 s window for 3,2,1
  const elapsed = t - countdownStart;
  const idx = Math.floor(elapsed / perDigit);
  const digit = 3 - idx;
  if (digit < 1 || digit > 3) return;
  const sub = (elapsed - idx * perDigit) / perDigit;

  let alpha = 1;
  let scale = 1;
  if (sub < 0.25) {
    const k = sub / 0.25;
    scale = easeOutBack(k);
    alpha = k;
  } else if (sub > 0.75) {
    const k = (sub - 0.75) / 0.25;
    alpha = 1 - k;
    scale = 1 + k * 0.4;
  }

  // Sit the countdown above the rows, in the banner's vertical band.
  const cx = width / 2;
  const cy = 280;

  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  const ringR = 150 * scale;
  const ring = ctx.createRadialGradient(cx, cy, ringR * 0.15, cx, cy, ringR);
  ring.addColorStop(0, palette.ctaBg);
  ring.addColorStop(0.6, palette.ctaBg + '00');
  ring.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = palette.ctaBg;
  ctx.strokeStyle = palette.ctaText;
  ctx.lineWidth = 18;
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    '900 220px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  ctx.strokeText(String(digit), cx, cy);
  ctx.fillText(String(digit), cx, cy);
  ctx.restore();
}

function drawConfetti(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  p: number,
  salt: number,
) {
  const colors = ['#f72585', '#7209b7', '#3a86ff', '#ffbe0b', '#fb5607', '#06d6a0', '#f5d3ff'];
  const N = 22;
  ctx.save();
  for (let i = 0; i < N; i++) {
    const seed = (salt * 9301 + i * 49297) % 233280;
    const angle = (i / N) * Math.PI * 2 + ((seed % 100) / 100) * 0.6;
    const speed = 260 + (seed % 110);
    const distP = easeOutCubic(p);
    const px = cx + Math.cos(angle) * speed * distP;
    const py = cy + Math.sin(angle) * speed * distP * 0.6 + 360 * p * p;
    const size = (10 + (seed % 14)) * (1 - p * 0.4);
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = Math.max(0, 1 - p * 1.1);
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(px, py, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(((seed % 360) / 360) * Math.PI * 2 + p * Math.PI * 2);
      ctx.fillRect(-size * 0.5, -size * 0.25, size, size * 0.5);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawCtaPop(
  ctx: CanvasRenderingContext2D,
  cta: string,
  handle: string,
  cx: number,
  cy: number,
  p: number,
  palette: Palette,
) {
  const scale = easeOutBack(p);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  const { stroke: ctaStroke, shadow: ctaShadow } = contrast(palette.ctaBg);
  ctx.fillStyle = palette.ctaBg;
  ctx.strokeStyle = ctaStroke;
  ctx.lineWidth = 14;
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font =
    '800 58px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
  ctx.shadowColor = ctaShadow;
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 9;
  const lines = splitCtaLines(ctx, cta, 540);
  const lh = 70;
  const offset = -((lines.length - 1) * lh) / 2;
  for (let i = 0; i < lines.length; i++) {
    const y = cy + offset + i * lh;
    ctx.strokeText(lines[i], cx, y);
    ctx.fillText(lines[i], cx, y);
  }

  if (handle) {
    const handleC = contrast(palette.text);
    ctx.shadowColor = handleC.shadow;
    ctx.shadowBlur = 16;
    ctx.font =
      '700 40px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif';
    ctx.lineWidth = 5;
    ctx.fillStyle = palette.text;
    ctx.strokeStyle = handleC.stroke;
    const hy = cy + offset + lines.length * lh + 28;
    ctx.strokeText(handle, cx, hy);
    ctx.fillText(handle, cx, hy);
  }
  ctx.restore();
}

function splitCtaLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const m = text.match(/^(.+?[?!])\s+(.+)$/);
  if (m) return [m[1], m[2]];
  const dash = text.match(/^(.+?)\s+[-—]\s+(.+)$/);
  if (dash) return [dash[1], dash[2]];
  return wrapToLines(ctx, text, maxWidth);
}

// ---------- helpers ----------

function wrapToLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function lum(hex: string): number {
  if (!hex.startsWith('#') || hex.length < 7) return 0.5;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function contrast(fillHex: string): { stroke: string; shadow: string } {
  return lum(fillHex) > 0.55
    ? { stroke: '#000000', shadow: 'rgba(0,0,0,0.65)' }
    : { stroke: '#ffffff', shadow: 'rgba(255,255,255,0.45)' };
}

function withAlpha(hex: string, a: number): string {
  if (!hex.startsWith('#') || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  const r = Math.round(lerp(pa[0], pb[0], t));
  const g = Math.round(lerp(pa[1], pb[1], t));
  const bl = Math.round(lerp(pa[2], pb[2], t));
  return `rgb(${r},${g},${bl})`;
}

function hex(s: string): [number, number, number] {
  const h = s.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
