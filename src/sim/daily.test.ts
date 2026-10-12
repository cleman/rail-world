import { describe, it, expect } from 'vitest';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { generateLayout } from './worldgen';
import { DailyLife, planCrossings } from './daily';
import { buildRoads } from './roads';

describe('Vie quotidienne', () => {
  it('marché le matin, terrasses en journée, écoliers aux heures de classe ; rien sous la pluie ni la nuit', () => {
    const def = generateLayout(3), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), d = new DailyLife(wp.plans, (x, z) => t.height(x, z), 80);
    expect(d.places.length).toBeGreaterThan(2);
    const run = (h0: number, h1: number, rain = 0) => { let mx = { seated: 0, shoppers: 0, pupils: 0 }; for (let h = h0; h < h1; h += 0.002) { d.step(1, h, rain); mx = { seated: Math.max(mx.seated, d.counts.seated), shoppers: Math.max(mx.shoppers, d.counts.shoppers), pupils: Math.max(mx.pupils, d.counts.pupils) }; for (const f of d.list) expect(Number.isFinite(f.x + f.y + f.z)).toBe(true); } return mx; };
    const night = run(1, 5); expect(night).toEqual({ seated: 0, shoppers: 0, pupils: 0 });
    const school = run(7.8, 8.8); expect(school.pupils).toBeGreaterThan(0);
    const day = run(9, 12); expect(day.shoppers).toBeGreaterThan(0); expect(day.seated).toBeGreaterThan(0);
    const wet = run(9, 12, 0.8); expect(wet.shoppers + wet.seated).toBe(0);
    const eve = run(16.2, 17.2); expect(eve.pupils).toBeGreaterThan(0);
  });
  it('passages piétons : placés sur des carrefours, piétons qui traversent, attendent les véhicules ; enfants plus petits ; clients assis', () => {
    const def = generateLayout(3), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp);
    const cr = planCrossings(roads, 60, 3); expect(cr.crossings.length).toBeGreaterThan(10);
    const d = new DailyLife(wp.plans, (x, z) => t.height(x, z), 80, cr.crossings);
    let crossed = 0, kids = 0, sat = 0;
    const mid = cr.crossings[0], block = [{ x: (mid.ax + mid.bx) / 2, z: (mid.az + mid.bz) / 2 }];
    for (let h = 8; h < 21; h += 0.003) { d.step(1, h, 0, h > 20 ? block : []); crossed = Math.max(crossed, d.counts.crossing); for (const f of d.list) { if (f.sit) sat++; if (f.size && f.size < 1) kids++; expect(Number.isFinite(f.x + f.z)).toBe(true); expect(f.size ?? 1).toBeGreaterThan(0.5); expect(f.size ?? 1).toBeLessThanOrEqual(1.2); } }
    expect(crossed).toBeGreaterThan(2); expect(sat).toBeGreaterThan(0); expect(kids).toBeGreaterThan(0);
  });
});
