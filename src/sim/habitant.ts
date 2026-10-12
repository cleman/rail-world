// Habitant : un piéton que l'on incarne (ou que l'on suit pendant une journée). Il marche dans les rues et sur les quais à 1,70 m,
// monte dans un tram, un bus ou un train à l'arrêt, regarde défiler la ville et descend à l'arrêt de son choix.
// Simulation pure (sans Three.js) : les véhicules sont vus à travers l'interface `Veh`.
import type { RoadEdge, RoadNet, RoadNode } from './roads';
import type { TramNet, Tram } from './tram';
import { TRAM_LEN } from './tram';
import type { Traffic, Vehicle } from './traffic';
import type { World, Train } from './world';

export type TransitKind = 'tram' | 'bus' | 'train';
export const KIND_LABEL: Record<TransitKind, string> = { tram: 'tram', bus: 'bus', train: 'train' };
export const EYE = 1.7;

export interface Pose { x: number; y: number; z: number; yaw: number }
export interface Spot { x: number; y: number; z: number }

/** Un véhicule public vu par l'habitant. Repère local : `lx` vers l'avant, `lz` vers la gauche (m). */
export interface Veh {
  kind: TransitKind; key: string; label: string;
  pose(): Pose;
  halfLen: number; halfW: number;
  /** hauteur du plancher au-dessus du point de pose */
  floor: number;
  /** portes ouvertes à un arrêt : clé et nom de l'arrêt, sinon null */
  stop(): { key: string; name: string } | null;
  /** prochain arrêt annoncé (texte) */
  next(): string;
  /** où l'on pose le pied en descendant (hauteur comprise) ; `lx` : abscisse de la porte la plus proche dans la voiture */
  exit(lx: number): Spot;
  /** vitesse (m/s) */
  speed(): number;
}

/** Un arrêt du réseau (tram, bus, gare) : ce qu'il faut rejoindre à pied pour prendre un véhicule. */
export interface Stop extends Spot { kind: TransitKind; key: string; name: string }

export interface HabWorld {
  /** sol : hauteur et présence d'eau */
  surface(x: number, z: number): { y: number; wet: boolean };
  /** hauteur d'un quai sous ce point, sinon null */
  support(x: number, z: number): number | null;
  /** point infranchissable (façades, eau profonde…) */
  blocked(x: number, z: number): boolean;
  vehicles(): Veh[];
  stops: Stop[];
  roads: RoadNet;
}

const rot = (lx: number, lz: number, yaw: number) => { const s = Math.sin(yaw), c = Math.cos(yaw); return { x: s * lx + c * lz, z: c * lx - s * lz }; };
/** Coordonnées locales (avant, gauche) d'un point du monde dans le repère d'un véhicule. */
export function toLocal(p: Pose, x: number, z: number) { const dx = x - p.x, dz = z - p.z, s = Math.sin(p.yaw), c = Math.cos(p.yaw); return { lx: dx * s + dz * c, lz: dx * c - dz * s }; }
export const fromLocal = (p: Pose, lx: number, lz: number) => { const r = rot(lx, lz, p.yaw); return { x: p.x + r.x, z: p.z + r.z }; };

