// Parapente : décollage en courant face à la pente, ascendance en spirale, transit plané vers l'atterrissage, spirale de perte d'altitude, approche et atterrissage.
// Un petit nombre de voiles à la fois, de 10 h à 17 h 30 par temps calme. Simulation pure (sans Three.js).
import type { Athlete } from './athlete';
import type { Mount } from './outdoor';
import type { GliderSite } from './sport';
import { rng } from './cityplan';

export type GState = 'prep' | 'run' | 'climb' | 'transit' | 'descend' | 'final' | 'landed';
export interface Glider { id: number; m: Mount; pilot: Athlete; state: GState; t: number; hdg: number; turn: 1 | -1; alt: number; target: number; v: number; vy: number; hidden: boolean; label: string }

const TAU = Math.PI * 2;
const COLORS = [0xe8453c, 0x2f6fd0, 0xf2c230, 0x39a86b, 0xee7d2c, 0x8e5bd0, 0xf06aa8, 0x20b8c8];

export class GliderOps {
  readonly gliders: Glider[] = [];
  private nid = 1; private rand: () => number; private lastSpawn = -999; private clock = 0;
  want = 0;
  constructor(readonly site: GliderSite, private ground: (x: number, z: number) => number, seed = 1) { this.rand = rng(seed ^ 0x6e11); }
  get mounts(): Mount[] { return this.gliders.map(g => g.m); }
  get athletes(): Athlete[] { return this.gliders.map(g => g.pilot); }

  private spawn() {
    const r = this.rand, S = this.site, L = S.launch, hdg = Math.PI / 2 - S.down;   // cap monde (atan2(x,z)) de la descente de pente : down est un angle (x,z) → cap = π/2 − down
    const color = COLORS[Math.floor(r() * COLORS.length)];
    const pilot: Athlete = { id: 8000000 + this.nid, x: L.x, y: L.y, z: L.z, yaw: hdg, pose: 'stand', phase: 0, v: 0, lean: 0, roll: 0, lift: 0, scale: 1, shirt: [0xd8352f, 0x2a2a2c, 0x2f6fd0, 0xf2f2f2][Math.floor(r() * 4)], shorts: 0x23262e, skin: 0xe8c4a0, lamp: false, mount: null, hidden: false, tag: 'parapente' };
    const m: Mount = { id: this.nid++, kind: 'glider', x: L.x, y: L.y, z: L.z, yaw: hdg, pitch: 0, roll: 0, phase: 0, v: 0, color, n: 1, len: 10.5, hidden: false };
    this.gliders.push({ id: m.id, m, pilot, state: 'prep', t: 0, hdg, turn: r() < 0.5 ? 1 : -1, alt: 0, target: 150 + r() * 130, v: 0, vy: 0, hidden: false, label: 'Parapente' });
  }

  step(dt: number, c: { hour: number; rain: number; storm: number; fog?: number }) {
    this.clock += dt;
    const ok = c.hour >= 10 && c.hour < 17.5 && c.rain < 0.15 && c.storm < 0.1 && (c.fog ?? 0) < 0.4;
    this.want = ok ? 3 : 0;
    if (this.gliders.filter(g => g.state === 'prep' || g.state === 'run' || g.state === 'climb' || g.state === 'transit' || g.state === 'descend' || g.state === 'final').length < this.want && this.clock - this.lastSpawn > 70) { this.spawn(); this.lastSpawn = this.clock; }
    for (const g of this.gliders) this.fly(g, dt);
    for (let i = this.gliders.length - 1; i >= 0; i--) if (this.gliders[i].hidden) this.gliders.splice(i, 1);
  }

