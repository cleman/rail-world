import type { Network, Edge } from './network';
import type { Terrain } from './terrain';
import type { WorldPlan } from './planning';
import { deckProfile, type Street } from './cityplan';
import { nearestDist } from './planning';

/** Réseau routier : graphe non orienté (rues des villes + routes de campagne), puis deux voies par tronçon. Aucune dépendance à Three.js. */

export interface Pt { x: number; y: number; z: number }
export interface Sample { x: number; y: number; z: number; tx: number; tz: number }

/** Polyligne avec abscisses cumulées. */
export class Poly {
  readonly cum: number[] = [0];
  readonly len: number;
  constructor(readonly pts: Pt[]) {
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    this.len = this.cum[this.cum.length - 1];
  }
  at(d: number): Sample {
    d = Math.max(0, Math.min(this.len, d));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= d) lo = m; else hi = m; }
    const a = this.pts[lo], b = this.pts[lo + 1] ?? a, seg = this.cum[lo + 1] - this.cum[lo] || 1;
    const u = Math.max(0, Math.min(1, (d - this.cum[lo]) / seg));
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, tx: (b.x - a.x) / seg, tz: (b.z - a.z) / seg };
  }
}

/** Demi-longueur (le long de la route) de la dalle d'un passage à niveau : la voie ferrée (≈ 4,6 m de part et d'autre de l'axe) doit être entièrement couverte, même sous un angle faible. */
export function crossHalf(cr: { rx: number; rz: number; tx: number; tz: number }): number {
  const sin = Math.abs(cr.rx * cr.tz - cr.rz * cr.tx);
  return Math.max(5, Math.min(18, 4.6 / Math.max(0.28, sin) + 0.8));
}
export interface Crossing {
  id: number;
  node: RoadNode;
  x: number; y: number; z: number;
  /** direction de la route et de la voie ferrée en ce point */
  rx: number; rz: number; tx: number; tz: number;
  /** cantons de voie ferrée qui passent ici (il y en a un par voie, plus les raccordements voisins) et abscisse du passage sur chacun */
  rail: { edgeId: string; off: number }[];
  closed: boolean;
  /** temps écoulé depuis la fermeture (s) */
  closedT: number;
  /** 0 = barrières levées, 1 = baissées (animation côté rendu) */
  bar: number;
  /** demi-largeur de la chaussée */
  hw: number;
}

export interface RoadNode {
  id: number; x: number; z: number; y: number;
  edges: RoadEdge[];
  lanesIn: Lane[]; lanesOut: Lane[];
  crossing: Crossing | null;
  /** feux : groupe (0 ou 1) de chaque voie entrante, nul s'il n'y a pas de feux */
  lights: Map<Lane, number> | null;
  /** exclusion mutuelle des véhicules dans le carrefour */
  holders: Set<unknown>;
  inLane: Lane | null;
  since: number;
}

export interface RoadEdge {
  id: number; a: RoadNode; b: RoadNode;
  poly: Poly;
  tier: 0 | 1 | 2 | 3;
  hw: number;
  vmax: number;
  /** vrai pour les routes de campagne (les rues des villes sont dessinées par city.ts) */
  render: boolean;
  fwd: Lane; back: Lane;
  /** sens unique (rond-point) : la voie `back` n'est jamais empruntée */
  oneWay?: boolean;
}

export interface LaneUser { s: number; len: number }

export interface Lane {
  id: number;
  noEntry?: boolean;
  edge: RoadEdge;
  from: RoadNode; to: RoadNode;
  poly: Poly;
  len: number;
  vmax: number;
  /** véhicules dont l'avant est sur cette voie, triés par abscisse croissante */
  veh: LaneUser[];
  rev: Lane;
}

export interface RoadNet {
  nodes: RoadNode[]; edges: RoadEdge[]; lanes: Lane[]; crossings: Crossing[];
  /** distance à la route de campagne la plus proche (plafonnée) */
  dist(x: number, z: number): number;
  /** longueur de voie totale (m), pour répartir les véhicules */
  totalLen: number;
  report: string[];
}

const LANE_OFF = 1.8;
export const HW = [8, 6.5, 4.2, 3.6];     // demi-largeurs par rang (les rues viennent de city.ts)
const VMAX = [14, 13, 9, 20];
const SNAP = 2.5;

// ---------------------------------------------------------------- graphe brut

interface RawNode { x: number; z: number; deg: number }
interface RawEdge { a: number; b: number; pts: [number, number][]; tier: 0 | 1 | 2 | 3; hw: number; render: boolean; comp?: number; oneWay?: boolean }

