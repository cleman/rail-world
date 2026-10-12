import type { Network, Edge } from './network';
import type { BusStop, Traffic, Vehicle } from './traffic';
import { activity, type Walker } from './pedestrians';

/** Un personnage dessiné par people.ts : position, cap, phase de marche (pause > 0 : immobile). */
export type Figure = Pick<Walker, 'x' | 'y' | 'z' | 'hx' | 'hz' | 'phase' | 'pause' | 'kind'> & { /** assis (sur une chaise) */ sit?: boolean; /** échelle (enfants : < 1) */ size?: number };

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fig = (kind: number, phase = 0): Figure => ({ x: 0, y: 0, z: 0, hx: 0, hz: 1, phase, pause: 0, kind });

interface Worker extends Figure { edge: Edge; off: number; dir: 1 | -1; lat: number; wait: number }

/**
 * Petite vie de quartier : voyageurs qui attendent aux arrêts de bus (et montent quand un bus s'arrête),
 * livreurs qui font la navette entre leur camion et un immeuble, ouvriers qui font leur ronde le long des voies du dépôt.
 */
export class StreetLife {
  /** Tous les personnages visibles, reconstruits à chaque pas. */
  readonly list: Figure[] = [];
  private waiting = new Map<BusStop, Figure[]>();
  private boardT = new Map<BusStop, number>();
  private couriers = new Map<Vehicle, Figure>();
  private workers: Worker[] = [];
  private r: () => number;
  private spawnT = 0;
  /** Compteurs pour les tests. */
  boarded = 0; deliveries = 0;

  constructor(private traffic: Traffic, net: Network, seed = 31) {
    this.r = rng(seed);
    for (const s of traffic.busStops) this.waiting.set(s, []);
    // ouvriers : quelques-uns par dépôt, chacun sur une voie du dépôt
    const seen = new Set<string>();
    for (const d of net.depots) {
      if (seen.has(d.name)) continue; seen.add(d.name);
      const edges = d.edges.filter(e => e.len > 30);
      for (let k = 0; k < Math.min(5, edges.length * 2); k++) {
        const e = edges[k % edges.length];
        this.workers.push({ ...fig(Math.floor(this.r() * 6), this.r() * 6), edge: e, off: this.r() * e.len, dir: this.r() < 0.5 ? 1 : -1, lat: (k % 2 ? 1 : -1) * (3.1 + this.r() * 0.5), wait: this.r() * 6 });
      }
    }
  }

  step(dt: number, hour: number) {
    const T = this.traffic, time = T.time, act = activity(hour), L = this.list; L.length = 0;
    // --- arrêts de bus
    const want = Math.round(3 * act);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && T.busStops.length) {
      this.spawnT = 2 + this.r() * 3;
      const s = T.busStops[Math.floor(this.r() * T.busStops.length)], w = this.waiting.get(s)!;
      if (w.length < want) { const f = fig(Math.floor(this.r() * 6)); f.pause = 1; w.push(f); }
      else if (w.length > want || this.r() < 0.05) w.pop();
    }
    for (const v of T.vehicles) {
      if (v.kind !== 'bus' || !v.stopDone || v.holdUntil === undefined || time >= v.holdUntil || v.v > 0.3) continue;
      const s = T.busStopOf(v.stopDone); if (!s) continue;
      const w = this.waiting.get(s)!;
      if (w.length && time - (this.boardT.get(s) ?? -9) > 1.1) { w.pop(); this.boardT.set(s, time); this.boarded++; }
    }
    for (const [s, w] of this.waiting) w.forEach((f, i) => {
      f.x = s.x + s.tx * (i - 1) * 1.1 + s.ox * 0.2; f.z = s.z + s.tz * (i - 1) * 1.1 + s.oz * 0.2; f.y = s.y + 0.15;
      f.hx = -s.ox; f.hz = -s.oz; f.pause = 1; L.push(f);
    });
    // --- livreurs
    for (const v of T.vehicles) {
      if (v.kind !== 'truck' || !v.stopDone || v.holdFrom === undefined || v.holdUntil === undefined || time >= v.holdUntil) { if (this.couriers.has(v) && (v.holdUntil === undefined || time >= v.holdUntil)) this.couriers.delete(v); continue; }
      const ds = T.dropStopOf(v.stopDone); if (!ds) continue;
      let f = this.couriers.get(v); if (!f) { f = fig(v.id % 6); this.couriers.set(v, f); this.deliveries++; }
      const u = (time - v.holdFrom) / (v.holdUntil - v.holdFrom);
      const ax = v.x + ds.ox * 2.2, az = v.z + ds.oz * 2.2, bx = ds.x + ds.ox * 9, bz = ds.z + ds.oz * 9;
      let k: number, dir = 1;
      if (u > 0.1 && u < 0.38) k = (u - 0.1) / 0.28; else if (u > 0.62 && u < 0.9) { k = 1 - (u - 0.62) / 0.28; dir = -1; } else continue;
      f.x = ax + (bx - ax) * k; f.z = az + (bz - az) * k; f.y = ds.y + 0.15;
      f.hx = (bx - ax) * dir; f.hz = (bz - az) * dir; f.phase += dt * 9; f.pause = 0; L.push(f);
    }
    for (const v of this.couriers.keys()) if (!T.vehicles.includes(v)) this.couriers.delete(v);
    // --- ouvriers du dépôt (journée seulement)
    if (hour > 5.5 && hour < 21) for (const w of this.workers) {
      if (w.wait > 0) { w.wait -= dt; w.pause = 1; }
      else {
        w.pause = 0; w.off += w.dir * 1.15 * dt; w.phase += dt * 8;
        if (w.off < 3 || w.off > w.edge.len - 3) { w.dir = (w.dir * -1) as 1 | -1; w.off = Math.max(3, Math.min(w.edge.len - 3, w.off)); w.wait = 3 + this.r() * 8; }
        else if (this.r() < dt * 0.04) w.wait = 2 + this.r() * 6;
      }
      const p = w.edge.at(w.off);
      w.x = p.x - p.tz * w.lat; w.z = p.z + p.tx * w.lat; w.y = p.y + 0.2; w.hx = p.tx * w.dir; w.hz = p.tz * w.dir;
      L.push(w);
    }
  }
}