// ---------------------------------------------------------------------------------------------------------------------------------
// Adaptateurs : tram, bus, train
// ---------------------------------------------------------------------------------------------------------------------------------
export function tramVeh(net: TramNet, t: Tram): Veh {
  const L = t.line;
  return {
    kind: 'tram', key: 'tram' + t.id, label: `${t.name} (${L.loop ? 'boucle' : L.name})`, halfLen: TRAM_LEN / 2 - 0.6, halfW: 0.95, floor: 0.95,
    pose: () => ({ x: t.x, y: t.y, z: t.z, yaw: t.yaw }),
    stop: () => (t.state === 'arrêt' && t.dwell > 0.4 && t.v < 0.2 ? { key: tramStopKey(L.name, t.atStop), name: `arrêt ${t.atStop + 1}, ligne ${L.name}` } : null),
    next: () => { const n = net.nextStop(t); if (!n) return '—'; const k = L.stops.findIndex(sp => { const q = net.at(L, sp); return Math.hypot(q.x - n.x, q.z - n.z) < 0.5; }); return `arrêt ${k + 1}, ligne ${L.name} — dans ${Math.round(n.d)} m`; },
    exit: () => tramExit(net, L, t.atStop),
    speed: () => t.v,
  };
}
export const tramStopKey = (line: string, i: number) => `tram:${line}:${i}`;
function tramExit(net: TramNet, L: Tram['line'], i: number): Spot {
  const a = net.at(L, L.stops[i]), side = L.sides[i] || 1, off = (L.hw + 1.2) * side;
  return { x: a.x - a.tz * off, y: a.y + 0.12, z: a.z + a.tx * off };
}

export function busVeh(tr: Traffic, v: Vehicle): Veh {
  const idx = (bs: unknown) => tr.busStops.indexOf(bs as never);
  return {
    kind: 'bus', key: 'bus' + v.id, label: `bus n°${v.id}`, halfLen: v.len / 2 - 0.8, halfW: 1.0, floor: 0.75,
    pose: () => ({ x: v.x, y: v.y, z: v.z, yaw: v.yaw }),
    stop: () => {
      const bs = tr.busStopOf(v.lane);
      if (!bs || v.stopDone !== v.lane || v.v > 0.25 || Math.abs(bs.s - v.s) > v.len + 3) return null;
      return { key: 'bus:' + idx(bs), name: `arrêt de bus n°${idx(bs) + 1}` };
    },
    next: () => { const n = tr.nextBusStop(v); return n ? `arrêt de bus n°${idx(n.stop) + 1} — dans ${Math.round(n.d)} m` : '—'; },
    exit: () => { const bs = tr.busStopOf(v.lane); return bs ? { x: bs.x + bs.ox * 1.6, y: bs.y + 0.12, z: bs.z + bs.oz * 1.6 } : { x: v.x, y: v.y, z: v.z }; },
    speed: () => v.v,
  };
}

const PLAT_Y = 0.9;
/** Le train est vu par sa voiture `car` (0 = tête). */
export function trainVeh(w: World, t: Train, car: number): Veh {
  const back = () => car * (t.carLen + t.gap) + t.carLen / 2;
  return {
    kind: 'train', key: `train${t.id}:${car}`, label: `train ${t.id}`, halfLen: t.carLen / 2 - 1.2, halfW: 1.3, floor: 1.05,
    pose: () => { const p = t.pointAt(back()); return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(p.tx, p.tz) }; },
    stop: () => (t.status !== 'stored' && t.dwell > 0.5 && t.v < 0.1 && t.lastStop === t.head && t.head.kind === 'plat' ? { key: 'gare:' + t.head.station, name: `gare de ${t.head.station}` } : null),
    next: () => {
      for (const e of [t.head, ...t.reserved]) if (e.kind === 'plat' && e !== t.lastStop && t.stopsAt(e.station)) return `gare de ${e.station}`;
      return '—';
    },
    exit: (lx: number) => {
      const e = t.head, d = Math.max(0, Math.min(e.len, e.stopOffset - back() + lx)), s = e.at(d), lat = 3.4;
      return { x: s.x - s.tz * lat, y: s.y + PLAT_Y, z: s.z + s.tx * lat };
    },
    speed: () => t.v,
  };
}

