// Drone FPV : physique de quadricoptère en mode « acro » (les manches commandent des vitesses de rotation, la poussée suit l'orientation du drone).
// Simulation pure, sans Three.js. Repère monde : y vers le haut. Repère drone : x à droite, y en haut (axe des hélices), avant = −z (convention Three.js).
export type Q = [number, number, number, number];   // quaternion w, x, y, z
type V = [number, number, number];

const G = 9.81;
export const qmul = (a: Q, b: Q): Q => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
export const qnorm = (q: Q): Q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };
export const qaxis = (x: number, y: number, z: number, a: number): Q => { const l = Math.hypot(x, y, z) || 1, s = Math.sin(a / 2) / l; return [Math.cos(a / 2), x * s, y * s, z * s]; };
/** Vecteur v (repère drone) exprimé dans le repère monde. */
export function qrot(q: Q, v: V): V {
  const [w, x, y, z] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}

/** Profil de taux à la Betaflight : rcRate (vitesse de base), superRate (courbure de fin de course), expo (adoucit autour du centre). Renvoie des °/s. */
export function rateCurve(x: number, rc: number, superRate: number, expo: number): number {
  const a = Math.abs(x), e = a * (a ** 3 * expo + (1 - expo)), r = 200 * rc * e / Math.max(0.05, 1 - e * superRate);
  return Math.sign(x) * r;
}

export interface FpvPreset {
  name: string;
  /** rapport poussée / poids à pleine poussée */
  twr: number;
  /** traînée linéaire et quadratique (1/s, 1/m) */
  kl: number; kq: number;
  /** inertie des moteurs (s) */
  tau: number;
  rollRc: number; rollSuper: number; yawRc: number; yawSuper: number; expo: number;
  /** inclinaison de la caméra (°), champ vertical (°) */
  tilt: number; fov: number;
  /** vitesse de chute au sol au-delà de laquelle le drone se brise (m/s) */
  crashV: number;
  /** durée de la batterie (s) */
  battery: number;
}
export const PRESETS: FpvPreset[] = [
  { name: 'Racer 5″', twr: 8, kl: 0.05, kq: 0.05, tau: 0.02, rollRc: 1.3, rollSuper: 0.72, yawRc: 1.2, yawSuper: 0.6, expo: 0.1, tilt: 35, fov: 100, crashV: 12, battery: 240 },
  { name: 'Whoop (Orqa)', twr: 3.8, kl: 0.18, kq: 0.1, tau: 0.04, rollRc: 1.1, rollSuper: 0.62, yawRc: 1.0, yawSuper: 0.5, expo: 0.2, tilt: 22, fov: 100, crashV: 7, battery: 300 },
  { name: 'Cinéwhoop', twr: 5, kl: 0.14, kq: 0.09, tau: 0.035, rollRc: 0.9, rollSuper: 0.5, yawRc: 0.8, yawSuper: 0.4, expo: 0.3, tilt: 12, fov: 90, crashV: 8, battery: 360 },
];

export interface FpvInput {
  /** manches, −1..1 : roll à droite, tangage vers l'avant (nez en bas), lacet à droite */
  roll: number; pitch: number; yaw: number;
  /** manche des gaz, −1..1 (−1 en bas) */
  thr: number;
}
/** `ceil` : plafond (tunnel) au-dessus duquel le drone ne peut pas monter */
export interface Surface { y: number; wet: boolean; ceil?: number }
export type FpvMode = 'acro' | 'stabilisé';
export type FpvThrottle = 'centré' | 'direct';

