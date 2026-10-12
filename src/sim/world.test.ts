import { describe, it, expect } from 'vitest';
import layout from '../layout.json';
import { World, TYPES, VMAX } from './world';
import { Terrain } from './terrain';
import type { LayoutDef } from './network';

// le monde d'origine sans sa corde : ces tests portent sur la boucle seule (la corde a ses propres tests dans chord.test.ts)
const full = layout as unknown as LayoutDef;
const def: LayoutDef = { ...full, chords: undefined, branches: undefined, circuits: full.circuits.filter(c => !c.via), urban: full.urban!.filter(u => !['Centre', 'Roquemaure', 'Bois-Joli'].includes(u.station ?? '')) };

function run(w: World, seconds: number, onSecond?: (w: World, s: number) => void) {
  let maxV = 0;
  for (let i = 0; i < 60 * seconds; i++) {
    w.step(1 / 60);
    for (const e of w.net.edges) if (e.occupants.size > 1) throw new Error(`deux trains dans le canton ${e.id} à t=${w.time.toFixed(1)}`);
    for (const t of w.trains) maxV = Math.max(maxV, t.v);
    if (onSecond && i % 60 === 0) onSecond(w, i / 60);
  }
  return maxV;
}
const active = (w: World, id: string) => w.trains.filter(t => t.circuit.id === id && (t.status === 'service' || t.status === 'leaving')).length;

describe('Réseau', () => {
  it('chaque voie est une boucle fermée, avec dépôt', () => {
    const w = new World(def);
    for (const name of ['A', 'B']) {
      const start = w.net.ring[name][0];
      let e = start, n = 0;
      do { e = e.to.outs[0]; n++; } while (e !== start && n < 1000);
      expect(e).toBe(start);
    }
    expect(w.net.depots.length).toBe(2);
    expect(w.net.depots[0].edges.length).toBe(6);
  });
  it('les rames au parc sont dans des voies de garage', () => {
    const w = new World(def);
    const stored = w.trains.filter(t => t.status === 'stored');
    expect(stored.length).toBe(4 - 3 + 3 - 2 + 2 - 1);
    for (const t of stored) expect(t.head.kind).toBe('depot');
  });
});

describe('Simulation (1 h simulée)', () => {
  it('aucune collision, aucun blocage, vitesses respectées', () => {
    const w = new World(def);
    const maxV = run(w, 3600);
    expect(maxV).toBeLessThanOrEqual(VMAX + 0.01);
    for (const t of w.trains.filter(x => x.status !== 'stored')) {
      expect(t.v <= TYPES[t.circuit.type].vmax + 0.01).toBe(true);
      expect(t.odo, `${t.id} distance`).toBeGreaterThan(8000);
    }
    for (const t of w.trains.filter(x => x.circuit.type === 'omnibus' && x.status === 'service')) expect(t.stopsDone, t.id).toBeGreaterThan(8);
    for (const t of w.trains.filter(x => x.circuit.type === 'fret')) expect(t.stopsDone).toBe(0);
  }, 120000);

  it('le nombre de trains en service suit la consigne (sorties et retours au dépôt)', () => {
    const d: LayoutDef = { ...def, circuits: def.circuits.map(c => (c.id === 'A' ? { ...c, fleet: 5 } : c)) };
    const w = new World(d);
    const A = w.circuits[0];
    run(w, 3000, (ww, s) => {
      if (s === 60) A.service = 5;
      if (s === 1500) A.service = 1;
      if (s === 1400) expect(active(ww, 'A')).toBe(5);
    });
    expect(active(w, 'A')).toBe(1);
    const parked = w.trains.filter(t => t.circuit.id === 'A' && t.status === 'stored');
    expect(parked.length).toBe(4);
    for (const t of parked) expect(t.head.kind).toBe('depot');
  }, 120000);

  it('arrêt gare par gare', () => {
    const d: LayoutDef = { ...def, circuits: def.circuits.map(c => (c.id === 'A' ? { ...c, stops: { Nord: true, Est: false, Sud: true } } : c)) };
    const w = new World(d);
    run(w, 3600);
    for (const t of w.trains.filter(t => t.circuit.id === 'A' && t.status !== 'stored')) {
      expect(t.stopLog['Est'] ?? 0, t.id).toBe(0);
      expect(t.stopLog['Nord']).toBeGreaterThan(3);
    }
  }, 120000);

  it('un rapide double les omnibus', () => {
    const d: LayoutDef = { ...def, circuits: [...def.circuits, { id: 'R', name: 'Rapide A', track: 'A', type: 'rapide', fleet: 1, service: 1, cars: 6, stops: { Nord: false, Est: true, Sud: false } }] };
    const w = new World(d);
    run(w, 3600);
    const r = w.trains.find(t => t.circuit.id === 'R')!;
    expect(r.stopLog['Nord'] ?? 0).toBe(0);
    expect(r.stopLog['Est']).toBeGreaterThan(3);
  }, 120000);
});