/** Tous les véhicules publics en service. */
export function collectVehicles(trams: TramNet, traffic: Traffic, world: World, cache = new WeakMap<object, Veh[]>()): Veh[] {
  const out: Veh[] = [];
  for (const t of trams.trams) if (t.active) { let c = cache.get(t); if (!c) cache.set(t, c = [tramVeh(trams, t)]); out.push(c[0]); }
  for (const v of traffic.vehicles) if (v.kind === 'bus') { let c = cache.get(v); if (!c) cache.set(v, c = [busVeh(traffic, v)]); out.push(c[0]); }
  for (const t of world.trains) if (t.status !== 'stored') { let c = cache.get(t); if (!c) cache.set(t, c = Array.from({ length: t.cars }, (_, k) => trainVeh(world, t, k))); for (const v of c) out.push(v); }
  return out;
}

/** Arrêts : stations de tram, arrêts de bus, quais de gare. */
export function collectStops(trams: TramNet, traffic: Traffic, world: World): Stop[] {
  const out: Stop[] = [];
  for (const L of trams.lines) L.stops.forEach((_, i) => { const p = tramExit(trams, L, i); out.push({ ...p, kind: 'tram', key: tramStopKey(L.name, i), name: `arrêt ${i + 1}, ligne ${L.name}` }); });
  traffic.busStops.forEach((b, i) => out.push({ x: b.x + b.ox * 1.6, y: b.y + 0.12, z: b.z + b.oz * 1.6, kind: 'bus', key: 'bus:' + i, name: `arrêt de bus n°${i + 1}` }));
  for (const e of world.net.edges) if (e.kind === 'plat' && !e.mirror) { const s = e.at(Math.max(0, e.stopOffset - 40)); out.push({ x: s.x - s.tz * 3.4, y: s.y + PLAT_Y, z: s.z + s.tx * 3.4, kind: 'train', key: 'gare:' + e.station + ':' + e.id, name: `gare de ${e.station}` }); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Cheminement dans le réseau de rues
// ---------------------------------------------------------------------------------------------------------------------------------
export interface P2 { x: number; z: number }
interface Samp { x: number; z: number; e: RoadEdge; s: number }
const SIDE = 0.95;   // distance du bord de chaussée au milieu du trottoir

export class Walkways {
  private samples: Samp[] = [];
  private edges: RoadEdge[];
  constructor(readonly roads: RoadNet) {
    this.edges = roads.edges.filter(e => e.poly.len > 6 && !e.render);
    for (const e of this.edges) for (let s = 0; s <= e.poly.len; s += 7) { const p = e.poly.at(s); this.samples.push({ x: p.x, z: p.z, e, s }); }
  }
  get count() { return this.samples.length; }

  /** Point de la rue le plus proche (arête et abscisse). */
  project(x: number, z: number, minLen = 0): Samp | null {
    let best: Samp | null = null, bd = 1e18;
    for (const q of this.samples) { if (q.e.poly.len < minLen) continue; const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; best = q; } }
    return best;
  }
  /** Point sur le trottoir (côté droit) d'une arête, parcourue dans le sens `dir`. */
  walk(e: RoadEdge, s: number, dir: 1 | -1): P2 { const p = e.poly.at(s), o = e.hw + SIDE; return { x: p.x - p.tz * dir * o, z: p.z + p.tx * dir * o }; }
  private along(e: RoadEdge, s0: number, s1: number, out: P2[]) {
    const dir: 1 | -1 = s1 >= s0 ? 1 : -1, n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 5));
    for (let k = 0; k <= n; k++) out.push(this.walk(e, s0 + ((s1 - s0) * k) / n, dir));
  }

  /** Chemin de trottoir entre deux points de rue. Renvoie null s'ils ne sont pas reliés. */
  path(a: Samp, b: Samp): P2[] | null {
    const out: P2[] = [];
    if (a.e === b.e) { this.along(a.e, a.s, b.s, out); return out; }
    const dij = (src: RoadNode) => {
      const dist = new Map<RoadNode, number>([[src, 0]]), prev = new Map<RoadNode, { n: RoadNode; e: RoadEdge }>(), todo = new Set<RoadNode>([src]);
      while (todo.size) {
        let u: RoadNode | null = null, ud = 1e18; for (const n of todo) { const d = dist.get(n)!; if (d < ud) { ud = d; u = n; } }
        if (!u) break; todo.delete(u);
        for (const e of u.edges) { if (e.render) continue; const v = e.a === u ? e.b : e.a, nd = ud + e.poly.len; if (nd < (dist.get(v) ?? 1e18)) { dist.set(v, nd); prev.set(v, { n: u, e }); todo.add(v); } }
      }
      return { dist, prev };
    };
    let best: { cost: number; n1: RoadNode; n2: RoadNode; prev: Map<RoadNode, { n: RoadNode; e: RoadEdge }> } | null = null;
    for (const n1 of [a.e.a, a.e.b]) {
      const { dist, prev } = dij(n1), c1 = n1 === a.e.a ? a.s : a.e.poly.len - a.s;
      for (const n2 of [b.e.a, b.e.b]) { const d = dist.get(n2); if (d === undefined) continue; const c2 = n2 === b.e.a ? b.s : b.e.poly.len - b.s, cost = c1 + d + c2; if (!best || cost < best.cost) best = { cost, n1, n2, prev }; }
    }
    if (!best) return null;
    const { n1, n2, prev } = best, chain: { e: RoadEdge; from: RoadNode; to: RoadNode }[] = [];
    for (let n = n2; n !== n1;) { const p = prev.get(n)!; chain.unshift({ e: p.e, from: p.n, to: n }); n = p.n; }
    this.along(a.e, a.s, n1 === a.e.a ? 0 : a.e.poly.len, out);
    for (const c of chain) this.along(c.e, c.from === c.e.a ? 0 : c.e.poly.len, c.to === c.e.a ? 0 : c.e.poly.len, out);
    this.along(b.e, n2 === b.e.a ? 0 : b.e.poly.len, b.s, out);
    return out;
  }

  /** Itinéraire à pied entre deux points quelconques (qui doivent être proches d'une rue). */
  route(from: P2, to: P2): P2[] | null {
    const a = this.project(from.x, from.z), b = this.project(to.x, to.z); if (!a || !b) return null;
    const mid = this.path(a, b); if (!mid) return null;
    return [from, ...mid, to];
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// L'habitant
// ---------------------------------------------------------------------------------------------------------------------------------
export interface Input { fwd: number; side: number; run: boolean }
export const WALK = 1.45, RUN = 4.2;

export class Habitant {
  x = 0; y = 0; z = 0;
  /** cap de la tête (rad) : absolu à pied, relatif au véhicule à bord */
  yaw = 0; pitch = 0;
  veh: Veh | null = null; lx = 0; lz = 0;
  /** arrêt où l'on est monté (on n'y redescend pas) et demande d'arrêt */
  boardedAt: string | null = null; request = false;
  /** secondes passées à bord */
  ridden = 0;
  /** vitesse de marche (m/s) et phase du pas, pour le balancement de la tête */
  v = 0; phase = 0;
  /** message d'aide affiché à l'écran */
  prompt = '';
  /** dernier arrêt où l'on est descendu */
  lastExit: Stop | null = null;
  private target: Veh | null = null;

  constructor(readonly w: HabWorld) {}

  get riding() { return this.veh !== null; }
  /** cap absolu */
  get heading() { return this.veh ? this.veh.pose().yaw + this.yaw : this.yaw; }

  place(x: number, z: number, yaw: number) {
    this.veh = null; this.x = x; this.z = z; this.yaw = yaw; this.pitch = 0;
    const s = this.w.surface(x, z); this.y = this.w.support(x, z) ?? s.y;
  }

  /** Mouvement à pied (clavier). */
  walk(dt: number, inp: Input) {
    this.v = 0;
    if (this.veh) { this.rideWalk(dt, inp); return; }
    const mx = inp.fwd, my = inp.side, l = Math.hypot(mx, my) || 1, sp = (inp.run ? RUN : WALK) * Math.min(1, l);   // stick analogique : vitesse proportionnelle
    if (mx || my) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);   // avant, gauche
      const dx = ((fx * mx + lx * my) / l) * sp * dt, dz = ((fz * mx + lz * my) / l) * sp * dt;
      this.tryMove(dx, dz); this.v = sp;
    }
    this.settle(dt);
  }
  private tryMove(dx: number, dz: number) {
    const w = this.w, ok = (x: number, z: number) => !w.blocked(x, z) && !w.surface(x, z).wet;
    if (ok(this.x + dx, this.z + dz)) { this.x += dx; this.z += dz; }
    else if (ok(this.x + dx, this.z)) this.x += dx;
    else if (ok(this.x, this.z + dz)) this.z += dz;
  }
  private settle(dt: number) {
    const g = this.w.support(this.x, this.z) ?? this.w.surface(this.x, this.z).y;
    this.y += (g - this.y) * Math.min(1, dt * 9); if (Math.abs(g - this.y) < 0.005) this.y = g;
    this.phase += this.v * dt * 1.9;
  }
  private rideWalk(dt: number, inp: Input) {
    const v = this.veh!, sp = WALK * 0.7;
    this.lx = Math.max(-v.halfLen, Math.min(v.halfLen, this.lx + inp.fwd * sp * dt));
    this.lz = Math.max(-v.halfW, Math.min(v.halfW, this.lz + inp.side * sp * dt));
    this.sync(); this.v = (inp.fwd || inp.side) ? sp : 0; this.phase += this.v * dt * 1.9;
  }
  /** Recale la position du monde sur le véhicule. */
  sync() {
    const v = this.veh; if (!v) return;
    const p = v.pose(), q = fromLocal(p, this.lx, this.lz); this.x = q.x; this.z = q.z; this.y = p.y + v.floor;
  }

  /** Véhicule à portée dont les portes sont ouvertes. */
  boardable(): Veh | null {
    if (this.veh) return null;
    let best: Veh | null = null, bd = 1e9;
    for (const v of this.w.vehicles()) {
      if (!v.stop()) continue;
      const p = v.pose(), d = Math.hypot(p.x - this.x, p.z - this.z); if (d > v.halfLen + 9) continue;
      const l = toLocal(p, this.x, this.z), dd = Math.max(0, Math.abs(l.lx) - v.halfLen - 2) + Math.max(0, Math.abs(l.lz) - 6);
      if (dd < bd && Math.abs(p.y + v.floor - this.y) < 3) { bd = dd; best = v; }
    }
    return bd < 6 ? best : null;
  }

  board(v: Veh) {
    const p = v.pose(), l = toLocal(p, this.x, this.z);
    this.veh = v; this.lx = Math.max(-v.halfLen, Math.min(v.halfLen, l.lx)); this.lz = Math.max(-v.halfW, Math.min(v.halfW, l.lz * 0.2));
    this.yaw = this.yaw - p.yaw; this.boardedAt = v.stop()?.key ?? null; this.request = false; this.ridden = 0; this.sync();
  }

  /** Descend du véhicule à l'arrêt où il se trouve. */
  alight(): boolean {
    const v = this.veh; if (!v) return false;
    const st = v.stop(); if (!st) return false;
    const p = v.pose(), s = v.exit(this.lx);
    this.yaw = this.yaw + p.yaw; this.veh = null; this.request = false; this.boardedAt = null;
    this.x = s.x; this.z = s.z; this.y = s.y; this.lastExit = { ...s, kind: v.kind, key: st.key, name: st.name };
    return true;
  }

  /** Touche d'action : monter, demander l'arrêt ou descendre. */
  interact(): string {
    if (!this.veh) { const v = this.boardable(); if (v) { this.board(v); return `Vous montez dans le ${v.label}.`; } return 'Aucun véhicule à l\'arrêt à portée.'; }
    const st = this.veh.stop();
    if (st && st.key !== this.boardedAt) { this.alight(); return `Vous descendez à l'${st.name}.`; }
    this.request = !this.request;
    return this.request ? 'Arrêt demandé : vous descendrez au prochain arrêt.' : 'Demande d\'arrêt annulée.';
  }

  /** À appeler à chaque image : suit le véhicule, gère la descente demandée. */
  update(dt: number) {
    const v = this.veh;
    if (v) {
      this.ridden += dt; this.sync();
      const st = v.stop();
      if (this.boardedAt && v.speed() > 1.5) this.boardedAt = null;          // le véhicule est parti : le prochain arrêt compte
      if (st && this.request && st.key !== this.boardedAt) { this.alight(); this.prompt = `Vous êtes descendu à l'${st.name}.`; return; }
      this.prompt = st ? (st.key === this.boardedAt ? `À l'${st.name} — portes ouvertes` : `À l'${st.name} — E : descendre`) : `${v.label} — prochain : ${v.next()}${this.request ? ' (arrêt demandé)' : ' — E : demander l\'arrêt'}`;
    } else {
      this.target = this.boardable();
      this.prompt = this.target ? `E : monter dans le ${this.target.label}` : '';
    }
  }

  // ----- pilote automatique -----
  private path: P2[] = []; private pi = 0;
  get walking() { return this.path.length > 0 && this.pi < this.path.length; }
  setPath(p: P2[] | null) { this.path = p ?? []; this.pi = 0; }
  /** Avance le long du chemin. Renvoie vrai quand il est terminé. */
  follow(dt: number): boolean {
    if (this.veh) return false;
    this.v = 0;
    if (!this.walking) return true;
    let t = this.path[this.pi], dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz);
    while (d < 0.6 && this.pi < this.path.length - 1) { this.pi++; t = this.path[this.pi]; dx = t.x - this.x; dz = t.z - this.z; d = Math.hypot(dx, dz); }
    if (d < 0.35 && this.pi >= this.path.length - 1) { this.pi = this.path.length; return true; }
    const want = Math.atan2(dx, dz); let da = want - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
    this.yaw += da * Math.min(1, dt * 5);
    const step = Math.min(d, WALK * dt); this.x += (dx / d) * step; this.z += (dz / d) * step; this.v = WALK;
    this.settle(dt);
    return false;
  }
  /** Se tourne doucement vers un point (attente à l'arrêt, regard vers la voie). */
  face(x: number, z: number, dt: number) { const a = Math.atan2(x - this.x, z - this.z); let da = a - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); this.yaw += da * Math.min(1, dt * 3); }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Une journée d'habitant
