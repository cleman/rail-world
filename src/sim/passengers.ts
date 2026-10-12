// Voyageurs sur les quais : attente (plus nombreux avant l'arrivée d'une rame), descente à l'arrêt, montée avant le départ.
// Simulation pure (sans Three.js). Chaque voyageur vit en coordonnées de quai (abscisse d, décalage latéral lat).
import type { Edge } from './network';
import type { Train, World } from './world';
import { activity, type Walker } from './pedestrians';

export interface Passenger extends Walker {
  e: Edge; d: number; lat: number; td: number; tlat: number; mode: 'come' | 'wait' | 'board' | 'leave'; delay: number;
}

const PLAT_Y = 0.9, EXIT_LAT = 12.5, LAT0 = 2.3, LAT1 = 5.0, MAXW = 26;

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Platforms {
  readonly list: Passenger[] = [];
  private plats: Edge[];
  private r: () => number;
  private seen = new Map<Train, Edge>();
  private nextId = 100000;

  constructor(readonly world: World, seed = 23) {
    this.r = rng(seed);
    this.plats = world.net.edges.filter(e => e.kind === 'plat' && !e.mirror);
  }

  private mk(e: Edge, d: number, lat: number, mode: Passenger['mode']): Passenger {
    const p: Passenger = {
      id: this.nextId++, edge: null as never, s: 0, dir: 1, side: 1, v: 1.0 + this.r() * 0.4, pause: 0, x: 0, y: 0, z: 0, hx: 0, hz: 1, phase: this.r() * 6.28, kind: Math.floor(this.r() * 6),
      e, d, lat, td: d, tlat: lat, mode, delay: 0,
    };
    this.place(p); return p;
  }

  private place(p: Passenger) {
    const s = p.e.at(Math.max(0, Math.min(p.e.len, p.d)));
    p.x = s.x - s.tz * p.lat; p.z = s.z + s.tx * p.lat; p.y = s.y + PLAT_Y;
  }

  private doors(t: Train, e: Edge): number[] {
    const out: number[] = [];
    for (let k = 0; k < t.cars; k++) out.push(e.stopOffset - (k * (t.carLen + t.gap) + t.carLen / 2));
    return out;
  }

  private count(e: Edge) { let n = 0; for (const p of this.list) if (p.e === e && (p.mode === 'wait' || p.mode === 'come')) n++; return n; }

  step(dt: number, hour = 12) {
    const act = activity(hour);
    for (const e of this.plats) {
      const dEnd = e.stopOffset;
      const dwelling = this.world.trains.find(t => t.head === e && t.dwell > 0 && t.lastStop === e);
      const approaching = !dwelling && this.world.trains.some(t => t.status !== 'stored' && t.reserved.includes(e));
      const target = Math.round(act * (approaching ? 12 : 3) * (1 + 0.5 * this.r()));
      const have = this.count(e);
      if (have < Math.min(target, MAXW) && this.r() < dt * (approaching ? 1.2 : 0.15)) {
        const d = Math.max(4, dEnd - 12 - this.r() * 118);
        this.list.push(this.mk(e, d, EXIT_LAT, 'come'));
        const p = this.list[this.list.length - 1]; p.td = d; p.tlat = LAT0 + this.r() * (LAT1 - LAT0);
      }
      if (dwelling) {
        if (this.seen.get(dwelling) !== e) {                      // début d'arrêt : descente
          this.seen.set(dwelling, e);
          const doors = this.doors(dwelling, e), n = Math.round((2 + this.r() * 6) * dwelling.cars * (0.3 + act) / 2);
          for (let i = 0; i < n; i++) {
            const dd = doors[Math.floor(this.r() * doors.length)] + (this.r() - 0.5) * 3;
            const p = this.mk(e, dd, 1.9, 'leave'); p.td = dd + (this.r() - 0.5) * 10; p.tlat = EXIT_LAT; p.delay = this.r() * 4;
            this.list.push(p);
          }
          for (const p of this.list) if (p.e === e && p.mode === 'wait') p.delay = 3 + this.r() * 8;   // montée après la descente
        }
        const doors = this.doors(dwelling, e);
        for (const p of this.list) if (p.e === e && p.mode === 'wait' && dwelling.dwell < 12 && this.r() < dt * 0.6) {
          let best = doors[0]; for (const dd of doors) if (Math.abs(dd - p.d) < Math.abs(best - p.d)) best = dd;
          p.mode = 'board'; p.td = best; p.tlat = 1.9; p.delay = 0;
        }
      }
    }
    for (const t of this.seen.keys()) if (t.dwell <= 0 || t.head !== this.seen.get(t)) this.seen.delete(t);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.delay > 0) { p.delay -= dt; p.pause = 1; continue; }
      const dd = p.td - p.d, dl = p.tlat - p.lat, dist = Math.hypot(dd, dl);
      if (dist < 0.3) {
        if (p.mode === 'come') { p.mode = 'wait'; p.pause = 1; }
        else if (p.mode === 'board' || p.mode === 'leave') { this.list.splice(i, 1); continue; }
        else p.pause = 1;
        continue;
      }
      p.pause = 0;
      const k = Math.min(1, p.v * dt / dist);
      p.d += dd * k; p.lat += dl * k; p.phase += dt * p.v * 4.2;
      const sdx = dd / dist, sdl = dl / dist, s = p.e.at(Math.max(0, Math.min(p.e.len, p.d)));
      p.hx = s.tx * sdx - s.tz * sdl; p.hz = s.tz * sdx + s.tx * sdl;
      this.place(p);
      // un voyageur qui attend alors qu'aucune rame n'arrive finit par repartir
      if (p.mode === 'wait' && this.r() < dt * 0.002 && !this.world.trains.some(t => t.reserved.includes(p.e) || t.head === p.e)) { p.mode = 'leave'; p.td = p.d; p.tlat = EXIT_LAT; }
    }
  }
}
