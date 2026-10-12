import { describe, it, expect } from 'vitest';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { buildRoads } from './roads';
import { Traffic } from './traffic';
import { generateLayout } from './worldgen';
import { TramNet } from './tram';
import { Habitant, Routine, Walkways, collectStops, collectVehicles, type HabWorld } from './habitant';

function build(seed: number) {
  const def = generateLayout(seed), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp);
  const traffic = new Traffic(roads, w, 5); traffic.target.bus = 8;
  const trams = new TramNet(wp.plans, (x, z) => t.height(x, z), 3, roads.nodes.filter(n => n.edges.length >= 3), roads.edges); trams.bindRoads(roads.nodes); traffic.tramPrio = trams;
  const cache = new WeakMap<object, never>();
  const hw: HabWorld = {
    surface: (x, z) => ({ y: t.height(x, z), wet: false }), support: () => null, blocked: () => false,
    vehicles: () => collectVehicles(trams, traffic, w, cache as never), stops: collectStops(trams, traffic, w), roads,
  };
  return { w, t, roads, traffic, trams, hw };
}

describe('Habitant', () => {
  it('trouve des arrêts, un chemin de trottoir et monte dans un véhicule', () => {
    const { w, traffic, trams, hw, roads } = build(3);
    expect(hw.stops.length).toBeGreaterThan(3);
    const ways = new Walkways(roads); expect(ways.count).toBeGreaterThan(50);
    const hab = new Habitant(hw);
    // à pied : on avance, le sol suit
    hab.place(hw.stops[0].x, hw.stops[0].z, 0); const x0 = hab.z;
    for (let i = 0; i < 100; i++) hab.walk(0.05, { fwd: 1, side: 0, run: false });
    expect(Math.abs(hab.z - x0)).toBeGreaterThan(5);
    // on fait tourner le monde jusqu'à ce qu'un véhicule s'arrête à un arrêt, et on y monte
    let boarded = false;
    for (let k = 0; k < 60 * 400 && !boarded; k++) {
      w.step(1 / 60); traffic.step(w, 1 / 60, false); traffic.updateCrossings(w, 1 / 60); if (k % 6 === 0) trams.step(0.1, traffic.vehicles, 9);
      if (k % 30 === 0) for (const v of hw.vehicles()) if (v.stop()) { const p = v.pose(); hab.place(p.x + 2.5, p.z, 0); const b = hab.boardable(); if (b) { hab.board(b); boarded = true; break; } }
    }
    expect(boarded).toBe(true);
    expect(hab.riding).toBe(true);
    hab.update(0.1); expect(hab.prompt.length).toBeGreaterThan(3);
    // à bord : la position suit le véhicule
    const v = hab.veh!; for (let k = 0; k < 600; k++) { w.step(1 / 60); traffic.step(w, 1 / 60, false); if (k % 6 === 0) trams.step(0.1, traffic.vehicles, 9); hab.update(1 / 60); }
    const p = v.pose(); expect(Math.hypot(hab.x - p.x, hab.z - p.z)).toBeLessThan(v.halfLen + 3);
  }, 120000);

  it('déroule une journée complète : domicile, trajet, travail, retour', () => {
    const { w, traffic, trams, hw, roads } = build(3);
    const ways = new Walkways(roads), hab = new Habitant(hw), day = new Routine(hab, ways, 2);
    expect(day.start()).toBe(true);
    let hour = 7.15, rode = 0;
    for (let k = 0; k < 60 * 60 * 25 && day.phase !== 'fin'; k++) {
      w.step(1 / 60); traffic.step(w, 1 / 60, false); traffic.updateCrossings(w, 1 / 60); if (k % 6 === 0) trams.step(0.1, traffic.vehicles, hour);
      hour = (hour + 1 / 60 / 50) % 24;
      day.update(1 / 60, hour);
      if (hab.riding) rode++;
      if (day.jump) { hour = day.jump.hour; day.jump = null; day.jumped(); }
    }
    console.log(day.log.join('\n'));
    expect(day.phase).toBe('fin');
    expect(rode).toBeGreaterThan(60 * 20);
    expect(day.log.some(l => l.includes('Descente'))).toBe(true);
  }, 600000);
});

describe('Bus', () => {
  it('chaque bus a une ligne fixe : il garde son prochain arrêt jusqu\'à l\'avoir desservi', () => {
    const { w, traffic } = build(3);
    const buses = traffic.vehicles.filter(v => v.kind === 'bus'); expect(buses.length).toBeGreaterThan(2);
    const last = new Map<number, { key: unknown; d: number }>(); let kept = 0, changed = 0, served = 0;
    for (let i = 0; i < 6000; i++) {
      traffic.step(w, 0.1, false);
      if (i % 5) continue;
      for (const b of buses) {
        if (!traffic.vehicles.includes(b)) continue;
        const n = traffic.nextBusStop(b); if (!n) continue;
        const p = last.get(b.id);
        if (p) { if (p.key === n.stop) { kept++; } else { changed++; if (p.d < 40) served++; } }
        last.set(b.id, { key: n.stop, d: n.d });
      }
    }
    // l'arrêt visé ne change presque que lorsqu'on l'a atteint
    expect(kept).toBeGreaterThan(100); expect(served / Math.max(1, changed)).toBeGreaterThan(0.6);
  });
});
