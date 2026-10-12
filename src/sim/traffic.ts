import type { World, Train } from './world';
import type { Edge } from './network';
import type { Lane, RoadNet, RoadNode, Crossing } from './roads';
import { Poly, crossHalf } from './roads';
import { rng, type Rand } from './cityplan';

/**
 * Circulation routière : véhicules suiveurs (IDM) sur les voies du réseau, exclusion mutuelle aux carrefours,
 * feux à deux phases, passages à niveau fermés à l'approche des trains. Aucune dépendance à Three.js.
 */

export type VKind = 'car' | 'bus' | 'truck';
export interface VSpec { len: number; w: number; h: number; a: number; b: number; T: number }
export const VSPEC: Record<VKind, VSpec> = {
  car: { len: 4.4, w: 1.8, h: 1.45, a: 1.6, b: 2.2, T: 1.2 },
  bus: { len: 11.5, w: 2.55, h: 3.1, a: 1.1, b: 2.0, T: 1.4 },
  truck: { len: 9.5, w: 2.5, h: 3.5, a: 0.9, b: 1.8, T: 1.5 },
};
const CAR_COLORS = [0xc0392b, 0x2c5aa0, 0xe8e8e8, 0x2b2b2e, 0x8a8f94, 0xd9b44a, 0x3f7d4e, 0x6b3f8a, 0xb8c2c9, 0xe07b39];
const TRUCK_COLORS = [0xf0f0f0, 0x2c5aa0, 0xd98a2b, 0xb23a2e, 0x6e7c86];

export interface Vehicle {
  id: number; kind: VKind; len: number; color: number; vfac: number;
  lane: Lane; s: number; v: number; acc: number;
  plan: Lane[];
  /** suivi de l'arrière : voies parcourues (indices absolus), position de l'arrière */
  trail: Lane[]; trailBase: number; laneAbs: number; rearAbs: number; rearS: number;
  holds: { node: RoadNode; abs: number }[];
  turnLim: number;
  stuck: number;
  /** pose pour le rendu */
  x: number; y: number; z: number; yaw: number; pitch: number;
  braking: boolean;
  /** bus : voie dont l'arrêt vient d'être desservi, instant de départ */
  stopDone?: Lane; holdUntil?: number; holdFrom?: number;
  /** bus : ligne fixe (arrêts successifs), arrêt visé et chemin déjà calculé jusqu'à lui */
  route?: BusStop[]; target?: BusStop; path?: Lane[];
}

/** Arrêt de bus : position sur une voie et sur le trottoir. */
export interface BusStop { lane: Lane; s: number; x: number; y: number; z: number; ox: number; oz: number; tx: number; tz: number }

export const CYCLE = 40;
export type Light = 'green' | 'yellow' | 'red';
/** État du feu pour le groupe 0 ou 1 d'un carrefour (cycle de 40 s, décalé par carrefour). */
export function lightState(node: RoadNode, group: number, t: number): Light {
  const c = (t + node.id * 7) % CYCLE, u = group === 0 ? c : (c + CYCLE - 20) % CYCLE;
  return u < 16 ? 'green' : u < 19 ? 'yellow' : 'red';
}

export interface TrafficCounts { car: number; bus: number; truck: number }

/** Le train menace-t-il ce passage à niveau ? (à moins de min(450, 11 v + 80) m, sur le passage, ou à moins de sa longueur + 12 m derrière) */
export function trainThreatens(t: Train, rail: { edge: Edge; off: number }[]): boolean {
  const reach = Math.min(450, t.v * 11 + 80), n = t.path.length;
  for (const r of rail) {
    const j = t.path.indexOf(r.edge);
    if (j >= 0) {
      let dh = t.d - r.off;                       // distance de la tête au passage, positive si elle l'a dépassé
      if (j < n - 1) { dh = t.d + r.edge.len - r.off; for (let k = j + 1; k < n - 1; k++) dh += t.path[k].len; }
      if (dh >= -reach && dh <= t.length + 12) return true;
    }
    const k = t.reserved.indexOf(r.edge);
    if (k >= 0) {
      let ahead = t.head.len - t.d + r.off;
      for (let q = 0; q < k; q++) ahead += t.reserved[q].len;
      if (ahead <= reach) return true;
    }
  }
  return false;
}