  private fly(g: Glider, dt: number) {
    const S = this.site, m = g.m, p = g.pilot; g.t += dt;
    const gnd = (x: number, z: number) => this.ground(x, z);
    const wind = [Math.cos(S.down + Math.PI) * 0.8, Math.sin(S.down + Math.PI) * 0.8];   // léger vent de face (vers la pente)
    const hx = () => Math.sin(g.hdg), hz = () => Math.cos(g.hdg);
    const settle = (k: number, to: number, a: number) => k + (to - k) * Math.min(1, dt * a);
    switch (g.state) {
      case 'prep': {
        m.phase = Math.min(1, g.t / 9); p.pose = 'stand'; p.x = m.x = S.launch.x; p.z = m.z = S.launch.z; p.y = m.y = S.launch.y; p.yaw = m.yaw = g.hdg; m.roll = 0; m.pitch = 0;
        if (g.t > 12) { g.state = 'run'; g.t = 0; g.v = 0.5; }
        break;
      }
      case 'run': {
        g.v += dt * 1.9; m.phase = 1; p.pose = 'run'; p.v = g.v; p.phase += dt * TAU * (1.4 + 0.2 * g.v); p.lean = 0.25;
        p.x += hx() * g.v * dt; p.z += hz() * g.v * dt; p.y = gnd(p.x, p.z);
        if (g.t > 4.2) { g.state = 'climb'; g.alt = p.y - gnd(p.x, p.z); g.vy = 0; g.v = 8.8; g.t = 0; }
        m.x = p.x; m.z = p.z; m.y = p.y; m.yaw = p.yaw = g.hdg; m.pitch = 0.1;
        break;
      }
      case 'climb': case 'transit': case 'descend': case 'final': {
        let sink: number, bankT = 0, spd = 9.0;
        const L = S.land, dx = L.x - p.x, dz = L.z - p.z, d = Math.hypot(dx, dz), agl = p.y - gnd(p.x, p.z), aglL = p.y - L.y;
        if (g.state === 'climb') {
          sink = -(1.5 + 0.5 * Math.sin(g.t * 0.3)); bankT = 0.38 * g.turn; g.hdg += g.turn * (spd / 55) * dt;
          if (agl < 25) { sink = -3.2; g.hdg += 0; }
          if (p.y - S.launch.y > g.target && g.t > 20) { g.state = 'transit'; g.t = 0; }
        } else if (g.state === 'transit') {
          sink = 1.05; this.turnToward(g, Math.atan2(dx, dz), dt, 0.5); bankT = 0.12 * Math.sign(this.dh(g, Math.atan2(dx, dz)));
          if (d < 160 || aglL < 90) { g.state = 'descend'; g.t = 0; g.turn = this.dh(g, Math.atan2(dx, dz)) >= 0 ? 1 : -1; }
        } else if (g.state === 'descend') {
          sink = 1.7; bankT = 0.42 * g.turn; g.hdg += g.turn * (spd / 60) * dt;
          // on garde l'atterrissage à portée : si l'on s'en éloigne trop, on recentre
          if (d > 190) this.turnToward(g, Math.atan2(dx, dz), dt, 0.5);
          if (aglL < 42 && d < 200) { g.state = 'final'; g.t = 0; }
        } else {
          const tt = Math.max(0.5, d / Math.max(3.5, g.v)); sink = Math.max(0.4, Math.min(3.0, (aglL - 1.4) / tt)); this.turnToward(g, Math.atan2(dx, dz), dt, 1.0); bankT = 0;
          spd = d < 14 ? 4.5 : 8.0;
          if (d < 4 || agl < 1.6) { g.state = 'landed'; g.t = 0; p.pose = 'stand'; m.pitch = 0; m.roll = 0; }
        }
        g.v = settle(g.v, spd, 1.2); g.vy = settle(g.vy, -sink, 1.5);
        p.x += hx() * g.v * dt + wind[0] * dt * (g.state === 'climb' ? 1 : 0.4); p.z += hz() * g.v * dt + wind[1] * dt * (g.state === 'climb' ? 1 : 0.4); p.y += g.vy * dt;
        const floor = gnd(p.x, p.z) + (g.state === 'final' ? 0.1 : 14);
        if (p.y < floor) p.y = floor;
        m.roll = settle(m.roll, -bankT, 1.4); m.pitch = settle(m.pitch, g.state === 'climb' ? 0.02 : g.state === 'final' ? -0.18 : -0.06, 1.2);
        m.x = p.x; m.y = p.y; m.z = p.z; m.yaw = p.yaw = g.hdg; m.phase = 1; m.v = g.v;
        p.pose = 'glide'; p.roll = m.roll * 0.5; p.lean = 0; p.v = g.v;
        break;
      }
      case 'landed': {
        p.y = gnd(p.x, p.z); m.y = p.y; m.x = p.x; m.z = p.z; p.v = 0; m.v = 0; m.roll = 0; p.roll = 0;
        m.phase = Math.max(0, 1 - g.t / 7); p.pose = g.t < 8 ? 'stand' : 'walk'; p.lean = 0;
        if (g.t >= 8) { p.v = 1.4; p.phase += dt * 5; p.x += Math.sin(p.yaw + 2.5) * 1.3 * dt; p.z += Math.cos(p.yaw + 2.5) * 1.3 * dt; p.y = gnd(p.x, p.z); m.x = p.x - Math.sin(g.hdg) * 2; m.z = p.z - Math.cos(g.hdg) * 2; m.y = gnd(m.x, m.z); }
        if (g.t > 24) { g.hidden = true; m.hidden = true; p.hidden = true; }
        break;
      }
    }
  }
  /** écart de cap signé (rad) entre le cap actuel et `to` */
  private dh(g: Glider, to: number) { let d = to - g.hdg; d = Math.atan2(Math.sin(d), Math.cos(d)); return d; }
  private turnToward(g: Glider, to: number, dt: number, rate: number) { const d = this.dh(g, to), mx = rate * dt; g.hdg += Math.max(-mx, Math.min(mx, d)); }
}
