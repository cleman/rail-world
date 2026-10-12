// Jeux de balle du complexe sportif : tennis (échanges en simple), foot à 5 (5 contre 5, gardiens), basket 3x3.
// Les joueurs entrent par le portail avec le moteur d'actions de athlete.ts, puis jouent ; à la fin de la période de jeu, ils repartent.
import { Troupe, type Runner, type Prop, type PoseKind } from './athlete';
import { toWorld, isWeekend, type Complex, type Court } from './sport';
import { rng } from './cityplan';

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const CLR = [[0xd8352f, 0x1c2230], [0x2f6fd0, 0xf2f2f2]] as const;
const SKINS = [0xe8c4a0, 0xd9a577, 0xb67f55, 0x8a5a3c, 0xf0cfb0];

interface Pl { r: Runner; team: number; role: 'gk' | 'field'; home: { u: number; v: number }; pose: PoseKind; ph: number; act: number; actDur: number; actPose: PoseKind; speed: number; vv: number; ready: boolean; tx: number; ty: number }
interface Arc { from: [number, number, number]; to: [number, number, number]; t: number; T: number; apex: number; bounce?: number }

/** Programme de jeu selon l'heure : tennis la journée, foot et basket surtout le soir et le week-end. */
export function playLevel(kind: Court['kind'], h: number, day: number): number {
  const wk = isWeekend(day);
  if (kind === 'tennis') return h >= 8.5 && h < 21 ? (wk ? 1 : h >= 12 && h < 14 ? 0.5 : h > 17 ? 1 : 0.5) : 0;
  if (kind === 'foot') return wk ? (h >= 10 && h < 19 ? 1 : 0) : h >= 17.5 && h < 21.5 ? 1 : 0;
  return wk ? (h >= 10 && h < 20 ? 1 : 0) : h >= 17 && h < 21.5 ? 1 : (h >= 12 && h < 13.5 ? 0.6 : 0);
}

abstract class Game {
  players: Pl[] = []; on = false; ball: Prop | null = null; wait = 0;
  constructor(protected T: Troupe, protected cx: Complex, protected c: Court, protected rand: () => number) {}
  protected w(u: number, v: number) { return toWorld(this.cx.f, u, v); }
  protected spawn(u: number, v: number, team: number, role: 'gk' | 'field', i: number) {
    const r = this.rand, [sh, sk] = CLR[team], g = this.cx.gate;
    const run = this.T.add(g.u + (r() - 0.5) * 5, g.v - r() * 3, { shirt: role === 'gk' ? 0x39b36b : sh, shorts: sk, skin: SKINS[Math.floor(r() * SKINS.length)], scale: 0.96 + r() * 0.1 });
    run.q.push({ t: 'wait', dur: i * 1.4 }, { t: 'go', u, v, speed: 1.9 });
    const p: Pl = { r: run, team, role, home: { u, v }, pose: 'stand', ph: r() * TAU, act: 0, actDur: 1, actPose: 'stand', speed: 4.2 + r() * 0.8, vv: 0, ready: false, tx: u, ty: v };
    this.players.push(p); return p;
  }
  close() {
    this.on = false; let k = 0;
    for (const p of this.players) { p.r.q.length = 0; p.r.cur = null; p.r.q.push({ t: 'wait', dur: (k++) * 1.1 }, { t: 'go', u: this.cx.gate.u + (this.rand() - 0.5) * 4, v: this.cx.gate.v, speed: 1.6 }, { t: 'hide' }); p.ready = false; p.pose = 'walk'; }
    if (this.ball) this.ball.hidden = true; this.ball = null;
    this.players = this.players.filter(() => true);
  }
  get live() { return this.players.filter(p => !p.r.a.hidden); }
  /** Après le pas du moteur d'actions : applique les poses choisies par le jeu aux joueurs libres. */
  finalize() { for (const p of this.players) if (p.r.idle && !p.r.a.hidden) { p.r.a.pose = p.pose; p.r.a.phase = p.ph; p.r.a.v = p.vv; } }
  protected move(p: Pl, tu: number, tv: number, sp: number, dt: number, faceU?: number, faceV?: number) {
    const r = p.r, dx = tu - r.u, dz = tv - r.v, d = Math.hypot(dx, dz);
    if (d > 0.15) { const st = Math.min(d, sp * dt); r.u += (dx / d) * st; r.v += (dz / d) * st; const fu = faceU ?? dx, fv = faceV ?? dz, l = Math.hypot(fu, fv) || 1, cu = r.hu, cv = r.hv; const a0 = Math.atan2(cv, cu), a1 = Math.atan2(fv / l, fu / l); let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da)); const na = a0 + da * Math.min(1, dt * 10); r.hu = Math.cos(na); r.hv = Math.sin(na); const v = Math.min(sp, st / dt); p.vv = v; p.ph += dt * TAU * (v > 2.2 ? 1.3 + 0.19 * v : 0.5 + 0.34 * v); p.pose = v > 2.2 ? 'run' : v > 0.15 ? 'walk' : 'stand'; r.a.lean = v > 2.2 ? Math.min(0.3, 0.04 + 0.03 * v) : 0.02; }
    else { p.pose = 'stand'; p.vv = 0; r.a.lean = 0; if (faceU !== undefined) { const l = Math.hypot(faceU, faceV!) || 1, a0 = Math.atan2(r.hv, r.hu), a1 = Math.atan2(faceV! / l, faceU / l); let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da)); const na = a0 + da * Math.min(1, dt * 8); r.hu = Math.cos(na); r.hv = Math.sin(na); } }
  }
  protected act(p: Pl, pose: PoseKind, dur: number) { p.act = 0.0001; p.actDur = dur; p.actPose = pose; }
  protected tickAct(p: Pl, dt: number) { if (p.act > 0) { p.act += dt; p.ph = Math.min(1, p.act / p.actDur); p.pose = p.actPose; if (p.act >= p.actDur) p.act = 0; return true; } return false; }
  protected put(p: Prop, u: number, v: number, h: number) { const w = this.w(u, v); p.x = w.x; p.z = w.z; p.y = this.cx.f.y + h; }
  abstract step(dt: number, want: boolean): void;
}