export class Traffic {
  time = 0;
  readonly vehicles: Vehicle[] = [];
  target: TrafficCounts = { car: 110, bus: 6, truck: 10 };
  /** point d'intérêt (caméra) : on ne fait pas apparaître ni disparaître de véhicule près de lui */
  focus: { x: number; z: number } | null = null;
  removedStuck = 0;
  /** Facteur sur les vitesses souhaitées (pluie, brouillard : moins de 1). */
  speedFactor = 1;
  readonly busStops: BusStop[] = [];
  /** Emplacements de livraison : les camions s'y arrêtent un moment (en double file). */
  readonly dropStops: BusStop[] = [];
  private stopOf = new Map<Lane, BusStop>();
  private dropOf = new Map<Lane, BusStop>();
  busStopOf(l: Lane) { return this.stopOf.get(l); }
  dropStopOf(l: Lane) { return this.dropOf.get(l); }
  private rand: Rand;
  private nextId = 1;
  private cumLen: number[] = [];
  private popT = 0;
  /** cantons de voie de chaque passage, retrouvés par identifiant dans CE monde (le réseau routier peut être partagé entre mondes) */
  private rail = new Map<Crossing, { edge: Edge; off: number }[]>();

  constructor(readonly roads: RoadNet, world: World, seed = 5) {
    this.rand = rng(seed);
    const byId = new Map(world.net.edges.map(e => [e.id, e] as const));
    for (const c of roads.crossings) this.rail.set(c, c.rail.map(r => ({ edge: byId.get(r.edgeId)!, off: r.off })).filter(r => r.edge));
    for (const l of roads.lanes) l.veh.length = 0;
    for (const n of roads.nodes) { n.holders.clear(); n.inLane = null; }
    for (const c of roads.crossings) { c.closed = false; c.closedT = 0; c.bar = 0; }
    let a = 0; for (const l of roads.lanes) { a += l.len; this.cumLen.push(a); }
    this.makeStops();
    this.populate();
  }

  /** Arrêts de bus : sur certaines voies assez longues des rues de ville principales, en retrait du carrefour. */
  private makeStops() {
    const r = rng(this.rand() * 1e9 | 0);
    const mk = (l: Lane, s: number): BusStop => {
      const e = l.edge, p = l.poly.at(s), c = e.poly.at(e.poly.len * (l === e.fwd ? s / l.len : 1 - s / l.len));
      let ox = p.x - c.x, oz = p.z - c.z; const m = Math.hypot(ox, oz) || 1; ox /= m; oz /= m;
      return { lane: l, s, x: c.x + ox * (e.hw + 0.3), y: p.y, z: c.z + oz * (e.hw + 0.3), ox, oz, tx: p.tx, tz: p.tz };
    };
    for (const l of this.roads.lanes) {
      const e = l.edge;
      if (e.render || e.tier > 1 || l.len < 80 || l.noEntry || r() > 0.4) continue;
      const bs = mk(l, l.len * (0.5 + (r() - 0.5) * 0.2));
      this.busStops.push(bs); this.stopOf.set(l, bs);
    }
    for (const l of this.roads.lanes) {
      const e = l.edge;
      if (e.render || e.tier > 2 || l.len < 60 || l.noEntry || this.stopOf.has(l) || r() > 0.3) continue;
      const ds = mk(l, l.len * (0.4 + r() * 0.2));
      this.dropStops.push(ds); this.dropOf.set(l, ds);
    }
  }

  // ------------------------------------------------------------- population

