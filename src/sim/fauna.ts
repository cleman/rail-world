import type { Terrain } from './terrain';
import type { WorldPlan } from './planning';
import { vnoise } from './terrain';
import { rng } from './cityplan';
import { Aircraft, type Plane } from './aircraft';
import { seaS, type Sea } from './water';
import type { Poi } from './pois';
export type { Plane } from './aircraft';

export interface Animal { kind: 'vache' | 'mouton'; x: number; y: number; z: number; h: number; hx: number; hz: number; tx: number; tz: number; wait: number; speed: number; herd: number; fear: number }
export interface Herd { x: number; z: number; r: number; kind: 'vache' | 'mouton' }
export interface Flock { cx: number; cz: number; alt: number; rad: number; speed: number; phase: number; birds: { dx: number; dy: number; dz: number; ph: number }[] }
/** Oiseau posé au bord de la voie : s'envole quand un train approche. */
export interface Perched { x: number; y: number; z: number; yaw: number; flap: number; state: 'posé' | 'vol' | 'parti'; t: number; vx: number; vz: number; delay: number; hx: number; hz: number; hy: number; group: number }
export interface Threat { x: number; z: number; v: number }
/** Avion de ligne en haute altitude : traverse le ciel de temps en temps en laissant une traînée de condensation. */
export interface Liner { active: boolean; x: number; y: number; z: number; yaw: number; wait: number; trail: { x: number; y: number; z: number; age: number }[]; since: number }
export interface Balloon { x: number; y: number; z: number; hue: number }

/** Faune et traffic de loisir : troupeaux qui broutent, nuées d'oiseaux, avion sur une grande boucle, montgolfière, la navigation est dans boats.ts. Aucune dépendance à Three.js. */
export class Fauna {
  readonly herds: Herd[] = [];
  readonly animals: Animal[] = [];
  readonly flocks: Flock[] = [];
  /** Avions : [0] avion de l'aérodrome (ou grande boucle sans aérodrome), puis le second avion et l'hydravion. */
  readonly aircraft: Aircraft[] = [];
  readonly fallback: Plane = { x: 0, y: 400, z: 0, yaw: 0, bank: 0, pitch: 0, mode: 'vol' };
  /** Avion principal (compatibilité : réalisateur, tests). */
  get plane(): Plane { return this.aircraft[0] ?? this.fallback; }
  get landings() { return this.aircraft.reduce((n, a) => n + a.landings, 0); }
  readonly perched: Perched[] = [];
  readonly liner: Liner = { active: false, x: 0, y: 950, z: 0, yaw: 0, wait: 25, trail: [], since: 0 };
  readonly balloon: Balloon = { x: 0, y: 150, z: 0, hue: 0 };
  t = 0;
  private rand: () => number;
  private cx = 0; private cz = 0; private loopR = 1800;

