/**
 * NSFW filter unit tests (pure functions, no browser/model needed).
 *
 * screenContentText: keyword-based text safety screening ('blur' for explicit
 * keywords, 'safe' otherwise).
 * verdictFromPredictions: maps NSFWJS class probabilities to safe/blur/block
 * using the tuned thresholds (block porn/hentai ≥0.75 or combined ≥0.85; blur
 * only sexy ≥0.92 AND explicit ≥0.10).
 */
import { describe, expect, it } from 'vitest';
import { screenContentText, verdictFromPredictions, SAFETY_KEYWORDS } from '../../turtleNSFWFilter';

describe('screenContentText', () => {
  it('returns safe for clean text', () => {
    expect(screenContentText('A lovely sunny day at the beach with friends.')).toBe('safe');
  });

  it('returns safe for empty/blank input', () => {
    expect(screenContentText('')).toBe('safe');
    expect(screenContentText(null as unknown as string)).toBe('safe');
  });

  it('flags obvious explicit text as blur', () => {
    expect(screenContentText('watch this porn video now')).toBe('blur');
    expect(screenContentText('hentai comics collection')).toBe('blur');
    expect(screenContentText('graphic gore footage')).toBe('blur');
  });

  it('is case-insensitive', () => {
    expect(screenContentText('PORN')).toBe('blur');
    expect(screenContentText('Porn')).toBe('blur');
  });

  it('covers the configured safety keywords', () => {
    for (const kw of SAFETY_KEYWORDS) {
      expect(screenContentText(`this contains ${kw} here`)).toBe('blur');
    }
  });
});

describe('verdictFromPredictions', () => {
  it('blocks high-confidence Porn', () => {
    const r = verdictFromPredictions([
      { className: 'Porn', probability: 0.9 },
      { className: 'Neutral', probability: 0.05 },
      { className: 'Sexy', probability: 0.05 },
    ]);
    expect(r.verdict).toBe('block');
  });

  it('blocks high-confidence Hentai', () => {
    const r = verdictFromPredictions([{ className: 'Hentai', probability: 0.8 }]);
    expect(r.verdict).toBe('block');
  });

  it('blocks combined explicit signal above the combined threshold', () => {
    const r = verdictFromPredictions([
      { className: 'Porn', probability: 0.5 },
      { className: 'Hentai', probability: 0.4 },
    ]);
    expect(r.verdict).toBe('block'); // explicit 0.9 ≥ 0.85
  });

  it('blurs high Sexy ONLY with a meaningful explicit signal', () => {
    const r = verdictFromPredictions([
      { className: 'Sexy', probability: 0.95 },
      { className: 'Porn', probability: 0.2 },
    ]);
    expect(r.verdict).toBe('blur'); // sexy ≥0.92 && explicit 0.2 ≥0.1
  });

  it('does not blur a high Sexy score alone (normal photos stay unblurred)', () => {
    const r = verdictFromPredictions([
      { className: 'Sexy', probability: 0.95 },
      { className: 'Neutral', probability: 0.05 },
    ]);
    expect(r.verdict).toBe('safe'); // no explicit signal → no blur (known fix)
  });

  it('returns safe for neutral predictions', () => {
    const r = verdictFromPredictions([
      { className: 'Neutral', probability: 0.7 },
      { className: 'Drawing', probability: 0.2 },
      { className: 'Hentai', probability: 0.05 },
      { className: 'Sexy', probability: 0.03 },
      { className: 'Porn', probability: 0.02 },
    ]);
    expect(r.verdict).toBe('safe');
  });
});