  private pickLane(): Lane | null {
    const L = this.roads.lanes; if (!L.length) return null;
    const r = this.rand() * this.cumLen[this.cumLen.length - 1];
    let lo = 0, hi = this.cumLen.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.cumLen[m] < r) lo = m + 1; else hi = m; }
    return L[lo];
  }
  count(k: VKind) { let n = 0; for (const v of this.vehicles) if (v.kind === k) n++; return n; }

  spawn(kind: VKind, far: boolean): Vehicle | null {
    const lane = this.pickLane(); if (!lane || lane.noEntry) return null;
    const sp = VSPEC[kind], s = sp.len + 3;
    if (lane.len < sp.len + 8 || lane.from.crossing) return null;
    if (lane.veh.length && (lane.veh[0] as Vehicle).s - (lane.veh[0] as Vehicle).len < s + 6) return null;
    const p = lane.poly.at(s);
    if (this.focus && far && Math.hypot(p.x - this.focus.x, p.z - this.focus.z) < 140) return null;
    if (lane.from.holders.size) return null;
    const colors = kind === 'car' ? CAR_COLORS : kind === 'truck' ? TRUCK_COLORS : [0xc0392b];
    const v: Vehicle = {
      id: this.nextId++, kind, len: sp.len, color: colors[Math.floor(this.rand() * colors.length)], vfac: 0.82 + this.rand() * 0.22,
      lane, s, v: Math.min(lane.vmax * 0.6, 8), acc: 0, plan: [], trail: [lane], trailBase: 0, laneAbs: 0, rearAbs: 0, rearS: s - sp.len,
      holds: [], turnLim: 99, stuck: 0, x: p.x, y: p.y, z: p.z, yaw: Math.atan2(p.tx, p.tz), pitch: 0, braking: false,
    };
    lane.veh.unshift(v); this.vehicles.push(v);
    this.plan(v, 4); this.setTurn(v); this.pose(v);
    return v;
  }
  private remove(v: Vehicle) {
    const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1);
    const j = v.lane.veh.indexOf(v); if (j >= 0) v.lane.veh.splice(j, 1);
    for (const h of v.holds) { h.node.holders.delete(v); if (!h.node.holders.size) h.node.inLane = null; }
    v.holds.length = 0;
  }
  private populate() {
    for (const k of ['car', 'bus', 'truck'] as VKind[]) for (let tries = 0; this.count(k) < this.target[k] && tries < this.target[k] * 40; tries++) this.spawn(k, false);
  }
  /** Ajuste la population aux consignes : fait apparaître au loin, retire ce qui est loin de la caméra. */
  private manage() {
    for (const k of ['car', 'bus', 'truck'] as VKind[]) {
      const n = this.count(k);
      if (n < this.target[k]) for (let t = 0; t < 12 && this.count(k) < this.target[k]; t++) { if (this.spawn(k, true)) break; }
      else if (n > this.target[k]) {
        let far: Vehicle | null = null, fd = -1;
        for (const v of this.vehicles) {
          if (v.kind !== k) continue;
          const d = this.focus ? Math.hypot(v.x - this.focus.x, v.z - this.focus.z) : 1e6 + v.id;
          if (d > fd) { fd = d; far = v; }
        }
        if (far && (!this.focus || fd > 160)) this.remove(far);
      }
    }
    for (const v of this.vehicles.slice()) if (v.stuck > 150) { this.removedStuck++; this.remove(v); }
  }

  // ------------------------------------------------------------- itinéraire

  /** Plus court chemin (en nombre de voies) de `from` à `to`, sans demi-tour ; `from` exclu. */
  private lanePath(from: Lane, to: Lane, maxN = 2500): Lane[] | null {
    if (from === to) return [];
    const prev = new Map<Lane, Lane>(), q: Lane[] = [from]; prev.set(from, from);
    for (let i = 0; i < q.length && i < maxN; i++) {
      const l = q[i];
      for (const o of l.to.lanesOut) {
        if (o === l.rev || o.noEntry || prev.has(o)) continue; prev.set(o, l);
        if (o === to) { const out: Lane[] = []; let c: Lane = o; while (c !== from) { out.push(c); c = prev.get(c)!; } return out.reverse(); }
        q.push(o);
      }
    }
    return null;
  }
  /** Choisit l'arrêt suivant de la ligne du bus (la ligne se construit au fil des arrêts, puis tourne en boucle). */
  private busTarget(v: Vehicle, from: Lane) {
    const R = v.route ?? (v.route = []);
    if (v.target && R.length >= 4) {
      const nx = R[(R.indexOf(v.target) + 1) % R.length], p = this.lanePath(from, nx.lane);
      if (p) { v.target = nx; v.path = p; return; }
      R.length = 0;                                       // ligne cassée (sens uniques) : on la reconstruit
    }
    const cand = this.busStops.filter(b => b.lane !== from && b !== v.target).sort(() => this.rand() - 0.5).slice(0, 14);
    for (const b of cand) { const p = this.lanePath(from, b.lane, 900); if (p && p.length >= 2 && p.length < 70) { v.target = b; v.path = p; if (!R.includes(b)) R.push(b); return; } }
    v.target = undefined; v.path = undefined;
  }
  private busPlan(v: Vehicle, n: number) {
    for (let guard = 0; v.plan.length < n && guard < 40; guard++) {
      const last = v.plan.length ? v.plan[v.plan.length - 1] : v.lane;
      const outs = last.to.lanesOut.filter(l => l !== last.rev && !l.noEntry);
      if (!outs.length) { v.plan.push(last.rev); v.path = undefined; continue; }
      if (!v.target || (last === v.target.lane && !v.path?.length)) this.busTarget(v, last);
      const nx = v.path?.[0];
      if (nx && outs.includes(nx)) { v.plan.push(nx); v.path!.shift(); continue; }
      if (v.target && v.target.lane !== last) { const p = this.lanePath(last, v.target.lane); if (p && p.length && outs.includes(p[0])) { v.path = p; v.plan.push(p[0]); v.path.shift(); continue; } }
      v.target = undefined; v.path = undefined;
      v.plan.push(outs[Math.floor(this.rand() * outs.length)]);   // repli : au hasard
    }
  }
  /** Prochain arrêt desservi par ce bus (et distance), d'après sa trajectoire déjà tracée. */
  nextBusStop(v: Vehicle): { stop: BusStop; d: number } | null {
    this.plan(v, 9);
    let d = 0;
    const b0 = this.stopOf.get(v.lane);
    if (b0 && v.stopDone !== v.lane && b0.s > v.s - 1) return { stop: b0, d: Math.max(0, b0.s - v.s) };
    d += v.lane.len - v.s;
    for (const l of v.plan) { const b = this.stopOf.get(l); if (b) return { stop: b, d: d + b.s }; d += l.len; }
    return null;
  }
  private plan(v: Vehicle, n: number) {
    if (v.kind === 'bus' && this.busStops.length > 3) { this.busPlan(v, n); return; }
    while (v.plan.length < n) {
      const last = v.plan.length ? v.plan[v.plan.length - 1] : v.lane;
      const outs = last.to.lanesOut.filter(l => l !== last.rev && !l.noEntry);
      if (!outs.length) { v.plan.push(last.rev); continue; }       // cul-de-sac : demi-tour
      const a = last.poly.at(Math.max(0, last.len - 2));
      let tot = 0; const w = outs.map(l => { const b = l.poly.at(Math.min(l.len, 2)); const c = a.tx * b.tx + a.tz * b.tz; const x = (0.25 + Math.max(0, c) * 2.2 + (v.kind !== 'car' && l.edge.tier === 2 ? -0.2 : 0)) * (last.edge.oneWay && !l.edge.oneWay ? 5 : 1); tot += Math.max(0.05, x); return Math.max(0.05, x); });   // sur un rond-point on sort vite : l'anneau reste fluide
      let r = this.rand() * tot, i = 0; while (i < outs.length - 1 && (r -= w[i]) > 0) i++;
      v.plan.push(outs[i]);
    }
  }
  private setTurn(v: Vehicle) {
    this.plan(v, 2);
    const a = v.lane.poly.at(Math.max(0, v.lane.len - 1)), b = v.plan[0].poly.at(Math.min(v.plan[0].len, 1));
    const cross = a.tx * b.tz - a.tz * b.tx, dot = a.tx * b.tx + a.tz * b.tz, th = Math.abs(Math.atan2(cross, dot));
    v.turnLim = th < 0.25 ? 99 : th < 0.8 ? 7 : 4.5;
  }

  // ------------------------------------------------------------- passages à niveau

  updateCrossings(world: World, dt: number) {
    for (const c of this.roads.crossings) {
      let closed = false;
      for (const t of world.trains) if (t.status !== 'stored' && trainThreatens(t, this.rail.get(c)!)) { closed = true; break; }
      if (closed && !c.closed) c.closedT = 0;
      if (closed) c.closedT += dt; else if (c.closed && c.closedT < 6) { closed = true; c.closedT += dt; }
      c.closed = closed;
      c.bar += ((closed && c.closedT > 3 ? 1 : 0) - c.bar) * Math.min(1, dt * 1.2);
    }
  }

  // ------------------------------------------------------------- dynamique

  /**
   * Place disponible juste après un nœud : on suppose que chaque véhicule de la voie qui n'a pas encore réservé son carrefour
   * finira à l'arrêt devant lui (pire cas). Il faut de quoi loger tout le véhicule, plus son intervalle et le dégagement du nœud.
   */
  private space(v: Vehicle, seq: Lane[], from: number): boolean {
    const need = v.len + 3.5; let free = 0;
    for (let j = from; j < seq.length && free < need; j++) {
      const l = seq[j];
      if (!l.veh.length) { free += l.len; continue; }
      let pos = l.len - 2.5, rear = Infinity;
      for (let i = l.veh.length - 1; i >= 0; i--) {
        const o = l.veh[i] as Vehicle;
        if (o.holds.some(h => h.node === l.to)) continue;   // il a réservé la sortie : il va partir
        rear = Math.min(rear, o.s - o.len, pos - o.len); pos -= o.len + 2;
      }
      if (rear === Infinity) { free += l.len; continue; }
      free += Math.max(0, rear); break;
    }
    return free >= need;
  }

  /** Peut-on franchir ce nœud ? (feu, passage à niveau, exclusion mutuelle ; `convoy` = même voie d'arrivée que le groupe déjà engagé) */
  private free(v: Vehicle, node: RoadNode, L: Lane, light: boolean, cross: boolean): boolean {
    if (light && node.lights) { const g = node.lights.get(L); if (g !== undefined && lightState(node, g, this.time) !== 'green') return false; }
    if (cross && node.crossing?.closed) return false;
    if (!node.holders.size || (node.holders.size === 1 && node.holders.has(v))) return true;
    return node.inLane === L && this.time - node.since < 9;
  }

  /** Réserve d'un coup le nœud et ceux qui le suivent de trop près : un véhicule long ne reste pas à cheval sur deux carrefours. */
  /** Réseau de tram : les véhicules lui cèdent le passage aux carrefours traversés. */
  tramPrio?: { laneBlocked(lane: object): boolean; obstacle?(x: number, z: number, yaw: number): { d: number; v: number } | null };
  private tryClaim(v: Vehicle, k: number, seq: Lane[], dist: number, margin: number): boolean {
    const canStop = v.v < 1 || dist - margin >= (v.v * v.v) / 10;   // à l'arrêt (ou presque), on peut toujours rester là
    // chaîne : tant que la voie suivante est trop courte pour que l'arrière ait dégagé le nœud (longueur + 4 m) à l'arrêt devant le suivant,
    // on réserve aussi le nœud suivant. Ainsi un véhicule ne reste jamais à l'arrêt en retenant un nœud (pas d'interblocage « tient et attend »).
    // rond-point : on n'y entre que si la portion suivante de l'anneau est vide et qu'aucun véhicule de l'anneau n'arrive (priorité à ceux qui y circulent) ;
    // l'anneau ne peut ainsi jamais se remplir (pas d'interblocage circulaire)
    if (seq[k + 1] && seq[k + 1].edge.oneWay && !seq[k].edge.oneWay) {
      if (seq[k + 1].veh.length) return false;
      for (const l of seq[k].to.lanesIn) if (l.edge.oneWay && !l.noEntry && l.veh.some(o => l.len - o.s < 22)) return false;
    }
    const chain: number[] = [k];
    for (let j = k + 1; j + 1 < seq.length; j++) { if (seq[j].len >= v.len + 4) break; chain.push(j); }
    const last = chain[chain.length - 1];
    if (!seq[last + 1]) return false;
    for (const j of chain) {
      const node = seq[j].to;
      if (v.holds.some(h => h.node === node)) continue;
      if (this.tramPrio?.laneBlocked(seq[j])) return false;   // le tram est prioritaire
      if (!this.free(v, node, seq[j], j === k && canStop, j > k || canStop)) return false;
    }
    for (let j = k + 1; j <= last; j++) if (seq[j].veh.length) return false;
    if (!this.space(v, seq, last + 1)) return false;
    for (const j of chain) {
      const node = seq[j].to;
      if (v.holds.some(h => h.node === node)) continue;
      if (!node.holders.size) { node.inLane = seq[j]; node.since = this.time; }
      node.holders.add(v); v.holds.push({ node, abs: v.laneAbs + j + 1 });
    }
    return true;
  }

  private accel(v: Vehicle): number {
    const sp = VSPEC[v.kind], lane = v.lane;
    this.plan(v, 5);
    // un passage à niveau qui se ferme annule les réservations des véhicules qui peuvent encore s'arrêter avant lui
    for (let i = v.holds.length - 1; i >= 0; i--) {
      const h = v.holds[i], m = h.abs - v.laneAbs;
      if (m < 1 || !h.node.crossing?.closed) continue;
      let dist = lane.len - v.s; for (let q = 0; q < m - 1; q++) dist += v.plan[q].len;
      if (dist - (crossHalf(h.node.crossing) + 2) >= (v.v * v.v) / 10) { h.node.holders.delete(v); if (!h.node.holders.size) h.node.inLane = null; v.holds.splice(i, 1); }
    }
    let v0 = lane.vmax * v.vfac * this.speedFactor, gap = 1e9, dv = 0;
    const list = lane.veh, idx = list.indexOf(v), ld = list[idx + 1] as Vehicle | undefined;
    const seq = [lane, ...v.plan];
    if (ld) { gap = ld.s - ld.len - v.s; dv = v.v - ld.v; }
    else {
      let d = lane.len - v.s;
      for (let k = 0; k < 3 && k < v.plan.length; k++) {
        const l = v.plan[k], f = l.veh[0] as Vehicle | undefined;
        if (f) { gap = d + f.s - f.len; dv = v.v - f.v; break; }
        d += l.len; if (d > 120) break;
      }
    }
    if (v.kind === 'bus') {                                  // arrêt de bus : s'arrête au poteau, patiente, repart
      if (v.holdUntil !== undefined && this.time < v.holdUntil) return -9;
      const bs = this.stopOf.get(lane);
      if (bs && v.stopDone !== lane && v.s < bs.s + 1) {
        const g = bs.s - v.s + 2 - v.len / 2;
        if (g < gap) { gap = g; dv = v.v; }
        if (v.v < 0.3 && bs.s - v.s < v.len) { v.stopDone = lane; v.holdFrom = this.time; v.holdUntil = this.time + 8 + (v.id % 7); return -9; }
      }
    }
    if (v.kind === 'truck') {                                // livraison : certains camions s'arrêtent en double file devant l'emplacement
      if (v.holdUntil !== undefined && this.time < v.holdUntil) return -9;
      const ds = this.dropOf.get(lane);
      if (ds && v.stopDone !== lane && v.s < ds.s + 1 && (v.id * 7 + Math.floor(ds.s)) % 3 === 0) {
        const g = ds.s - v.s + 2 - v.len / 2;
        if (g < gap) { gap = g; dv = v.v; }
        if (v.v < 0.3 && ds.s - v.s < v.len) { v.stopDone = lane; v.holdFrom = this.time; v.holdUntil = this.time + 9 + (v.id % 6); return -9; }
      }
    }
    // un tram devant, dans la trajectoire : on le traite comme un véhicule qui précède
    if (this.tramPrio?.obstacle) { const o = this.tramPrio.obstacle(v.x, v.z, v.yaw); if (o && o.d - v.len / 2 < gap) { gap = Math.max(0.1, o.d - v.len / 2); dv = v.v - o.v; } }
    // carrefours, feux, passages à niveau
    const horizon = (v.v * v.v) / 4 + 14;
    let dist = lane.len - v.s;
    const leadOk = !ld;   // seul le premier de la file réserve le carrefour (son prédécesseur a déjà franchi le nœud)
    for (let k = 0; k < 3 && k + 1 < seq.length && leadOk; k++) {
      if (dist > horizon) break;
      const L = seq[k], node = L.to, margin = node.crossing ? crossHalf(node.crossing) + 2 : 2.5;
      if (!v.holds.some(h => h.node === node)) {
        if (!this.tryClaim(v, k, seq, dist, margin)) { const g = dist - margin + 2; if (g < gap) { gap = g; dv = v.v; } break; }   // +2 : l'IDM s'arrête à s0 = 2 m de l'obstacle, on veut `margin` m de la ligne
      }
      dist += seq[k + 1].len;
    }
    // limites de vitesse à l'approche du prochain nœud (virage, voie plus lente)
    const d0 = Math.max(0, lane.len - v.s), nl = v.plan[0];
    v0 = Math.min(v0, Math.sqrt(v.turnLim * v.turnLim + 2 * sp.b * d0), Math.sqrt((nl.vmax * v.vfac * this.speedFactor) ** 2 + 2 * sp.b * d0));
    const sStar = 2 + Math.max(0, v.v * sp.T + (v.v * dv) / (2 * Math.sqrt(sp.a * sp.b)));
    const a = sp.a * (1 - Math.pow(v.v / Math.max(v0, 0.5), 4) - (sStar / Math.max(gap, 0.1)) ** 2);
    return Math.max(-9, a);
  }

  /** `crossings = false` si l'appelant met déjà les passages à niveau à jour (à chaque pas du monde). */
  step(world: World, dt: number, crossings = true): void {
    this.time += dt;
    if (crossings) this.updateCrossings(world, dt);
    const V = this.vehicles;
    // ordre de traitement tournant au hasard : sinon le même véhicule gagne toujours la course au carrefour libre
    const off = V.length ? Math.floor(this.rand() * V.length) : 0;
    for (let i = 0; i < V.length; i++) { const v = V[(i + off) % V.length]; v.acc = this.accel(v); }
    for (const v of V) {
      const v1 = Math.max(0, v.v + v.acc * dt), ds = ((v.v + v1) / 2) * dt;
      v.v = v1; v.s += ds; v.braking = v.acc < -0.8;
      v.stuck = v.v < 0.1 ? v.stuck + dt : 0;
      // arrière
      v.rearS += ds;
      for (;;) {
        const rl = v.trail[v.rearAbs - v.trailBase];
        if (v.rearS > rl.len && v.rearAbs < v.laneAbs) { v.rearS -= rl.len; v.rearAbs++; } else break;
      }
      while (v.trailBase < v.rearAbs - 1) { v.trail.shift(); v.trailBase++; }   // on garde la voie précédente : l'arrière en a besoin pour arrondir le virage
      // changement de voie
      while (v.s > v.lane.len && v.plan.length) {
        const old = v.lane, i = old.veh.indexOf(v); if (i >= 0) old.veh.splice(i, 1);
        v.s -= old.len; v.lane = v.plan.shift()!; v.trail.push(v.lane); v.laneAbs++;
        v.lane.veh.unshift(v);
        this.setTurn(v);
      }
      // libération des carrefours une fois l'arrière passé
      for (let i = v.holds.length - 1; i >= 0; i--) {
        const h = v.holds[i];
        if (v.rearAbs > h.abs || (v.rearAbs === h.abs && v.rearS > 1.5)) {
          h.node.holders.delete(v); if (!h.node.holders.size) h.node.inLane = null;
          v.holds.splice(i, 1);
        }
      }
      this.pose(v);
    }
    for (const v of V) { const l = v.lane.veh; if (l.length > 1) l.sort((a, b) => a.s - b.s); }
    this.popT += dt;
    if (this.popT > 0.5) { this.popT = 0; this.manage(); }
  }

  /** Courbe de virage lissée (Bézier quadratique) entre la fin de la voie L et le début de la voie N, mise en cache. */
  private curves = new Map<number, { poly: Poly; a: number }>();
  private turnCurve(L: Lane, N: Lane) {
    const key = L.id * 100003 + N.id;
    let c = this.curves.get(key);
    if (c) return c;
    const a = Math.min(7, L.len * 0.45, N.len * 0.45);
    const A = L.poly.at(L.len - a), C = N.poly.at(a), tA = L.poly.at(L.len), tC = N.poly.at(0);
    const cross = tA.tx * tC.tz - tA.tz * tC.tx;
    let bx = (A.x + C.x) / 2, bz = (A.z + C.z) / 2;
    if (Math.abs(cross) > 0.02) {                     // point d'intersection des deux tangentes
      const dx = C.x - A.x, dz = C.z - A.z, t1 = (dx * tC.tz - dz * tC.tx) / cross, t2 = (dx * tA.tz - dz * tA.tx) / cross;
      if (t1 > 0 && t2 > 0 && t1 < 5 * a && t2 < 5 * a) { bx = A.x + tA.tx * t1; bz = A.z + tA.tz * t1; }
    }
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
      pts.push({ x: w0 * A.x + w1 * bx + w2 * C.x, y: A.y + (C.y - A.y) * u, z: w0 * A.z + w1 * bz + w2 * C.z });
    }
    c = { poly: new Poly(pts), a };
    this.curves.set(key, c);
    return c;
  }
  /** Position sur une voie, en arrondissant le passage du carrefour (entrée de `next` / sortie de `prev`). */
  private pos(lane: Lane, s: number, prev?: Lane, next?: Lane) {
    s = Math.max(0, Math.min(s, lane.len));
    if (next && next !== lane) { const c = this.turnCurve(lane, next); if (s > lane.len - c.a) return c.poly.at((c.poly.len * (s - (lane.len - c.a))) / (2 * c.a)); }
    if (prev && prev !== lane) { const c = this.turnCurve(prev, lane); if (s < c.a) return c.poly.at((c.poly.len * (c.a + s)) / (2 * c.a)); }
    return lane.poly.at(s);
  }

  /** Position (milieu) et cap du véhicule, d'après les points de l'avant et de l'arrière. */
  private pose(v: Vehicle) {
    const fi = v.laneAbs - v.trailBase, ri = v.rearAbs - v.trailBase, rl = v.trail[ri];
    const f = this.pos(v.lane, v.s, v.trail[fi - 1], v.plan[0]);
    const r = this.pos(rl, v.rearS, v.trail[ri - 1], v.trail[ri + 1] ?? v.plan[0]);
    const dx = f.x - r.x, dz = f.z - r.z, l = Math.hypot(dx, dz);
    v.x = (f.x + r.x) / 2; v.z = (f.z + r.z) / 2; v.y = (f.y + r.y) / 2;
    if (l > 0.5) { v.yaw = Math.atan2(dx, dz); v.pitch = Math.atan2(r.y - f.y, l); }
  }
}
