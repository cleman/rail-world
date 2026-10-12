// Sportifs : un petit moteur de « scripts » pour des personnages qui courent, sautent, lancent, attendent leur tour.
// Chaque sportif exécute une file d'actions dans un repère local (u, v) ; les accessoires (javelot, disque, balle…) volent librement.
// Simulation pure (sans Three.js).
import { toWorld, yawOf, trackAt, type Frame } from './sport';

export type PoseKind = 'run' | 'walk' | 'stand' | 'crouch' | 'fly' | 'throw' | 'swing' | 'sit' | 'cycle' | 'ride' | 'glide' | 'row' | 'stretch' | 'lie' | 'flop' | 'hurdle' | 'vault';
export type Mount = null | 'bike' | 'horse' | 'glider' | 'boat';
export interface Athlete {
  id: number; x: number; y: number; z: number; yaw: number; pose: PoseKind;
  /** phase du mouvement (rad) pour les gestes qui se répètent ; avancement 0..1 pour les gestes uniques (lancer, saut) */
  phase: number;
  /** vitesse (m/s) : donne l'amplitude de la foulée */
  v: number;
  /** inclinaison avant du buste (rad), roulis (rad), hauteur au-dessus du sol (m) */
  lean: number; roll: number; lift: number;
  scale: number; shirt: number; shorts: number; skin: number;
  /** lampe frontale allumée */
  lamp: boolean; mount: Mount; hidden: boolean; tag: string;
}
export type PropKind = 'javelot' | 'disque' | 'poids' | 'perche' | 'tennis' | 'foot' | 'basket';
export interface Prop { id: number; kind: PropKind; x: number; y: number; z: number; yaw: number; pitch: number; hidden: boolean; age: number }

export interface Lock { busy: boolean }
export type Act =
  | { t: 'go'; u: number; v: number; speed: number; pose?: PoseKind }
  | { t: 'wait'; dur: number; pose?: PoseKind; face?: [number, number]; lean?: number }
  | { t: 'until'; at: number; pose?: PoseKind; face?: [number, number]; lean?: number }
  | { t: 'track'; lane: number; s0: number; dist: number; v0: number; v1: number; hurdles?: number[] }
  | { t: 'line'; u: number; v: number; hu: number; hv: number; dist: number; v0: number; v1: number; hurdles?: number[] }
  | { t: 'jump'; u0: number; v0: number; u1: number; v1: number; dur: number; apex: number; style: 'long' | 'pole' | 'flop' | 'step' }
  | { t: 'throw'; kind: PropKind; hu: number; hv: number; wind: number; spin: number; speed: number; angle: number }
  | { t: 'lock'; lock: Lock } | { t: 'unlock'; lock: Lock }
  | { t: 'hide' };

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

export class Runner {
  q: Act[] = [];
  cur: Act | null = null; tt = 0; s = 0; trav = 0; started = false;
  u = 0; v = 0; hu = 1; hv = 0;
  constructor(readonly a: Athlete) {}
  get idle() { return !this.cur && !this.q.length; }
}

export class Troupe {
  readonly runners: Runner[] = [];
  readonly props: Prop[] = [];
  time = 0;
  private nid = 1;
  constructor(readonly frame: Frame, private seed = 1) {}

  add(u: number, v: number, o: Partial<Athlete> = {}): Runner {
    const a: Athlete = { id: this.nid++ + this.seed * 100000, x: 0, y: 0, z: 0, yaw: 0, pose: 'stand', phase: Math.random() * TAU, v: 0, lean: 0, roll: 0, lift: 0, scale: 1, shirt: 0xffffff, shorts: 0x222233, skin: 0xe0b58f, lamp: false, mount: null, hidden: false, tag: '', ...o };
    const r = new Runner(a); r.u = u; r.v = v; this.runners.push(r); this.out(r); return r;
  }
  remove(r: Runner) { const i = this.runners.indexOf(r); if (i >= 0) this.runners.splice(i, 1); }
  prop(kind: PropKind, u: number, v: number, h: number): Prop { const p: Prop = { id: this.nid++, kind, x: 0, y: h, z: 0, yaw: 0, pitch: 0, hidden: false, age: 0 }; const w = toWorld(this.frame, u, v); p.x = w.x; p.z = w.z; p.y = this.frame.y + h; this.props.push(p); return p; }

