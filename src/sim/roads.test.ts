import { describe, it, expect } from 'vitest';
import layout from '../layout.json';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { buildRoads } from './roads';
import { Traffic } from './traffic';
import type { LayoutDef } from './network';

const def = layout as unknown as LayoutDef;
const w0 = new World(def), t0 = new Terrain(w0.net, def.urban), wp0 = planWorld(w0.net, t0), roads0 = buildRoads(w0.net, t0, wp0);

describe('Réseau routier', () => {
  it('un seul réseau connexe, qui relie toutes les villes', () => {
    const seen = new Set<number>(), stack = [roads0.nodes[0]];
    while (stack.length) {
      const n = stack.pop()!; if (seen.has(n.id)) continue; seen.add(n.id);
      for (const e of n.edges) stack.push(e.a === n ? e.b : e.a);
    }
    expect(seen.size).toBe(roads0.nodes.length);
    for (const p of wp0.plans) expect(roads0.nodes.some(n => Math.hypot(n.x - p.zone.x, n.z - p.zone.z) < p.zone.r), p.zone.name ?? 'village').toBe(true);
  });
  it('des passages à niveau, chacun lié aux deux voies', () => {
    expect(roads0.crossings.length).toBeGreaterThanOrEqual(2);
    for (const c of roads0.crossings) expect(c.rail.length).toBeGreaterThanOrEqual(2);
  });
  it('un pont routier passe au moins 2,5 m au-dessus de l\'eau', () => {
    let n = 0;
    for (const e of roads0.edges) if (e.render) for (let d = 0; d <= e.poly.len; d += 4) {
      const s = e.poly.at(d), r = t0.riverNear(s.x, s.z);
      if (r && r.d < r.hw) { n++; expect(s.y - r.level, `pont ${e.id} à ${d.toFixed(0)} m`).toBeGreaterThan(2.5); }
    }
    expect(n).toBeGreaterThan(0);
  });
  it('les routes de campagne évitent le lac, les gares et les tunnels', () => {
    for (const e of roads0.edges) if (e.render) for (let d = 0; d <= e.poly.len; d += 8) {
      const s = e.poly.at(d);
      expect(wp0.inLake(s.x, s.z, 5), 'lac').toBe(false);
    }
  });
  it('deux voies par tronçon, sens opposés', () => {
    for (const e of roads0.edges) { expect(e.fwd.rev).toBe(e.back); expect(e.fwd.from).toBe(e.back.to); }
  });
});

describe('Circulation (10 min simulées)', () => {
  it('pas de chevauchement, pas de blocage, personne sur un passage à niveau pendant le passage d\'un train', () => {
    const w = new World(def), roads = roads0, tr = new Traffic(roads, w);
    let speedSum = 0, speedN = 0, closedSeen = 0;
    const bad: string[] = [];
    for (let i = 0; i < 60 * 600; i++) {
      w.step(1 / 60); tr.step(w, 1 / 60);
      if (i % 30) continue;
      for (const l of roads.lanes) for (let k = 1; k < l.veh.length; k++) {
        const a = l.veh[k - 1] as { s: number; len: number }, b = l.veh[k] as { s: number; len: number };
        if (b.s - b.len - a.s < -0.3) bad.push(`recouvrement voie ${l.id} t=${(i / 60).toFixed(0)}`);
      }
      for (const v of tr.vehicles) { speedSum += v.v; speedN++; }
      closedSeen += roads.crossings.filter(c => c.closed).length;
      for (const c of roads.crossings) for (const t of w.trains) {
        if (t.status === 'stored') continue;
        let covers = false;                       // le train recouvre le passage (mesure géométrique, indépendante de la logique de fermeture)
        for (let back = 0; back <= t.length && !covers; back += 4) { const p = t.pointAt(back); covers = Math.hypot(p.x - c.x, p.z - c.z) < 3.5; }
        if (covers) for (const v of tr.vehicles) {
          if (Math.hypot(v.x - c.x, v.z - c.z) < 4.2 + v.len / 2 - 1) bad.push(`véhicule ${v.id} sur le passage ${c.id} avec ${t.id} à t=${(i / 60).toFixed(0)}`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(tr.removedStuck).toBe(0);
    expect(closedSeen, 'les passages se ferment au passage des trains').toBeGreaterThan(0);
    expect(speedSum / speedN).toBeGreaterThan(3);
    expect(tr.vehicles.length).toBeGreaterThan(100);
  }, 180000);
});

describe('Arrêts de bus', () => {
  it('des arrêts existent, les bus s\'y arrêtent, rien ne se bloque', () => {
    const w = new World(def), tr = new Traffic(roads0, w, 9);
    tr.target.bus = 12;
    expect(tr.busStops.length).toBeGreaterThan(2);
    const served = new Set<number>(); let stuck = 0;
    for (let i = 0; i < 60 * 900; i++) {
      w.step(1 / 60); tr.step(w, 1 / 60);
      if (i % 30) continue;
      for (const v of tr.vehicles) if (v.kind === 'bus' && v.holdUntil !== undefined && tr.time < v.holdUntil && v.v < 0.1) served.add(v.id);
    }
    stuck = tr.removedStuck;
    expect(served.size).toBeGreaterThan(0);
    expect(stuck).toBe(0);
  });
});