export class Fpv {
  x = 0; y = 0; z = 0; vx = 0; vy = 0; vz = 0;
  q: Q = [1, 0, 0, 0];
  /** vitesses angulaires du repère drone (rad/s) : x (tangage, + nez en haut), y (lacet, + nez à gauche), z (roulis, + aile droite en haut) */
  w: V = [0, 0, 0];
  preset: FpvPreset = PRESETS[0];
  mode: FpvMode = 'acro';
  throttleMode: FpvThrottle = 'centré';
  armed = false;
  state: 'sol' | 'vol' | 'écrasé' = 'sol';
  /** gaz effectifs 0..1 (pour le son et les hélices), temps de vol, batterie 0..1 */
  thrust = 0; flight = 0; battery = 1; crashT = 0; crashWhy = '';
  /** facteur appliqué aux taux (réglage utilisateur) */
  rateScale = 1; tiltOverride: number | null = null;
  home = { x: 0, y: 0, z: 0, yaw: 0 };
  crashes = 0;
  constructor(private surface: (x: number, z: number, y?: number) => Surface) {}

  get tilt() { return this.tiltOverride ?? this.preset.tilt; }
  get speed() { return Math.hypot(this.vx, this.vy, this.vz); }
  get forward(): V { return qrot(this.q, [0, 0, -1]); }
  get up(): V { return qrot(this.q, [0, 1, 0]); }
  get yaw() { const f = this.forward; return Math.atan2(f[0], f[2]); }
  get agl() { return this.y - this.surface(this.x, this.z, this.y).y; }

  /** Pose le drone au sol, face au cap `yaw` (même convention que les navires : avant = (sin, cos)). */
  reset(x: number, z: number, yaw: number, y?: number) {
    const s = this.surface(x, z); this.x = x; this.z = z; this.y = y ?? s.y + 0.06; this.vx = this.vy = this.vz = 0; this.w = [0, 0, 0];
    this.q = qaxis(0, 1, 0, yaw + Math.PI); this.armed = false; this.state = 'sol'; this.thrust = 0; this.flight = 0; this.battery = 1; this.crashT = 0; this.crashWhy = '';
    this.home = { x, y: this.y, z, yaw };
  }
  setPreset(i: number) { this.preset = PRESETS[((i % PRESETS.length) + PRESETS.length) % PRESETS.length]; }
  arm(on: boolean) { if (this.state === 'écrasé') return; this.armed = on; if (on) this.battery = Math.max(this.battery, 0.02); }

  /** Poussée (m/s², partie de la pleine poussée 0..1) pour la position du manche des gaz. */
  thrustFraction(thr: number): number {
    const hov = 1 / this.preset.twr;
    if (this.throttleMode === 'direct') { const t = (Math.max(-1, Math.min(1, thr)) + 1) / 2; return 0.65 * t + 0.35 * t ** 3; }
    const s = Math.max(-1, Math.min(1, thr));
    return s < 0 ? (s + 1) * hov : hov + (1 - hov) * s;
  }

