import { describe, it, expect } from 'vitest';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { buildRoads } from './roads';
import { planPois } from './pois';
import { generateLayout } from './worldgen';

describe('Points d\'intérêt', () => {
  for (const seed of [1, 3, 7]) it(`monde ${seed} : château, phare, ruine et moulin, loin de tout`, () => {
    const w = new World(generateLayout(seed)), t = new Terrain(w.net, generateLayout(seed).urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp);
    const a = planPois(t, wp, roads.dist, seed), b = planPois(t, wp, roads.dist, seed);
    expect(a).toEqual(b);
    expect(a.map(p => p.kind)).toEqual(expect.arrayContaining(['château', 'phare', 'ruine', 'moulin']));
    for (const p of a) {
      expect(wp.trackD(p.x, p.z), p.name).toBeGreaterThan(p.r + 80);
      if (p.kind !== 'port') expect(wp.inLake(p.x, p.z, p.r), p.name).toBe(false);
      for (const q of a) if (q !== p) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(300);
    }
  });
});
