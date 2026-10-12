import { describe, it, expect } from 'vitest';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { buildRoads } from './roads';
import { Traffic } from './traffic';
import { StreetLife } from './streetlife';
import { generateLayout } from './worldgen';

describe('Vie de quartier', () => {
  it('voyageurs aux arrêts, livreurs et ouvriers : ils apparaissent, bougent et restent bornés', () => {
    const seed = 3, def = generateLayout(seed), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp);
    const tr = new Traffic(roads, w, 5), life = new StreetLife(tr, w.net, 31);
    tr.target.bus = 10; tr.target.truck = 30; tr.target.car = 80;
    expect(tr.dropStops.length).toBeGreaterThan(3);
    let maxList = 0, courierSeen = 0;
    for (let k = 0; k < 60 * 900; k++) {
      w.step(1 / 60); tr.updateCrossings(w, 1 / 60); tr.step(w, 1 / 60, false); life.step(1 / 60, 8.2);
      maxList = Math.max(maxList, life.list.length);
      if (k % 30 === 0) for (const f of life.list) { expect(Number.isFinite(f.x + f.y + f.z)).toBe(true); }
      if (k % 600 === 0) courierSeen = Math.max(courierSeen, life.deliveries);
    }
    expect(life.boarded).toBeGreaterThan(0);
    expect(life.deliveries).toBeGreaterThan(0);
    expect(maxList).toBeLessThan(400);
    expect(tr.removedStuck).toBeLessThanOrEqual(2);
    console.log('montées', life.boarded, 'livraisons', life.deliveries, 'max figurants', maxList, 'bloqués retirés', tr.removedStuck);
  });
});