  step(dt: number, inp: FpvInput) {
    const P = this.preset;
    if (this.state === 'écrasé') { this.crashT -= dt; if (this.crashT <= 0) this.reset(this.home.x, this.home.z, this.home.yaw); return; }
    // --- taux demandés (rad/s), repère drone
    const d2r = Math.PI / 180, k = this.rateScale;
    let wxc: number, wzc: number;
    const wyc = rateCurve(inp.yaw, P.yawRc, P.yawSuper, P.expo) * d2r * k;
    if (this.mode === 'acro') {
      wxc = -rateCurve(inp.pitch, P.rollRc, P.rollSuper, P.expo) * d2r * k;      // manche en avant : nez en bas
      wzc = -rateCurve(inp.roll, P.rollRc, P.rollSuper, P.expo) * d2r * k;       // manche à droite : aile droite en bas
    } else {                                                                     // stabilisé : les manches commandent un angle (≤ 55°)
      const f = this.forward, r = qrot(this.q, [1, 0, 0]), pit = Math.asin(Math.max(-1, Math.min(1, f[1]))), rol = Math.asin(Math.max(-1, Math.min(1, -r[1])));
      const max = 7 * Math.PI;
      wxc = Math.max(-max, Math.min(max, 7 * (-inp.pitch * 0.96 - pit)));
      wzc = -Math.max(-max, Math.min(max, 7 * (inp.roll * 0.96 - rol)));
    }
    const sur = this.surface(this.x, this.z, this.y), onGround = this.y <= sur.y + 0.1;
    const live = this.armed && this.battery > 0;
    if (!live) { this.thrust = 0; }
    else this.thrust = this.thrustFraction(inp.thr);
    // --- inertie des moteurs
    const a = 1 - Math.exp(-dt / P.tau);
    if (live && !(onGround && this.thrust < 1 / P.twr * 0.6)) { this.w[0] += (wxc - this.w[0]) * a; this.w[1] += (wyc - this.w[1]) * a; this.w[2] += (wzc - this.w[2]) * a; }
    else { this.w[0] *= 0.8; this.w[1] *= 0.8; this.w[2] *= 0.8; }
    // --- orientation
    const wl = Math.hypot(this.w[0], this.w[1], this.w[2]);
    if (wl > 1e-6) this.q = qnorm(qmul(this.q, qaxis(this.w[0], this.w[1], this.w[2], wl * dt)));
    // --- forces
    const up = this.up, acc = this.thrust * P.twr * G, ax = up[0] * acc, ay = up[1] * acc - G, az = up[2] * acc;
    const sp = this.speed, dl = P.kl + P.kq * sp;
    this.vx += (ax - dl * this.vx) * dt; this.vy += (ay - dl * this.vy) * dt; this.vz += (az - dl * this.vz) * dt;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    if (live) { this.flight += dt; if (this.state === 'sol' && this.thrust > 1 / P.twr * 0.9) this.state = 'vol'; if (this.state === 'vol') this.battery = Math.max(0, this.battery - dt / P.battery); }
    // --- sol et eau
    const s2 = this.surface(this.x, this.z, this.y);
    if (s2.ceil !== undefined && this.y > s2.ceil - 0.08) {              // plafond de la voûte : un coup léger rebondit, un choc brise le drone
      if (this.vy > P.crashV * 0.8) { this.crash('plafond du tunnel'); return; }
      this.y = s2.ceil - 0.08; if (this.vy > 0) this.vy *= -0.15;
    }
    if (this.y < s2.y + 0.06) {
      const vin = -this.vy, uy = this.up[1];
      if (s2.wet) { this.crash('tombé à l\'eau'); return; }
      if (s2.y - this.y > 1.2) { this.crash('choc contre la paroi'); return; }      // enfoncé dans le relief (paroi de tunnel, falaise) : pas de téléportation sur le dessus
      if (vin > P.crashV) { this.crash('choc violent'); return; }
      this.y = s2.y + 0.06; if (this.vy < 0) this.vy *= -0.12;
      const fr = Math.exp(-4 * dt); this.vx *= fr; this.vz *= fr;
      if (uy < 0.15 && this.thrust < 0.5) { /* retourné : reste au sol */ }
      // le drone se remet à plat quand il est posé sans gaz
      if (this.thrust < 1 / P.twr * 0.7 || !live) this.level(dt * 6);
      if (this.state === 'vol' && sp < 0.6 && this.thrust < 1 / P.twr * 0.5) this.state = 'sol';
    }
  }
  /** Redresse progressivement le drone (garde le cap). */
  private level(a: number) {
    const f = this.forward, yaw = Math.atan2(f[0], f[2]), t = qaxis(0, 1, 0, yaw + Math.PI), k = Math.min(1, a);
    let q: Q = [this.q[0] + (t[0] - this.q[0]) * k, this.q[1] + (t[1] - this.q[1]) * k, this.q[2] + (t[2] - this.q[2]) * k, this.q[3] + (t[3] - this.q[3]) * k];
    if (this.q[0] * t[0] + this.q[1] * t[1] + this.q[2] * t[2] + this.q[3] * t[3] < 0) q = [this.q[0] - (t[0] + this.q[0]) * k, this.q[1] - (t[1] + this.q[1]) * k, this.q[2] - (t[2] + this.q[2]) * k, this.q[3] - (t[3] + this.q[3]) * k];
    this.q = qnorm(q);
  }
  private crash(why: string) { this.state = 'écrasé'; this.crashWhy = why; this.crashT = 2.2; this.armed = false; this.thrust = 0; this.crashes++; this.vx = this.vy = this.vz = 0; }
}
