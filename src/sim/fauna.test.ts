import { describe, it, expect } from 'vitest';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { buildRoads } from './roads';
import { Fauna } from './fauna';
import { generateLayout } from './worldgen';
import { planPois, RUNWAY } from './pois';

describe('Faune', () => {
  for (const seed of [1, 3, 7]) it(`monde ${seed} : troupeaux à l'écart des voies, mouvement borné`, () => {
    const def = generateLayout(seed), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp);
    const pois = planPois(t, wp, roads.dist, seed), f = new Fauna(t, wp, roads.dist, seed, 2200, { airfield: pois.find(p => p.kind === 'aérodrome'), guides: w.net.guides });
    expect(f.herds.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 600; i++) f.step(1);
    for (const a of f.animals) {
      expect(wp.trackD(a.x, a.z)).toBeGreaterThan(25);
      expect(roads.dist(a.x, a.z)).toBeGreaterThan(15);
      expect(Math.hypot(a.x - f.herds[a.herd].x, a.z - f.herds[a.herd].z)).toBeLessThan(f.herds[a.herd].r + 24);
    }
    expect(Number.isFinite(f.plane.x + f.plane.y + f.plane.z)).toBe(true);
  });
  it('un train qui approche fait fuir les animaux et envoler les oiseaux posés ; l\'avion atterrit, patiente, décolle', () => {
    const seed = 3, def = generateLayout(seed), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp);
    const pois = planPois(t, wp, roads.dist, seed), air = { kind: 'aérodrome' as const, name: 'test', x: 200, y: t.height(200, 200), z: 200, rot: 0.2, r: 60 }; void pois;
    const f = new Fauna(t, wp, roads.dist, seed, 2200, { airfield: air, guides: w.net.guides });
    expect(f.perched.length).toBeGreaterThan(5);
    const b = f.perched[0], a = f.animals[0];
    for (let i = 0; i < 100; i++) f.step(0.1, []);
    expect(f.perched.every(p => p.state === 'posé')).toBe(true);
    const x0 = a.x, z0 = a.z;
    for (let i = 0; i < 80; i++) f.step(0.1, [{ x: b.x + 40, z: b.z, v: 30 }, { x: a.x + 60, z: a.z, v: 30 }]);
    expect(b.state).not.toBe('posé');
    expect(Math.hypot(a.x - x0, a.z - z0)).toBeGreaterThan(8);
    for (let i = 0; i < 400; i++) f.step(0.1, []);
    expect(f.perched.every(p => p.state === 'posé')).toBe(true);
    if (air) {
      const modes = new Set<string>(); let maxAlt = 0;
      for (let i = 0; i < 20 * 60 * 15; i++) { f.step(0.05, []); modes.add(f.plane.mode);
        if (f.plane.mode !== 'vol') { const dx = f.plane.x - air.x, dz = f.plane.z - air.z, pp = dx * Math.sin(air.rot) + dz * Math.cos(air.rot), qq = dx * Math.cos(air.rot) - dz * Math.sin(air.rot); expect(Math.abs(pp)).toBeLessThanOrEqual(RUNWAY.len / 2 + 6); expect(Math.abs(qq)).toBeLessThanOrEqual(RUNWAY.wid / 2); } maxAlt = Math.max(maxAlt, f.plane.y - air.y); expect(Number.isFinite(f.plane.y)).toBe(true); }
      expect([...modes]).toEqual(expect.arrayContaining(['vol', 'roulage', 'parqué', 'décollage']));
      expect(f.landings).toBeGreaterThanOrEqual(2);
      expect(maxAlt).toBeGreaterThan(100);
    }
  });
});
