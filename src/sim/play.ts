// Modes jouables : course à pied, vélo, équitation, aviron, planeur, avion léger, parapente. Simulation pure (sans Three.js).
// Chaque joueur possède un `Athlete` et une `Mount` que les vues existantes savent dessiner.
import type { Athlete } from './athlete';
import type { Mount, MountKind } from './outdoor';

export type PlayKind = 'course' | 'vélo' | 'cheval' | 'aviron' | 'planeur' | 'avion' | 'parapente';
export const PLAY_LABEL: Record<PlayKind, string> = { course: 'Course à pied', vélo: 'Vélo', cheval: 'Équitation', aviron: 'Aviron', planeur: 'Planeur', avion: 'Avion léger', parapente: 'Parapente' };

/** Commandes normalisées (clavier ou manette). +turn = tourner à gauche, +roll = pencher à droite, +pitch = cabrer (nez en haut). */
export interface PlayInput { fwd: number; turn: number; roll: number; pitch: number; thr: number; brake: boolean; run: boolean; action: boolean; gearUp: boolean; gearDown: boolean }
export const noInput = (): PlayInput => ({ fwd: 0, turn: 0, roll: 0, pitch: 0, thr: 0, brake: false, run: false, action: false, gearUp: false, gearDown: false });

export interface Thermal { x: number; z: number; r: number; w: number }
export interface PlayWorld {
  ground(x: number, z: number): number;
  /** sol praticable (hauteur de l'eau si `wet`) */
  surface(x: number, z: number): { y: number; wet: boolean };
  blocked?(x: number, z: number): boolean;
  thermals?: Thermal[];
  field?: { x: number; y: number; z: number; rot: number };
  launch?: { x: number; y: number; z: number; hdg: number };
}

const G = 9.81, TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (k: number, to: number, a: number) => k + (to - k) * Math.min(1, a);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export abstract class Player {
  abstract readonly kind: PlayKind;
  x = 0; y = 0; z = 0; yaw = 0; v = 0;
  message = ''; messageT = 0;
  readonly a: Athlete; mount: Mount | null = null;
  protected stamina = 1; protected tired = false;
  constructor(protected w: PlayWorld, x: number, z: number, yaw: number) {
    this.x = x; this.z = z; this.yaw = yaw; this.y = w.surface(x, z).y;
    this.a = { id: 7000000, x, y: this.y, z, yaw, pose: 'stand', phase: 0, v: 0, lean: 0, roll: 0, lift: 0, scale: 1, shirt: 0xd8352f, shorts: 0x23262e, skin: 0xe8c4a0, lamp: false, mount: null, hidden: false, tag: 'joueur' };
  }
  abstract step(dt: number, inp: PlayInput): void;
  abstract hud(): string;
  /** hauteur de la caméra de poursuite : recul, hauteur, et point visé */
  cam = { back: 5, up: 2, look: 1.2, eye: [0.2, 1.7] as [number, number] };
  say(m: string, t = 4) { this.message = m; this.messageT = t; }
  protected tick(dt: number) { if (this.messageT > 0) this.messageT -= dt; }
  protected mk(kind: MountKind, len: number, color: number): Mount { return { id: 7000001, kind, x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: 0, roll: 0, phase: 0, v: 0, color, n: 1, len, hidden: false }; }
  /** déplacement à plat avec glissement le long des obstacles ; renvoie faux si bloqué */
  protected move(dx: number, dz: number, ok: (x: number, z: number) => boolean): boolean {
    if (ok(this.x + dx, this.z + dz)) { this.x += dx; this.z += dz; return true; }
    if (ok(this.x + dx, this.z)) { this.x += dx; return true; }
    if (ok(this.x, this.z + dz)) { this.z += dz; return true; }
    return false;
  }
  protected land = (x: number, z: number) => !this.w.surface(x, z).wet && !(this.w.blocked?.(x, z) ?? false);
}

