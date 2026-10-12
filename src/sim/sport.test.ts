import { describe, it, expect } from 'vitest';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { buildRoads } from './roads';
import { generateLayout } from './worldgen';
import { planPois } from './pois';
import { planComplex, planTrails, planGliderSite, planRowing, trackAt, trackLen, laneR, TRACK, jogLevel, bikeLevel, weekday } from './sport';
import { Athletics, PROGRAM } from './athletics';
import { Outdoors } from './outdoor';
import { Games, playLevel } from './games';
import { GliderOps } from './glider';

function build(seed: number) {
  const def = generateLayout(seed), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp), pois = planPois(t, wp, roads.dist, seed);
  const complex = planComplex(t, wp, roads.dist, pois.map(p => ({ x: p.x, z: p.z, r: p.r })), seed);
  if (complex) t.addFlat({ ...complex.flat, y: complex.f.y, fade: 40 });
  const trails = planTrails(t, wp, roads.dist, complex, seed);
  return { t, wp, roads, complex, trails, pois };
}

describe('Piste et horaires', () => {
  it('la piste fait 400 m au couloir 1 (norme) et se referme', () => {
    expect(trackLen(0)).toBeCloseTo(2 * TRACK.straight + 2 * Math.PI * TRACK.r0, 6);
    expect(trackLen(0) - 2 * Math.PI * 0.3).toBeGreaterThan(400 - 1.2 * 2 * Math.PI * 0 - 3);   // 2·84,39 + 2π·36,8 ≈ 400,0 m
    expect(trackLen(0)).toBeCloseTo(400, 0);
    for (const l of [0, 3, 7]) { const a = trackAt(l, 0), b = trackAt(l, trackLen(l)); expect(Math.hypot(a.u - b.u, a.v - b.v)).toBeLessThan(1e-6); expect(Math.hypot(trackAt(l, 10).v + laneR(l), 0)).toBeLessThan(1e-6); }
  });
  it('joggeurs : pointes du matin, de midi et du soir, creux la nuit', () => {
    expect(jogLevel(18.4)).toBeGreaterThan(jogLevel(3));
    expect(jogLevel(7)).toBeGreaterThan(jogLevel(10));
    expect(jogLevel(12.6)).toBeGreaterThan(jogLevel(15));
    expect(jogLevel(3)).toBeGreaterThan(0);
    expect(bikeLevel(10.5, true)).toBeGreaterThan(bikeLevel(10.5, false));
  });
  it('le programme du stade varie selon les jours et se tient avant la nuit', () => {
    expect(PROGRAM.length).toBe(7); expect(PROGRAM[6]).toBeNull();
    const names = new Set(PROGRAM.filter(Boolean).map(p => p!.name)); expect(names.size).toBeGreaterThanOrEqual(5);
    for (const p of PROGRAM) if (p) { expect(p.start).toBeGreaterThanOrEqual(14); expect(p.end).toBeLessThanOrEqual(19.5); }
    expect(weekday(0)).toBe(0); expect(weekday(7)).toBe(0); expect(weekday(-1)).toBe(6);
    expect(playLevel('tennis', 10, 1)).toBeGreaterThan(0); expect(playLevel('tennis', 3, 1)).toBe(0); expect(playLevel('foot', 19, 1)).toBeGreaterThan(0); expect(playLevel('foot', 11, 1)).toBe(0); expect(playLevel('foot', 11, 5)).toBeGreaterThan(0);
  });
});