// ---------------------------------------------------------------------------------------------------------------------------------
export type DayPhase = 'début' | 'marche-départ' | 'attente' | 'trajet' | 'marche-travail' | 'travail' | 'midi' | 'après-midi' | 'marche-arrêt' | 'attente-retour' | 'trajet-retour' | 'marche-maison' | 'soir' | 'fin';
export interface DayCaption { hour: string; text: string }

/** Programme d'une journée : le domicile, un arrêt proche, le trajet, le lieu de travail, le retour. L'heure du monde saute entre les temps forts. */
export class Routine {
  phase: DayPhase = 'fin';
  caption: DayCaption = { hour: '', text: '' };
  /** demande de saut d'horloge (heure du monde) que le programme principal applique avec un fondu */
  jump: { hour: number; text: string } | null = null;
  private lastJump = 0;
  private t = 0; private home: P2 = { x: 0, z: 0 }; private homeStop: Stop | null = null; private work: P2 = { x: 0, z: 0 }; private workStop: Stop | null = null;
  private wait = 0; private pending: DayPhase | null = null;
  readonly log: string[] = [];
  n = 0;

  constructor(readonly hab: Habitant, readonly ways: Walkways, readonly seed = 1) {}

  private rnd() { this.n++; let x = Math.sin(this.n * 12.9898 + this.seed * 78.233) * 43758.5453; return x - Math.floor(x); }
  private say(hour: string, text: string) { this.caption = { hour, text }; this.log.push(`${hour} ${text}`); }
  private stopsNear(kind: TransitKind | null, x: number, z: number, r0: number, r1: number) {
    return this.hab.w.stops.filter(s => (!kind || s.kind === kind) && Math.hypot(s.x - x, s.z - z) >= r0 && Math.hypot(s.x - x, s.z - z) <= r1);
  }
  /** Choisit un domicile et l'arrêt qu'il utilise. Préfère le tram, puis le train, puis le bus. Renvoie faux si le monde n'offre aucun arrêt utilisable. */
  start(): boolean {
    const all = this.hab.w.stops; if (!all.length) return false;
    for (const kind of ['tram', 'train', 'bus'] as const) {
      const cand = all.filter(s => s.kind === kind); if (!cand.length) continue;
      for (let k = 0; k < 12; k++) {
        const s = cand[Math.floor(this.rnd() * cand.length)], ang = this.rnd() * 6.28, d = 70 + this.rnd() * 100;
        const tx = s.x + Math.cos(ang) * d, tz = s.z + Math.sin(ang) * d, sp = this.ways.project(tx, tz, 40); if (!sp || Math.hypot(sp.x - tx, sp.z - tz) > 60) continue;
        const home = this.ways.walk(sp.e, sp.s, 1), route = this.ways.route(home, s);
        if (!route || route.length < 6) continue;
        this.homeStop = s; this.home = home; this.hab.place(home.x, home.z, Math.atan2(route[1].x - home.x, route[1].z - home.z));
        this.hab.setPath(null); this.phase = 'début'; this.t = 0; this.wait = 0;
        this.jump = { hour: 7.15, text: 'Chez soi' }; this.say('07:10', `Chez soi — départ pour le travail (${kind})`); return true;
      }
    }
    return false;
  }