// ------------------------------------------------------------------------------------------------ à pied
export class RunPlayer extends Player {
  readonly kind = 'course' as const;
  constructor(w: PlayWorld, x: number, z: number, yaw: number) { super(w, x, z, yaw); this.cam = { back: 4.2, up: 1.9, look: 1.2, eye: [0.2, 1.65] }; }
  step(dt: number, inp: PlayInput) {
    this.tick(dt);
    if (this.stamina < 0.04) this.tired = true; else if (this.stamina > 0.3) this.tired = false;
    const sprint = inp.run && !this.tired && inp.fwd > 0.2;
    const top = sprint ? 7.8 : 4.1;
    const target = inp.fwd > 0 ? Math.min(1, inp.fwd) * top : inp.fwd * 1.3;
    this.v = lerp(this.v, target, dt * 3.2);
    this.stamina = clamp(this.stamina + dt * (sprint ? -0.12 : this.v < 1 ? 0.18 : 0.04), 0, 1);
    if (this.tired && inp.run) this.say('Essoufflé : ralentis un peu');
    this.yaw = wrap(this.yaw + inp.turn * dt * (2.3 - 0.12 * Math.abs(this.v)));
    if (!this.move(Math.sin(this.yaw) * this.v * dt, Math.cos(this.yaw) * this.v * dt, this.land)) this.v *= 0.2;
    this.y = lerp(this.y, this.w.surface(this.x, this.z).y, dt * 12);
    const a = this.a; a.x = this.x; a.y = this.y; a.z = this.z; a.yaw = this.yaw; a.v = Math.abs(this.v);
    a.pose = Math.abs(this.v) > 3.2 ? 'run' : Math.abs(this.v) > 0.25 ? 'walk' : 'stand';
    a.phase += dt * TAU * (1.3 + 0.19 * Math.abs(this.v)) * Math.sign(this.v || 1); a.lean = Math.min(0.22, 0.04 + 0.025 * Math.abs(this.v)); a.lift = 0;
  }
  hud() { return `${(this.v * 3.6).toFixed(0)} km/h — souffle ${(this.stamina * 100).toFixed(0)} %`; }
}

// ------------------------------------------------------------------------------------------------ vélo
export class BikePlayer extends Player {
  readonly kind = 'vélo' as const;
  constructor(w: PlayWorld, x: number, z: number, yaw: number) { super(w, x, z, yaw); this.mount = this.mk('bike', 1.75, 0x2f6fd0); this.cam = { back: 5.2, up: 2.1, look: 1.1, eye: [0.35, 1.55] }; }
  step(dt: number, inp: PlayInput) {
    this.tick(dt);
    const sl = (this.w.ground(this.x + Math.sin(this.yaw) * 2, this.z + Math.cos(this.yaw) * 2) - this.w.ground(this.x, this.z)) / 2;   // pente devant
    const vmax = inp.run ? 15 : 11;
    let acc = inp.fwd > 0 ? 2.4 * inp.fwd * Math.max(0, 1 - this.v / vmax) : 0;
    acc -= 0.012 * this.v * this.v * 0.1 + 0.18 + sl * G * 0.85;       // résistance de l'air, roulement, pente
    if (inp.brake || inp.fwd < -0.1) acc -= 6;
    this.v = Math.max(0, this.v + acc * dt);
    this.yaw = wrap(this.yaw + inp.turn * dt * 1.9 / (1 + this.v * 0.28));
    if (!this.move(Math.sin(this.yaw) * this.v * dt, Math.cos(this.yaw) * this.v * dt, this.land)) this.v *= 0.3;
    this.y = lerp(this.y, this.w.surface(this.x, this.z).y, dt * 14);
    const a = this.a, m = this.mount!; a.x = m.x = this.x; a.y = m.y = this.y; a.z = m.z = this.z; a.yaw = m.yaw = this.yaw; a.v = m.v = this.v;
    a.pose = 'cycle'; a.lean = 0; a.lift = 0;
    if (this.v > 0.3 && inp.fwd >= 0) a.phase += dt * (1.3 + 0.55 * this.v); m.phase += dt * this.v / 0.34;
  }
  hud() { return `${(this.v * 3.6).toFixed(0)} km/h`; }
}

