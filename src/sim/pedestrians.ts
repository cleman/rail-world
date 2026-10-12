// Piétons : marcheurs sur les trottoirs des rues de ville. Simulation pure (sans Three.js), déterministe.
import type { RoadEdge, RoadNet, RoadNode } from './roads';

export interface Walker {
  id: number; edge: RoadEdge; s: number; dir: 1 | -1; side: 1 | -1; v: number; pause: number;
  x: number; y: number; z: number; hx: number; hz: number; phase: number; kind: number;
}

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Part de la population dehors selon l'heure (nuit calme, pointes du matin, midi et soir). */
export function activity(hour: number): number {
  const g = (c: number, w: number) => Math.exp(-((hour - c) ** 2) / (2 * w * w));
  return Math.min(1, 0.04 + 0.75 * g(8.2, 1.2) + 0.55 * g(12.5, 1.3) + 0.85 * g(17.8, 1.7) + 0.25 * g(21, 1.5));
}

export class Pedestrians {
  readonly walkers: Walker[] = [];
  /** nombre maximal de piétons et part active (0..1) */
  active = 1;
  private edges: RoadEdge[];
  private r: () => number;
  private time = 0;

  constructor(readonly roads: RoadNet, seed = 11, max = 220) {
    this.r = rng(seed);
    this.edges = roads.edges.filter(e => !e.render && e.poly.len > 12);
    if (!this.edges.length) return;
    const total = this.edges.reduce((a, e) => a + e.poly.len, 0), n = Math.min(max, Math.round(total / 14));
    for (let i = 0; i < n; i++) {
      let pick = this.r() * total, e = this.edges[0];
      for (const c of this.edges) { pick -= c.poly.len; if (pick <= 0) { e = c; break; } }
      const w: Walker = { id: i, edge: e, s: this.r() * e.poly.len, dir: this.r() < 0.5 ? 1 : -1, side: this.r() < 0.5 ? 1 : -1, v: 1.15 + this.r() * 0.35, pause: 0, x: 0, y: 0, z: 0, hx: 0, hz: 1, phase: this.r() * 6.28, kind: Math.floor(this.r() * 6) };
      this.place(w); this.walkers.push(w);
    }
  }

  get visible(): number { return Math.round(this.walkers.length * this.active); }

  private place(w: Walker) {
    const p = w.edge.poly.at(w.s), off = w.edge.hw + 0.65;
    // normale à gauche de la tangente
    w.x = p.x - p.tz * off * w.side; w.z = p.z + p.tx * off * w.side; w.y = p.y + 0.02;
    w.hx = p.tx * w.dir; w.hz = p.tz * w.dir;
  }

  private turn(w: Walker, node: RoadNode) {
    const opts = node.edges.filter(e => !e.render && e !== w.edge && e.poly.len > 6);
    if (opts.length && this.r() < 0.85) {
      const e = opts[Math.floor(this.r() * opts.length)];
      w.edge = e; w.dir = e.a === node ? 1 : -1; w.s = w.dir === 1 ? 0 : e.poly.len;
      if (this.r() < 0.3) w.side = w.side === 1 ? -1 : 1;
    } else { w.dir = w.dir === 1 ? -1 : 1; w.pause = 1 + this.r() * 4; }
  }

  step(dt: number) {
    this.time += dt;
    const n = this.visible;
    for (let i = 0; i < n; i++) {
      const w = this.walkers[i];
      if (w.pause > 0) { w.pause -= dt; continue; }
      w.s += w.dir * w.v * dt;
      if (w.s >= w.edge.poly.len) { w.s = w.edge.poly.len; this.turn(w, w.edge.b); }
      else if (w.s <= 0) { w.s = 0; this.turn(w, w.edge.a); }
      else if (this.r() < dt * 0.004) w.pause = 2 + this.r() * 6;     // flânerie
      w.phase += dt * w.v * 4.2;
      this.place(w);
    }
  }
}