  constructor(private terrain: Terrain, private wp: WorldPlan, roadD: (x: number, z: number) => number, seed = 1, half = 2200, private opts: { airfield?: Poi; guides?: { x: number; z: number; tf?: number; bf?: number }[]; sea?: Sea | null } = {}) {
    const rand = this.rand = rng(seed ^ 0xfa7a);
    // troupeaux : en terrain dégagé (hors forêt), loin des voies, routes, villes, rivières et lac
    const free = (x: number, z: number, r: number) =>
      wp.zoneRatio(x, z) > 1.25 && wp.trackD(x, z) > r + 55 && roadD(x, z) > r + 30 && wp.riverD(x, z) > r + 12 && !wp.inLake(x, z, r + 12) &&
      vnoise(x / 420 + 4, z / 420 + 9, 77) < 0.4 && Math.abs(terrain.height(x + r, z) - terrain.height(x - r, z)) < r * 0.5 && Math.abs(terrain.height(x, z + r) - terrain.height(x, z - r)) < r * 0.5;
    for (let g = 0; g < 4000 && this.herds.length < 12; g++) {
      const x = (rand() * 2 - 1) * half, z = (rand() * 2 - 1) * half, r = 30 + rand() * 14;
      if (!free(x, z, r) || this.herds.some(h => Math.hypot(h.x - x, h.z - z) < 160)) continue;
      const kind = this.herds.length % 2 ? 'mouton' : 'vache';
      this.herds.push({ x, z, r, kind });
      const n = 6 + Math.floor(rand() * 8);
      for (let i = 0; i < n; i++) {
        const a = rand() * 6.28, d = Math.sqrt(rand()) * r, ax = x + Math.cos(a) * d, az = z + Math.sin(a) * d;
        this.animals.push({ kind, x: ax, y: terrain.height(ax, az), z: az, h: rand() * 6.28, hx: 0, hz: 1, tx: ax, tz: az, wait: rand() * 8, speed: 0.5 + rand() * 0.5, herd: this.herds.length - 1, fear: 0 });
      }
    }
    // oiseaux : quelques nuées de 7 à 14
    for (let f = 0; f < 6; f++) {
      const n = 7 + Math.floor(rand() * 8);
      this.flocks.push({ cx: (rand() * 2 - 1) * half * 0.8, cz: (rand() * 2 - 1) * half * 0.8, alt: 70 + rand() * 90, rad: 220 + rand() * 380, speed: 0.05 + rand() * 0.04, phase: rand() * 6.28,
        birds: Array.from({ length: n }, () => ({ dx: (rand() - 0.5) * 26, dy: (rand() - 0.5) * 9, dz: (rand() - 0.5) * 26, ph: rand() * 6.28 })) });
    }
    this.half = half;
    this.balloon.x = -half * 0.6; this.balloon.z = (rand() * 2 - 1) * half * 0.5; this.balloon.hue = rand();
    this.loopR = half * 0.8;
    // oiseaux posés près de la voie
    const gs = opts.guides ?? [];
    for (let g = 0, grp = 0; g < 400 && grp < 10 && gs.length; g++) {
      const gd = gs[Math.floor(rand() * gs.length)]; if (gd.tf || gd.bf) continue;
      const a = rand() * 6.28, d = 11 + rand() * 6, x = gd.x + Math.cos(a) * d, z = gd.z + Math.sin(a) * d, td = wp.trackD(x, z);
      if (td < 8 || td > 22 || roadD(x, z) < 8 || wp.zoneRatio(x, z) < 1.2 || wp.inLake(x, z, 8) || wp.riverD(x, z) < 6) continue;
      for (let k = 0; k < 5 + Math.floor(rand() * 4); k++) {
        const bx = x + (rand() - 0.5) * 6, bz = z + (rand() - 0.5) * 6;
        this.perched.push({ x: bx, y: terrain.height(bx, bz) + 0.12, z: bz, yaw: rand() * 6.28, flap: 0, state: 'posé', t: 0, vx: 0, vz: 0, delay: rand() * 0.9, hx: bx, hz: bz, hy: terrain.height(bx, bz) + 0.12, group: grp });
      }
      grp++;
    }
    this.initAircraft();
    this.step(0);
  }
  private half = 2200;