  private out(r: Runner) {
    const w = toWorld(this.frame, r.u, r.v), a = r.a; a.x = w.x; a.z = w.z; a.y = this.frame.y + a.lift; a.yaw = yawOf(this.frame, r.hu, r.hv);
  }
  private face(r: Runner, hu: number, hv: number, dt: number) {
    const l = Math.hypot(hu, hv); if (l < 1e-6) return; hu /= l; hv /= l;
    const cur = Math.atan2(r.hv, r.hu), want = Math.atan2(hv, hu); let d = want - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
    const na = cur + d * Math.min(1, dt * 9); r.hu = Math.cos(na); r.hv = Math.sin(na);
  }
  private gait(a: Athlete, v: number, dt: number) { const run = v > 2.2; a.v = v; a.phase += dt * TAU * (run ? 1.3 + 0.19 * v : 0.5 + 0.34 * v); a.pose = run ? 'run' : v > 0.15 ? 'walk' : 'stand'; a.lean = run ? Math.min(0.32, 0.04 + 0.03 * v) : 0.02; }

  step(dt: number) {
    this.time += dt;
    for (const r of this.runners) {
      let guard = 0;
      while (guard++ < 4) {
        if (!r.cur) { r.cur = r.q.shift() ?? null; r.tt = 0; r.s = 0; r.trav = 0; r.started = false; if (!r.cur) break; }
        if (this.exec(r, r.cur, dt)) { r.cur = null; continue; }
        break;
      }
      if (!r.cur) { r.a.v = 0; if (r.a.pose === 'run' || r.a.pose === 'walk') r.a.pose = 'stand'; }
      this.out(r);
    }
    for (const p of this.props) this.flyProp(p, dt);
  }

  // ----- accessoires -----
  private vel = new Map<Prop, { vx: number; vy: number; vz: number; spin: number }>();
  launch(p: Prop, vx: number, vy: number, vz: number, spin = 0) { this.vel.set(p, { vx, vy, vz, spin }); }
  private flyProp(p: Prop, dt: number) {
    const v = this.vel.get(p); p.age += dt;
    if (!v) return;
    v.vy -= 9.8 * dt; p.x += v.vx * dt; p.z += v.vz * dt; p.y += v.vy * dt;
    const gy = this.frame.y + (p.kind === 'javelot' ? 0.1 : 0.15);
    p.pitch = Math.atan2(v.vy, Math.hypot(v.vx, v.vz)); p.yaw = Math.atan2(v.vx, v.vz) + v.spin * p.age;
    if (p.y <= gy) { p.y = gy; this.vel.delete(p); if (p.kind === 'javelot') p.pitch = -0.35; else p.pitch = 0; }
  }