describe('Plan sport', () => {
  it('est déterministe : complexe, chemins, parapente, aviron', () => {
    const a = build(3), b = build(3);
    expect(a.complex?.f).toEqual(b.complex?.f); expect(a.trails.length).toBe(b.trails.length);
    expect(planGliderSite(a.t, a.wp, a.roads.dist, 3)).toEqual(planGliderSite(b.t, b.wp, b.roads.dist, 3));
    const strip = (r: ReturnType<typeof planRowing>) => JSON.parse(JSON.stringify(r)); expect(strip(planRowing(a.t, a.wp, 3))).toEqual(strip(planRowing(b.t, b.wp, 3)));
    expect(a.complex).not.toBeNull(); expect(a.trails.length).toBeGreaterThan(2);
  });
  it('le complexe est à plat et hors des routes', () => {
    const { t, complex, roads } = build(3); const c = complex!;
    let lo = 1e9, hi = -1e9; for (let u = -100; u <= 100; u += 25) for (let v = -60; v <= 100; v += 20) { const p = { x: c.f.x + Math.cos(c.f.rot) * u - Math.sin(c.f.rot) * v, z: c.f.z + Math.sin(c.f.rot) * u + Math.cos(c.f.rot) * v }; const h = t.height(p.x, p.z); lo = Math.min(lo, h); hi = Math.max(hi, h); expect(roads.dist(p.x, p.z)).toBeGreaterThan(20); }
    expect(hi - lo).toBeLessThan(1.5);
  });
});

describe('Athlétisme', () => {
  it('une séance s\'ouvre en fin d\'après-midi, les athlètes bougent, les projecteurs s\'allument au crépuscule, tout se vide ensuite', () => {
    const { complex } = build(3); const A = new Athletics(complex!, 3);
    for (let i = 0; i < 100; i++) A.step(0.1, 10, 1, 0, 0, 0); expect(A.session).toBeNull(); expect(A.athletes.length).toBe(0);
    for (let i = 0; i < 2400; i++) A.step(0.1, 17.5, 1, 0, 0, 0.1); expect(A.session).not.toBeNull(); expect(A.athletes.length).toBeGreaterThan(6);
    const xs = new Set(A.athletes.map(a => Math.round(a.x))); expect(xs.size).toBeGreaterThan(5);
    for (const a of A.athletes) expect(Number.isFinite(a.x + a.y + a.z + a.yaw + a.phase)).toBe(true);
    expect(A.lights).toBe(false);
    for (let i = 0; i < 50; i++) A.step(0.1, 18.5, 1, 0, 0, 0.6); expect(A.lights).toBe(true);
    A.step(0.1, 19.6, 1, 0, 0, 0.95); expect(A.session).toBeNull();
    for (let i = 0; i < 3000; i++) A.step(0.1, 19.7, 1, 0, 0, 1); expect(A.athletes.length).toBe(0);
  });
  it('pas de séance le dimanche ni sous la pluie', () => {
    const { complex } = build(3); const A = new Athletics(complex!, 3);
    for (let i = 0; i < 50; i++) A.step(0.1, 17.5, 6, 0, 0, 0); expect(A.session).toBeNull();
    for (let i = 0; i < 50; i++) A.step(0.1, 17.5, 1, 0.9, 0, 0); expect(A.session).toBeNull();
  });
  it('le saut en hauteur et le lancer de javelot produisent des sauts et des objets en vol', () => {
    const { complex } = build(3); let jumps = 0, throws = 0, props = 0;
    for (const d of [1, 4]) { const A = new Athletics(complex!, 3); for (let i = 0; i < 9000; i++) { A.step(0.1, 17.5, d, 0, 0, 0); for (const a of A.athletes) { if (a.pose === 'fly' || a.pose === 'vault' || a.pose === 'flop') jumps++; if (a.pose === 'throw') throws++; } props = Math.max(props, A.troupe.props.length); } }
    expect(jumps).toBeGreaterThan(0); expect(throws).toBeGreaterThan(0); expect(props).toBeGreaterThan(0);
  });
});