  step(dt: number, threats: Threat[] = []) {
    this.t += dt;
    const t = this.t, T = this.terrain;
    // animaux : marchent vers un point d'herbe voisin, s'arrêtent brouter
    for (const a of this.animals) {
      const H = this.herds[a.herd];
      // un train qui approche (moins de 150 m) fait fuir les animaux, à l'opposé du train, sans trop s'éloigner de leur pré
      let near: Threat | null = null, nd = 150;
      for (const th of threats) { if (th.v < 2) continue; const d = Math.hypot(th.x - a.x, th.z - a.z); if (d < nd) { nd = d; near = th; } }
      if (near) a.fear = 7;
      if (a.fear > 0) {
        a.fear -= dt;
        const dx = a.x - (near?.x ?? a.x - a.hx), dz = a.z - (near?.z ?? a.z - a.hz), d = Math.hypot(dx, dz) || 1;
        if (Math.hypot(a.x - H.x, a.z - H.z) < H.r + 20 || !near) { a.hx = dx / d; a.hz = dz / d; a.x += a.hx * 3.2 * dt; a.z += a.hz * 3.2 * dt; a.h = Math.atan2(a.hx, a.hz); }
        a.wait = 0; a.tx = H.x + (a.x - H.x) * 0.4; a.tz = H.z + (a.z - H.z) * 0.4;
        a.y = T.height(a.x, a.z); continue;
      }
      if (a.wait > 0) a.wait -= dt;
      else {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.8) {
          a.wait = 4 + this.rand() * 14;
          const ang = this.rand() * 6.28, rr = Math.sqrt(this.rand()) * H.r; a.tx = H.x + Math.cos(ang) * rr; a.tz = H.z + Math.sin(ang) * rr;
        } else {
          a.hx = dx / d; a.hz = dz / d; a.x += a.hx * a.speed * dt; a.z += a.hz * a.speed * dt; a.h = Math.atan2(a.hx, a.hz);
        }
      }
      a.y = T.height(a.x, a.z);
    }
    // oiseaux et avion : fonctions du temps
    this.stepPlane(dt);
    this.stepLiner(dt);
    // montgolfière : dérive vers l'est, altitude qui varie, réapparaît à l'ouest
    const B = this.balloon; B.x += 3.2 * dt; B.z += Math.sin(t * 0.01) * 1.2 * dt; if (B.x > this.half) B.x = -this.half;
    B.y = Math.max(T.height(B.x, B.z) + 60, 150 + Math.sin(t * 0.03) * 40);
    // oiseaux posés : s'envolent à l'approche d'un train, reviennent quand il est parti
    const groups = new Map<number, Perched[]>();
    for (const b of this.perched) { const l = groups.get(b.group); if (l) l.push(b); else groups.set(b.group, [b]); }
    for (const l of groups.values()) {
      let th: Threat | null = null;
      for (const q of threats) if (q.v > 2 && Math.hypot(q.x - l[0].hx, q.z - l[0].hz) < 100 && (!th || true)) th = q;
      const calm = !threats.some(q => Math.hypot(q.x - l[0].hx, q.z - l[0].hz) < 260);
      for (const b of l) {
        if (b.state === 'posé') { b.flap = 0; if (th) { b.delay -= dt; if (b.delay <= 0) { b.state = 'vol'; b.t = 0; const dx = b.x - th.x, dz = b.z - th.z, d = Math.hypot(dx, dz) || 1; b.vx = (dx / d + (Math.sin(b.hx) * 0.4)) * 8; b.vz = (dz / d + Math.cos(b.hz) * 0.4) * 8; } } }
        else if (b.state === 'vol') {
          b.t += dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y = Math.min(b.hy + 40, b.y + 6.5 * dt); b.yaw = Math.atan2(b.vx, b.vz); b.flap = Math.sin(this.t * 14 + b.hx);
          if (b.t > 16) b.state = 'parti';
        } else if (calm) { b.state = 'posé'; b.x = b.hx; b.z = b.hz; b.y = b.hy; b.delay = Math.random() * 0.9; }
      }
    }
  }

  // ---------- avions ----------
  private initAircraft() {
    const A = this.opts.airfield, T = this.terrain, sea = this.opts.sea, ground = (x: number, z: number) => T.height(x, z);
    if (A) {
      const Y0 = A.rot;      // cap de la piste : avant = (sin, cos) = (sin rot, cos rot), comme la piste dessinée (poi.ts)
      this.aircraft.push(new Aircraft({ kind: 'léger', name: 'Piper rouge', cx: A.x, cz: A.z, y0: A.y + 0.4, Y0, sgn: 1, landEvery: 3, lap0: 0, s0: 0, ground }));
      this.aircraft.push(new Aircraft({ kind: 'léger', name: 'Biplan', cx: A.x, cz: A.z, y0: A.y + 0.4, Y0, sgn: 1, landEvery: 0, lap0: 0, lowPass: true, s0: 3000, ground, park: 30 }));
    }
    if (sea) {
      // hydravion : bande d'eau parallèle à la côte, à 280 m du rivage, circuit côté large
      const along = (this.rand() * 2 - 1) * 900, s = 330, tx = -sea.uz, tz = sea.ux;
      const cx = sea.ux * (sea.c0 + s) + tx * along, cz = sea.uz * (sea.c0 + s) + tz * along, Y0 = Math.atan2(tx, tz);
      // le circuit est à gauche de la piste ; on veut qu'il parte vers le large : gauche = (cos Y0, −sin Y0)
      const left = Math.cos(Y0) * sea.ux - Math.sin(Y0) * sea.uz;
      this.aircraft.push(new Aircraft({ kind: 'hydravion', name: 'Hydravion jaune', cx, cz, y0: sea.level + 0.45, Y0, sgn: left >= 0 ? 1 : -1, landEvery: 2, lap0: 1, s0: 600, ground, park: 25 }));
      void seaS;
    }
  }
  private stepLiner(dt: number) {
    const L = this.liner, R = this.rand;
    for (const p of L.trail) p.age += dt;
    while (L.trail.length && L.trail[0].age > 80) L.trail.shift();
    if (!L.active) {
      L.wait -= dt;
      if (L.wait <= 0 && dt > 0) {      // nouveau vol : d'un bord à l'autre, avec un décalage latéral
        const th = R() * Math.PI * 2, off = (R() * 2 - 1) * 1400, D = 4200, tx = -Math.sin(th), tz = Math.cos(th);
        L.x = Math.cos(th) * D + tx * off; L.z = Math.sin(th) * D + tz * off; L.yaw = Math.atan2(-Math.cos(th), -Math.sin(th)); L.y = 880 + R() * 220; L.active = true; L.since = 0;
      }
      return;
    }
    L.since += dt; L.x += Math.sin(L.yaw) * 125 * dt; L.z += Math.cos(L.yaw) * 125 * dt;
    { const last = L.trail[L.trail.length - 1]; if (!last || Math.hypot(last.x - L.x, last.z - L.z) > 90) L.trail.push({ x: L.x, y: L.y, z: L.z, age: 0 }); }
    if (Math.hypot(L.x, L.z) > 4600 && L.since > 10) { L.active = false; L.wait = 80 + R() * 200; }
  }
  private stepPlane(dt: number) {
    if (!this.aircraft.length) {                          // pas d'aérodrome : grande boucle à ~420 m
      const P = this.fallback, ph = this.t * 0.012, px = this.cx + Math.cos(ph) * this.loopR, pz = this.cz + Math.sin(ph) * this.loopR * 0.8;
      P.yaw = Math.atan2(-Math.sin(ph) * this.loopR, Math.cos(ph) * this.loopR * 0.8); P.x = px; P.z = pz; P.y = 420 + Math.sin(this.t * 0.02) * 40; P.bank = -0.22; P.pitch = 0; P.mode = 'vol';
      return;
    }
    for (const a of this.aircraft) a.step(dt);
  }

  /** Position d'un oiseau d'une nuée (calculée à la demande). */
  bird(f: Flock, i: number, out: { x: number; y: number; z: number; yaw: number; flap: number }) {
    const b = f.birds[i], a = this.t * f.speed + f.phase, cx = f.cx + Math.cos(a) * f.rad, cz = f.cz + Math.sin(a) * f.rad;
    const vx = -Math.sin(a), vz = Math.cos(a), rx = Math.cos(a), rz = Math.sin(a);
    out.x = cx + b.dx * rx + b.dz * vx + Math.sin(this.t * 0.3 + b.ph) * 2; out.z = cz + b.dx * rz + b.dz * vz;
    out.y = f.alt + b.dy + Math.sin(this.t * 0.2 + b.ph) * 4; out.yaw = Math.atan2(vx, vz);
    out.flap = Math.sin(this.t * 7 + b.ph);
  }
}