describe('Relief', () => {
  it('pente limitée, zones plates, sol sous les voies', () => {
    const w = new World(def);
    const ys = w.net.center.map(p => p.y);
    expect(Math.max(...ys) - Math.min(...ys), 'relief de la voie').toBeGreaterThan(3);
    expect(w.net.maxGrade).toBeLessThan(0.03);
    for (const e of w.net.edges.filter(x => x.kind === 'plat' || x.kind === 'depot')) {
      const y = e.pts.map(p => p.y);
      expect(Math.max(...y) - Math.min(...y), e.id).toBeLessThan(1e-6);
    }
    const t = new Terrain(w.net, def.urban);
    for (let i = 0; i < w.net.guides.length; i += 5) {
      const p = w.net.guides[i];
      if (p.tf) continue;                                // en tunnel, le sol est au-dessus de la voie
      expect(t.height(p.x, p.z)).toBeLessThanOrEqual(p.y);
    }
  });
});

describe('Tunnels, ponts, rivières', () => {
  const w = new World(def), net = w.net, t = new Terrain(net, def.urban), N = net.center.length;
  const idx = (s: { i0: number; n: number }) => Array.from({ length: s.n }, (_, k) => (s.i0 + k) % N);
  it('le layout contient au moins un tunnel, un pont et une rivière', () => {
    expect(net.structures.filter(s => s.kind === 'tunnel').length).toBeGreaterThanOrEqual(2);
    expect(net.structures.filter(s => s.kind === 'bridge').length).toBeGreaterThanOrEqual(2);
    expect(t.rivers.length).toBeGreaterThanOrEqual(1);
  });
  it('un tunnel est toujours couvert de terre (axe et côtés), un pont toujours au-dessus du sol', () => {
    for (const s of net.structures) for (const i of idx(s)) {
      const p = net.center[i], a = net.center[(i + N - 1) % N], b = net.center[(i + 1) % N];
      const l = Math.hypot(b.x - a.x, b.z - a.z), nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
      for (const o of [-5, 0, 5]) {
        const h = t.height(p.x + nx * o, p.z + nz * o);
        if (s.kind === 'tunnel') expect(h - p.y, `tunnel i=${i} lat=${o}`).toBeGreaterThan(6.8);
        else expect(p.y - h, `pont i=${i} lat=${o}`).toBeGreaterThan(2.4);
      }
    }
  });
  it('aucun tunnel ni pont ne chevauche une gare ou un dépôt', () => {
    const zones = [...net.stations.map(n => net.edges.find(e => e.kind === 'plat' && e.station === n && e.track === 'A')!), ...net.depots.filter(d => d.track === 'A').map(d => d.edges[0])];
    for (const e of zones) for (const q of [e.at(0), e.at(e.len / 2), e.at(e.len)]) for (const s of net.structures)
      for (const i of idx(s)) expect(Math.hypot(net.center[i].x - q.x, net.center[i].z - q.z), `${s.kind} près de ${e.id}`).toBeGreaterThan(60);
  });
  it('la voie passe bien au-dessus de l\'eau là où elle franchit une rivière', () => {
    for (const r of t.rivers) for (const q of r.pts) {
      const c = net.center.reduce((m, p) => (Math.hypot(p.x - q.x, p.z - q.z) < Math.hypot(m.x - q.x, m.z - q.z) ? p : m));
      if (Math.hypot(c.x - q.x, c.z - q.z) < 40) { expect(c.bf, 'pont sur la rivière').toBe(1); expect(c.y - 2.1 - q.level).toBeGreaterThan(1.5); }
    }
  });
});

describe('Aucun chevauchement géométrique', () => {
  it('même avec tout le parc en service, deux rames ne se croisent jamais dans les zones', () => {
    const d: LayoutDef = { ...def, circuits: def.circuits.map(c => ({ ...c, fleet: c.fleet + 1 })) };
    const w = new World(d);
    w.circuits.forEach(c => { c.service = c.fleet; });
    const bad: string[] = [];
    for (let i = 0; i < 60 * 3000; i++) {
      w.step(1 / 60);
      if (i % 30) continue;
      const live = w.trains.filter(t => t.status !== 'stored').map(t => ({ t, c: Array.from({ length: t.cars }, (_, k) => t.pointAt(k * (t.carLen + t.gap) + t.carLen / 2)) }));
      for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
        let dmin = 1e9;
        for (const p of live[a].c) for (const q of live[b].c) dmin = Math.min(dmin, Math.hypot(p.x - q.x, p.z - q.z));
        if (dmin < 3) bad.push(`${live[a].t.id}/${live[b].t.id} à t=${w.time.toFixed(0)} s (${dmin.toFixed(1)} m) @${live[a].t.head.id} | ${live[b].t.head.id}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 120000);

  it('les rames garées tiennent entièrement dans leur voie de garage', () => {
    const w = new World(def);
    for (const t of w.trains.filter(x => x.status === 'stored')) expect(t.path.length, t.id).toBe(1);
    const maxLen = Math.max(...w.circuits.map(c => c.maxCars * (14 + 1)));
    for (const dep of w.net.depots) for (const e of dep.edges) expect(e.stopOffset - maxLen, e.id).toBeGreaterThan(0);
  });
});