// ------------------------------------------------------------------------------------------------ cheval
export const GAITS = ['à l\'arrêt', 'au pas', 'au trot', 'au petit galop', 'au galop'];
const GAIT_V = [0, 1.5, 4.0, 6.6, 10.5];
export class HorsePlayer extends Player {
  readonly kind = 'cheval' as const;
  gear = 0;
  constructor(w: PlayWorld, x: number, z: number, yaw: number) { super(w, x, z, yaw); this.mount = this.mk('horse', 2.4, 0x6b4528); this.cam = { back: 6.5, up: 2.8, look: 1.5, eye: [0.3, 2.3] }; }
  step(dt: number, inp: PlayInput) {
    this.tick(dt);
    if (inp.gearUp && this.gear < 4) this.gear++; if (inp.gearDown && this.gear > 0) this.gear--;
    if (inp.brake) this.gear = 0;
    this.v = lerp(this.v, GAIT_V[this.gear], dt * 1.6);
    this.yaw = wrap(this.yaw + inp.turn * dt * 1.6 / (1 + this.v * 0.15));
    if (!this.move(Math.sin(this.yaw) * this.v * dt, Math.cos(this.yaw) * this.v * dt, this.land)) { this.v *= 0.2; this.gear = Math.min(this.gear, 1); }
    this.y = lerp(this.y, this.w.surface(this.x, this.z).y, dt * 14);
    const v = this.v, rate = v < 2.4 ? 0.9 + 0.9 * v : v < 4.6 ? 3 + 0.6 * v : v < 7 ? 4.5 + 0.35 * v : 5 + 0.3 * v;
    const a = this.a, m = this.mount!; a.x = m.x = this.x; a.z = m.z = this.z; m.y = this.y; a.yaw = m.yaw = this.yaw; a.v = m.v = v; a.pose = 'ride'; a.phase += dt * rate; m.phase += dt * rate; a.lean = 0;
    a.lift = 0.16 + (v > 4.6 ? (v > 7 ? 0.12 : 0.07) * Math.abs(Math.sin(a.phase)) : 0.03 * Math.abs(Math.sin(a.phase * 0.5))); a.y = this.y;
  }
  hud() { return `${GAITS[this.gear]} — ${(this.v * 3.6).toFixed(0)} km/h (W / S : changer d'allure)`; }
}

// ------------------------------------------------------------------------------------------------ aviron
export class RowPlayer extends Player {
  readonly kind = 'aviron' as const;
  constructor(w: PlayWorld, x: number, z: number, yaw: number) { super(w, x, z, yaw); this.mount = this.mk('boat', 8.2, 0xe0b020); this.mount.n = 1; this.cam = { back: 12, up: 4.5, look: 0.8, eye: [0, 2.0] }; }
  step(dt: number, inp: PlayInput) {
    this.tick(dt);
    const ok = (x: number, z: number) => this.w.surface(x, z).wet;
    this.v = lerp(this.v, inp.fwd > 0 ? 4.4 * inp.fwd : inp.brake || inp.fwd < 0 ? 0 : this.v * 0.97, dt * 0.9);
    this.yaw = wrap(this.yaw + inp.turn * dt * 0.55 * Math.min(1, 0.3 + this.v / 3));
    if (!this.move(Math.sin(this.yaw) * this.v * dt, Math.cos(this.yaw) * this.v * dt, ok)) { this.v *= 0.3; this.say('Berge : fais demi-tour'); }
    this.y = this.w.surface(this.x, this.z).y;
    const a = this.a, m = this.mount!; m.x = this.x; m.y = this.y; m.z = this.z; m.yaw = this.yaw; m.v = this.v;
    a.phase += dt * (this.v > 0.2 ? 2.8 + 0.1 * this.v : 0.5); m.phase = a.phase; m.roll = 0.02 * Math.sin(a.phase);
    a.x = this.x; a.z = this.z; a.y = this.y + 0.02; a.lift = 0.02; a.yaw = this.yaw + Math.PI; a.pose = 'row'; a.v = this.v; a.lean = 0;
  }
  hud() { return `${(this.v * 3.6).toFixed(1)} km/h — W : ramer, A / D : barrer`; }
}

