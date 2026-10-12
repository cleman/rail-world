import { describe, it, expect } from 'vitest';
import layout from '../layout.json';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { buildRoads } from './roads';
import { Traffic } from './traffic';
import type { LayoutDef } from './network';

describe('Ronds-points', () => {
  it('chaque grande ville a un anneau à sens unique, personne ne le prend à contresens, et il ne se bloque pas', () => {
    const def = layout as unknown as LayoutDef, w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), r = buildRoads(w.net, t, wp);
    const rings = wp.plans.filter(p => p.streets.some(s => s.oneWay));
    expect(rings.length).toBeGreaterThanOrEqual(3);
    const oneWay = r.edges.filter(e => e.oneWay); expect(oneWay.length).toBeGreaterThan(8);
    expect(oneWay.every(e => e.back.noEntry && !e.fwd.noEntry)).toBe(true);
    const tr = new Traffic(r, w, 9); let wrong = 0, onRing = 0;
    for (let i = 0; i < 60 * 300; i++) {
      w.step(1 / 60); tr.step(w, 1 / 60);
      if (i % 30) continue;
      for (const v of tr.vehicles) { if (v.lane.noEntry) wrong++; if (v.lane.edge.oneWay) onRing++; }
    }
    expect(wrong).toBe(0); expect(onRing).toBeGreaterThan(0); expect(tr.removedStuck).toBe(0);
  });
});
