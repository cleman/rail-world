// Planeur : remorquage par un avion (roulage, montée, largage), ascendances (spirales), transits planés d'une ascendance à l'autre,
// retour, spirale de perte d'altitude, approche et atterrissage sur le terrain. De 10 h à 17 h 30 par temps calme et dégagé.
// Simulation pure (sans Three.js). Le terrain est la piste de l'aérodrome s'il y en a un, sinon une prairie dégagée.
import type { Mount } from './outdoor';
import { rng } from './cityplan';

export interface Field { x: number; y: number; z: number; /** cap de la piste (rad, avant = (sin, cos)) */ rot: number }
export type SState = 'grid' | 'tow' | 'winch' | 'glide' | 'thermal' | 'return' | 'spiral' | 'approach' | 'final' | 'rollout' | 'parked';
export type TState = 'roll' | 'climb' | 'leave' | 'final' | 'rollout' | 'gone';
export interface Tug { m: Mount; state: TState; t: number; hdg: number; v: number; vy: number; target: number }
export interface Sail { id: number; m: Mount; tug: Tug | null; state: SState; t: number; hdg: number; turn: 1 | -1; v: number; vy: number; hidden: boolean; label: string; th: number; thermal: number; cap: number; flown: number; ang: number; launch: 'tow' | 'winch'; rad: number; /** treuil : point d'ancrage du câble */ wm: Mount | null; top: number }
export interface Thermal { x: number; z: number; r: number; w: number }

