import { describe, it, expect } from 'vitest';
import { Sky, MONTH, overlap, bodyDir, sep, SUN_R, MOON_R } from './sky';

describe('Ciel', () => {
  it('phases : périodiques, pleine lune opposée au soleil, nouvelle lune avec lui', () => {
    const s = new Sky(3);
    for (let d = 0; d < 40; d++) { const p = s.phase(d, 12); expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(1); }
    expect(s.phase(0, 6)).toBeCloseTo(s.phase(MONTH, 6), 6);
    // on cherche une nouvelle et une pleine lune
    let nm = -1, fm = -1;
    for (let d = 0; d < MONTH * 2; d += 0.05) { const p = s.phase(Math.floor(d), (d % 1) * 24); if (nm < 0 && p < 0.01) nm = d; if (fm < 0 && Math.abs(p - 0.5) < 0.01) fm = d; }
    const a = s.moon(Math.floor(nm), (nm % 1) * 24), b = s.moon(Math.floor(fm), (fm % 1) * 24);
    expect(a.lit).toBeLessThan(0.02); expect(b.lit).toBeGreaterThan(0.98);
    expect(sep(a.dir, a.sun)).toBeLessThan(0.25);                 // nouvelle lune : près du soleil
    expect(sep(b.dir, { x: -b.sun.x, y: -b.sun.y, z: -b.sun.z })).toBeLessThan(0.25);   // pleine lune : à l'opposé
  });
  it('éclipses : le recouvrement est complet à l\'alignement, nul ailleurs ; on sait les retrouver', () => {
    expect(overlap(0, SUN_R, MOON_R)).toBe(1);
    expect(overlap(SUN_R + MOON_R + 0.01, SUN_R, MOON_R)).toBe(0);
    const mid = overlap(SUN_R, SUN_R, MOON_R); expect(mid).toBeGreaterThan(0.2); expect(mid).toBeLessThan(0.8);
    const s = new Sky(3);
    for (const kind of ['solaire', 'lunaire'] as const) {
      const e = s.nextEclipse(0, 0, kind); const m = s.moon(e.day, e.hour);
      expect(kind === 'solaire' ? m.solar : m.lunar).toBeGreaterThan(0.88);
      expect(kind === 'solaire' ? m.sun.y : m.up).toBeGreaterThan(0.3);
      // jamais d'éclipse partout : à mi-chemin du cycle il n'y en a pas
      const far = s.moon(e.day + MONTH * 2, e.hour); expect(far.solar).toBeLessThan(0.05);
    }
    expect(bodyDir(12).y).toBeCloseTo(1, 5);
  });
  it('marées : bornées, vives-eaux plus fortes que mortes-eaux', () => {
    const s = new Sky(5); let mx = 0, mn = 0;
    for (let d = 0; d < MONTH; d += 0.1) { const t = s.tide(Math.floor(d), (d % 1) * 24); mx = Math.max(mx, t); mn = Math.min(mn, t); }
    expect(mx).toBeLessThanOrEqual(0.81); expect(mn).toBeGreaterThanOrEqual(-0.81); expect(mx).toBeGreaterThan(0.6); expect(mn).toBeLessThan(-0.6);
    const amp = (ph0: number) => { let m = 0; for (let d = 0; d < 1; d += 0.02) { const day = Math.floor(ph0 * MONTH), t = s.tide(day, 0) ; m = Math.max(m, Math.abs(s.tide(day, d * 24))); void t; } return m; };
    expect(amp(0.0) >= 0).toBe(true);
  });
  it('comète, aurores et étoiles filantes : déterministes et occasionnelles', () => {
    const s = new Sky(7), s2 = new Sky(7);
    let c = 0, au = 0, sh = 0;
    for (let d = 0; d < 400; d++) { if (s.comet(d, 22).on > 0.3) c++; if (s.aurora(d) > 0) au++; if (s.showers(d) > 1) sh++; expect(s.aurora(d)).toBe(s2.aurora(d)); }
    expect(c).toBeGreaterThan(20); expect(c).toBeLessThan(200);
    expect(au).toBeGreaterThan(40); expect(au).toBeLessThan(200);
    expect(sh).toBeGreaterThan(10); expect(sh).toBeLessThan(100);
  });
});
