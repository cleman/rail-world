import { describe, it, expect } from 'vitest';
import { generateLayout, checkLayout } from './worldgen';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { buildRoads } from './roads';
import { Traffic } from './traffic';

describe('Génération procédurale', () => {
  it('est déterministe : même graine, même monde', () => {
    expect(JSON.stringify(generateLayout(12345))).toBe(JSON.stringify(generateLayout(12345)));
  });
  it('des graines différentes donnent des mondes différents', () => {
    const a = generateLayout(1), b = generateLayout(2);
    expect(JSON.stringify(a.centerline)).not.toBe(JSON.stringify(b.centerline));
    expect(JSON.stringify(a.rivers)).not.toBe(JSON.stringify(b.rivers));
    expect(a.terrain!.seed).not.toBe(b.terrain!.seed);
  });
  it('40 graines donnent toutes un monde valide (courbes, gares droites, ouvrages d\'art, zones, lac)', () => {
    for (let s = 1; s <= 40; s++) {
      const def = generateLayout(s), c = checkLayout(def);
      expect(c.problems, `graine ${s}`).toEqual([]);
      expect(def.stations.length).toBeGreaterThanOrEqual(3);
      expect((def.chords?.length ?? 0) + (def.branches?.length ?? 0), `graine ${s} : ligne secondaire`).toBeGreaterThanOrEqual(1);
      expect(def.circuits.filter(c => c.via?.length).length).toBeGreaterThanOrEqual(1);
      expect(def.urban!.filter(u => u.village).length).toBeGreaterThanOrEqual(3);
    }
  }, 400000);
  it('monde complet : routes connexes, villes reliées, trafic sans chevauchement (3 graines)', () => {
    for (const s of [3, 17, 54, 91, 120]) {
      const def = generateLayout(s), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), r = buildRoads(w.net, t, wp);
      const seen = new Set<number>(), st = [r.nodes[0]];
      while (st.length) { const n = st.pop()!; if (seen.has(n.id)) continue; seen.add(n.id); for (const e of n.edges) st.push(e.a === n ? e.b : e.a); }
      expect(seen.size, `graine ${s} connexe`).toBe(r.nodes.length);
      for (const p of wp.plans) expect(r.nodes.some(n => Math.hypot(n.x - p.zone.x, n.z - p.zone.z) < p.zone.r), `graine ${s} ${p.zone.name}`).toBe(true);
      expect(w.net.lines.length, `graine ${s} : lignes`).toBe(1 + (def.chords?.length ?? 0) + (def.branches?.length ?? 0));
      const extra = [...(def.chords ?? []).flatMap(c => c.stations!.map(q => q.name)), ...(def.branches ?? []).flatMap(b => [...(b.origin ? [b.origin] : []), ...b.loops!.map(l => l.name), b.terminus])];
      for (const n of extra) expect(w.circuits.some(c => c.served.includes(n)), `graine ${s} : ${n} desservie`).toBe(true);
      const tr = new Traffic(r, w, s + 5);
      let over = 0;
      for (let i = 0; i < 60 * 600; i++) {
        w.step(1 / 60); tr.step(w, 1 / 60);
        for (const e of w.net.edges) if (e.occupants.size > 1) throw new Error(`graine ${s} : deux trains dans le canton ${e.id}`);
        if (i % 60 === 0) for (const l of r.lanes) for (let j = 1; j < l.veh.length; j++) { const a = l.veh[j - 1] as any, b = l.veh[j] as any; if (b.s - b.len - a.s < -0.3) over++; }
      }
      expect(over, `graine ${s}`).toBe(0);
      expect(tr.vehicles.length).toBeGreaterThan(30);
    }
  }, 400000);
});
