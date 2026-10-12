import { describe, it, expect } from 'vitest';
import { World } from './world';
import { buildNetwork, type LayoutDef } from './network';

// Boucle circulaire (rayon 1500 m) + antenne à voie unique vers l'intérieur : un évitement, un terminus.
const R = 1500, centerline = Array.from({ length: 12 }, (_, i) => [Math.round(R * Math.cos((i / 12) * 2 * Math.PI)), Math.round(R * Math.sin((i / 12) * 2 * Math.PI))]);
const def = (svc: number, fleet: number): LayoutDef => ({
  centerline, trackSpacing: 4.5, platformOffset: 4.5, blockLength: 350,
  stations: [{ name: 'Nord', at: 0.1 }, { name: 'Est', at: 0.5 }, { name: 'Sud', at: 0.75 }],
  depots: [{ name: 'Dépôt', at: 0.9, tracks: 6, on: ['A', 'B'] }],
  circuits: [
    { id: 'A', track: 'A', type: 'omnibus', fleet: 3, service: 2, cars: 4, name: 'A' },
    { id: 'B', track: 'B', type: 'omnibus', fleet: 3, service: 2, cars: 4, name: 'B' },
    { id: 'D1', track: 'A', type: 'omnibus', fleet, service: svc, cars: 3, name: 'D', via: ['D'] },
  ],
  terrain: { seed: 1, amplitude: 0, scale: 600, maxGrade: 0.02 },
  branches: [{ id: 'D', name: 'Antenne', from: 0.25, side: 'A', via: [[0, 1000], [0, 500], [150, 0], [260, -400]], loops: [{ name: 'Mi-Pente', at: 0.5 }], terminus: 'Bout' }],
});

describe('Antenne à voie unique', () => {
  it('graphe : jumeaux, sections exclusives, évitement, terminus', () => {
    const net = buildNetwork(def(2, 3));
    expect(net.lines.map(l => l.id)).toEqual(['ring', 'D']);
    const T = net.edges.find(e => e.id === 'D>T')!;
    expect(T.turn).toBe(true); expect(T.twin!.id).toBe('D<T'); expect(T.twin!.twin).toBe(T);
    expect(T.stopOffset).toBeGreaterThan(150);                                       // une rame de 150 m tient au terminus
    for (const e of net.edges.filter(x => x.id.startsWith('D>b'))) {
      const w = e.twin!;
      expect(w.len).toBeCloseTo(e.len, 6); expect(w.mirror).toBe(true);
      expect(e.lock).toContain(w);                                                   // sens contraires exclusifs
    }
    expect(net.nodes.get('A@D.dv')!.outs.length).toBe(2);
    expect(net.nodes.get('A@D.mg')!.ins.length).toBe(2);
    const L = ['D>L0', 'D<L0'].map(id => net.edges.find(e => e.id === id)!);
    for (const e of L) { expect(e.kind).toBe('plat'); expect(e.station).toBe('Mi-Pente'); expect(e.stopOffset).toBeGreaterThan(150); }
    expect(net.stations).toEqual(expect.arrayContaining(['Mi-Pente', 'Bout']));
  });
  it('3 h de circulation (2 rames sur l\'antenne) : pas de collision, ni superposition, ni blocage, demi-tour au terminus', () => {
    const w = new World(def(2, 3));
    expect(w.circuits.find(c => c.id === 'D1')!.served).toEqual(expect.arrayContaining(['Mi-Pente', 'Bout']));
    const bad: string[] = [];
    for (let i = 0; i < 60 * 10800; i++) {
      w.step(1 / 60);
      for (const e of w.net.edges) if (e.occupants.size > 1) throw new Error(`deux trains dans ${e.id} à t=${w.time.toFixed(0)}`);
      if (i % 30) continue;
      const live = w.trains.filter(t => t.status !== 'stored').map(t => ({ t, c: Array.from({ length: t.cars }, (_, k) => t.pointAt(k * (t.carLen + t.gap) + t.carLen / 2)) }));
      for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
        let dm = 1e9; for (const p of live[a].c) for (const q of live[b].c) dm = Math.min(dm, Math.hypot(p.x - q.x, p.z - q.z));
        if (dm < 3) bad.push(`${live[a].t.id}/${live[b].t.id} t=${w.time.toFixed(0)} ${dm.toFixed(1)} m`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    for (const t of w.trains.filter(x => x.status !== 'stored')) {
      expect(t.odo, `${t.id} avance`).toBeGreaterThan(60000);
      if (t.circuit.id === 'D1') { expect(t.stopLog['Bout'], `${t.id} terminus`).toBeGreaterThan(5); expect(t.stopLog['Mi-Pente'], `${t.id} évitement`).toBeGreaterThan(5); }
    }
  }, 180000);
  it('tout le parc sur l\'antenne (4 rames) : jamais d\'interblocage', () => {
    const w = new World(def(4, 4));
    for (let i = 0; i < 60 * 7200; i++) {
      w.step(1 / 60);
      for (const e of w.net.edges) if (e.occupants.size > 1) throw new Error(`deux trains dans ${e.id}`);
    }
    for (const t of w.trains.filter(x => x.status !== 'stored')) expect(t.odo, `${t.id} avance`).toBeGreaterThan(40000);
  }, 180000);
  it('ligne libre (navette aller-retour sans lien avec la boucle) : deux terminus, évitement, 2 h sans incident', () => {
    const base = def(1, 2);
    const d: LayoutDef = { ...base, branches: [{ id: 'N', name: 'Navette', origin: 'Ouest', via: [[-1000, 100], [-500, 150], [0, 0], [500, -150], [1000, -100]], loops: [{ name: 'Milieu', at: 0.5 }], terminus: 'Est-N' }],
      circuits: [...base.circuits.filter(c => !c.via), { id: 'N1', name: 'Navette', track: 'N>', type: 'omnibus', fleet: 2, service: 2, cars: 3 }] };
    const w = new World(d);
    expect(w.circuits.find(c => c.id === 'N1')!.served).toEqual(expect.arrayContaining(['Ouest', 'Milieu', 'Est-N']));
    expect(w.net.edges.filter(e => e.turn).length).toBe(2);
    for (let i = 0; i < 60 * 7200; i++) {
      w.step(1 / 60);
      for (const e of w.net.edges) if (e.occupants.size > 1) throw new Error(`deux trains dans ${e.id}`);
    }
    for (const t of w.trains.filter(x => x.circuit.id === 'N1')) for (const n of ['Ouest', 'Milieu', 'Est-N']) expect(t.stopLog[n], `${t.id} ${n}`).toBeGreaterThan(10);
  }, 120000);
});
