import { describe, it, expect } from 'vitest';
import { Fpv, rateCurve, PRESETS } from './fpv';

const flat = (y = 0) => (_x: number, _z: number) => ({ y, wet: false });
const run = (f: Fpv, t: number, inp: { roll?: number; pitch?: number; yaw?: number; thr?: number }) => { for (let i = 0; i < Math.round(t * 240); i++) f.step(1 / 240, { roll: 0, pitch: 0, yaw: 0, thr: 0, ...inp }); };

describe('Drone FPV', () => {
  it('courbe de taux : nulle au centre, symétrique, croissante, plafonnée raisonnablement', () => {
    expect(rateCurve(0, 1.3, 0.7, 0.1)).toBe(0);
    expect(rateCurve(0.5, 1.3, 0.7, 0.1)).toBeCloseTo(-rateCurve(-0.5, 1.3, 0.7, 0.1), 6);
    expect(rateCurve(1, 1.3, 0.7, 0.1)).toBeGreaterThan(rateCurve(0.5, 1.3, 0.7, 0.1));
    expect(rateCurve(1, 1.3, 0.7, 0.1)).toBeGreaterThan(600); expect(rateCurve(1, 1.3, 0.7, 0.1)).toBeLessThan(1200);
  });
  for (const p of PRESETS) it(`${p.name} : le manche centré fait stationner, plein gaz monte, roulis commandé ≈ taux × durée`, () => {
    const f = new Fpv(flat(0)); f.setPreset(PRESETS.indexOf(p)); f.reset(0, 0, 0, 100); f.arm(true); f.state = 'vol';
    run(f, 3, { thr: 0 }); expect(Math.abs(f.vy)).toBeLessThan(0.1); expect(Math.abs(f.y - 100)).toBeLessThan(0.5);
    run(f, 1, { thr: 1 }); expect(f.vy).toBeGreaterThan(5);
    const g = new Fpv(flat(0)); g.setPreset(PRESETS.indexOf(p)); g.reset(0, 0, 0, 200); g.arm(true); g.state = 'vol';
    run(g, 0.2, { roll: 1, thr: 0 }); const r = g.q; expect(Math.hypot(...r)).toBeCloseTo(1, 6);
    expect(Math.abs(g.up[1])).toBeLessThan(0.99);       // il a bien roulé
  });
  it('en inclinant le nez en avant (manche), le drone accélère vers l\'avant, sans dépasser sa vitesse limite', () => {
    const f = new Fpv(flat(0)); f.reset(0, 0, 0, 100); f.arm(true); f.state = 'vol';
    f.mode = 'stabilisé'; run(f, 6, { pitch: 1, thr: 0.5 });
    const fw = f.forward; expect(f.speed).toBeGreaterThan(8); expect(f.speed).toBeLessThan(60); expect(Number.isFinite(f.x + f.y + f.z)).toBe(true);
    expect(f.vz * fw[2] + f.vx * fw[0]).toBeGreaterThan(0);
  });
  it('désarmé : il tombe ; au sol sans gaz il reste posé ; un choc violent le brise puis il revient au point de départ', () => {
    const f = new Fpv(flat(0)); f.reset(5, 5, 0.5); run(f, 2, { thr: 1 }); expect(f.y).toBeLessThan(0.2); expect(f.state).toBe('sol');
    const g = new Fpv(flat(0)); g.reset(0, 0, 0, 120); g.arm(true); g.state = 'vol'; g.vy = -30; for (let i = 0; i < 240 * 20 && (g.state as string) !== 'écrasé'; i++) g.step(1 / 240, { roll: 0, pitch: 0, yaw: 0, thr: -1 }); expect(g.state).toBe('écrasé'); const c = g.crashes; expect(c).toBe(1);
    run(g, 3, {}); expect(g.state).toBe('sol'); expect(g.x).toBe(0);
  });
  it('l\'eau détruit le drone', () => {
    const f = new Fpv((_x, _z) => ({ y: 0, wet: true })); f.reset(0, 0, 0, 20); f.arm(true); f.state = 'vol'; run(f, 4, { thr: -1 }); expect(f.state).toBe('écrasé'); expect(f.crashWhy).toContain('eau');
  });
  it('dans un tunnel : le plafond arrête la montée (sans casser le drone à faible vitesse), le sol porte', () => {
    const f = new Fpv((_x, _z, y) => (y !== undefined ? { y: 0, wet: false, ceil: 6 } : { y: 0, wet: false })); f.reset(0, 0, 0, 3); f.arm(true); f.state = 'vol';
    run(f, 6, { thr: 0.05 });
    expect(f.state).toBe('vol'); expect(f.y).toBeLessThanOrEqual(6); expect(f.y).toBeGreaterThan(3);
    run(f, 4, { thr: -1 }); expect(f.y).toBeGreaterThanOrEqual(0);
  });
});

describe('sens des manches', () => {
  it('lacet à droite = virage à droite ; roulis à droite = aile droite en bas ; manche en avant = nez en bas', () => {
    const mk = () => { const g = new Fpv(flat(0)); g.reset(0, 0, 0, 30); g.arm(true); g.mode = 'acro'; return g; };
    const turn = (inp: { roll?: number; pitch?: number; yaw?: number }) => { const g = mk(), f0 = [...g.forward]; for (let i = 0; i < 120; i++) g.step(1 / 240, { roll: 0, pitch: 0, yaw: 0, thr: 0, ...inp }); const f1 = g.forward, u = g.up; return { left: f0[2] * f1[0] - f0[0] * f1[2], dp: f1[1], rightUp: u[0] * -f0[2] + u[2] * f0[0] }; };
    expect(turn({ yaw: 1 }).left).toBeLessThan(0);
    expect(turn({ roll: 1 }).rightUp).toBeGreaterThan(0);
    expect(turn({ pitch: 1 }).dp).toBeLessThan(0);
  });
});
