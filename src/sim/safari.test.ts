import { describe, it, expect } from 'vitest';
import { scorePhoto, missionsFor, fulfils, placement, sizeScore, type Seen, type Ctx, type Target } from './safari';

const T = (kind: Target['kind'], rarity: number): Target => ({ kind, name: kind, x: 0, y: 0, z: 0, r: 5, rarity });
const S = (t: Target, nx: number, ny: number, size: number): Seen => ({ t, nx, ny, size, dist: 100, occluded: false });
const golden: Ctx = { hour: 18, sunEl: Math.sin(0.1), night: 0, grey: 0, rain: 0, fog: 0, storm: 0 };
const night: Ctx = { hour: 1, sunEl: -0.7, night: 1, grey: 0, rain: 0, fog: 0, storm: 0 };

describe('Safari photo', () => {
  it('récompense le bon cadrage, la bonne lumière et la rareté', () => {
    expect(placement(1 / 3, 1 / 3)).toBeGreaterThan(0.95); expect(placement(0.95, 0.9)).toBeLessThan(0.1);
    expect(sizeScore(0.3)).toBe(1); expect(sizeScore(0.01)).toBeLessThan(0.15);
    const good = scorePhoto([S(T('train', 0.3), 0.33, -0.3, 0.3)], golden), bad = scorePhoto([S(T('train', 0.3), 0.97, 0.9, 0.02)], golden);
    expect(good.score).toBeGreaterThan(bad.score + 25);
    const train = scorePhoto([S(T('train', 0.3), 0, 0, 0.3)], night), rare = scorePhoto([S(T('aurore', 0.85), 0, 0, 0.3)], night);
    expect(rare.score).toBeGreaterThan(train.score);              // la nuit sert le ciel, pas les trains
    expect(scorePhoto([], golden).score).toBe(0);
    expect(scorePhoto([{ ...S(T('train', 0.3), 0, 0, 0.3), occluded: true }], golden).score).toBe(0);
  });
  it('génère des missions déterministes et les valide', () => {
    const none = { aurore: false, comète: false, éclipseSoleil: false, éclipseLune: false, pleineLune: false };
    const a = missionsFor(4, 3, none), b = missionsFor(4, 3, none);
    expect(a).toEqual(b); expect(a.length).toBe(3); expect(new Set(a.map(m => m.subject)).size).toBe(3);
    expect(missionsFor(4, 3, { ...none, aurore: true }).some(m => m.subject === 'aurore')).toBe(true);
    const m = missionsFor(1, 1, { ...none, aurore: true }).find(x => x.subject === 'aurore')!;
    const shot = scorePhoto([S(T('aurore', 0.85), 0.2, 0.2, 0.4)], night);
    expect(fulfils(m, shot, night)).toBe(true); expect(fulfils(m, shot, golden)).toBe(false);
  });
});