const TAU = Math.PI * 2, SINK = 0.8, V_CRUISE = 29, V_THERMAL = 23, RAD = 88, ROPE = 52;
const COLORS = [0xffffff, 0xf4f1e6, 0xfff4c8, 0xe6f0ff, 0xffe0d0];
const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class SailplaneOps {
  readonly planes: Sail[] = []; readonly thermals: Thermal[] = [];
  private nid = 1; private rand: () => number; private lastSpawn = -999; private clock = 0; want = 0;
  constructor(readonly field: Field, private ground: (x: number, z: number) => number, seed = 1) {
    this.rand = rng(seed ^ 0x5a11);
    const r = this.rand, n = 7;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.6, d = 900 + r() * 2600; this.thermals.push({ x: field.x + Math.cos(a) * d, z: field.z + Math.sin(a) * d, r: 80 + r() * 40, w: 2.2 + r() * 1.2 }); }
  }
  get mounts(): Mount[] { const o: Mount[] = []; for (const s of this.planes) { o.push(s.m); if (s.tug && s.tug.state !== 'gone') o.push(s.tug.m); } return o; }
  /** couples (avion remorqueur, planeur) reliés par un câble */
  get ropes(): [Mount, Mount][] {
    const o: [Mount, Mount][] = [];
    for (const s of this.planes) { if (s.state === 'tow' && s.tug && !s.tug.m.hidden) o.push([s.tug.m, s.m]); else if (s.state === 'winch' && s.wm) o.push([s.wm, s.m]); }
    return o;
  }

  private forceUntil = -1;
  /** Fait voler un planeur tout de suite (pour aller le voir hors horaires) : on avance la simulation jusqu'à sa première ascendance. */
  summon(): Sail {
    this.forceUntil = this.clock + 1500; this.spawn(); this.lastSpawn = this.clock; const s = this.planes[this.planes.length - 1];
    for (let i = 0; i < 6000 && s.state !== 'thermal'; i++) this.step(0.1, { hour: 12, rain: 0, storm: 0 });
    return s;
  }
  private fwd() { return [Math.sin(this.field.rot), Math.cos(this.field.rot)] as const; }
  private mount(kind: 'sailplane' | 'tug', color: number, len: number): Mount { return { id: this.nid++, kind, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, phase: 0, v: 0, color, n: 1, len, hidden: false }; }

  private spawn() {
    const r = this.rand, F = this.field, [fx, fz] = this.fwd(), side = (r() < 0.5 ? -1 : 1) * (9 + r() * 6);
    const sx = F.x - fx * 150 - fz * side, sz = F.z - fz * 150 + fx * side;
    const m = this.mount('sailplane', COLORS[Math.floor(r() * COLORS.length)], 15);
    const tm = this.mount('tug', [0xf2c230, 0xd8352f, 0xf2f2ee][Math.floor(r() * 3)], 8);
    const gy = this.ground(sx, sz);
    m.x = sx; m.z = sz; m.y = gy + 0.32; m.yaw = F.rot;
    const winch = r() < 0.45, tug: Tug = { m: tm, state: 'roll', t: 0, hdg: F.rot, v: 0, vy: 0, target: 520 + r() * 330 };
    tm.x = sx + fx * ROPE; tm.z = sz + fz * ROPE; tm.y = this.ground(tm.x, tm.z) + 0.55; tm.yaw = F.rot;
    const wm = winch ? this.mount('tug', 0xffffff, 1) : null; if (wm) { wm.hidden = true; wm.x = sx + fx * 650; wm.z = sz + fz * 650; wm.y = this.ground(wm.x, wm.z) + 0.6; wm.yaw = F.rot + Math.PI; }
    this.planes.push({ id: m.id, m, tug: winch ? null : tug, state: 'grid', t: 0, hdg: F.rot, turn: r() < 0.5 ? 1 : -1, v: 0, vy: 0, hidden: false, label: 'Planeur', th: 0, thermal: -1, cap: 900 + r() * 500, flown: 0, ang: 0, launch: winch ? 'winch' : 'tow', rad: RAD, wm, top: 330 + r() * 120 });
  }

  step(dt: number, c: { hour: number; rain: number; storm: number; fog?: number }) {
    this.clock += dt;
    const ok = this.clock < this.forceUntil || c.hour >= 10 && c.hour < 17.4 && c.rain < 0.15 && c.storm < 0.1 && (c.fog ?? 0) < 0.4;
    this.want = ok ? 4 : 0;
    const live = this.planes.filter(s => s.state !== 'parked' && s.state !== 'rollout').length;
    if (live < this.want && this.clock - this.lastSpawn > 75 && !this.planes.some(s => s.state === 'grid' || s.state === 'winch' || (s.state === 'tow' && s.tug && s.tug.state !== 'leave'))) { this.spawn(); this.lastSpawn = this.clock; }
    for (const s of this.planes) { this.fly(s, dt, ok, c.hour); }
    for (let i = this.planes.length - 1; i >= 0; i--) if (this.planes[i].hidden) this.planes.splice(i, 1);
  }

  private fly(s: Sail, dt: number, ok: boolean, hour: number) {
    const F = this.field, m = s.m, g = (x: number, z: number) => this.ground(x, z), [fx, fz] = this.fwd(); s.t += dt;
    const settle = (k: number, to: number, a: number) => k + (to - k) * Math.min(1, dt * a);
    const tug = s.tug;
    if (tug) this.flyTug(s, tug, dt);
    const touch: [number, number] = [F.x - fx * 20, F.z - fz * 20];
    switch (s.state) {
      case 'grid': {
        m.v = 0; if (s.t > 16 && tug && tug.state === 'roll') { s.state = 'tow'; s.t = 0; s.v = 0; }
        else if (s.t > 14 && s.launch === 'winch') { s.state = 'winch'; s.t = 0; s.v = 0; s.vy = 0; }
        break;
      }
      case 'winch': {
        // treuillage : accélération brutale, rotation puis montée à forte pente, le câble se décroche au sommet
        const agl = m.y - g(m.x, m.z);
        s.v = Math.min(34, s.v + dt * 8); const lift = s.v > 24 ? Math.min(0.62, (s.v - 24) * 0.08 + 0.05) : 0;
        m.x += Math.sin(s.hdg) * s.v * Math.cos(lift) * dt; m.z += Math.cos(s.hdg) * s.v * Math.cos(lift) * dt; s.vy = s.v * Math.sin(lift);
        m.y = Math.max(g(m.x, m.z) + 0.32, m.y + s.vy * dt); m.yaw = s.hdg; m.v = s.v; m.pitch = settle(m.pitch, lift, 3); m.roll = 0;
        if (agl > s.top || s.t > 40) { s.state = 'glide'; s.t = 0; s.vy = 1.5; s.thermal = this.pick(s); s.turn = this.rand() < 0.5 ? 1 : -1; s.v = 30; }
        break;
      }
      case 'tow': {
        if (!tug) { s.state = 'glide'; break; }
        // le planeur suit l'avion à ROPE mètres, légèrement au-dessus de son sillage
        const tx = tug.m.x - Math.sin(tug.hdg) * ROPE, tz = tug.m.z - Math.cos(tug.hdg) * ROPE;
        const slope = tug.v > 5 ? tug.vy / tug.v : 0, ty = tug.m.y + 1.2 - ROPE * slope, gy = g(tx, tz) + 0.32;
        m.x = tx; m.z = tz; m.y = Math.max(gy, ty); m.yaw = tug.hdg; s.hdg = tug.hdg; m.v = tug.v; s.v = tug.v;
        m.pitch = m.y > gy + 0.5 ? Math.atan2(tug.vy, Math.max(5, tug.v)) : 0; m.roll = 0;
        if (tug.state === 'leave' || tug.state === 'final' || tug.state === 'rollout' || tug.state === 'gone') { s.state = 'glide'; s.t = 0; s.v = tug.v; s.vy = 0; s.thermal = this.pick(s); s.turn = this.rand() < 0.5 ? 1 : -1; }
        break;
      }
      case 'glide': case 'return': {
        const agl = m.y - g(m.x, m.z); let tx: number, tz: number, bank = 0;
        if (s.state === 'glide') {
          const T = this.thermals[s.thermal]; tx = T.x; tz = T.z;
          const d = Math.hypot(tx - m.x, tz - m.z);
          if (d < T.r * 0.9) {
            s.state = 'thermal'; s.t = 0; s.th = T.w; s.ang = Math.atan2(m.z - T.z, m.x - T.x); s.turn = this.rand() < 0.5 ? 1 : -1;
            const mates = this.planes.filter(o => o !== s && o.state === 'thermal' && o.thermal === s.thermal);
            if (mates.length) { s.turn = mates[0].turn; s.rad = RAD + 16 * mates.length; }   // tous tournent dans le même sens, sur des rayons un peu différents
            else s.rad = RAD;
          }
          if (agl < 320 || s.flown > 1500 + s.cap || !ok || (hour > 16.9 && hour < 18)) { s.state = 'return'; s.t = 0; }
        } else { tx = touch[0]; tz = touch[1]; if (Math.hypot(tx - m.x, tz - m.z) < 650) { s.state = 'spiral'; s.t = 0; s.ang = Math.atan2(m.z - (F.z - fz * 120), m.x - (F.x - fx * 120)); } }
        const want = Math.atan2(tx - m.x, tz - m.z), dh = norm(want - s.hdg), mx = 0.5 * dt; s.hdg += Math.max(-mx, Math.min(mx, dh)); bank = Math.max(-0.4, Math.min(0.4, dh * 1.4));
        s.v = settle(s.v, V_CRUISE, 1); s.vy = settle(s.vy, -SINK - (s.state === 'return' ? 0.15 : 0), 1);
        this.move(s, dt, bank, 0.0);
        s.flown += dt;
        break;
      }
      case 'thermal': {
        const T = this.thermals[s.thermal]; s.v = V_THERMAL; const rate = (s.v / s.rad) * dt;
        s.ang -= s.turn * rate;
        const px = T.x + Math.cos(s.ang) * s.rad, pz = T.z + Math.sin(s.ang) * s.rad, k = Math.min(1, s.t / 5 + 0.02);
        const nx = m.x + (px - m.x) * (s.t < 5 ? Math.min(1, dt * 0.8) : 1), nz = m.z + (pz - m.z) * (s.t < 5 ? Math.min(1, dt * 0.8) : 1), hx = nx - m.x, hz = nz - m.z;
        if (hx * hx + hz * hz > 1e-6) s.hdg = Math.atan2(hx, hz);
        s.vy = settle(s.vy, T.w * (0.55 + 0.35 * Math.sin(s.t * 0.21)) * (0.85 + 0.15 * k) - 0.9, 0.8);
        m.x = nx; m.z = nz; m.y += s.vy * dt; m.yaw = s.hdg; m.v = s.v;
        m.roll = settle(m.roll, -0.5 * s.turn, 1.2); m.pitch = settle(m.pitch, 0.0, 1);
        s.flown += dt; const agl = m.y - g(m.x, m.z);
        if (agl > s.cap || s.t > 760 || agl < 200 && s.t > 60 && s.vy < 0.2) { s.state = agl < 330 ? 'return' : 'glide'; s.t = 0; s.thermal = this.pick(s); }
        if (!ok || (hour > 17 && hour < 18)) { s.state = 'return'; s.t = 0; }
        break;
      }
      case 'spiral': {
        // spirale de perte d'altitude autour de la tête de piste (aérofreins : taux de chute plus élevé)
        const cx = F.x - fx * 120, cz = F.z - fz * 120, R = 170, agl = m.y - g(m.x, m.z);
        s.v = settle(s.v, 26, 1); s.ang -= s.turn * (s.v / R) * dt;
        const px = cx + Math.cos(s.ang) * R, pz = cz + Math.sin(s.ang) * R, hx = px - m.x, hz = pz - m.z;
        if (hx * hx + hz * hz > 1e-6) s.hdg = Math.atan2(hx, hz);
        s.vy = settle(s.vy, agl > 320 ? -4.5 : -2.4, 1); m.x += hx * Math.min(1, dt * 0.9); m.z += hz * Math.min(1, dt * 0.9); m.y += s.vy * dt; m.yaw = s.hdg; m.v = s.v;
        m.roll = settle(m.roll, -0.45 * s.turn, 1.2); m.pitch = settle(m.pitch, -0.06, 1);
        if (agl < 105) { s.state = 'approach'; s.t = 0; }
        break;
      }
      case 'approach': {
        const px = touch[0] - fx * 430, pz = touch[1] - fz * 430, dx = px - m.x, dz = pz - m.z, d = Math.hypot(dx, dz), agl = m.y - g(m.x, m.z);
        const dh = norm(Math.atan2(dx, dz) - s.hdg); s.hdg += Math.max(-0.6 * dt, Math.min(0.6 * dt, dh));
        s.v = settle(s.v, 27, 1); s.vy = settle(s.vy, -Math.max(0.5, Math.min(2.2, (agl - 62) / Math.max(2, d / s.v))), 1.2);
        this.move(s, dt, Math.max(-0.35, Math.min(0.35, dh * 1.2)), -0.05);
        if (d < 40) { s.state = 'final'; s.t = 0; }
        break;
      }
      case 'final': {
        const dx = touch[0] - m.x, dz = touch[1] - m.z, d = Math.hypot(dx, dz), agl = m.y - g(m.x, m.z);
        const dh = norm(Math.atan2(dx, dz) - s.hdg); s.hdg += Math.max(-0.5 * dt, Math.min(0.5 * dt, dh));
        s.v = settle(s.v, d < 80 ? 21 : 25, 1); s.vy = settle(s.vy, -Math.max(0.3, Math.min(3.2, (agl - 0.4) / Math.max(1.2, d / s.v))), 1.5);
        this.move(s, dt, 0, d < 60 ? 0.07 : -0.08);
        if (m.y < g(m.x, m.z) + 0.32 || d < 3) { s.state = 'rollout'; s.t = 0; m.roll = 0; m.pitch = 0; }
        break;
      }
      case 'rollout': {
        s.v = Math.max(0, s.v - dt * 2.2); m.v = s.v; m.x += Math.sin(s.hdg) * s.v * dt; m.z += Math.cos(s.hdg) * s.v * dt; m.y = g(m.x, m.z) + 0.32; m.pitch = 0; m.roll = settle(m.roll, s.v < 3 ? 0.07 : 0, 1);
        if (s.v <= 0) { s.state = 'parked'; s.t = 0; }
        break;
      }
      case 'parked': { m.v = 0; if (s.t > 45) { s.hidden = true; m.hidden = true; } break; }
    }
    if (s.state === 'glide' || s.state === 'return') { /* roll déjà posé par move() */ }
  }

  private pick(s: Sail): number {
    let best = -1, bs = -1e9; const m = s.m;
    this.thermals.forEach((T, i) => { if (i === s.thermal) return; const d = Math.hypot(T.x - m.x, T.z - m.z), dist0 = Math.hypot(T.x - this.field.x, T.z - this.field.z); const occ = this.planes.filter(o => o !== s && o.state === 'thermal' && o.thermal === i).length, sc = T.w * 100 - Math.abs(d - 1500) * 0.05 - dist0 * 0.03 + this.rand() * 80 + Math.min(2, occ) * 170; if (sc > bs) { bs = sc; best = i; } });
    return best < 0 ? 0 : best;
  }
  /** Avance en ligne : cap, vitesse et taux de chute déjà fixés. */
  private move(s: Sail, dt: number, bank: number, pitch: number) {
    const m = s.m; m.x += Math.sin(s.hdg) * s.v * dt; m.z += Math.cos(s.hdg) * s.v * dt; m.y += s.vy * dt;
    const gy = this.ground(m.x, m.z) + 0.32; if (m.y < gy) m.y = gy;
    m.yaw = s.hdg; m.v = s.v; m.roll += (-bank - m.roll) * Math.min(1, dt * 1.5); m.pitch += (pitch + s.vy / Math.max(10, s.v) - m.pitch) * Math.min(1, dt * 1.2);
  }

  private flyTug(s: Sail, T: Tug, dt: number) {
    const F = this.field, m = T.m, [fx, fz] = this.fwd(), g = (x: number, z: number) => this.ground(x, z); T.t += dt;
    const settle = (k: number, to: number, a: number) => k + (to - k) * Math.min(1, dt * a);
    m.phase += dt * 60;
    switch (T.state) {
      case 'roll': {
        if (s.state !== 'tow') { m.v = 0; m.x = s.m.x + fx * ROPE; m.z = s.m.z + fz * ROPE; m.y = g(m.x, m.z) + 0.55; break; }
        T.v += dt * 3.0; m.x += Math.sin(T.hdg) * T.v * dt; m.z += Math.cos(T.hdg) * T.v * dt; m.y = g(m.x, m.z) + 0.55; m.v = T.v; m.pitch = 0;
        if (T.v >= 27) { T.state = 'climb'; T.t = 0; T.vy = 0; }
        break;
      }
      case 'climb': {
        T.v = settle(T.v, 31, 0.5); T.vy = settle(T.vy, 3.4, 0.6); T.hdg += 0.022 * dt * (s.turn);
        m.x += Math.sin(T.hdg) * T.v * dt; m.z += Math.cos(T.hdg) * T.v * dt; m.y += T.vy * dt; m.yaw = T.hdg; m.v = T.v; m.pitch = settle(m.pitch, 0.1, 1); m.roll = settle(m.roll, -0.08 * s.turn, 1);
        if (m.y - g(m.x, m.z) > T.target) { T.state = 'leave'; T.t = 0; }
        break;
      }
      case 'leave': {
        // largage : l'avion pique et vire à l'opposé, retourne se poser
        T.hdg += -0.35 * s.turn * dt; T.v = settle(T.v, 38, 0.6); T.vy = settle(T.vy, -6, 0.8);
        m.x += Math.sin(T.hdg) * T.v * dt; m.z += Math.cos(T.hdg) * T.v * dt; m.y += T.vy * dt; m.yaw = T.hdg; m.v = T.v; m.roll = settle(m.roll, 0.45 * s.turn, 1.5); m.pitch = settle(m.pitch, -0.2, 1);
        const tx = F.x - fx * 700, tz = F.z - fz * 700; if (T.t > 9 && Math.hypot(tx - m.x, tz - m.z) < 2400) { T.state = 'final'; T.t = 0; }
        break;
      }
      case 'final': {
        const tx = F.x - fx * 20 - fx * 0, tz = F.z - fz * 20, ax = F.x - fx * 650, az = F.z - fz * 650, agl = m.y - g(m.x, m.z);
        const toApp = Math.hypot(ax - m.x, az - m.z) > 120 ? [ax, az] : [tx, tz];
        const dx = toApp[0] - m.x, dz = toApp[1] - m.z, d = Math.hypot(dx, dz), dh = norm(Math.atan2(dx, dz) - T.hdg);
        T.hdg += Math.max(-0.5 * dt, Math.min(0.5 * dt, dh)); T.v = settle(T.v, d < 300 ? 26 : 34, 0.6);
        const tgtAgl = toApp[0] === ax ? Math.min(agl, 90) : 0.5, sink = Math.max(0.5, Math.min(6, (agl - tgtAgl) / Math.max(2, d / T.v)));
        T.vy = settle(T.vy, -sink, 1.2); m.x += Math.sin(T.hdg) * T.v * dt; m.z += Math.cos(T.hdg) * T.v * dt; m.y += T.vy * dt; m.yaw = T.hdg; m.v = T.v; m.roll = settle(m.roll, -Math.max(-0.4, Math.min(0.4, dh * 1.2)), 1.2); m.pitch = settle(m.pitch, T.vy / T.v, 1);
        if (m.y < g(m.x, m.z) + 0.55) { m.y = g(m.x, m.z) + 0.55; T.state = 'rollout'; T.t = 0; m.pitch = 0; m.roll = 0; }
        break;
      }
      case 'rollout': {
        T.v = Math.max(0, T.v - dt * 3); m.x += Math.sin(T.hdg) * T.v * dt; m.z += Math.cos(T.hdg) * T.v * dt; m.y = g(m.x, m.z) + 0.55; m.v = T.v;
        if (T.v <= 0 && T.t > 25) { T.state = 'gone'; m.hidden = true; }
        break;
      }
      case 'gone': break;
    }
  }
}