class Raw {
  nodes: RawNode[] = [];
  edges: RawEdge[] = [];
  private hash = new Map<number, number[]>();
  private seen = new Set<string>();
  private k(cx: number, cz: number) { return cx * 100003 + cz; }
  node(x: number, z: number, snap = SNAP): number {
    const cx = Math.floor(x / 10), cz = Math.floor(z / 10);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      for (const id of this.hash.get(this.k(cx + i, cz + j)) ?? []) if (Math.hypot(this.nodes[id].x - x, this.nodes[id].z - z) <= snap) return id;
    const id = this.nodes.length;
    this.nodes.push({ x, z, deg: 0 });
    const key = this.k(cx, cz), l = this.hash.get(key);
    if (l) l.push(id); else this.hash.set(key, [id]);
    return id;
  }
  edge(a: number, b: number, pts: [number, number][], tier: 0 | 1 | 2 | 3, hw: number, render: boolean, oneWay = false): void {
    if (a === b) return;
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (len < 1) return;
    const key = `${Math.min(a, b)}-${Math.max(a, b)}-${Math.round(len / 2)}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    pts = pts.map(p => [p[0], p[1]] as [number, number]);
    pts[0] = [this.nodes[a].x, this.nodes[a].z]; pts[pts.length - 1] = [this.nodes[b].x, this.nodes[b].z];
    this.edges.push({ a, b, pts, tier, hw, render, oneWay });
    this.nodes[a].deg++; this.nodes[b].deg++;
  }
}

function segInter(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): [number, number] | null {
  const r1 = bx - ax, r2 = bz - az, s1 = dx - cx, s2 = dz - cz, den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * s2 - (cz - az) * s1) / den, u = ((cx - ax) * r2 - (cz - az) * r1) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return [t, u];
}

/** Découpe les rues d'une ville à leurs intersections et jonctions en T, et les ajoute au graphe. */
function addCity(raw: Raw, streets: Street[]): void {
  const S = streets.map(s => ({ ...s, pts: s.pts.map(p => [p[0], p[1]] as [number, number]) }));
  // jonctions en T : une extrémité proche d'une autre rue s'y prolonge
  const nearSeg = (x: number, z: number, skip: number) => {
    let best: { d: number; px: number; pz: number } | null = null;
    S.forEach((o, j) => {
      if (j === skip) return;
      for (let i = 1; i < o.pts.length; i++) {
        const [ax, az] = o.pts[i - 1], [bx, bz] = o.pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), px = ax + dx * u, pz = az + dz * u, d = Math.hypot(x - px, z - pz);
        if (!best || d < best.d) best = { d, px, pz };
      }
    });
    return best as { d: number; px: number; pz: number } | null;
  };
  S.forEach((s, i) => {
    for (const end of [0, 1]) {
      const p = end ? s.pts[s.pts.length - 1] : s.pts[0], q = nearSeg(p[0], p[1], i);
      if (q && q.d > 0.05 && q.d < 9) { if (end) s.pts.push([q.px, q.pz]); else s.pts.unshift([q.px, q.pz]); }
    }
  });
  // intersections
  const cell = 40, grid = new Map<number, [number, number][]>();
  const key = (cx: number, cz: number) => cx * 100003 + cz;
  S.forEach((s, i) => { for (let k = 1; k < s.pts.length; k++) {
    const [ax, az] = s.pts[k - 1], [bx, bz] = s.pts[k];
    for (let cx = Math.floor(Math.min(ax, bx) / cell); cx <= Math.floor(Math.max(ax, bx) / cell); cx++)
      for (let cz = Math.floor(Math.min(az, bz) / cell); cz <= Math.floor(Math.max(az, bz) / cell); cz++) { const l = grid.get(key(cx, cz)); if (l) l.push([i, k]); else grid.set(key(cx, cz), [[i, k]]); }
  } });
  const events: { pos: number; x: number; z: number }[][] = S.map(() => []);
  S.forEach((s, i) => {
    const done = new Set<number>();
    for (let k = 1; k < s.pts.length; k++) {
      const [ax, az] = s.pts[k - 1], [bx, bz] = s.pts[k];
      for (let cx = Math.floor(Math.min(ax, bx) / cell); cx <= Math.floor(Math.max(ax, bx) / cell); cx++)
        for (let cz = Math.floor(Math.min(az, bz) / cell); cz <= Math.floor(Math.max(az, bz) / cell); cz++)
          for (const [j, m] of grid.get(key(cx, cz)) ?? []) {
            if (j === i) continue;
            const id = (j * 4096 + m) * 4096 + k;
            if (done.has(id)) continue; done.add(id);
            const o = S[j].pts, r = segInter(ax, az, bx, bz, o[m - 1][0], o[m - 1][1], o[m][0], o[m][1]);
            if (r) events[i].push({ pos: k - 1 + r[0], x: ax + (bx - ax) * r[0], z: az + (bz - az) * r[0] });
          }
    }
  });
  S.forEach((s, i) => {
    const n = s.pts.length;
    const cuts: { pos: number; x: number; z: number }[] = [{ pos: 0, x: s.pts[0][0], z: s.pts[0][1] }, ...events[i], { pos: n - 1, x: s.pts[n - 1][0], z: s.pts[n - 1][1] }];
    cuts.sort((p, q) => p.pos - q.pos);
    for (let c = 1; c < cuts.length; c++) {
      const c0 = cuts[c - 1], c1 = cuts[c], pts: [number, number][] = [[c0.x, c0.z]];
      for (let v = Math.floor(c0.pos) + 1; v < c1.pos - 1e-9; v++) if (v > c0.pos + 1e-9) pts.push(s.pts[v]);
      pts.push([c1.x, c1.z]);
      raw.edge(raw.node(c0.x, c0.z), raw.node(c1.x, c1.z), pts, s.tier, s.hw, false, s.oneWay);
    }
  });
}

// ---------------------------------------------------------------- A*

class Heap {
  private a: [number, number][] = [];
  get size() { return this.a.length; }
  push(k: number, v: number) {
    const a = this.a; a.push([k, v]); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop(): [number, number] {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; }
    }
    return top;
  }
}

const GS = 30, GH = 2200, GN = Math.ceil((GH * 2) / GS);

function chaikin(p: [number, number][], it: number): [number, number][] {
  for (let k = 0; k < it; k++) {
    const q: [number, number][] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]); p = q;
  }
  return p;
}
function resample(p: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [p[0]];
  let acc = 0;
  let len = 0; for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  const n = Math.max(2, Math.round(len / step)), st = len / n;
  let next = st;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + l >= next - 1e-9 && out.length < n) { const u = (next - acc) / (l || 1); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); next += st; }
    acc += l;
  }
  out.push(p[p.length - 1]);
  return out;
}

// ---------------------------------------------------------------- construction

export function buildRoads(net: Network, terrain: Terrain, wp: WorldPlan): RoadNet {
  const report: string[] = [];
  const raw = new Raw();
  const cityOf: number[] = [];                  // pour chaque arête brute de ville : indice du plan
  wp.plans.forEach((p, pi) => { const before = raw.edges.length; addCity(raw, p.streets); for (let i = before; i < raw.edges.length; i++) cityOf[i] = pi; });
  const cityEdges = raw.edges.length;

  // composantes connexes ; on ne garde par ville que la plus grande
  const uf = raw.nodes.map((_, i) => i);
  const find = (x: number): number => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
  const union = (a: number, b: number) => { uf[find(a)] = find(b); };
  for (const e of raw.edges) union(e.a, e.b);
  const keepRoot: number[] = [];                // par plan, racine de la composante gardée
  wp.plans.forEach((_, pi) => {
    const cnt = new Map<number, number>();
    raw.edges.forEach((e, i) => { if (cityOf[i] === pi) cnt.set(find(e.a), (cnt.get(find(e.a)) ?? 0) + e.pts.length); });
    let best = -1, bc = 0; for (const [r, c] of cnt) if (c > bc) { bc = c; best = r; }
    keepRoot[pi] = best;
  });
  const kept = new Set<RawEdge>(), keptNodes = new Set<number>();
  raw.edges.forEach((e, i) => { if (keepRoot[cityOf[i]] === find(e.a)) { kept.add(e); keptNodes.add(e.a); keptNodes.add(e.b); } });
  report.push(`rues : ${cityEdges} tronçons, ${kept.size} gardés (composante principale de chaque ville)`);

  // ---- grille de coûts pour les routes de campagne
  const H = new Float32Array(GN * GN), cost = new Float32Array(GN * GN), blocked = new Uint8Array(GN * GN);
  const cx = (i: number) => -GH + (i + 0.5) * GS;
  const near = (pts: { x: number; z: number }[], R: number, cap: number, out: Float32Array | Uint8Array, v: number, add: boolean) => {
    for (const p of pts) {
      const i0 = Math.floor((p.x - R + GH) / GS), i1 = Math.floor((p.x + R + GH) / GS), j0 = Math.floor((p.z - R + GH) / GS), j1 = Math.floor((p.z + R + GH) / GS);
      for (let i = Math.max(0, i0); i <= Math.min(GN - 1, i1); i++) for (let j = Math.max(0, j0); j <= Math.min(GN - 1, j1); j++)
        if (Math.hypot(cx(i) - p.x, cx(j) - p.z) < R) { if (add) (out as Float32Array)[i * GN + j] += v; else (out as Uint8Array)[i * GN + j] = 1; }
    }
    void cap;
  };
  const structPts: Pt[] = [];
  for (const l of net.lines) for (const st of l.structures) for (let k = 0; k < st.n; k++) structPts.push(l.center[(st.i0 + k) % l.center.length]);
  const stationPts: Pt[] = [];
  for (const e of net.edges) if (e.kind === 'plat' || e.kind === 'depot' || e.kind === 'ramp') for (let i = 0; i < e.pts.length; i += 3) stationPts.push(e.pts[i]);
  near(structPts, 50, 0, blocked, 1, false);
  near(stationPts, 62, 0, blocked, 1, false);
  const railCells = new Uint8Array(GN * GN);
  near(net.guides.filter((_, i) => i % 3 === 0), 22, 0, railCells, 1, false);
  // emplacements de ponts : un tous les ~480 m le long de chaque rivière
  const sites: { x: number; z: number }[] = [];
  for (const r of terrain.rivers) for (let i = 18; i < r.pts.length; i += 26) sites.push(r.pts[i]);
  const siteNear = (x: number, z: number) => sites.some(q => Math.hypot(q.x - x, q.z - z) < 70);
  for (let i = 0; i < GN; i++) for (let j = 0; j < GN; j++) {
    const x = cx(i), z = cx(j), k = i * GN + j;
    H[k] = terrain.height(x, z);
    if (wp.inLake(x, z, 30)) blocked[k] = 1;
    if (Math.abs(x) > GH - 90 || Math.abs(z) > GH - 90) blocked[k] = 1;
    let c = 0;
    if (railCells[k]) c += 40;
    const rd = wp.riverD(x, z);
    if (rd < 26 && !siteNear(x, z)) blocked[k] = 1;          // les rivières ne se franchissent qu'aux emplacements de ponts
    const zr = wp.zoneRatio(x, z);
    if (zr < 1.02) c += 50;
    cost[k] = c;
  }

  const astar = (sx: number, sz: number, gx: number, gz: number, maxSlope: number): [number, number][] | null => {
    const si = Math.floor((sx + GH) / GS), sj = Math.floor((sz + GH) / GS), gi = Math.floor((gx + GH) / GS), gj = Math.floor((gz + GH) / GS);
    const g = new Float32Array(GN * GN).fill(1e9), from = new Int32Array(GN * GN).fill(-1), closed = new Uint8Array(GN * GN);
    const heap = new Heap(), S = si * GN + sj, T = gi * GN + gj;
    g[S] = 0; heap.push(0, S);
    while (heap.size) {
      const [, u] = heap.pop();
      if (closed[u]) continue; closed[u] = 1;
      if (u === T) break;
      const ui = Math.floor(u / GN), uj = u % GN;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const vi = ui + di, vj = uj + dj;
        if (vi < 0 || vj < 0 || vi >= GN || vj >= GN) continue;
        const v = vi * GN + vj;
        if (closed[v] || (blocked[v] && v !== T && v !== S)) continue;
        const dist = GS * (di && dj ? 1.4142 : 1), slope = Math.abs(H[v] - H[u]) / dist;
        if (slope > maxSlope) continue;
        // un virage serré coûte : on pénalise le zigzag par le coût de pente et un léger bruit
        const c = g[u] + dist * (1 + 60 * slope * slope) + cost[v] * (dist / GS);
        if (c < g[v]) { g[v] = c; from[v] = u; heap.push(c + Math.hypot(vi - gi, vj - gj) * GS, v); }
      }
    }
    if (from[T] < 0 && S !== T) return null;
    const path: [number, number][] = [];
    for (let u = T; u >= 0; u = from[u]) { path.push([cx(Math.floor(u / GN)), cx(u % GN)]); if (u === S) break; }
    return path.reverse();
  };

  /** Coût d'un segment droit sur la grille (infini s'il traverse une case interdite ou trop pentue). */
  const segCost = (a: [number, number], b: [number, number], maxSlope: number): number => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 10)), st = L / n;
    let c = 0, prev = -1;
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
      const i = Math.max(0, Math.min(GN - 1, Math.floor((x + GH) / GS))), j = Math.max(0, Math.min(GN - 1, Math.floor((z + GH) / GS))), id = i * GN + j;
      if (blocked[id] && k > 1 && k < n - 1) return Infinity;
      const h = terrain.height(x, z);
      if (k) { const sl = Math.abs(h - prev) / st; if (sl > maxSlope) return Infinity; c += st * (1 + 60 * sl * sl) + (cost[id] * st) / GS; }
      prev = h;
    }
    return c;
  };
  /** Tire le chemin en ligne droite tant que cela ne coûte pas sensiblement plus cher (supprime les marches d'escalier de la grille). */
  const pull = (p: [number, number][], maxSlope: number): [number, number][] => {
    const out: [number, number][] = [p[0]];
    let i = 0;
    while (i < p.length - 1) {
      let j = Math.min(p.length - 1, i + 14);
      for (; j > i + 1; j--) {
        let along = 0; for (let k = i; k < j; k++) along += segCost(p[k], p[k + 1], maxSlope);
        if (segCost(p[i], p[j], maxSlope) <= along * 1.12 + 1) break;
      }
      out.push(p[j]); i = j;
    }
    return out;
  };

  // ---- nœuds « sorties » de chaque ville : ceux du pourtour
  const plansNodes = wp.plans.map((p, pi) => {
    const ids = new Set<number>();
    raw.edges.forEach((e, i) => { if (cityOf[i] === pi && kept.has(e)) { ids.add(e.a); ids.add(e.b); } });
    const all = [...ids];
    const free = (id: number) => !blocked[Math.floor((raw.nodes[id].x + GH) / GS) * GN + Math.floor((raw.nodes[id].z + GH) / GS)];
    const rim = all.filter(id => free(id) && Math.hypot(raw.nodes[id].x - p.zone.x, raw.nodes[id].z - p.zone.z) > p.zone.r * 0.75);
    const ok = all.filter(free);
    return rim.length >= 2 ? rim : ok.length >= 2 ? ok : all;
  });
  const used = new Set<number>();
  const pairBetween = (a: number, b: number) => {
    let best: { i: number; j: number; d: number } | null = null;
    for (const i of plansNodes[a]) { if (used.has(i)) continue; for (const j of plansNodes[b]) {
      if (used.has(j)) continue;
      const d = Math.hypot(raw.nodes[i].x - raw.nodes[j].x, raw.nodes[i].z - raw.nodes[j].z);
      if (!best || d < best.d) best = { i, j, d };
    } }
    return best;
  };
  const P = wp.plans.length, links: { a: number; b: number; d: number }[] = [];
  for (let a = 0; a < P; a++) for (let b = a + 1; b < P; b++) {
    const pb = pairBetween(a, b); if (pb) links.push({ a, b, d: pb.d });
  }
  links.sort((p, q) => p.d - q.d);
  const comp = wp.plans.map((_, i) => i), cf = (x: number): number => (comp[x] === x ? x : (comp[x] = cf(comp[x])));
  const deg = new Array(P).fill(0), done = new Set<string>();
  const connectors: { a: number; b: number; pts: [number, number][] }[] = [];
  const tryLink = (l: { a: number; b: number }) => {
    const pb = pairBetween(l.a, l.b); if (!pb) return false;
    const A = raw.nodes[pb.i], B = raw.nodes[pb.j];
    const path = astar(A.x, A.z, B.x, B.z, 0.14) ?? astar(A.x, A.z, B.x, B.z, 0.25);
    if (!path) { report.push(`liaison ${wp.plans[l.a].zone.name ?? l.a} → ${wp.plans[l.b].zone.name ?? l.b} impossible`); return false; }
    used.add(pb.i); used.add(pb.j);
    let pts: [number, number][] = [[A.x, A.z], ...path.slice(1, -1), [B.x, B.z]];
    pts = pull(pts, 0.25);
    pts = resample(chaikin(pts, 3), 8);
    connectors.push({ a: pb.i, b: pb.j, pts });
    // les routes suivantes évitent de longer celle-ci
    near(pts.map(([x, z]) => ({ x, z })), 50, 0, cost, 35, true);
    deg[l.a]++; deg[l.b]++; done.add(`${l.a}-${l.b}`);
    return true;
  };
  // arbre couvrant d'abord, puis boucles : chaque ville est reliée à ses deux plus proches voisines
  for (const l of links) if (cf(l.a) !== cf(l.b) && tryLink(l)) comp[cf(l.a)] = cf(l.b);
  for (const l of links) if (!done.has(`${l.a}-${l.b}`) && deg[l.a] < 3 && deg[l.b] < 3 && l.d < 2400) tryLink(l);
  report.push(`liaisons : ${connectors.length} routes de campagne`);

  // ---- hauteurs, ponts, passages à niveau
  const rivH = (x: number, z: number) => terrain.riverNear(x, z);
  const nodeY0 = (x: number, z: number, add: number) => terrain.height(x, z) + add;
  // rues à pont-route : altitude de chaque point surélevé
  const deckY = new Map<string, number>();
  for (const pl of wp.plans) for (const st of pl.streets) if (st.deck) {
    const prof = deckProfile(st, (x, z) => terrain.height(x, z));
    st.pts.forEach(([x, z], i) => { if (prof[i] > terrain.height(x, z) + 0.02) deckY.set(x + ',' + z, prof[i]); });
  }
  const nodeY = nodeY0;
  /** segments d'axe de toutes les lignes (boucle et cordes), indexés par cellule de 40 m */
  const axisSegs: { a: Pt; b: Pt }[] = [], cgrid = new Map<number, number[]>();
  for (const l of net.lines) {
    const n = l.center.length;
    for (let i = 0; i < (l.closed ? n : n - 1); i++) {
      const idx = axisSegs.length; axisSegs.push({ a: l.center[i], b: l.center[(i + 1) % n] });
      const k = Math.floor(l.center[i].x / 40) * 100003 + Math.floor(l.center[i].z / 40); const g = cgrid.get(k); if (g) g.push(idx); else cgrid.set(k, [idx]);
    }
  }
  const connPts: Pt[][] = [];
  const crossByConn: { x: number; z: number; ci: number; at: number }[][] = [];
  connectors.forEach((c, ci) => {
    // altitudes : sol + 0,3 ; sous un pont, tablier au-dessus de l'eau
    const ys = c.pts.map(([x, z]) => nodeY(x, z, 0.3));
    // tablier : seulement sur les parcours qui touchent vraiment l'eau (pas le long d'une rive)
    const near = c.pts.map(([x, z]) => rivH(x, z));
    const wet = c.pts.map(() => -1e9);
    for (let i = 0; i < near.length;) {
      if (!near[i] || near[i]!.d >= near[i]!.hw + 24) { i++; continue; }
      let j = i, touch = false;
      while (j < near.length && near[j] && near[j]!.d < near[j]!.hw + 24) { if (near[j]!.d < near[j]!.hw + 2) touch = true; j++; }
      if (touch) for (let k = i; k < j; k++) wet[k] = near[k]!.level + 9.2;     // garde pour les péniches
      i = j;
    }
    let y2 = ys.map((y, i) => Math.max(y, wet[i]));
    if (wet.some(w => w > -1e8)) {
      for (let it = 0; it < 3; it++) y2 = y2.map((_, i) => { let a = 0, n = 0; for (let k = -4; k <= 4; k++) { const j = i + k; if (j >= 0 && j < y2.length) { a += y2[j]; n++; } } return a / n; });
      y2 = y2.map((y, i) => Math.max(y, ys[i]));
      y2[0] = ys[0]; y2[y2.length - 1] = ys[ys.length - 1];
    }
    connPts.push(c.pts.map(([x, z], i) => ({ x, y: y2[i], z })));
    // croisements avec l'axe de la voie
    const list: { x: number; z: number; ci: number; at: number }[] = [];
    let acc = 0;
    for (let k = 1; k < c.pts.length; k++) {
      const [ax, az] = c.pts[k - 1], [bx, bz] = c.pts[k], sl = Math.hypot(bx - ax, bz - az);
      const seen = new Set<number>();
      for (let gx = Math.floor((Math.min(ax, bx) - 5) / 40); gx <= Math.floor((Math.max(ax, bx) + 5) / 40); gx++)
        for (let gz = Math.floor((Math.min(az, bz) - 5) / 40); gz <= Math.floor((Math.max(az, bz) + 5) / 40); gz++)
          for (const i of cgrid.get(gx * 100003 + gz) ?? []) {
            if (seen.has(i)) continue; seen.add(i);
            const p = axisSegs[i].a, q = axisSegs[i].b, r = segInter(ax, az, bx, bz, p.x, p.z, q.x, q.z);
            if (r && !list.some(w => Math.abs(w.at - (acc + r[0] * sl)) < 40)) list.push({ x: ax + (bx - ax) * r[0], z: az + (bz - az) * r[0], ci: i, at: acc + r[0] * sl });
          }
      acc += sl;
    }
    crossByConn.push(list.sort((p, q) => p.at - q.at));
  });

  // ---- rues de ville qui franchissent la voie : on coupe le tronçon au croisement, qui devient un passage à niveau
  const crossRaw = new Map<number, { x: number; z: number; ci: number; rx: number; rz: number }>();
  for (const e of [...kept]) {
    if (e.pts.some(([x, z]) => deckY.has(x + ',' + z))) continue;        // pont-route : il passe au-dessus de la voie
    const cuts: { pos: number; x: number; z: number; ci: number; rx: number; rz: number }[] = [];
    for (let k = 1; k < e.pts.length; k++) {
      const [ax, az] = e.pts[k - 1], [bx, bz] = e.pts[k], sl = Math.hypot(bx - ax, bz - az) || 1, seen = new Set<number>();
      for (let gx = Math.floor((Math.min(ax, bx) - 5) / 40); gx <= Math.floor((Math.max(ax, bx) + 5) / 40); gx++)
        for (let gz = Math.floor((Math.min(az, bz) - 5) / 40); gz <= Math.floor((Math.max(az, bz) + 5) / 40); gz++)
          for (const i of cgrid.get(gx * 100003 + gz) ?? []) {
            if (seen.has(i)) continue; seen.add(i);
            const p = axisSegs[i].a, q = axisSegs[i].b, r = segInter(ax, az, bx, bz, p.x, p.z, q.x, q.z);
            if (r) cuts.push({ pos: k - 1 + r[0], x: ax + (bx - ax) * r[0], z: az + (bz - az) * r[0], ci: i, rx: (bx - ax) / sl, rz: (bz - az) / sl });
          }
    }
    if (!cuts.length) continue;
    cuts.sort((p, q) => p.pos - q.pos);
    kept.delete(e);
    const seq = [{ pos: 0, x: e.pts[0][0], z: e.pts[0][1] }, ...cuts, { pos: e.pts.length - 1, x: e.pts[e.pts.length - 1][0], z: e.pts[e.pts.length - 1][1] }];
    for (let c = 1; c < seq.length; c++) {
      const c0 = seq[c - 1], c1 = seq[c], pts: [number, number][] = [[c0.x, c0.z]];
      for (let v = Math.floor(c0.pos) + 1; v < c1.pos - 1e-9; v++) if (v > c0.pos + 1e-9) pts.push(e.pts[v]);
      pts.push([c1.x, c1.z]);
      const a = raw.node(c0.x, c0.z, 0.5), b = raw.node(c1.x, c1.z, 0.5);
      if (a === b) continue;
      const piece: RawEdge = { a, b, pts, tier: e.tier, hw: e.hw, render: false, oneWay: e.oneWay };
      kept.add(piece); keptNodes.add(a); keptNodes.add(b);
      if (c > 1) crossRaw.set(a, cuts[c - 2]);
    }
  }

  // ---- graphe final
  const nodes: RoadNode[] = [], edges: RoadEdge[] = [], lanes: Lane[] = [], crossings: Crossing[] = [];
  const mk = (x: number, z: number, y: number): RoadNode => {
    const n: RoadNode = { id: nodes.length, x, z, y, edges: [], lanesIn: [], lanesOut: [], crossing: null, lights: null, holders: new Set(), inLane: null, since: 0 };
    nodes.push(n); return n;
  };
  // les tronçons de moins de 9 m (rues qui se croisent presque au même endroit) sont contractés : un véhicule ne doit pas occuper deux carrefours à la fois
  const cl = raw.nodes.map((_, i) => i);
  const cfind = (x: number): number => { while (cl[x] !== x) { cl[x] = cl[cl[x]]; x = cl[x]; } return x; };
  const rawLen = (e: RawEdge) => { let l = 0; for (let i = 1; i < e.pts.length; i++) l += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]); return l; };
  for (const e of kept) if (rawLen(e) < 9 && !crossRaw.has(e.a) && !crossRaw.has(e.b)) cl[cfind(e.a)] = cfind(e.b);
  // impasses : un demi-tour au bout d'une rue sans issue bloque la circulation (la file se remplit des deux côtés) ; on les retire
  const conn = new Set<number>(); for (const c of connectors) { conn.add(cfind(c.a)); conn.add(cfind(c.b)); }
  for (let changed = true; changed;) {
    changed = false;
    const dg = new Map<number, number>();
    for (const e of kept) { const a = cfind(e.a), b = cfind(e.b); if (a === b) continue; dg.set(a, (dg.get(a) ?? 0) + 1); dg.set(b, (dg.get(b) ?? 0) + 1); }
    for (const e of [...kept]) {
      const a = cfind(e.a), b = cfind(e.b);
      if (a === b) { kept.delete(e); continue; }
      if (((dg.get(a) === 1 && !conn.has(a)) || (dg.get(b) === 1 && !conn.has(b)))) { kept.delete(e); changed = true; }
    }
  }
  const cpos = new Map<number, { x: number; z: number; n: number }>();
  keptNodes.clear(); for (const e of kept) { keptNodes.add(e.a); keptNodes.add(e.b); }
  for (const id of keptNodes) { const r = cfind(id), q = cpos.get(r) ?? { x: 0, z: 0, n: 0 }; q.x += raw.nodes[id].x; q.z += raw.nodes[id].z; q.n++; cpos.set(r, q); }
  const nodeMap = new Map<number, RoadNode>();
  const get = (rid: number) => {
    const r = cfind(rid);
    let n = nodeMap.get(r);
    if (!n) { const q = cpos.get(r) ?? { x: raw.nodes[r].x, z: raw.nodes[r].z, n: 1 }, x = q.x / q.n, z = q.z / q.n; n = mk(x, z, deckY.has(x + ',' + z) ? deckY.get(x + ',' + z)! + 0.22 : nodeY(x, z, 0.22)); nodeMap.set(r, n); }
    return n;
  };
  const mkEdge = (a: RoadNode, b: RoadNode, pts: Pt[], tier: 0 | 1 | 2 | 3, hw: number, render: boolean, oneWay = false) => {
    if (a === b || pts.length < 2) return;
    pts = pts.slice(); pts[0] = { x: a.x, y: pts[0].y, z: a.z }; pts[pts.length - 1] = { x: b.x, y: pts[pts.length - 1].y, z: b.z };
    const poly = new Poly(pts);
    if (poly.len < 1) return;
    const e = { id: edges.length, a, b, poly, tier, hw, vmax: VMAX[tier], render, oneWay } as RoadEdge;
    edges.push(e); a.edges.push(e); b.edges.push(e);
  };
  // deux tronçons parallèles entre les mêmes carrefours forment une boucle de deux nœuds où les files peuvent se bloquer : on garde le plus important
  const best = new Map<string, RawEdge>();
  for (const e of kept) {
    const a = cfind(e.a), b = cfind(e.b); if (a === b) continue;
    const k = `${Math.min(a, b)}-${Math.max(a, b)}`, o = best.get(k);
    if (!o || e.tier < o.tier || (e.tier === o.tier && rawLen(e) < rawLen(o))) best.set(k, e);
  }
  for (const e of kept) {
    const a = get(e.a), b = get(e.b);
    if (a === b || best.get(`${Math.min(cfind(e.a), cfind(e.b))}-${Math.max(cfind(e.a), cfind(e.b))}`) !== e) continue;
    mkEdge(a, b, e.pts.map(([x, z]) => ({ x, z, y: deckY.has(x + ',' + z) ? deckY.get(x + ',' + z)! + 0.22 : nodeY(x, z, 0.22) })), e.tier, e.hw, false, e.oneWay);
  }
  connectors.forEach((c, ci) => {
    const pts = connPts[ci], cr = crossByConn[ci];
    let last = get(c.a), lastIdx = 0;
    const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z));
    for (const w of cr) {
      const idx = cum.findIndex(c2 => c2 >= w.at); if (idx <= lastIdx) continue; if (idx >= pts.length - 1) break;
      const p = axisSegs[w.ci].a, q = axisSegs[w.ci].b, l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
      const node = mk(w.x, w.z, p.y + 0.22), tx = (q.x - p.x) / l, tz = (q.z - p.z) / l;
      const seg = [{ x: last.x, y: last.y, z: last.z }, ...pts.slice(lastIdx + 1, idx), { x: w.x, y: node.y, z: w.z }];
      // l'indice « idx » est le premier sommet après le croisement ; on le garde pour le tronçon suivant
      mkEdge(last, node, seg.length > 1 ? seg : [seg[0], seg[0]], 3, HW[3], true);
      const rx = pts[idx].x - w.x, rz = pts[idx].z - w.z, rl = Math.hypot(rx, rz) || 1;
      node.crossing = { id: crossings.length, node, x: w.x, y: node.y, z: w.z, rx: rx / rl, rz: rz / rl, tx, tz, rail: [], closed: false, closedT: 0, bar: 0, hw: HW[3] };
      crossings.push(node.crossing);
      last = node; lastIdx = idx - 1;
    }
    const tail = [{ x: last.x, y: last.y, z: last.z }, ...pts.slice(lastIdx + 1)];
    mkEdge(last, get(c.b), tail, 3, HW[3], true);
  });

  // impasses restantes (créées par la fusion des tronçons parallèles) : un demi-tour au bout d'une rue sans issue bloque la file, on les retire
  for (let changed = true; changed;) {
    changed = false;
    for (const e of edges.slice()) {
      if (e.render || (e.a.edges.length > 1 && e.b.edges.length > 1)) continue;
      edges.splice(edges.indexOf(e), 1); e.a.edges.splice(e.a.edges.indexOf(e), 1); e.b.edges.splice(e.b.edges.indexOf(e), 1); changed = true;
    }
  }
  edges.forEach((e, i) => { e.id = i; });
  for (let i = nodes.length - 1; i >= 0; i--) if (!nodes[i].edges.length) nodes.splice(i, 1);
  nodes.forEach((n, i) => { n.id = i; });

  // passages à niveau des rues de ville
  for (const [id, w] of crossRaw) {
    const node = nodeMap.get(cfind(id)); if (!node || node.crossing || node.edges.length !== 2) continue;
    const p = axisSegs[w.ci].a, q = axisSegs[w.ci].b, l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    node.y = p.y + 0.22;
    node.crossing = { id: crossings.length, node, x: node.x, y: node.y, z: node.z, rx: w.rx, rz: w.rz, tx: (q.x - p.x) / l, tz: (q.z - p.z) / l, rail: [], closed: false, closedT: 0, bar: 0, hw: Math.max(...node.edges.map(e => e.hw)) };
    crossings.push(node.crossing);
  }

  // cantons de voie ferrée de chaque passage (à moins de 8 m)
  for (const cr of crossings) for (const e of net.edges) {
    let best = { d: 1e9, off: 0 };
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((cr.x - a.x) * dx + (cr.z - a.z) * dz) / l2)), d = Math.hypot(cr.x - (a.x + dx * u), cr.z - (a.z + dz * u));
      if (d < best.d) best = { d, off: e.cum[i - 1] + Math.sqrt(l2) * u };
    }
    if (best.d < 8) cr.rail.push({ edgeId: e.id, off: best.off });
  }

  // ---- voies de circulation (à droite) : deux par tronçon, décalées de 1,8 m et ramenées à l'axe aux nœuds
  for (const e of edges) {
    const mkLane = (rev: boolean): Lane => {
      const src = rev ? e.poly.pts.slice().reverse() : e.poly.pts, n = src.length, L = e.poly.len, cum = rev ? e.poly.cum.map(c => L - c).reverse() : e.poly.cum;
      const pts: Pt[] = src.map((p, i) => {
        const a = src[Math.max(0, i - 1)], b = src[Math.min(n - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        const off = LANE_OFF; void cum; void L;   // décalage constant : les virages sont arrondis à l'affichage (traffic.ts, turnCurve)
        return { x: p.x - (dz / l) * off, y: p.y, z: p.z + (dx / l) * off };
      });
      const poly = new Poly(pts);
      const lane = { id: lanes.length, edge: e, from: rev ? e.b : e.a, to: rev ? e.a : e.b, poly, len: poly.len, vmax: e.vmax, veh: [] } as unknown as Lane;
      if (rev && e.oneWay) lane.noEntry = true;
      lanes.push(lane); lane.from.lanesOut.push(lane); lane.to.lanesIn.push(lane);
      return lane;
    };
    e.fwd = mkLane(false); e.back = mkLane(true);
    e.fwd.rev = e.back; e.back.rev = e.fwd;
  }

  // feux aux carrefours importants (4 branches ou plus)
  for (const n of nodes) {
    if (n.edges.length < 4 || n.edges.some(e => e.tier > 1) && n.edges.filter(e => e.tier <= 1).length < 3) continue;
    if (n.edges.some(e => e.poly.len < 42)) continue;      // carrefours trop rapprochés : les feux feraient refluer les files de l'un sur l'autre
    const m = new Map<Lane, number>();
    // deux phases : les voies sont regroupées par direction d'arrivée (modulo π), en coupant le cercle aux deux plus grands écarts
    const ang = n.lanesIn.map(l => { const s = l.poly.at(Math.max(0, l.len - 4)); return (Math.atan2(n.z - s.z, n.x - s.x) % Math.PI + Math.PI) % Math.PI; });
    const order = ang.map((_, i) => i).sort((p, q) => ang[p] - ang[q]), K = order.length;
    const gaps = order.map((i, k) => ({ k, g: (ang[order[(k + 1) % K]] - ang[i] + Math.PI) % Math.PI || Math.PI }));
    const cut = gaps.slice().sort((p, q) => q.g - p.g).slice(0, 2).map(x => x.k).sort((p, q) => p - q);
    order.forEach((li, k) => { const inFirst = cut.length === 2 ? k > cut[0] && k <= cut[1] : k > cut[0]; m.set(n.lanesIn[li], inFirst ? 0 : 1); });
    n.lights = m;
  }

  // ---- distance aux routes de campagne
  const samples: { x: number; z: number }[] = [];
  for (const e of edges) if (e.render) for (let d = 0; d <= e.poly.len; d += 6) { const s = e.poly.at(d); samples.push({ x: s.x, z: s.z }); }
  const dist = samples.length ? nearestDist(samples, 80) : () => 80;
  const totalLen = lanes.reduce((s, l) => s + l.len, 0);

  report.push(`graphe : ${nodes.length} nœuds, ${edges.length} tronçons, ${(totalLen / 2000).toFixed(1)} km de route, ${crossings.length} passages à niveau, ${nodes.filter(n => n.lights).length} carrefours à feux`);
  void kept; void keptNodes; void used;
  return { nodes, edges, lanes, crossings, dist, totalLen, report };
}