  // ----- exécution d'une action ; renvoie vrai quand elle est terminée -----
  private exec(r: Runner, c: Act, dt: number): boolean {
    const a = r.a; r.tt += dt;
    switch (c.t) {
      case 'go': {
        a.lift = 0; a.roll = 0; const dx = c.u - r.u, dz = c.v - r.v, d = Math.hypot(dx, dz);
        if (d < 0.25) return true;
        const st = Math.min(d, c.speed * dt); r.u += (dx / d) * st; r.v += (dz / d) * st; this.face(r, dx, dz, dt);
        this.gait(a, c.speed, dt); if (c.pose) a.pose = c.pose; return false;
      }
      case 'wait': case 'until': {
        a.lift = 0; a.roll = 0; a.v = 0; a.pose = c.pose ?? 'stand'; a.lean = c.lean ?? 0; if (c.face) this.face(r, c.face[0], c.face[1], dt);
        if (c.pose === 'stretch' || c.pose === 'crouch') a.phase += dt * 1.4;
        return c.t === 'wait' ? r.tt >= c.dur : this.time >= c.at;
      }
      case 'track': {
        const v = lerp(c.v0, c.v1, Math.min(1, r.s / Math.max(1, c.dist)));
        r.s += v * dt; const P = trackAt(c.lane, c.s0 + r.s); r.u = P.u; r.v = P.v; r.hu = P.hu; r.hv = P.hv;
        this.hurdle(a, r.s, c.hurdles); this.gait(a, v, dt); if (a.lift > 0.05) a.pose = 'hurdle';
        return r.s >= c.dist;
      }
      case 'line': {
        const v = lerp(c.v0, c.v1, Math.min(1, r.s / Math.max(1, c.dist))); r.s += v * dt;
        const l = Math.hypot(c.hu, c.hv), hu = c.hu / l, hv = c.hv / l;
        if (!r.started) { r.started = true; r.u = c.u; r.v = c.v; }
        r.u = c.u + hu * r.s; r.v = c.v + hv * r.s; r.hu = hu; r.hv = hv;
        this.hurdle(a, r.s, c.hurdles); this.gait(a, v, dt); if (a.lift > 0.05) a.pose = 'hurdle';
        return r.s >= c.dist;
      }
      case 'jump': {
        const k = Math.min(1, r.tt / c.dur); r.u = lerp(c.u0, c.u1, k); r.v = lerp(c.v0, c.v1, k); this.face(r, c.u1 - c.u0, c.v1 - c.v0, dt * 3);
        a.lift = c.apex * 4 * k * (1 - k); a.phase = k; a.v = 6;
        if (c.style === 'flop') { a.pose = 'flop'; a.roll = Math.PI * Math.min(1, k * 1.6); a.lean = 0.3; }
        else if (c.style === 'pole') { a.pose = 'vault'; a.lean = -0.2 + 2.4 * k; a.lift = c.apex * Math.sin(Math.PI * Math.min(1, k * 1.05)); }
        else { a.pose = 'fly'; a.lean = 0.25 - 0.5 * k; }
        return k >= 1;
      }
      case 'throw': {
        const W = c.kind === 'poids' ? 1.1 : c.kind === 'disque' ? 2.2 : 1.6, tot = W + 0.8;
        a.pose = 'throw'; a.v = 0; a.lift = 0; a.phase = Math.min(1, r.tt / tot);
        const wind = r.tt < W ? r.tt / W : 1;
        if (c.spin) { const turn = wind * c.spin * TAU; const base = Math.atan2(c.hv, c.hu); r.hu = Math.cos(base + turn); r.hv = Math.sin(base + turn); } else this.face(r, c.hu, c.hv, dt * 6);
        if (!r.started && r.tt >= W) {
          r.started = true;
          const p = this.prop(c.kind, r.u, r.v, 1.7), hl = Math.hypot(c.hu, c.hv), th = (c.angle * Math.PI) / 180, vh = c.speed * Math.cos(th);
          const w0 = toWorld(this.frame, 0, 0), w1 = toWorld(this.frame, c.hu / hl, c.hv / hl);
          this.launch(p, (w1.x - w0.x) * vh, c.speed * Math.sin(th), (w1.z - w0.z) * vh, c.kind === 'disque' ? 9 : 0);
          void c.wind;
        }
        return r.tt >= tot;
      }
      case 'lock': if (c.lock.busy) { a.pose = 'stand'; a.v = 0; return false; } c.lock.busy = true; return true;
      case 'unlock': c.lock.busy = false; return true;
      case 'hide': a.hidden = true; return true;
    }
  }
  /** Saut de haie : un arc de 1,6 m autour de chaque haie. */
  private hurdle(a: Athlete, s: number, h?: number[]) {
    a.lift = 0; if (!h) return;
    for (const d of h) { const k = (s - (d - 1.0)) / 2.0; if (k > 0 && k < 1) { a.lift = 0.5 * Math.sin(Math.PI * k); return; } }
  }
}
