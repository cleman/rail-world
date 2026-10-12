import { describe, it, expect } from 'vitest';
import { World } from './world';
import { Terrain } from './terrain';
import { planSea, planTributary, inSea } from './water';
import { planWorld } from './planning';
import { buildRoads } from './roads';
import { planPois } from './pois';
import { Ships } from './boats';
import { rng } from './cityplan';
import { generateLayout } from './worldgen';

describe('Eau : mer, affluent, navires', () => {
  for (const s of [2, 4]) it(`monde ${s} : la côte est de l'eau, les voies restent au sec, les navires restent à flot et accostent`, () => {
    const def = generateLayout(s), w = new World(def), t0 = new Terrain(w.net, def.urban);
    const sea = planSea(t0, w.net.guides, s, 2400, rng(s ^ 0x5ea)), t = sea ? new Terrain(w.net, def.urban, 26, 110, sea) : t0;
    const tr = planTributary(t, w.net.guides, rng(s ^ 0x7b1b)); if (tr) t.addTributary(tr.points, tr.width, 'Affluent');
    if (sea) {
      for (const g of w.net.guides) expect(inSea(sea, g.x, g.z)).toBe(false);
      expect(t.height(sea.ux * (sea.c0 + 400), sea.uz * (sea.c0 + 400))).toBeLessThan(sea.level);
    }
    const wp = planWorld(w.net, t), r = buildRoads(w.net, t, wp), pois = planPois(t, wp, r.dist, s), roadPts = r.edges.flatMap(e => e.poly.pts);
    const ships = new Ships(t, wp.lakes, pois, roadPts, w.net.guides, s);
    let bad = 0, docked = 0;
    for (let i = 0; i < 60 * 900; i++) {
      ships.step(1 / 60); ships.work(1 / 60);
      if (i % 60) continue;
      for (const sh of ships.ships) {
        if (sh.hidden) continue;
        if (!Number.isFinite(sh.x + sh.z + sh.yaw)) bad += 1000;
        if (sh.phase === 'quai') docked++;
        if (sh.y - t.height(sh.x, sh.z) < 0.3 && Math.abs(sh.x) < 2300 && Math.abs(sh.z) < 2300) bad++;
      }
    }
    expect(bad).toBe(0);
    if (ships.ports.length) expect(docked).toBeGreaterThan(0);
  });
});
