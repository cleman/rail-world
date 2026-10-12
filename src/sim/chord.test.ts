import { describe, it, expect } from 'vitest';
import layout from '../layout.json';
import { World } from './world';
import { Terrain } from './terrain';
import type { LayoutDef } from './network';

const full = layout as unknown as LayoutDef;
const def: LayoutDef = { ...full, branches: undefined, circuits: full.circuits.filter(c => c.id !== 'D1'), urban: full.urban!.filter(u => !['Roquemaure', 'Bois-Joli'].includes(u.station ?? '')) };

describe('Corde (ligne secondaire à double voie)', () => {
  const w0 = new World(def), net = w0.net;
  it('le graphe contient la corde, ses deux voies et ses raccordements', () => {
    expect(net.lines.length).toBe(2);
    expect(net.ring['C+'].length).toBeGreaterThan(4);
    expect(net.ring['C-'].length).toBeGreaterThan(4);
    for (const n of ['A@C.dv1', 'A@C.mg2', 'B@C.mg1', 'B@C.dv2']) expect(net.nodes.has(n), n).toBe(true);
    expect(net.nodes.get('A@C.dv1')!.outs.length).toBe(2);        // aiguillage : voie directe + corde
    expect(net.nodes.get('A@C.mg2')!.ins.length).toBe(2);         // convergence
    expect(net.nodes.get('B@C.dv2')!.outs.length).toBe(2);
    expect(net.nodes.get('B@C.mg1')!.ins.length).toBe(2);
  });
  it('chaque traversée de la voie A est verrouillée avec le canton coupé', () => {
    const x = net.edges.filter(e => e.id.endsWith('-c2x') || e.id.endsWith('-c4x'));
    expect(x.length).toBe(2);
    for (const e of x) { expect(e.lock.length).toBe(1); expect(e.lock[0].lock).toContain(e); }
  });
  it('la corde dessert sa gare, sa pente est tenue, ses ouvrages sont hors des zones', () => {
    expect(net.stations).toContain('Centre');
    expect(net.maxGrade).toBeLessThanOrEqual(0.0205);
    const t = new Terrain(net, def.urban);
    expect(t.zones.some(z => z.name === 'Centre')).toBe(true);
    const c = w0.circuits.find(q => q.id === 'C1')!;
    expect(c.served).toContain('Centre');
    expect(c.served).not.toContain('Est');                        // saute la gare de la boucle contournée par la corde
    expect(w0.circuits.find(q => q.id === 'A')!.served).not.toContain('Centre');
  });
  it('1 h de circulation : aucune collision, les rames de la corde desservent Centre, la boucle continue', () => {
    const w = new World(def);
    for (let i = 0; i < 60 * 3600; i++) {
      w.step(1 / 60);
      for (const e of w.net.edges) if (e.occupants.size > 1) throw new Error(`deux trains dans ${e.id} à t=${w.time.toFixed(0)}`);
    }
    for (const t of w.trains.filter(x => x.status !== 'stored')) {
      expect(t.odo, `${t.id} avance`).toBeGreaterThan(8000);
      if (t.circuit.via.length) expect(t.stopLog['Centre'], `${t.id} s'arrête à Centre`).toBeGreaterThan(4);
    }
  }, 120000);
  it('tout le parc en service sur la corde : pas de blocage ni de superposition', () => {
    const d: LayoutDef = { ...def, circuits: def.circuits.map(c => (c.via ? { ...c, fleet: 4, service: 3 } : c)) };
    const w = new World(d);
    const bad: string[] = [];
    for (let i = 0; i < 60 * 3000; i++) {
      w.step(1 / 60);
      if (i % 30) continue;
      const live = w.trains.filter(t => t.status !== 'stored').map(t => ({ t, c: Array.from({ length: t.cars }, (_, k) => t.pointAt(k * (t.carLen + t.gap) + t.carLen / 2)) }));
      for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
        let dmin = 1e9;
        for (const p of live[a].c) for (const q of live[b].c) dmin = Math.min(dmin, Math.hypot(p.x - q.x, p.z - q.z));
        if (dmin < 3) bad.push(`${live[a].t.id}/${live[b].t.id} à t=${w.time.toFixed(0)} s (${dmin.toFixed(1)} m)`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    for (const t of w.trains.filter(x => x.status !== 'stored')) expect(t.odo, `${t.id} avance`).toBeGreaterThan(6000);
  }, 120000);
});