describe('Plein air', () => {
  it('joggeurs, cyclistes, cavaliers, rameurs apparaissent selon l\'heure ; frontale la nuit', () => {
    const { t, roads, trails } = build(3), rows = planRowing(t, planWorld(new World(generateLayout(3)).net, t), 3);
    const O = new Outdoors({ edges: roads.edges, trails, rows, ground: (x, z) => t.height(x, z), seed: 3 }), cam = { x: 0, z: 0 };
    const run = (h: number, day: number, night: number, n = 1500) => { O.movers.length = 0; for (let i = 0; i < n; i++) O.step(0.1, { hour: h, day, rain: 0, storm: 0, night, cam }); };
    run(18.4, 1, 0); const evening = O.count('footing'); expect(evening).toBeGreaterThan(5);
    run(3, 1, 1); expect(O.count('footing')).toBeLessThan(evening);
    run(10.5, 5, 0); expect(O.count('vélo')).toBeGreaterThan(3); expect(O.count('peloton')).toBeGreaterThan(0);
    for (const a of O.athletes) expect(Number.isFinite(a.x + a.y + a.z + a.yaw)).toBe(true);
    run(20.8, 1, 0.9, 1200); const j = O.movers.filter(m => m.kind === 'footing'); if (j.length) expect(j.every(m => m.a.lamp)).toBe(true);
    O.movers.length = 0; for (let i = 0; i < 1500; i++) O.step(0.1, { hour: 8, day: 1, rain: 0.9, storm: 0, night: 0, cam }); expect(O.count('aviron')).toBe(0);
  });
  it('les mobiles restent près d\'un parcours (rue ou chemin) et avancent', () => {
    const { t, roads, trails } = build(3), O = new Outdoors({ edges: roads.edges, trails, rows: [], ground: (x, z) => t.height(x, z), seed: 3 });
    for (let i = 0; i < 600; i++) O.step(0.1, { hour: 18, day: 1, rain: 0, storm: 0, night: 0, cam: { x: 0, z: 0 } });
    const m = O.movers.find(q => q.kind === 'footing' && !q.lead)!; const p0 = { x: m.a.x, z: m.a.z }; for (let i = 0; i < 100; i++) O.step(0.1, { hour: 18, day: 1, rain: 0, storm: 0, night: 0, cam: { x: 0, z: 0 } });
    expect(Math.hypot(m.a.x - p0.x, m.a.z - p0.z)).toBeGreaterThan(8);
  });
});

describe('Matchs et parapente', () => {
  it('des matchs se jouent aux heures prévues, les balles bougent', () => {
    const { complex } = build(3), G = new Games(complex!, 3);
    for (let i = 0; i < 4000; i++) G.step(0.05, 18.5, 1, 0, 0, 0.3);
    expect(G.activeKinds).toEqual(expect.arrayContaining(['tennis', 'foot', 'basket'])); expect(G.athletes.length).toBeGreaterThanOrEqual(18);
    const b0 = G.troupe.props.map(p => `${p.x.toFixed(1)}${p.z.toFixed(1)}`).join(); for (let i = 0; i < 40; i++) G.step(0.05, 18.5, 1, 0, 0, 0.3); expect(G.troupe.props.map(p => `${p.x.toFixed(1)}${p.z.toFixed(1)}`).join()).not.toBe(b0);
    for (const a of G.athletes) expect(Number.isFinite(a.x + a.z + a.yaw)).toBe(true);
    for (let i = 0; i < 4000; i++) G.step(0.05, 23, 1, 0, 0, 1); expect(G.athletes.length).toBe(0);
  });
  it('un parapente décolle, monte, plane et se pose au bon endroit', () => {
    const { t, wp, roads } = build(3), site = planGliderSite(t, wp, roads.dist, 3)!; expect(site).not.toBeNull();
    const G = new GliderOps(site, (x, z) => t.height(x, z), 3); let maxAlt = 0, landed = false;
    for (let i = 0; i < 9000 && !landed; i++) { G.step(0.1, { hour: 12, rain: 0, storm: 0 }); for (const g of G.gliders) { maxAlt = Math.max(maxAlt, g.pilot.y - site.launch.y); if (g.state === 'landed') { landed = true; expect(Math.hypot(g.pilot.x - site.land.x, g.pilot.z - site.land.z)).toBeLessThan(25); } } }
    expect(maxAlt).toBeGreaterThan(100); expect(landed).toBe(true);
    const H = new GliderOps(site, (x, z) => t.height(x, z), 3); for (let i = 0; i < 100; i++) H.step(0.1, { hour: 12, rain: 0.8, storm: 0 }); expect(H.gliders.length).toBe(0);
  });
});