// ------------------------------------------------------------------------------------------------ vol
export type FlyKind = 'planeur' | 'avion' | 'parapente';
interface Spec { stall: number; vtrim: number; vmax: number; sink0: number; sinkK: number; vref: number; maxRoll: number; ground: number; power: number; drag: number }
const SPEC: Record<FlyKind, Spec> = {
  planeur: { stall: 17, vtrim: 27, vmax: 62, sink0: 0.62, sinkK: 0.0012, vref: 26, maxRoll: 1.05, ground: 0.32, power: 0, drag: 0 },
  avion: { stall: 24, vtrim: 42, vmax: 70, sink0: 0, sinkK: 0, vref: 0, maxRoll: 0.9, ground: 0.55, power: 3.1, drag: 0.00104 },
  parapente: { stall: 5, vtrim: 9.5, vmax: 14, sink0: 1.05, sinkK: 0.02, vref: 9.5, maxRoll: 0.75, ground: 0, power: 0, drag: 0 },
};
export type FlyState = 'sol' | 'treuil' | 'vol' | 'crash';

export class FlyPlayer extends Player {
  readonly kind: FlyKind;
  state: FlyState = 'sol'; pitch = 0; roll = 0; vy = 0; thr = 0.0; agl = 0; stalled = false; best = 0; t = 0; maxAgl = 0; /** vitesse verticale de la masse d'air (m/s) */ air = 0;
  readonly home: { x: number; z: number; yaw: number; y: number };
  constructor(kind: FlyKind, w: PlayWorld, x: number, z: number, yaw: number) {
    super(w, x, z, yaw); this.kind = kind; const S = SPEC[kind];
    this.home = { x, z, yaw, y: w.ground(x, z) };
    this.mount = this.mk(kind === 'planeur' ? 'sailplane' : kind === 'avion' ? 'tug' : 'glider', kind === 'planeur' ? 15 : kind === 'avion' ? 8 : 10.5, kind === 'planeur' ? 0xffffff : kind === 'avion' ? 0xf2c230 : 0xe8453c);
    this.y = w.ground(x, z) + S.ground;
    this.cam = kind === 'parapente' ? { back: 9, up: 3.5, look: 1.5, eye: [0.3, 1.5] } : kind === 'planeur' ? { back: 26, up: 6, look: 1, eye: [1.1, 0.75] } : { back: 20, up: 5, look: 1, eye: [0.9, 0.9] };
    if (kind === 'parapente') { this.state = 'sol'; this.v = 0; this.mount.phase = 0; this.a.pose = 'stand'; }
    this.say(kind === 'planeur' ? 'Espace : treuillage — ensuite ↑↓ ← → : piloter, A / D : palonnier' : kind === 'avion' ? 'Maj : plein gaz — ↑↓ ← → : piloter — décolle à 95 km/h' : 'Espace : courir et décoller — ← → : freins gauche / droit', 8);
  }
  private thermal(): number {
    let up = 0; const T = this.w.thermals; if (!T) return 0;
    for (const t of T) { const d = Math.hypot(this.x - t.x, this.z - t.z); if (d < t.r * 1.6) { const k = 1 - (d / (t.r * 1.6)) ** 2; up = Math.max(up, t.w * k * (this.kind === 'parapente' ? 0.7 : 1) * clamp(this.agl / 120, 0.2, 1) * clamp((1700 - this.agl) / 500, 0, 1)); } }
    return up;
  }
  step(dt: number, inp: PlayInput) {
    this.tick(dt); this.t += dt; const S = SPEC[this.kind], w = this.w, g0 = w.ground(this.x, this.z);
    this.agl = this.y - g0 - S.ground; if (this.agl > this.maxAgl) this.maxAgl = this.agl;
    if (this.state === 'crash') { this.v = 0; this.vy = 0; if (this.t > 3.5) this.reset(); this.sync(dt); return; }
    if (this.state === 'sol') this.onGround(dt, inp, S); else if (this.state === 'treuil') this.winch(dt, inp, S); else this.fly(dt, inp, S);
    this.sync(dt);
  }
  reset() { this.x = this.home.x; this.z = this.home.z; this.yaw = this.home.yaw; this.y = this.home.y + SPEC[this.kind].ground; this.v = 0; this.vy = 0; this.pitch = 0; this.roll = 0; this.state = 'sol'; this.thr = 0; this.t = 0; this.say('Retour au départ'); }
  private onGround(dt: number, inp: PlayInput, S: Spec) {
    this.roll = lerp(this.roll, 0, dt * 4); this.pitch = lerp(this.pitch, 0, dt * 4);
    if (this.kind === 'planeur') {
      this.v = Math.max(0, this.v - dt * 2.4);
      if (inp.action && this.v < 1) { this.state = 'treuil'; this.t = 0; this.v = 0; this.say('Treuillage…', 3); }
      this.yaw = wrap(this.yaw + inp.turn * dt * 0.3 * Math.min(1, this.v / 6));
    } else if (this.kind === 'avion') {
      this.thr = clamp(this.thr + inp.thr * dt * 0.7 + (inp.run ? dt * 1.2 : 0) - (inp.brake ? dt * 1.5 : 0), 0, 1);
      this.v = Math.max(0, this.v + (S.power * this.thr - S.drag * this.v * this.v - 0.45 - (inp.brake ? 5 : 0)) * dt);
      this.yaw = wrap(this.yaw + inp.turn * dt * 0.7 * Math.min(1, this.v / 8) * (this.v > 30 ? 0.4 : 1));
      if (this.v > S.stall * 1.1 && inp.pitch > 0.15) { this.state = 'vol'; this.vy = 1.5; this.say('Décollage'); }
    } else {
      if (inp.action || this.v > 0.1) { this.v = Math.min(8.5, this.v + dt * 2.2); if (this.v > 7 || inp.pitch > 0.2 && this.v > 5) { this.state = 'vol'; this.vy = 0.8; this.t = 0; this.y += 0.6; this.say('En vol'); } }
    }
    if (this.state === 'sol') { const dx = Math.sin(this.yaw) * this.v * dt, dz = Math.cos(this.yaw) * this.v * dt; this.x += dx; this.z += dz; this.y = this.w.ground(this.x, this.z) + S.ground; }
  }
  private winch(dt: number, inp: PlayInput, S: Spec) {
    this.v = Math.min(34, this.v + dt * 7.5); const lift = this.v > 22 ? Math.min(0.6, (this.v - 22) * 0.07 + 0.05) : 0;
    this.yaw = wrap(this.yaw + inp.turn * dt * 0.1); this.x += Math.sin(this.yaw) * this.v * Math.cos(lift) * dt; this.z += Math.cos(this.yaw) * this.v * Math.cos(lift) * dt;
    this.y = Math.max(this.w.ground(this.x, this.z) + S.ground, this.y + this.v * Math.sin(lift) * dt); this.pitch = lift; this.roll = lerp(this.roll, inp.roll * 0.3, dt * 2);
    if (this.agl > 320 + 40 || this.t > 30) { this.state = 'vol'; this.vy = 1; this.v = 30; this.pitch = 0.1; this.say('Largué ! Cherche une ascendance (vario +)', 6); }
  }
  private fly(dt: number, inp: PlayInput, S: Spec) {
    const para = this.kind === 'parapente', plane = this.kind === 'avion';
    // attitude : le manche commande l'assiette (angle de trajectoire) et l'inclinaison
    const rollCmd = para ? -inp.turn * S.maxRoll * 0.9 : inp.roll * S.maxRoll;
    this.roll = lerp(this.roll, rollCmd, dt * (para ? 1.4 : 2.0));
    if (plane) this.pitch = lerp(this.pitch, clamp(inp.pitch, -1, 1) * 0.42, dt * 1.7);
    if (plane) this.thr = clamp(this.thr + inp.thr * dt * 0.7 + (inp.run ? dt * 1.2 : 0) - (inp.brake ? dt * 1.2 : 0), 0, 1);
    // décrochage : sous la vitesse de décrochage, le nez tombe
    this.stalled = this.v < S.stall;
    let gamma = this.pitch;
    if (para) gamma = -0.1 + clamp(inp.pitch, -1, 1) * 0.05;
    else if (!plane) {
      // planeur : le manche règle la vitesse visée (compensateur automatique), l'assiette suit
      const vt = inp.pitch >= 0 ? S.vtrim - 8 * inp.pitch : S.vtrim - 30 * inp.pitch, gt = -this.sinkAt(this.v) / Math.max(8, this.v);
      this.pitch = lerp(this.pitch, clamp(gt + 0.03 * (this.v - vt), -0.7, 0.45), dt * 2); gamma = this.pitch;
    }
    if (this.stalled) gamma = Math.min(gamma, -0.35 * (1 - this.v / S.stall) - 0.1);
    // vitesse : bilan d'énergie (la pente de trajectoire échange hauteur et vitesse)
    const load = 1 / Math.max(0.5, Math.cos(this.roll));
    let dv: number;
    if (plane) dv = S.power * this.thr * (1 - this.v / (S.vmax * 1.05)) - S.drag * this.v * this.v * (inp.brake ? 1.8 : 1) * load - G * Math.sin(gamma);
    else if (para) { const tgt = S.vtrim + clamp(inp.pitch, -1, 1) * 3.5; dv = (tgt - this.v) * 0.7; }
    else { const sink = this.sinkAt(this.v) * load * (inp.brake ? 2.8 : 1); dv = -G * Math.sin(gamma) - G * sink / Math.max(8, this.v); }
    this.v = clamp(this.v + dv * dt, 4, S.vmax * 1.1);
    // virage : roulis → cap (le cap augmente à gauche) ; le palonnier ajoute un peu de lacet
    const turn = -(G * Math.tan(this.roll)) / Math.max(8, this.v) + inp.turn * (para ? 0 : 0.18);
    this.yaw = wrap(this.yaw + turn * dt);
    const air = this.thermal() + (para ? 2.4 * Math.max(0, 1 - this.t / 6) : 0);   // dynamique de la pente au décollage
    this.air = air;
    // taux de montée : trajectoire + masse d'air
    this.vy = lerp(this.vy, this.v * Math.sin(gamma) + (plane ? 0 : 0) + air - (para ? this.sinkAt(this.v) : 0), dt * 2.5);
    this.x += Math.sin(this.yaw) * this.v * Math.cos(gamma) * dt; this.z += Math.cos(this.yaw) * this.v * Math.cos(gamma) * dt; this.y += this.vy * dt;
    const g = this.w.ground(this.x, this.z) + S.ground;
    if (this.y <= g) this.touch(g, S);
    if (this.stalled && this.agl > 20) this.say('DÉCROCHAGE — rends la main', 1.5);
  }
  private sinkAt(v: number) { const S = SPEC[this.kind]; return S.sink0 + S.sinkK * (v - S.vref) ** 2 + (v < S.stall ? (S.stall - v) * 0.5 : 0); }
  private touch(g: number, S: Spec) {
    const soft = this.vy > -3.2 && Math.abs(this.roll) < 0.4 && this.pitch > -0.3 && this.v < (this.kind === 'parapente' ? 11 : 45);
    const water = this.w.surface(this.x, this.z).wet && this.kind !== 'parapente';
    if (soft && !water) { this.y = g; this.state = 'sol'; this.vy = 0; this.pitch = 0; this.roll = 0; if (this.kind === 'parapente') this.v = Math.min(this.v, 2.5); this.say('Posé.'); this.t = 0; }
    else { this.state = 'crash'; this.y = g; this.t = 0; this.say(water ? 'À l\'eau ! Retour au départ…' : 'Atterrissage trop dur ! Retour au départ…', 3.5); }
  }
  private sync(dt: number) {
    const m = this.mount!, a = this.a, S = SPEC[this.kind];
    m.x = this.x; m.y = this.y; m.z = this.z; m.yaw = this.yaw; m.pitch = this.state === 'sol' ? 0 : this.pitch; m.roll = this.roll; m.v = this.v;
    if (this.kind === 'avion') m.phase += dt * (20 + 70 * this.thr);
    if (this.kind === 'parapente') {
      m.phase = this.state === 'sol' ? (this.v > 0.1 ? 1 : lerp(m.phase, 0, dt)) : 1; a.x = this.x; a.y = this.y - 0.1; a.z = this.z; a.yaw = this.yaw; a.v = this.v; a.hidden = false;
      a.pose = this.state === 'sol' ? (this.v > 0.2 ? 'run' : 'stand') : 'glide'; a.roll = m.roll * 0.5; a.phase += dt * TAU * (1.4 + 0.2 * this.v); a.lean = this.state === 'sol' && this.v > 0.2 ? 0.25 : 0;
    } else a.hidden = true;     // pilote dans la cabine
    void S;
  }
  hud() {
    const kmh = (this.v * 3.6).toFixed(0), alt = Math.max(0, this.agl).toFixed(0), vario = (this.vy >= 0 ? '+' : '') + this.vy.toFixed(1);
    if (this.state === 'sol') return this.kind === 'planeur' ? 'Au sol — Espace : treuillage' : this.kind === 'avion' ? `Au sol — ${kmh} km/h — gaz ${(this.thr * 100).toFixed(0)} %` : 'Au sol — Espace : courir et décoller';
    return `${kmh} km/h — ${alt} m — vario ${vario} m/s${this.kind === 'avion' ? ` — gaz ${(this.thr * 100).toFixed(0)} %` : ''}${this.stalled ? ' — DÉCROCHAGE' : ''}`;
  }
}

export function startPlayer(kind: PlayKind, w: PlayWorld, at: { x: number; z: number; yaw: number }): Player {
  switch (kind) {
    case 'course': return new RunPlayer(w, at.x, at.z, at.yaw);
    case 'vélo': return new BikePlayer(w, at.x, at.z, at.yaw);
    case 'cheval': return new HorsePlayer(w, at.x, at.z, at.yaw);
    case 'aviron': return new RowPlayer(w, at.x, at.z, at.yaw);
    case 'planeur': case 'avion': { const F = w.field ?? { x: at.x, y: 0, z: at.z, rot: at.yaw }; const fx = Math.sin(F.rot), fz = Math.cos(F.rot); return new FlyPlayer(kind, w, F.x - fx * 150 + fz * 12, F.z - fz * 150 - fx * 12, F.rot); }
    case 'parapente': { const L = w.launch ?? { x: at.x, y: 0, z: at.z, hdg: at.yaw }; return new FlyPlayer('parapente', w, L.x, L.z, L.hdg); }
  }
}
