import { describe, it, expect } from 'vitest';
import { startPlayer, noInput, FlyPlayer, type PlayWorld, type PlayKind } from './play';

const world = (extra: Partial<PlayWorld> = {}): PlayWorld => ({ ground: () => 20, surface: () => ({ y: 20, wet: false }), field: { x: 0, y: 20, z: 0, rot: 0.5 }, launch: { x: 0, y: 20, z: 0, hdg: 0.5 }, ...extra });
const run = (p: ReturnType<typeof startPlayer>, sec: number, f: (t: number) => Partial<ReturnType<typeof noInput>>) => { for (let i = 0; i < sec * 20; i++) { p.step(0.05, { ...noInput(), ...f(i * 0.05) }); } };

describe('Modes jouables', () => {
  it('course : trot, sprint, essoufflement ; vélo et cheval accélèrent', () => {
    const r = startPlayer('course', world(), { x: 0, z: 0, yaw: 0 }); run(r, 6, () => ({ fwd: 1 })); const jog = r.v;
    run(r, 6, () => ({ fwd: 1, run: true })); expect(r.v).toBeGreaterThan(jog + 2); expect(r.z).toBeGreaterThan(40);
    run(r, 40, () => ({ fwd: 1, run: true })); expect(r.v).toBeLessThan(5);                          // plus de souffle
    const b = startPlayer('vélo', world(), { x: 0, z: 0, yaw: 0 }); run(b, 12, () => ({ fwd: 1 })); expect(b.v).toBeGreaterThan(8); run(b, 4, () => ({ brake: true })); expect(b.v).toBeLessThan(1);
    const h = startPlayer('cheval', world(), { x: 0, z: 0, yaw: 0 }) as unknown as { gear: number; v: number; step: Function };
    for (let k = 0; k < 4; k++) { h.step(0.05, { ...noInput(), gearUp: true }); } run(h as never, 8, () => ({})); expect(h.gear).toBe(4); expect(h.v).toBeGreaterThan(9);
  });
  it('on ne marche pas dans l\'eau ; l\'aviron reste sur l\'eau', () => {
    const w = world({ surface: (x: number) => ({ y: 20, wet: x > 10 }) });
    const r = startPlayer('course', w, { x: 0, z: 0, yaw: Math.PI / 2 }); run(r, 10, () => ({ fwd: 1, run: true })); expect(r.x).toBeLessThan(10.5);
    const a = startPlayer('aviron', w, { x: 30, z: 0, yaw: -Math.PI / 2 }); run(a, 20, () => ({ fwd: 1 })); expect(a.x).toBeGreaterThan(9.5);
  });
  it('planeur : treuillage, ascendance en spirale (on gagne de la hauteur), atterrissage doux', () => {
    const th = { x: 900, z: 300, r: 100, w: 3 };
    const p = startPlayer('planeur', world({ thermals: [th] }), { x: 0, z: 0, yaw: 0 }) as FlyPlayer;
    run(p, 1, () => ({ action: true })); expect(p.state).toBe('treuil'); run(p, 25, () => ({})); expect(p.state).toBe('vol'); expect(p.agl).toBeGreaterThan(250);
    // pilote automatique : vers l'ascendance puis spirale
    let maxAgl = 0;
    run(p, 500, () => {
      const d = Math.hypot(th.x - p.x, th.z - p.z), want = Math.atan2(th.x - p.x, th.z - p.z); let dh = want - p.yaw; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      maxAgl = Math.max(maxAgl, p.agl);
      if (d > th.r * 1.2) return { roll: Math.max(-0.5, Math.min(0.5, -dh * 1.5)) }; return { roll: -0.85, pitch: 0.6 };   // roll > 0 = droite = cap qui diminue
    });
    expect(maxAgl).toBeGreaterThan(450);
    // descente sans rien faire (hors ascendance) puis atterrissage
    p.x = -3000; p.z = -3000; p.state = 'vol'; run(p, 2000, () => ({})); expect(p.state).toBe('sol');
  });
  it('avion : roulage, décollage et montée', () => {
    const p = startPlayer('avion', world(), { x: 0, z: 0, yaw: 0 }) as FlyPlayer;
    run(p, 14, () => ({ run: true })); expect(p.v).toBeGreaterThan(26); run(p, 20, () => ({ run: true, pitch: 0.3 }));
    expect(p.state).toBe('vol'); expect(p.agl).toBeGreaterThan(60); expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
    run(p, 30, () => ({ pitch: 1.0, thr: -1 })); expect(p.state === 'vol' || p.state === 'crash' || p.state === 'sol').toBe(true);     // le décrochage ne produit pas de NaN
    expect(Number.isFinite(p.v + p.y)).toBe(true);
  });
  it('parapente : course de décollage puis vol plané', () => {
    const p = startPlayer('parapente', world(), { x: 0, z: 0, yaw: 0 }) as FlyPlayer;
    run(p, 1, () => ({ action: true })); run(p, 6, () => ({ action: true })); expect(p.state).toBe('vol'); run(p, 5, () => ({}));
    expect(p.v).toBeGreaterThan(7); const kinds: PlayKind[] = ['course', 'vélo', 'cheval', 'aviron', 'planeur', 'avion', 'parapente']; expect(kinds.length).toBe(7);
  });
});
