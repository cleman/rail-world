import { describe, it, expect } from 'vitest';
import layout from './layout.json';
import { World } from './sim/world';
import { Terrain } from './sim/terrain';
import type { LayoutDef } from './sim/network';
import { planCity, rng, type Env } from './city';

// le monde d'origine sans sa corde : ces tests portent sur la boucle seule (la corde a ses propres tests dans chord.test.ts)
const full = layout as unknown as LayoutDef;
const def: LayoutDef = { ...full, chords: undefined, branches: undefined, circuits: full.circuits.filter(c => !c.via), urban: full.urban!.filter(u => !['Centre', 'Roquemaure', 'Bois-Joli'].includes(u.station ?? '')) };
const w = new World(def), terrain = new Terrain(w.net, def.urban);
const pts = w.net.guides.filter((_, i) => i % 2 === 0);
const env: Env = {
  trackD: (x, z) => Math.sqrt(Math.min(...pts.map(p => (p.x - x) ** 2 + (p.z - z) ** 2))),
  riverD: (x, z) => { const r = terrain.riverNear(x, z); return r ? r.d - r.hw - 2.5 : 1e9; },
};

describe('Villes', () => {
  const plans = terrain.zones.filter(z => z.kind !== 'depot').map(z => planCity(z, rng(Math.round(z.x * 7 + z.z * 13)), env));
  it('chaque ville et village a un réseau de rues', () => {
    for (const p of plans) expect(p.streets.length, p.zone.name).toBeGreaterThanOrEqual(p.village ? 4 : 10);
  });
  it('le plan est irrégulier : peu de rues alignées sur une grille', () => {
    for (const p of plans.filter(x => !x.village)) {
      let aligned = 0;
      for (const s of p.segs) {
        const a = ((Math.atan2(s.bz - s.az, s.bx - s.ax) * 180) / Math.PI + 720) % 90;
        if (a < 6 || a > 84) aligned++;
      }
      expect(aligned / p.segs.length, p.zone.name).toBeLessThan(0.3);
    }
  });
  it('aucune rue ne touche la voie ferrée ni la rivière', () => {
    for (const p of plans) for (const s of p.streets) for (const [x, z] of s.pts) {
      expect(env.trackD(x, z), p.zone.name).toBeGreaterThan(25);
      expect(env.riverD(x, z), p.zone.name).toBeGreaterThan(13);
    }
  });
  it('le plan est déterministe', () => {
    const z = plans[0].zone, a = planCity(z, rng(5), env), b = planCity(z, rng(5), env);
    expect(a.streets.length).toBe(b.streets.length);
    expect(a.segs[a.segs.length - 1]).toEqual(b.segs[b.segs.length - 1]);
  });
});
