import { describe, it, expect } from 'vitest';
import { World } from './sim/world';
import { Terrain } from './sim/terrain';
import { planWorld } from './sim/planning';
import { buildRoads } from './sim/roads';
import { planPois } from './sim/pois';
import { Fauna } from './sim/fauna';
import { Traffic } from './sim/traffic';
import { generateLayout } from './sim/worldgen';
import { Director, type RailSpot } from './director';
import { TramNet } from './sim/tram';

describe('Réalisateur automatique', () => {
  it('enchaîne des plans variés (trains, événements, lieux, faune) sans répétition immédiate', () => {
    const seed = 3, def = generateLayout(seed), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp);
    const pois = planPois(t, wp, roads.dist, seed), fauna = new Fauna(t, wp, roads.dist, seed, 2200, { airfield: pois.find(p => p.kind === 'aérodrome'), guides: w.net.guides }), traffic = new Traffic(roads, w, 5);
    let sel = 0; const views: string[] = [];
    const tram = new TramNet(wp.plans, (x, z) => t.height(x, z), 3, roads.nodes.filter(n => n.edges.length >= 3), roads.edges); tram.bindRoads(roads.nodes); traffic.tramPrio = tram;
    const spots: RailSpot[] = w.net.lines.flatMap(l => l.structures.flatMap((st): RailSpot[] => {
      const C = l.center, n = C.length, at = (i: number) => l.closed ? C[((i % n) + n) % n] : C[Math.max(0, Math.min(n - 1, i))];
      if (st.kind === 'bridge') { const m = at(st.i0 + Math.floor(st.n / 2)); return [{ kind: 'bridge', x: m.x, y: m.y, z: m.z }]; }
      const a = at(st.i0), b = at(st.i0 + st.n); return [{ kind: 'portal', x: a.x, y: a.y, z: a.z }, { kind: 'portal', x: b.x, y: b.y, z: b.z }];
    }));
    let nowT = 0; const v0 = { x: 0, y: 1, z: 0 };
    const d = new Director(w, { setTrain: i => { sel = i; }, setView: k => views.push(k), selected: () => sel },
      { pois, fauna: fauna, crossings: roads.crossings, zones: t.zones, ground: (x, z) => t.height(x, z), hour: () => 15, night: () => 0, buses: () => traffic.vehicles.filter(v => v.kind === 'bus'), weather: () => ({ rain: 0, fog: 0, storm: 0 }), tram, spots, sport: () => ({ stadium: { x: 100, y: t.height(100, 100), z: 100, session: 'Séance de vitesse', lit: true }, things: [{ kind: 'parapente', key: 'para1', label: 'Parapente', pos: () => ({ x: 300, y: t.height(300, 300) + 150, z: 300 }) }, { kind: 'footing', key: 'jog1', label: 'Joggeur à la frontale', pos: () => ({ x: 200, y: t.height(200, 200) + 1.2, z: 200 }) }] }), sky: () => ({ solar: nowT > 700 && nowT < 800 ? 0.95 : 0, lunar: 0, aurora: 0, comet: 0, rainbow: 0, moonUp: 0, moonLit: 0, starVis: 0, sunDir: { x: 0.3, y: 0.8, z: 0.5 }, moonDir: v0, cometDir: v0, meteorDirs: [] }) });
    const secs: Record<string, number> = {}, pnEnds: { closed: boolean; dur: number }[] = []; let tStart = 0;
    let now = 0; d.enable(true, now);
    const seq: string[] = [d.shot];
    let last = d.shot;
    for (let k = 0; k < 12000; k++) {
      now += 0.1; nowT = now;
      for (let j = 0; j < 6; j++) { w.step(1 / 60); traffic.updateCrossings(w, 1 / 60); }
      fauna.step(0.1, []); tram.step(0.1, traffic.vehicles, 15);
      secs[d.fam] = (secs[d.fam] ?? 0) + 0.1;
      d.update(now);
      expect(d.fade).toBeGreaterThanOrEqual(0); expect(d.fade).toBeLessThanOrEqual(1);
      if (d.free) { const p = d.cam.position; expect(Number.isFinite(p.x + p.y + p.z)).toBe(true); expect(p.y).toBeGreaterThan(t.height(p.x, p.z) - 0.1); }
      if (d.shot !== last) {
        if (last.startsWith('événement:pn')) { const cr = roads.crossings.find(c => c.id === Number(last.slice(12))); pnEnds.push({ closed: !!cr?.closed, dur: now - tStart }); }
        seq.push(d.shot); last = d.shot; tStart = now;
      }
    }
    expect(seq.length).toBeGreaterThan(25);
    expect(seq.some(x => x.includes('eclipse-soleil'))).toBe(true);
    expect(seq.some(x => x.startsWith('sport:'))).toBe(true);                       // la famille « sport » est filmée                // l'éclipse interrompt le plan en cours
    const cats = new Set(seq.map(s => s.split(':')[0]));
    expect(cats.has('train')).toBe(true);
    console.log("CATS", [...cats].join(","));
    expect([...cats].length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < seq.length; i++) expect(seq[i], `plan ${i}`).not.toBe(seq[i - 1]);
    expect(new Set(views).size).toBeGreaterThanOrEqual(5);
    const cnt: Record<string, number> = {}; for (const s of seq) cnt[s.split(':')[0]] = (cnt[s.split(':')[0]] ?? 0) + 1; const vc: Record<string, number> = {}; for (const v of views) vc[v] = (vc[v] ?? 0) + 1;
    console.log(JSON.stringify(cnt), JSON.stringify(vc));
    const tot = Object.values(secs).reduce((a, b) => a + b, 0); console.log('TEMPS D\'ÉCRAN', Object.entries(secs).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(', '));
    const rail = ((secs['train'] ?? 0) + (secs['tram'] ?? 0) + (secs['rail'] ?? 0)) / tot;
    for (const e of pnEnds) expect(e.dur, 'passage à niveau : plan trop court (' + JSON.stringify(e) + ')').toBeGreaterThanOrEqual(9.5);   // durée minimale ; ils durent jusqu'à la réouverture (un nouveau train peut refermer aussitôt)
    console.log('PN', JSON.stringify(pnEnds.map(e => Math.round(e.dur))));
    expect(rail).toBeGreaterThan(0.45); expect(rail).toBeLessThan(0.8);                       // trains et trams dominent
    expect(((secs['eau'] ?? 0) + (secs['ciel'] ?? 0) + (secs['bus'] ?? 0)) / tot).toBeLessThan(0.3);
  });
});