  private go(p: P2 | Stop, to: DayPhase) {
    const h = this.hab, r = this.ways.route({ x: h.x, z: h.z }, p); h.setPath(r ?? [{ x: p.x, z: p.z }]); this.phase = to;
  }
  private stopPos(s: Stop): P2 { return { x: s.x, z: s.z }; }

  /** Un pas de la journée. `hour` : heure du monde. */
  update(dt: number, hour: number) {
    const h = this.hab; this.t += dt; h.update(dt);
    const hh = (x: number) => `${String(Math.floor(x)).padStart(2, '0')}:${String(Math.floor((x - Math.floor(x)) * 60)).padStart(2, '0')}`;
    switch (this.phase) {
      case 'début': if (this.t > 3 && this.homeStop) { this.go(this.homeStop, 'marche-départ'); this.say(hh(hour), `En route vers l'${this.homeStop.name}`); this.t = 0; } break;
      case 'marche-départ': if (h.follow(dt)) { this.phase = 'attente'; this.t = 0; this.say(hh(hour), `À l'${this.homeStop!.name} — attente du ${KIND_LABEL[this.homeStop!.kind]}`); } break;
      case 'attente': case 'attente-retour': {
        const st = this.phase === 'attente' ? this.homeStop! : this.workStop!;
        if (this.pending) break;
        const v = h.boardable();
        const trail = v && Math.hypot(v.pose().x - st.x, v.pose().z - st.z) < 28;
        if (trail && v!.kind === st.kind && this.hereOk(v!, st)) { h.board(v!); this.phase = this.phase === 'attente' ? 'trajet' : 'trajet-retour'; this.t = 0; this.say(hh(hour), `Dans le ${v!.label}`); }
        else { const p = this.hab.w.vehicles().find(q => q.kind === st.kind && q.stop() && Math.hypot(q.pose().x - st.x, q.pose().z - st.z) < 40); if (p) h.face(p.pose().x, p.pose().z, dt); }
        break;
      }
      case 'trajet': case 'trajet-retour': {
        const v = h.veh;
        if (!v) { this.phase = 'marche-travail'; break; }
        const st = v.stop();
        if (st && st.key !== h.boardedAt) {
          const back = this.phase === 'trajet-retour';
          const near = this.homeStop && Math.hypot(v.exit(h.lx).x - this.homeStop.x, v.exit(h.lx).z - this.homeStop.z) < 70 && v.kind === this.homeStop.kind;
          if ((!back && h.ridden > 45) || (back && (near || h.ridden > 420))) {
            h.alight();
            if (!back) { this.workStop = h.lastExit; this.planWork(); this.phase = 'marche-travail'; this.say(hh(hour), `Descente à l'${st.name}`); }
            else { this.phase = 'marche-maison'; this.go(this.home, 'marche-maison'); this.say(hh(hour), 'De retour dans son quartier'); }
          }
        }
        break;
      }
      case 'marche-travail': if (h.follow(dt)) { this.phase = 'travail'; this.t = 0; this.say(hh(hour), 'Arrivée au travail'); } break;
      case 'travail': if (this.t > 5 && !this.pending) { this.pending = 'midi'; this.jump = { hour: 12.4, text: 'Pause de midi' }; this.lastJump = 12.4; } break;
      case 'midi': if (this.t > 7 && !this.pending) { this.pending = 'après-midi'; this.jump = { hour: 17.6, text: 'Fin de journée' }; this.lastJump = 17.6; } break;
      case 'après-midi': if (this.t > 4 && this.workStop) { this.go(this.workStop, 'marche-arrêt'); this.say(hh(hour), `Retour vers l'${this.workStop.name}`); } break;
      case 'marche-arrêt': if (h.follow(dt)) { this.phase = 'attente-retour'; this.t = 0; this.say(hh(hour), 'Attente du véhicule de retour'); } break;
      case 'marche-maison': if (h.follow(dt)) { this.phase = 'soir'; this.t = 0; this.pending = 'soir'; this.jump = { hour: 21, text: 'La soirée' }; this.lastJump = 21; this.say(hh(hour), 'Chez soi'); } break;
      case 'soir': if (this.t > 8) { this.phase = 'fin'; this.say(hh(hour), 'Fin de la journée'); } break;
      case 'fin': break;
    }
  }