// ---------------------------------------------------------------------------------------------------------------------------------
class Tennis extends Game {
  private arc: Arc | null = null; private hitter = 0; private pending: { u: number; v: number } = { u: 0, v: 0 }; private rest = 0; private rally = 0;
  open() {
    this.on = true; const c = this.c, hl = c.len / 2;
    for (let i = 0; i < 2; i++) this.spawn(c.u + (i ? 1 : -1) * (hl + 1.2), c.v, i, 'field', i);
    this.ball = this.T.prop('tennis', c.u, c.v, 1); this.ball.hidden = true; this.arc = null; this.rest = 8; this.rally = 0; this.hitter = this.rand() < 0.5 ? 0 : 1;
  }
  step(dt: number, want: boolean) {
    if (want && !this.on) this.open(); else if (!want && this.on) { this.close(); return; }
    if (!this.on || !this.players.length) return;
    const c = this.c, hl = c.len / 2, hw = c.wid / 2, P = this.players, ready = P.every(p => p.r.idle);
    if (!ready) return;
    if (this.rest > 0) { this.rest -= dt; for (const p of P) this.move(p, p.home.u, p.home.v, 2.4, dt, c.u - p.home.u, 0); if (this.ball) this.ball.hidden = this.rest > 0; if (this.rest <= 0) this.serve(); return; }
    const a = this.arc; if (!a) return;
    this.ball!.hidden = false; a.t += dt; const k = Math.min(1, a.t / a.T);
    // deux trajets : de la frappe au rebond, puis du rebond au point de frappe suivant
    const kb = a.bounce ?? 0.55;
    let u: number, v: number, h: number;
    if (k < kb) { const q = k / kb; u = lerp(a.from[0], this.pending.u, q); v = lerp(a.from[1], this.pending.v, q); h = lerp(a.from[2], 0.03, q) + a.apex * 4 * q * (1 - q); }
    else { const q = (k - kb) / (1 - kb); u = lerp(this.pending.u, a.to[0], q); v = lerp(this.pending.v, a.to[1], q); h = lerp(0.03, a.to[2], q) + a.apex * 0.45 * 4 * q * (1 - q); }
    this.put(this.ball!, u, v, h);
    const hit = P[this.hitter], recv = P[1 - this.hitter];
    // le receveur court vers le point de frappe, le frappeur retourne au centre
    this.move(recv, a.to[0], a.to[1], recv.speed, dt, hit.r.u - recv.r.u, hit.r.v - recv.r.v);
    if (hit.act === 0) this.move(hit, hit.home.u, c.v + (a.to[1] - c.v) * -0.4, 2.8, dt, recv.r.u - hit.r.u, recv.r.v - hit.r.v);
    this.tickAct(hit, dt);
    if (k >= 1) {
      this.rally++;
      if (this.rally > 3 && this.rand() < 0.13) { this.rest = 6 + this.rand() * 6; this.arc = null; return; }
      this.hitter = 1 - this.hitter; this.strike();
    }
  }
  private serve() { this.rally = 0; this.strike(); }
  private strike() {
    const c = this.c, hl = c.len / 2, hw = c.wid / 2, r = this.rand, H = this.players[this.hitter], R = this.players[1 - this.hitter], s = H.home.u > c.u ? -1 : 1;   // s : direction vers l'autre côté
    const from: [number, number, number] = [H.r.u, H.r.v, 1.0];
    const tu = c.u + s * (2.5 + r() * (hl - 4)), tv = c.v + (r() * 2 - 1) * (hw - 0.9);
    this.pending = { u: tu, v: tv };
    const toU = Math.max(c.u - hl - 2.5, Math.min(c.u + hl + 2.5, tu + s * (2.5 + r() * 3))), toV = c.v + Math.max(-hw - 1, Math.min(hw + 1, tv + (r() * 2 - 1) * 1.2));
    this.arc = { from, to: [toU, toV, 0.95], t: 0, T: 1.25 + r() * 0.55, apex: 1.4 + r() * 1.2 };
    this.act(H, 'swing', 0.55); void R;
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
/** Foot à 5 et basket 3x3 : possession, conduite de balle, passes, tirs, pressing. */
class Match extends Game {
  private carrier: Pl | null = null; private flight: { t: number; T: number; from: [number, number, number]; to: [number, number, number]; apex: number; kind: 'pass' | 'shot'; to_p?: Pl; goal?: boolean; team?: number } | null = null;
  private clock = 0; private score = [0, 0]; private pause = 0; private cool = 0;
  constructor(T: Troupe, cx: Complex, c: Court, rand: () => number, private per: number) { super(T, cx, c, rand); }
  private get basket() { return this.c.kind === 'basket'; }
  /** but attaqué par l'équipe `t` : l'équipe 0 attaque vers u+, l'équipe 1 vers u−. */
  private goal(t: number) { return { u: this.c.u + (t === 0 ? 1 : -1) * (this.c.len / 2 - (this.basket ? 1.4 : 0)), v: this.c.v }; }
  open() {
    this.on = true; const c = this.c, hl = c.len / 2, hw = c.wid / 2; let i = 0;
    for (let t = 0; t < 2; t++) {
      const s = t === 0 ? -1 : 1;
      for (let k = 0; k < this.per; k++) {
        const gk = !this.basket && k === 0, u = gk ? c.u + s * (hl - 0.8) : c.u + s * (hl * (0.15 + 0.5 * ((k + 1) / this.per))), v = gk ? c.v : c.v + (k % 2 ? 1 : -1) * hw * (0.2 + 0.4 * ((k + 1) / this.per));
        this.spawn(u, v, t, gk ? 'gk' : 'field', i++);
      }
    }
    this.ball = this.T.prop(this.basket ? 'basket' : 'foot', c.u, c.v, 0.12); this.ball.hidden = true; this.carrier = null; this.flight = null; this.pause = 6; this.score = [0, 0];
  }
  private kickoff() { const c = this.c, ts = this.rand() < 0.5 ? 0 : 1; const mid = this.players.filter(p => p.team === ts && p.role === 'field').sort((a, b) => Math.hypot(a.r.u - c.u, a.r.v - c.v) - Math.hypot(b.r.u - c.u, b.r.v - c.v))[0]; this.carrier = mid ?? null; this.flight = null; this.cool = 1.0; }
  step(dt: number, want: boolean) {
    if (want && !this.on) this.open(); else if (!want && this.on) { this.close(); return; }
    if (!this.on || !this.players.length) return;
    const c = this.c, hl = c.len / 2, hw = c.wid / 2, P = this.players;
    if (!P.every(p => p.r.idle)) return;
    if (this.pause > 0) { this.pause -= dt; for (const p of P) this.move(p, p.home.u, p.home.v, 2.8, dt, c.u - p.home.u, 0); this.ball!.hidden = true; if (this.pause <= 0) { this.ball!.hidden = false; this.kickoff(); } return; }
    this.clock += dt; this.cool -= dt;
    const ball = this.ball!, bh = this.basket ? 1.0 : 0.12;
    const F = this.flight;
    if (F) {
      F.t += dt; const k = Math.min(1, F.t / F.T);
      this.put(ball, lerp(F.from[0], F.to[0], k), lerp(F.from[1], F.to[1], k), lerp(F.from[2], F.to[2], k) + F.apex * 4 * k * (1 - k));
      if (k >= 1) {
        this.flight = null;
        if (F.kind === 'pass' && F.to_p) { this.carrier = F.to_p; this.cool = 0.5; }
        else if (F.goal) { this.score[F.team!]++; this.pause = 4; }
        else { const t = 1 - (F.team ?? 0), cand = P.filter(p => p.team === t && p.role === 'field'); this.carrier = cand[Math.floor(this.rand() * cand.length)] ?? null; this.cool = 0.8; if (this.carrier && !this.basket) { /* rebond : le défenseur récupère */ } }
      }
    } else if (this.carrier) {
      const cp = this.carrier, g = this.goal(cp.team), dg = Math.hypot(g.u - cp.r.u, g.v - cp.r.v);
      // conduite : vers le but, en évitant le défenseur le plus proche
      let du = g.u - cp.r.u, dv = g.v - cp.r.v; const def = P.filter(p => p.team !== cp.team && p.role === 'field').sort((a, b) => Math.hypot(a.r.u - cp.r.u, a.r.v - cp.r.v) - Math.hypot(b.r.u - cp.r.u, b.r.v - cp.r.v))[0];
      if (def) { const ou = cp.r.u - def.r.u, ov = cp.r.v - def.r.v, od = Math.hypot(ou, ov) || 1; if (od < 3.5) { du += (ou / od) * 6; dv += (ov / od) * 6; } }
      const dl = Math.hypot(du, dv) || 1, tu = Math.max(c.u - hl + 0.8, Math.min(c.u + hl - 0.8, cp.r.u + (du / dl) * 3)), tv = Math.max(c.v - hw + 0.8, Math.min(c.v + hw - 0.8, cp.r.v + (dv / dl) * 3));
      if (cp.act === 0) this.move(cp, tu, tv, cp.speed * (this.basket ? 0.8 : 0.95), dt, du, dv);
      this.tickAct(cp, dt);
      const hu = cp.r.hu, hv = cp.r.hv, bob = this.basket ? 0.55 + 0.45 * Math.abs(Math.sin(cp.ph * 1.0 + this.clock * 6)) : 0.12;
      if (cp.act === 0) this.put(ball, cp.r.u + hu * 0.5, cp.r.v + hv * 0.5, this.basket ? bob : bh);
      // tir ?
      const range = this.basket ? 6.5 : 11;
      if (this.cool <= 0 && dg < range && this.rand() < dt * 1.3 && cp.act === 0) {
        const ok = this.rand() < (this.basket ? 0.42 : 0.38), gh = this.basket ? 3.05 : 0.9, spread = this.basket ? 0 : (ok ? (this.rand() * 2 - 1) * 1.2 : (this.rand() < 0.5 ? 1 : -1) * (1.9 + this.rand()));
        this.act(cp, this.basket ? 'throw' : 'swing', this.basket ? 0.9 : 0.5);
        const tgt: [number, number, number] = [g.u, g.v + spread, gh];
        this.flight = { t: 0, T: this.basket ? 1.1 : Math.max(0.35, dg / 16), from: [cp.r.u, cp.r.v, this.basket ? 2.3 : 0.15], to: tgt, apex: this.basket ? 2.0 : 0, kind: 'shot', goal: ok, team: cp.team };
        this.carrier = null;
      } else if (this.cool <= 0 && this.rand() < dt * 0.55 && cp.act === 0) {
        const mates = P.filter(p => p.team === cp.team && p !== cp && p.role === 'field'), tgt = mates.sort((a, b) => Math.abs(this.goal(cp.team).u - a.r.u) - Math.abs(this.goal(cp.team).u - b.r.u))[0];
        if (tgt) { const d = Math.hypot(tgt.r.u - cp.r.u, tgt.r.v - cp.r.v); this.flight = { t: 0, T: Math.max(0.35, d / (this.basket ? 11 : 9)), from: [cp.r.u, cp.r.v, this.basket ? 1.4 : 0.12], to: [tgt.r.u, tgt.r.v, this.basket ? 1.3 : 0.12], apex: this.basket ? 0.4 : 0.2, kind: 'pass', to_p: tgt }; this.act(cp, this.basket ? 'throw' : 'swing', 0.4); this.carrier = null; this.flight!.to_p = tgt; }
      }
      // vol du ballon
      if (def && this.cool <= 0 && Math.hypot(def.r.u - cp.r.u, def.r.v - cp.r.v) < 0.9 && this.rand() < dt * 0.8) { this.carrier = def; this.cool = 1.0; }
    } else { const f = P.filter(q => q.role === 'field'); this.carrier = f[Math.floor(this.rand() * f.length)] ?? null; this.cool = 0.6; }
    // les autres joueurs
    for (const p of P) {
      if (p === this.carrier) continue;
      if (this.tickAct(p, dt)) continue;
      const att = this.carrier ? this.carrier.team : (F?.team ?? (F?.to_p?.team ?? 0)), mine = p.team === att, g = this.goal(att);
      const refU = this.carrier?.r.u ?? ball.x, refV = this.carrier?.r.v ?? 0; void refU; void refV;
      if (p.role === 'gk') { const bv = F ? F.to[1] : (this.carrier?.r.v ?? c.v); const gu = c.u + (p.team === 0 ? -1 : 1) * (hl - 0.8); this.move(p, gu, Math.max(c.v - 1.3, Math.min(c.v + 1.3, bv)), 3.2, dt, p.team === 0 ? 1 : -1, 0); continue; }
      if (mine) {
        // soutien : un point devant le porteur, décalé en largeur selon le rang
        const idx = P.filter(q => q.team === p.team && q.role === 'field').indexOf(p), cu = this.carrier ? this.carrier.r.u : c.u, dirU = Math.sign(g.u - c.u) || 1;
        const tu = Math.max(c.u - hl + 1.5, Math.min(c.u + hl - 1.5, cu + dirU * (2 + idx * 2.2) * (1 - idx * 0.1))), tv = c.v + ((idx % 2) ? 1 : -1) * hw * (0.35 + 0.1 * idx);
        this.move(p, tu, tv, p.speed * 0.8, dt, g.u - p.r.u, g.v - p.r.v);
      } else {
        const tgt = this.carrier ?? P[0], d = Math.hypot(tgt.r.u - p.r.u, tgt.r.v - p.r.v), closest = P.filter(q => q.team === p.team && q.role === 'field').sort((a, b) => Math.hypot(a.r.u - tgt.r.u, a.r.v - tgt.r.v) - Math.hypot(b.r.u - tgt.r.u, b.r.v - tgt.r.v))[0] === p;
        if (closest && this.carrier) this.move(p, tgt.r.u, tgt.r.v, p.speed, dt, tgt.r.u - p.r.u, tgt.r.v - p.r.v);
        else { const own = this.goal(1 - p.team), tu = lerp(tgt.r.u, own.u, 0.35 + 0.1 * (p.home.u > c.u ? 1 : 0)), tv = lerp(tgt.r.v, c.v, 0.3) + (p.home.v - c.v) * 0.5; this.move(p, tu, tv, p.speed * 0.75, dt, tgt.r.u - p.r.u, tgt.r.v - p.r.v); }
        void d;
      }
    }
  }
  get result() { return this.score.join('–'); }
}

// ---------------------------------------------------------------------------------------------------------------------------------
export class Games {
  readonly troupe: Troupe;
  private games: { c: Court; g: Game }[] = [];
  private rand: () => number;
  lights = false;
  constructor(readonly cx: Complex, seed = 1) {
    this.troupe = new Troupe(cx.f, seed + 77); this.rand = rng(seed ^ 0x6a3e5);
    for (const c of cx.courts) this.games.push({ c, g: c.kind === 'tennis' ? new Tennis(this.troupe, cx, c, this.rand) : new Match(this.troupe, cx, c, this.rand, c.kind === 'foot' ? 5 : 3) });
  }
  get athletes() { return this.troupe.runners.map(r => r.a).filter(a => !a.hidden); }
  get activeKinds(): string[] { return this.games.filter(x => x.g.on).map(x => x.c.kind); }
  step(dt: number, hour: number, day: number, rain: number, storm: number, night: number) {
    const wet = rain > 0.45 || storm > 0.3;
    for (const { c, g } of this.games) g.step(dt, !wet && playLevel(c.kind, hour, day) > 0.4);
    this.troupe.step(dt);
    for (const { g } of this.games) g.finalize();
    for (let i = this.troupe.runners.length - 1; i >= 0; i--) if (this.troupe.runners[i].a.hidden) this.troupe.remove(this.troupe.runners[i]);
    this.lights = night > 0.2 && this.games.some(x => x.g.on);
    for (let i = this.troupe.props.length - 1; i >= 0; i--) if (this.troupe.props[i].hidden && !this.games.some(x => x.g.ball === this.troupe.props[i])) this.troupe.props.splice(i, 1);
  }
}
