import { describe, it, expect } from 'vitest';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { buildRoads } from './roads';
import { generateLayout } from './worldgen';
import { Traffic } from './traffic';
import { TramNet, TRAM_LEN } from './tram';
import { crossHalf } from './roads';

describe('Tramway', () => {
  it('petites voitures seules : elles circulent, s\'arrêtent, ne se touchent pas et laissent la place aux véhicules', () => {
    const seed = 1, def = generateLayout(seed), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp), traffic = new Traffic(roads, w, 6);
    const net = new TramNet(wp.plans, (x, z) => t.height(x, z), 3, roads.nodes.filter(n => n.edges.length >= 3), roads.edges);
    net.bindRoads(roads.nodes); traffic.tramPrio = net;
    expect(net.lines.length).toBeGreaterThan(0); expect(net.trams.length).toBeGreaterThanOrEqual(net.lines.length);
    for (const L of net.lines) { expect(L.stops.length).toBeGreaterThanOrEqual(2); if (L.loop) expect(L.trams.length).toBeGreaterThanOrEqual(2); }
    const start = net.trams.map(x => ({ x: x.x, z: x.z })), travelled = net.trams.map(() => 0), last = start.map(p => ({ ...p })); let minGap = 1e9, stops = 0, overlap = 0;
    const DT = 0.1;
    for (let i = 0; i < 6000; i++) {
      traffic.step(w, DT, false); net.step(DT, traffic.vehicles, 12);
      net.trams.forEach((x, k) => {
        expect(Number.isFinite(x.x + x.y + x.z)).toBe(true); expect(x.s).toBeGreaterThanOrEqual(0); expect(x.s).toBeLessThanOrEqual(x.line.len);
        travelled[k] += Math.hypot(x.x - last[k].x, x.z - last[k].z); last[k] = { x: x.x, z: x.z }; if (x.state === 'arrêt') stops++;
        for (let j = k + 1; j < net.trams.length; j++) minGap = Math.min(minGap, Math.hypot(x.x - net.trams[j].x, x.z - net.trams[j].z));
        for (const v of traffic.vehicles) { const dx = v.x - x.x, dz = v.z - x.z; if (dx * dx + dz * dz > 40) continue; const hx = Math.sin(x.yaw), hz = Math.cos(x.yaw); if (Math.abs(dx * hx + dz * hz) < TRAM_LEN / 2 && Math.abs(-dx * hz + dz * hx) < 0.9) overlap++; }
      });
    }
    expect(travelled.every(d => d > 150)).toBe(true);
    expect(stops).toBeGreaterThan(20);
    expect(minGap).toBeGreaterThan(7);
    expect(overlap).toBeLessThan(300);     // les véhicules cèdent au tram (reste : bus en virage et véhicules croisés dans les carrefours, quelques dixièmes de seconde)
  });
  it('grandes villes : boucle avec plusieurs trams qui se suivent à distance, arrêts desservis', () => {
    const seed = 3, def = generateLayout(seed), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp);
    const net = new TramNet(wp.plans, (x, z) => t.height(x, z), 3, roads.nodes.filter(n => n.edges.length >= 3), roads.edges);
    const loops = net.lines.filter(l => l.loop); expect(loops.length).toBeGreaterThan(0);
    expect(Math.max(...loops.map(l => l.len))).toBeGreaterThan(700);   // grande boucle, pas un simple îlot
    for (const L of loops) { expect(L.hw).toBeGreaterThan(2); expect(L.trams.length).toBeGreaterThanOrEqual(2); expect(L.stops.length).toBeGreaterThanOrEqual(3); }
    let minGap = 1e9; const served = new Set<number>();
    for (let i = 0; i < 9000; i++) {
      net.step(0.1, [], 12);
      for (const L of loops) for (let a = 0; a < L.trams.length; a++) { const ta = L.trams[a]; if (ta.state === 'arrêt') served.add(ta.id * 100 + ta.atStop); for (let b = a + 1; b < L.trams.length; b++) minGap = Math.min(minGap, Math.hypot(ta.x - L.trams[b].x, ta.z - L.trams[b].z)); }
    }
    expect(minGap).toBeGreaterThan(8);
    expect(served.size).toBeGreaterThanOrEqual(loops.reduce((n, L) => n + L.trams.length, 0) * 2);
  });
  it('passage à niveau en biais : la dalle couvre la voie ferrée', () => {
    expect(crossHalf({ rx: 1, rz: 0, tx: 0, tz: 1 })).toBeLessThan(7);
    expect(crossHalf({ rx: 1, rz: 0, tx: Math.cos(0.35), tz: Math.sin(0.35) })).toBeGreaterThan(12);   // ≈ 20° : plus de 24 m de dalle
    expect(crossHalf({ rx: 1, rz: 0, tx: 1, tz: 0 })).toBeLessThanOrEqual(18);
  });
  it('la nuit, les trams sont garés et invisibles', () => {
    const def = generateLayout(2), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), net = new TramNet(wp.plans, (x, z) => t.height(x, z));
    net.step(0.1, [], 3); expect(net.trams.every(x => !x.active && x.v === 0)).toBe(true);
    net.step(0.1, [], 8); expect(net.trams.every(x => x.active)).toBe(true);
  });
});