  /** Le véhicule est-il à prendre ? Sur un tram à deux sens on ne vérifie rien : l'habitant descend là où il peut. */
  private hereOk(_v: Veh, _st: Stop) { return true; }

  /** Appelé par le programme principal une fois le saut d'horloge exécuté. */
  jumped() { const jh = this.lastJump; if (this.pending) { const p = this.pending; this.pending = null; if (p === 'soir') { this.hab.place(this.home.x, this.home.z, this.hab.yaw); } else { this.phase = p; } this.t = 0; this.say(jh ? `${String(Math.floor(jh)).padStart(2, '0')}:${String(Math.floor((jh - Math.floor(jh)) * 60)).padStart(2, '0')}` : '', p === 'midi' ? 'Pause de midi' : p === 'après-midi' ? 'Fin de la journée de travail' : 'Chez soi'); } }

  private planWork() {
    const h = this.hab, s = h.lastExit; if (!s) { this.work = { x: h.x, z: h.z }; return; }
    for (let k = 0; k < 10; k++) {
      const ang = this.rnd() * 6.28, d = 45 + this.rnd() * 80, tx = s.x + Math.cos(ang) * d, tz = s.z + Math.sin(ang) * d, sp = this.ways.project(tx, tz, 30); if (!sp || Math.hypot(sp.x - tx, sp.z - tz) > 60) continue;
      const p = this.ways.walk(sp.e, sp.s, 1), r = this.ways.route({ x: h.x, z: h.z }, p); if (!r || r.length < 4) continue;
      this.work = p; h.setPath(r); return;
    }
    this.work = { x: h.x, z: h.z }; h.setPath(null);
  }
}
