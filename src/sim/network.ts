import type { Train } from './world';
import { rawHeight, riverPath, type RiverDef, type TerrainDef, type UrbanDef } from './terrain';
import { resampleOpen, frames, hermite, cutPoly, segInter, profileOpen, polyLen } from './chord';

export interface CircuitDef {
  id: string; name?: string; track: string;   // 'A' | 'B' ou, pour une ligne libre, `${id}>`;
  type: 'omnibus' | 'rapide' | 'fret';
  fleet: number;    // rames dans le parc du circuit
  service: number;  // rames en service au départ
  cars: number;     // caisses par rame
  stops?: Record<string, boolean>; // arrêt (true) ou non (false) par gare ; défaut : true
  /** cordes empruntées à leur bifurcation (identifiants de `chords`) ; sans elle, le circuit reste sur la boucle */
  via?: string[];
}
/**
 * Corde : ligne à double voie entre deux points de la boucle (`from` et `to`, fractions dans le sens de la voie A). Elle part vers l'intérieur
 * (côté gauche de la voie A) : la voie C+ quitte A et la rejoint sans croisement ; la voie D- (sens inverse) quitte B et la rejoint en
 * traversant A à plat (traversée verrouillée par l'enclenchement). `via` : points de passage entre les deux bouts ; `stations` : gares sur la corde.
 */
export interface ChordDef { id: string; name?: string; from: number; to: number; via: number[][]; stations?: { name: string; at: number }[] }
/** Antenne à voie unique, branchée sur la boucle par un « Y » (deux aiguillages), avec évitements (gares à deux voies) et terminus à rebroussement. */
export interface BranchDef {
  id: string; name?: string;
  from?: number;                      // point de la boucle (0-1) où se branche l'antenne ; absent = ligne libre (navette) sans lien avec la boucle
  origin?: string;                    // ligne libre : nom du terminus de départ (le tracé `via` va alors de ce terminus à `terminus`)
  side?: 'A' | 'B';                   // voie de la boucle qui la dessert : A (intérieur) ou B (extérieur)
  stem?: number;                      // distance (m) entre la boucle et le début de la voie unique
  via: number[][];                    // tracé après le début de la voie unique ; le premier point doit être dans la direction de départ
  loops?: { name: string; at: number }[];   // gares à évitement (position 0-1 le long de l'antenne)
  terminus: string;                   // gare terminus (le train y fait demi-tour)
}
export interface DepotDef { name: string; at: number; tracks: number; on?: ('A' | 'B')[] }
export interface LayoutDef {
  /** graine du monde (monde généré) ; sert aussi à dériver la végétation et le trafic */
  seed?: number;
  centerline: number[][];
  trackSpacing: number;
  platformOffset: number;
  blockLength: number;
  stations: { name: string; at: number }[];
  depots?: DepotDef[];
  circuits: CircuitDef[];
  terrain?: TerrainDef;
  urban?: UrbanDef[];
  rivers?: RiverDef[];
  chords?: ChordDef[];
  branches?: BranchDef[];
}
export type Kind = 'block' | 'main' | 'plat' | 'depot' | 'ramp';
export type Via = '' | 'main' | 'plat' | 'depot';
export interface P2 { x: number; y: number; z: number }
/** Point de voie servant au terrassement ; tf/bf = 1 si la voie est en tunnel / sur un pont à cet endroit. */
export interface Guide extends P2 { tf?: number; bf?: number }
/** Tunnel ou pont : `n` échantillons de l'axe (`net.center`, sens A) à partir de l'indice `i0` (cyclique). */
export interface Structure { kind: 'tunnel' | 'bridge'; i0: number; n: number; len: number }
export interface Sample { x: number; y: number; z: number; tx: number; tz: number }

const A_LAT = 1.0; // accélération latérale max tolérée (m/s²)

export class Node {
  readonly outs: Edge[] = [];  // outs[0] = voie directe ; >1 sortie = aiguillage
  readonly ins: Edge[] = [];
  constructor(readonly id: string, readonly x: number, readonly z: number) {}
}

/** Une arête = un canton orienté (un sens de circulation) avec sa géométrie. */
export class Edge {
  readonly cum: number[] = [0];
  readonly len: number;
  readonly vmax: number;
  from!: Node;
  to!: Node;
  stopOffset = 0;   // quai / voie de garage : abscisse d'arrêt de la tête du train
  station = '';
  depot = '';
  via: Via = '';                 // route à laquelle appartient une rampe d'entrée/sortie
  diverge = '';                  // identifiant de la corde que cette sortie d'aiguillage dessert (les circuits qui la prennent y entrent)
  lock: Edge[] = [];             // rampes exclusives : on n'y entre pas si l'une d'elles est occupée ou réservée
  twin: Edge | null = null;      // voie unique : le canton de même géométrie parcouru en sens inverse
  mirror = false;                // doublon (sens inverse) d'un canton de voie unique : non dessiné
  turn = false;                  // terminus : la rame s'y arrête puis repart en sens inverse sur `twin`
  ref: Edge | null = null;       // voie voisine plus proche de l'axe (pour ne pas superposer les traverses)
  occupants = new Set<Train>();
  reservedBy: Train | null = null;

  constructor(readonly id: string, readonly pts: P2[], readonly kind: Kind, readonly track: string, cap: number) {
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    this.len = this.cum[this.cum.length - 1];
    let kmax = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const ang = Math.abs(Math.atan2((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)));
      kmax = Math.max(kmax, ang / ((this.cum[i + 1] - this.cum[i - 1]) / 2));
    }
    this.vmax = Math.min(cap, Math.sqrt(A_LAT / Math.max(kmax, 1e-6)));
  }

  at(d: number): Sample {
    d = Math.max(0, Math.min(this.len, d));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= d) lo = m; else hi = m; }
    const a = this.pts[lo], b = this.pts[lo + 1], seg = this.cum[lo + 1] - this.cum[lo] || 1;
    const u = (d - this.cum[lo]) / seg;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, tx: (b.x - a.x) / seg, tz: (b.z - a.z) / seg };
  }

  /** Pente (m/m, > 0 en montée) autour de l'abscisse d. */
  grade(d: number): number {
    const a = this.at(d - 6), b = this.at(d + 6), h = Math.hypot(b.x - a.x, b.z - a.z);
    return h > 1 ? (b.y - a.y) / h : 0;
  }
}

export interface DepotInfo { name: string; track: string; edges: Edge[] }

/** Une ligne d'axe échantillonné : la boucle (fermée) ou une corde (ouverte). */
export interface Line { id: string; closed: boolean; center: Guide[]; step: number; structures: Structure[] }

export class Network {
  lines: Line[] = [];
  nodes = new Map<string, Node>();
  edges: Edge[] = [];
  ring: Record<string, Edge[]> = { A: [], B: [] }; // voie directe de chaque sens, dans l'ordre (aussi 'C+' / 'D-' pour une corde)
  stations: string[] = [];
  depots: DepotInfo[] = [];
  starts: Record<string, Edge[]> = {};            // lignes libres (sans dépôt) : un canton de départ par section de voie unique
  center: Guide[] = [];                            // axe de la ligne avec altitude
  guides: Guide[] = [];                               // points de toutes les voies (terrassement, exclusions)
  raw: (x: number, z: number) => number = () => 0; // relief naturel
  maxGrade = 0;
  step = 5;                                        // pas d'échantillonnage de l'axe (m)
  rivers: RiverDef[] = [];
  riverPaths: { x: number; z: number }[][] = [];
  /** points de la boucle où ni pont ni tunnel ne sont permis (gares, dépôts, bifurcations) : les rivières ne doivent pas y croiser la voie */
  ringBlocked: boolean[] = [];
  structures: Structure[] = [];

  private node(id: string, p: P2): Node {
    let n = this.nodes.get(id);
    if (!n) { n = new Node(id, p.x, p.z); this.nodes.set(id, n); }
    return n;
  }
  add(e: Edge, from: string, to: string): void {
    e.from = this.node(from, e.pts[0]);
    e.to = this.node(to, e.pts[e.pts.length - 1]);
    e.from.outs.push(e); e.to.ins.push(e); this.edges.push(e);
  }
}

const sm = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

function resample(ctrl: number[][], step: number) {
  const n = ctrl.length, per = 40, dense: P2[] = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map(o => ctrl[(i + o + n) % n]);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (c: number) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
      dense.push({ x: f(0), y: 0, z: f(1) });
    }
  }
  dense.push(dense[0]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
  const total = cum[cum.length - 1], N = Math.round(total / step), pts: P2[] = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (i * total) / N;
    while (cum[j + 1] < s) j++;
    const u = (s - cum[j]) / (cum[j + 1] - cum[j]);
    pts.push({ x: dense[j].x + (dense[j + 1].x - dense[j].x) * u, y: 0, z: dense[j].z + (dense[j + 1].z - dense[j].z) * u });
  }
  return { pts, step: total / N };
}

function limit(Y: number[], anch: boolean[], lim: number) {
  const N = Y.length;
  for (let it = 0; it < 8; it++) {
    for (let i = 1; i <= 2 * N; i++) { const j = i % N, p = (j - 1 + N) % N; if (!anch[j]) Y[j] = Math.max(Y[p] - lim, Math.min(Y[p] + lim, Y[j])); }
    for (let i = 2 * N - 1; i >= 0; i--) { const j = i % N, n = (j + 1) % N; if (!anch[j]) Y[j] = Math.max(Y[n] - lim, Math.min(Y[n] + lim, Y[j])); }
  }
}


/** Segments cycliques d'indices « actifs » : une zone est retenue si elle contient un échantillon « cœur » ; les trous courts sont comblés. */
function findRuns(core: boolean[], ext: boolean[], blocked: boolean[], mergeGap: number, minLen: number): { i0: number; n: number }[] {
  const N = core.length;
  const e = ext.map((v, i) => (v || core[i]) && !blocked[i]);
  const on = new Array<boolean>(N).fill(false);
  const s = e.findIndex(v => !v);
  if (s < 0) return [];
  for (let k = 0; k < N;) {
    if (!e[(s + k) % N]) { k++; continue; }
    let j = k, has = false;
    while (j < N && e[(s + j) % N]) { if (core[(s + j) % N] && !blocked[(s + j) % N]) has = true; j++; }
    if (has) for (let q = k; q < j; q++) on[(s + q) % N] = true;
    k = j;
  }
  const t = on.findIndex(v => !v);
  if (t < 0) return [];
  for (let q = 0; q < N;) {
    if (on[(t + q) % N]) { q++; continue; }
    let j = q, bl = false;
    while (j < N && !on[(t + j) % N]) { if (blocked[(t + j) % N]) bl = true; j++; }
    if (q > 0 && j < N && j - q < mergeGap && !bl) for (let m = q; m < j; m++) on[(t + m) % N] = true;
    q = j;
  }
  const runs: { i0: number; n: number }[] = [];
  for (let q = 0; q < N;) {
    if (!on[(t + q) % N]) { q++; continue; }
    let j = q; while (j < N && on[(t + j) % N]) j++;
    if (j - q >= minLen) runs.push({ i0: (t + q) % N, n: j - q });
    q = j;
  }
  return runs;
}

/** Profil en long : relief lissé (±250 m), pente limitée, gares plates. */
function profile(C: P2[], raw: (x: number, z: number) => number, step: number, ics: number[], maxGrade: number, half: number, smooth: number): number[] {
  const N = C.length, w = Math.round(smooth / step);
  let Y = C.map(p => raw(p.x, p.z));
  for (let pass = 0; pass < 2; pass++) {
    const s = Y;
    Y = s.map((_, i) => { let a = 0; for (let k = -w; k <= w; k++) a += s[(i + k + N) % N]; return a / (2 * w + 1); });
  }
  const lim = maxGrade * step;
  limit(Y, new Array<boolean>(N).fill(false), lim);
  const anch = new Array<boolean>(N).fill(false);
  // altitudes des zones plates, rapprochées si deux zones voisines sont trop éloignées pour la pente max
  const order = ics.map((ic, i) => ({ ic, i })).sort((p, q) => p.ic - q.ic);
  const lv = ics.map(ic => Y[ic]);
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    order.forEach((cur, n) => {
      const nx = order[(n + 1) % order.length];
      const gap = ((nx.ic - cur.ic) + N) % N - 2 * half;
      const allow = Math.max(gap, 1) * lim * 0.8, diff = lv[nx.i] - lv[cur.i];
      if (Math.abs(diff) > allow) {
        const fix = (Math.abs(diff) - allow) / 2 * Math.sign(diff);
        lv[cur.i] += fix; lv[nx.i] -= fix; moved = true;
      }
    });
    if (!moved) break;
  }
  ics.forEach((ic, i) => {
    for (let k = -half; k <= half; k++) { const j = (((ic + k) % N) + N) % N; Y[j] = lv[i]; anch[j] = true; }
  });
  limit(Y, anch, lim);
  return Y;
}

/** Tunnels et ponts d'une ligne : un tunnel là où le terrain monte nettement au-dessus de la voie, un pont là où il s'écarte ou près d'une rivière. */
function detect(C: P2[], Y: number[], closed: boolean, blocked: boolean[], raw: (x: number, z: number) => number, riverPaths: { x: number; z: number }[][]) {
  const N = C.length, ix = (i: number) => (closed ? ((i % N) + N) % N : Math.max(0, Math.min(N - 1, i)));
  const lats = [-9, -4.5, 0, 4.5, 9];
  const tdiff = new Array<number>(N), bdiff = new Array<number>(N), rd = new Array<number>(N).fill(Infinity);
  for (let i = 0; i < N; i++) {
    const a = C[ix(i - 1)], b = C[ix(i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
    const d = lats.map(o => raw(C[i].x + nx * o, C[i].z + nz * o) - Y[i]);
    tdiff[i] = Math.min(...d); bdiff[i] = Math.max(...d);
    for (const path of riverPaths) for (const q of path) rd[i] = Math.min(rd[i], Math.hypot(q.x - C[i].x, q.z - C[i].z));
  }
  const tun = findRuns(tdiff.map(v => v > 12), tdiff.map(v => v > 7), blocked, 20, 20);
  const inTun = new Array<boolean>(N).fill(false);
  for (const r of tun) for (let k = 0; k < r.n; k++) inTun[(r.i0 + k) % N] = true;
  const brg = findRuns(bdiff.map((v, i) => v < -6 || rd[i] < 45), bdiff.map(v => v < -3), blocked.map((b, i) => b || inTun[i]), 14, 10);
  const tf = new Array<number>(N).fill(0), bf = new Array<number>(N).fill(0);
  for (const r of tun) for (let k = 0; k < r.n; k++) tf[(r.i0 + k) % N] = 1;
  for (const r of brg) for (let k = 0; k < r.n; k++) bf[(r.i0 + k) % N] = 1;
  return { tun, brg, tf, bf };
}

interface Cut { i: number; id: string }
/** Géométrie d'une corde : axe, profil, raccordements à la boucle (Hermite), traversées de la voie A, coupures à faire dans la boucle. */
interface ChordGeo {
  def: ChordDef; K: P2[]; step: number; M: number; jS: number; jE: number;
  zones: { k: number; ic: number }[];
  conn: { c1: P2[]; c2: P2[]; c3: P2[]; c4: P2[] };
  cross: { c2: [number, number]; c4: [number, number] };     // abscisses de la traversée (début, fin) le long de c2 et c4
  cutsA: Cut[]; cutsB: Cut[];                                  // indices dans l'axe de la boucle (sens A)
  structures: Structure[];
}

/** Géométrie d'une antenne : axe, profil, bras du Y (Hermite) vers la boucle, coupures de la boucle, gares à évitement. */
interface BranchGeo {
  def: BranchDef; side: 'A' | 'B'; free: boolean; s0: number; K: P2[]; step: number; M: number;
  c1: P2[]; c3: P2[];                      // bras sortant de la boucle / bras rejoignant la boucle
  cutsA: Cut[]; cutsB: Cut[];
  loops: { k: number; ic: number }[]; t0: number;     // centres des évitements ; début du canton terminus
}
const BR_RAMP = 44;     // échantillons : longueur d'un bras du Y le long de la boucle
const BR_TERM = 44;     // échantillons : longueur du canton terminus

/**
 * Construit une double voie en anneau : voie A (sens des points) et voie B (sens inverse),
 * circulation à gauche. Chaque zone (gare ou dépôt) = un aiguillage d'entrée, une voie directe,
 * des voies annexes (quai, ou voies de garage), un aiguillage de sortie. Le reste est découpé en cantons.
 * Un dépôt est « traversant » : on entre par un bout, on ressort par l'autre.
 * Les cordes (`def.chords`) se raccordent à la boucle par des aiguillages et des traversées à plat verrouillées.
 */
export function buildNetwork(def: LayoutDef): Network {
  const net = new Network();
  net.stations = def.stations.map(s => s.name);
  const { pts: C, step } = resample(def.centerline, 5);
  const N = C.length, half = def.trackSpacing / 2;
  const R = 16, SPAN = 72; // échantillons : longueur de rampe, longueur totale d'une zone
  const depots = def.depots ?? [];
  const zones = [
    ...def.stations.map((s, k) => ({ kind: 'station' as const, k, ic: Math.round(s.at * N) % N })),
    ...depots.map((d, k) => ({ kind: 'depot' as const, k, ic: Math.round(d.at * N) % N })),
  ];
  const T = def.terrain ?? { seed: 1, amplitude: 0, scale: 600, maxGrade: 0.02 };
  net.raw = rawHeight(T);
  const Y = profile(C, net.raw, step, zones.map(z => z.ic), T.maxGrade, SPAN / 2, T.smooth ?? 250);
  net.center = C.map((p, i) => ({ x: p.x, y: Y[i], z: p.z }));
  for (let i = 0; i < N; i++) net.maxGrade = Math.max(net.maxGrade, Math.abs(Y[(i + 1) % N] - Y[i]) / step);
  net.step = step;
  net.rivers = def.rivers ?? [];
  net.riverPaths = net.rivers.map(r => riverPath(r.points));
  const chords = def.chords ?? [];
  const wrap = (i: number) => ((i % N) + N) % N;

  // ----- Rivières, tunnels et ponts de la boucle -----
  {
    const blocked = new Array<boolean>(N).fill(false);
    for (const z of zones) {                       // ni tunnel ni pont dans une zone, ni dans la ville qui l'entoure
      const name = z.kind === 'station' ? def.stations[z.k].name : depots[z.k].name;
      const u = (def.urban ?? []).find(q => (z.kind === 'station' ? q.station : q.depot) === name);
      const reach = Math.max(SPAN / 2 + 14, Math.ceil(((u?.radius ?? 0) * 1.3) / step));
      for (let k = -reach; k <= reach; k++) blocked[wrap(z.ic + k)] = true;
    }
    for (const c of chords) for (const f of [c.from, c.to]) for (let k = -45; k <= 45; k++) blocked[wrap(Math.round(f * N) + k)] = true;   // bifurcations
    for (const b of def.branches ?? []) if (b.from !== undefined) for (let k = -BR_RAMP - 20; k <= BR_RAMP + 20; k++) blocked[wrap(Math.round(b.from * N) + k)] = true;
    net.ringBlocked = blocked;
    const { tun, brg, tf, bf } = detect(C, Y, true, blocked, net.raw, net.riverPaths);
    for (const r of tun) net.structures.push({ kind: 'tunnel', i0: r.i0, n: r.n, len: r.n * step });
    for (const r of brg) net.structures.push({ kind: 'bridge', i0: r.i0, n: r.n, len: r.n * step });
    net.structures.sort((p, q) => p.i0 - q.i0);
    net.center.forEach((p, i) => { p.tf = tf[i]; p.bf = bf[i]; });
  }
  net.lines.push({ id: 'ring', closed: true, center: net.center, step, structures: net.structures });

  // ----- Géométrie des cordes -----
  const nlC = C.map((_, i) => { const a = C[wrap(i - 1)], b = C[wrap(i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: -dz / l, z: dx / l }; });
  const tC = nlC.map(n => ({ x: n.z, z: -n.x }));       // tangente avant (rotation inverse de la normale)
  const geos: ChordGeo[] = chords.map(cd => {
    const i1 = wrap(Math.round(cd.from * N)), i2 = wrap(Math.round(cd.to * N));
    const ctrl = [[C[i1].x, C[i1].z], ...cd.via, [C[i2].x, C[i2].z]];
    const { pts: K, step: ks } = resampleOpen(ctrl, 5), M = K.length, jS = 10, jE = M - 1 - 10;
    if (jE - jS < 3 * SPAN) throw new Error(`Corde ${cd.id} trop courte`);
    const zs = (cd.stations ?? []).map((s, k) => ({ k, ic: Math.round(s.at * (M - 1)) }));
    for (const z of zs) if (z.ic - SPAN / 2 < jS + 30 || z.ic + SPAN / 2 > jE - 30) throw new Error(`Gare de la corde ${cd.id} trop près d'une bifurcation`);
    const Yk = profileOpen(K, net.raw, ks, zs.map(z => z.ic), [Y[i1], Y[i2]], T.maxGrade, SPAN / 2, T.smooth ?? 250);
    K.forEach((p, i) => { p.y = Yk[i]; });
    for (let i = 0; i < M - 1; i++) net.maxGrade = Math.max(net.maxGrade, Math.abs(Yk[i + 1] - Yk[i]) / ks);
    // tunnels et ponts de la corde (jamais près des bifurcations ni des gares)
    const blocked = new Array<boolean>(M).fill(false);
    for (let i = 0; i < M; i++) if (i < jS + 25 || i > jE - 25) blocked[i] = true;
    for (const z of zs) { const u = (def.urban ?? []).find(q => q.station === cd.stations![z.k].name); const reach = Math.max(SPAN / 2 + 14, Math.ceil(((u?.radius ?? 0) * 1.3) / ks)); for (let k = -reach; k <= reach; k++) if (z.ic + k >= 0 && z.ic + k < M) blocked[z.ic + k] = true; }
    const d = detect(K, Yk, false, blocked, net.raw, net.riverPaths);
    const structures: Structure[] = [];
    for (const r of d.tun) structures.push({ kind: 'tunnel', i0: r.i0, n: r.n, len: r.n * ks });
    for (const r of d.brg) structures.push({ kind: 'bridge', i0: r.i0, n: r.n, len: r.n * ks });
    structures.sort((p, q) => p.i0 - q.i0);
    const center: Guide[] = K.map((p, i) => ({ x: p.x, y: p.y, z: p.z, tf: d.tf[i], bf: d.bf[i] }));
    net.lines.push({ id: cd.id, closed: false, center, step: ks, structures });

    // raccordements : c1 A→C+ (début), c2 D-→B (début), c3 C+→A (fin), c4 B→D- (fin)
    const fK = frames(K), Kr = [...K].reverse(), Ykr = [...Yk].reverse();
    void Kr; void Ykr;
    const A = (i: number) => ({ x: C[wrap(i)].x + nlC[wrap(i)].x * half, z: C[wrap(i)].z + nlC[wrap(i)].z * half });
    const B = (i: number) => ({ x: C[wrap(i)].x - nlC[wrap(i)].x * half, z: C[wrap(i)].z - nlC[wrap(i)].z * half });
    const Cp = (j: number) => ({ x: K[j].x + fK[j].n.x * half, z: K[j].z + fK[j].n.z * half });
    const Dm = (j: number) => ({ x: K[j].x - fK[j].n.x * half, z: K[j].z - fK[j].n.z * half });
    const neg = (v: { x: number; z: number }) => ({ x: -v.x, z: -v.z });
    const iA1 = wrap(i1 - 12), iB1 = wrap(i1 - 14), iA2 = wrap(i2 + 12), iB2 = wrap(i2 + 12);
    const c1 = hermite(A(iA1), tC[iA1], Cp(jS), fK[jS].t, Y[iA1], Yk[jS]);
    const c2 = hermite(Dm(jS), neg(fK[jS].t), B(iB1), neg(tC[iB1]), Yk[jS], Y[iB1]);
    const c3 = hermite(Cp(jE), fK[jE].t, A(iA2), tC[iA2], Yk[jE], Y[iA2]);
    const c4 = hermite(B(iB2), neg(tC[iB2]), Dm(jE), neg(fK[jE].t), Y[iB2], Yk[jE]);
    // traversée de la voie A par c2 (début de corde) et c4 (fin) : on cherche l'intersection avec l'axe de la voie A
    const crossing = (conn: P2[], iCenter: number): { ring: number; s: number } => {
      let acc = 0;
      for (let k = 1; k < conn.length; k++) {
        const sl = Math.hypot(conn[k].x - conn[k - 1].x, conn[k].z - conn[k - 1].z);
        for (let i = iCenter - 30; i < iCenter + 30; i++) {
          const r = segInter(conn[k - 1], conn[k], A(i), A(i + 1));
          if (r) return { ring: wrap(i) + r[1], s: acc + r[0] * sl };
        }
        acc += sl;
      }
      throw new Error(`Corde ${cd.id} : la liaison ne croise pas la voie A (angle de bifurcation ?)`);
    };
    const x1 = crossing(c2, i1), x2 = crossing(c4, i2);
    const L2 = polyLen(c2), L4 = polyLen(c4);
    const win = (s: number, L: number): [number, number] => [Math.max(10, s - 16), Math.min(L - 10, s + 16)];
    const cutsA: Cut[] = [
      { i: iA1, id: `${cd.id}.dv1` }, { i: iA2, id: `${cd.id}.mg2` },
      { i: Math.floor(x1.ring) - 3, id: `${cd.id}.x1a` }, { i: Math.ceil(x1.ring) + 3, id: `${cd.id}.x1b` },
      { i: Math.floor(x2.ring) - 3, id: `${cd.id}.x2a` }, { i: Math.ceil(x2.ring) + 3, id: `${cd.id}.x2b` },
    ];
    const cutsB: Cut[] = [{ i: iB1, id: `${cd.id}.mg1` }, { i: iB2, id: `${cd.id}.dv2` }];
    return { def: cd, K, step: ks, M, jS, jE, zones: zs, conn: { c1, c2, c3, c4 }, cross: { c2: win(x1.s, L2), c4: win(x2.s, L4) }, cutsA, cutsB, structures };
  });

  // ----- Géométrie des antennes (voie unique) -----
  const bgeos: BranchGeo[] = (def.branches ?? []).map(bd => {
    const free = bd.origin !== undefined, side = bd.side ?? 'A', sg = side === 'A' ? 1 : -1;
    const i1 = wrap(Math.round((bd.from ?? 0) * N)), iUp = wrap(i1 - sg * BR_RAMP), iDn = wrap(i1 + sg * BR_RAMP);
    const Tt = (i: number) => side === 'A' ? tC[wrap(i)] : { x: -tC[wrap(i)].x, z: -tC[wrap(i)].z };
    const Nn = (i: number) => side === 'A' ? nlC[wrap(i)] : { x: -nlC[wrap(i)].x, z: -nlC[wrap(i)].z };
    const Rp = (i: number) => ({ x: C[wrap(i)].x + Nn(i).x * half, z: C[wrap(i)].z + Nn(i).z * half });
    const stem = bd.stem ?? 210, r1 = Rp(i1);
    const { pts: K, step: ks } = resampleOpen(free ? bd.via : [[r1.x + Nn(i1).x * stem, r1.z + Nn(i1).z * stem], ...bd.via], 5), M = K.length;
    const s0 = free ? BR_TERM : 0;      // fin du terminus de départ (ligne libre)
    const loops = (bd.loops ?? []).map((l, k) => ({ k, ic: Math.round(l.at * (M - 1)) })).sort((a, b) => a.ic - b.ic);
    const t0 = M - 1 - BR_TERM;
    let prev = free ? s0 : 40;
    for (const l of loops) { if (l.ic - SPAN / 2 < prev + 20) throw new Error(`Antenne ${bd.id} : évitement ${bd.loops![l.k].name} trop près du début ou d'un autre évitement`); prev = l.ic + SPAN / 2; }
    if (t0 - 20 < prev) throw new Error(`Antenne ${bd.id} trop courte`);
    const ends = loops.map(l => l.ic); ends.push(t0 + 22); if (free) ends.push(s0 - 22);
    const Ys = free ? 0 : (Y[iUp] + Y[iDn]) / 2;
    const Yk = profileOpen(K, net.raw, ks, ends, [free ? null : Ys, null], T.maxGrade, SPAN / 2, T.smooth ?? 250);
    K.forEach((p, i) => { p.y = Yk[i]; });
    for (let i = 0; i < M - 1; i++) net.maxGrade = Math.max(net.maxGrade, Math.abs(Yk[i + 1] - Yk[i]) / ks);
    const blocked = new Array<boolean>(M).fill(false);
    for (let i = 0; i < M; i++) if (i < (free ? s0 + 20 : 36) || i > t0 - 20) blocked[i] = true;
    for (const l of loops) { const u = (def.urban ?? []).find(q => q.station === bd.loops![l.k].name); const reach = Math.max(SPAN / 2 + 14, Math.ceil(((u?.radius ?? 0) * 1.3) / ks)); for (let k = -reach; k <= reach; k++) if (l.ic + k >= 0 && l.ic + k < M) blocked[l.ic + k] = true; }
    if (free) { const u = (def.urban ?? []).find(q => q.station === bd.origin); const reach = Math.ceil(((u?.radius ?? 0) * 1.3) / ks); for (let k = 0; k <= reach; k++) if (k < M) blocked[k] = true; }
    { const u = (def.urban ?? []).find(q => q.station === bd.terminus); const reach = Math.ceil(((u?.radius ?? 0) * 1.3) / ks); for (let k = -reach; k <= 0; k++) if (M - 1 + k >= 0) blocked[M - 1 + k] = true; }
    const d = detect(K, Yk, false, blocked, net.raw, net.riverPaths);
    const structures: Structure[] = [];
    for (const r of d.tun) structures.push({ kind: 'tunnel', i0: r.i0, n: r.n, len: r.n * ks });
    for (const r of d.brg) structures.push({ kind: 'bridge', i0: r.i0, n: r.n, len: r.n * ks });
    structures.sort((p, q) => p.i0 - q.i0);
    net.lines.push({ id: bd.id, closed: false, center: K.map((p, i) => ({ x: p.x, y: p.y, z: p.z, tf: d.tf[i], bf: d.bf[i] })), step: ks, structures });
    const fK = frames(K), neg = (v: { x: number; z: number }) => ({ x: -v.x, z: -v.z });
    const c1 = free ? [] : hermite(Rp(iUp), Tt(iUp), K[0], fK[0].t, Y[iUp], Ys);
    const c3 = free ? [] : hermite(K[0], neg(fK[0].t), Rp(iDn), Tt(iDn), Ys, Y[iDn]);
    const cuts: Cut[] = free ? [] : [{ i: iUp, id: `${bd.id}.dv` }, { i: iDn, id: `${bd.id}.mg` }];
    return { def: bd, side, free, s0, K, step: ks, M, c1, c3, cutsA: side === 'A' ? cuts : [], cutsB: side === 'B' ? cuts : [], loops, t0 };
  });

  // ----- La boucle : voies A et B, zones, cantons (découpés aux bifurcations) -----
  for (const [name, Q, Yq] of [['A', C, Y], ['B', [...C].reverse(), [...Y].reverse()]] as [string, P2[], number[]][]) {
    const nl = Q.map((_, i) => {
      const a = Q[(i - 1 + N) % N], b = Q[(i + 1) % N], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
      return { x: -dz / l, z: dx / l }; // normale à gauche
    });
    const slice = (i0: number, i1: number, lat: (k: number) => number): P2[] => {
      const r: P2[] = [];
      for (let i = i0; i <= i1; i++) {
        const j = ((i % N) + N) % N, o = half + lat(i - i0);
        r.push({ x: Q[j].x + nl[j].x * o, y: Yq[j], z: Q[j].z + nl[j].z * o });
      }
      return r;
    };
    const zs = zones
      .filter(z => z.kind === 'station' || (depots[z.k].on ?? ['A', 'B']).includes(name as 'A' | 'B'))
      .map(z => ({ ...z, ic: name === 'A' ? z.ic : N - 1 - z.ic }))
      .sort((a, b) => a.ic - b.ic);
    zs.forEach((z, n) => {
      const nx = zs[(n + 1) % zs.length], dist = ((nx.ic - z.ic) + N) % N;
      if (zs.length > 1 && dist < SPAN + 10) throw new Error('Deux zones (gares/dépôts) sont trop proches sur la ligne');
    });
    // coupures de cette voie (indices dans le repère de la voie)
    const cuts: Cut[] = [...geos, ...bgeos].flatMap(g => (name === 'A' ? g.cutsA : g.cutsB).map(c => ({ id: c.id, i: name === 'A' ? c.i : N - 1 - wrap(c.i) })));

    zs.forEach((z, n) => {
      const D = z.ic - SPAN / 2, M = z.ic + SPAN / 2;
      zoneEdges(net, def, depots, name, slice, z, n, D, M, SPAN, R, step, `${name}D${n}`, `${name}M${n}`, 'main');
      const nextD = n + 1 < zs.length ? zs[n + 1].ic - SPAN / 2 : zs[0].ic - SPAN / 2 + N;
      const count = Math.max(1, Math.floor(((nextD - M) * step) / def.blockLength));
      // bornes : subdivisions régulières + coupures (une subdivision à moins de 10 échantillons d'une coupure est supprimée)
      const myCuts = cuts.map(c => { let i = c.i; while (i <= M) i += N; while (i > M + N) i -= N; return { id: c.id, i }; }).filter(c => c.i > M && c.i < nextD).sort((a, b) => a.i - b.i);
      const bounds: { i: number; id: string }[] = [];
      for (let j = 1; j < count; j++) { const i = M + Math.round(((nextD - M) * j) / count); if (!myCuts.some(c => Math.abs(c.i - i) < 10)) bounds.push({ i, id: `${name}G${n}_${j}` }); }
      for (const c of myCuts) bounds.push({ i: c.i, id: `${name}@${c.id}` });
      bounds.sort((a, b) => a.i - b.i);
      bounds.push({ i: nextD, id: `${name}D${(n + 1) % zs.length}` });
      let prevId = `${name}M${n}`, prevI = M;
      bounds.forEach((b, j) => {
        const e = new Edge(`${name}-b${n}_${j + 1}`, slice(prevI, b.i, () => 0), 'block', name, 40);
        net.add(e, prevId, b.id); net.ring[name].push(e);
        prevId = b.id; prevI = b.i;
      });
    });
  }

  // ----- Les cordes : voies C+ et D-, gares, raccordements, traversées -----
  geos.forEach(g => {
    const id = g.def.id, cp = `${id}+`, dm = `${id}-`, K = g.K, M = g.M;
    for (const c of [...g.cutsA.map(x => `A@${x.id}`), ...g.cutsB.map(x => `B@${x.id}`)]) if (!net.nodes.has(c)) throw new Error(`Corde ${id} : la bifurcation ${c} tombe dans une zone de gare ou de dépôt`);
    net.ring[cp] = []; net.ring[dm] = [];
    const zsF = g.zones.map(z => ({ kind: 'station' as const, k: z.k, ic: z.ic }));
    const fK = frames(K);
    for (const [name, rev] of [[cp, false], [dm, true]] as [string, boolean][]) {
      const Q = rev ? [...K].reverse() : K, fr = rev ? frames(Q) : fK;
      const slice = (i0: number, i1: number, lat: (k: number) => number): P2[] => {
        const r: P2[] = [];
        for (let i = i0; i <= i1; i++) { const o = half + lat(i - i0); r.push({ x: Q[i].x + fr[i].n.x * o, y: Q[i].y, z: Q[i].z + fr[i].n.z * o }); }
        return r;
      };
      const j0 = rev ? M - 1 - g.jE : g.jS, j1 = rev ? M - 1 - g.jS : g.jE;
      const zs = zsF.map(z => ({ ...z, ic: rev ? M - 1 - z.ic : z.ic })).sort((a, b) => a.ic - b.ic);
      let prevId = `${name}@s`, prevI = j0, seq = 0;
      const block = (toId: string, i1: number) => {
        const len = (i1 - prevI) * g.step, cnt = Math.max(1, Math.round(len / def.blockLength));
        for (let q = 1; q <= cnt; q++) {
          const ie = q === cnt ? i1 : prevI + Math.round(((i1 - prevI) * q) / cnt);
          const e = new Edge(`${name}-b${++seq}`, slice(prevI, ie, () => 0), 'block', name, 40);
          const to = q === cnt ? toId : `${name}G${seq}`;
          net.add(e, prevId, to); net.ring[name].push(e);
          prevId = to; prevI = ie;
        }
      };
      zs.forEach((z, n) => {
        const D = z.ic - SPAN / 2, Mz = z.ic + SPAN / 2;
        block(`${name}D${n}`, D);
        zoneEdges(net, def, depots, name, slice, z, n, D, Mz, SPAN, R, g.step, `${name}D${n}`, `${name}M${n}`, 'chord', g.def.stations![z.k].name);
        prevId = `${name}M${n}`; prevI = Mz;
      });
      block(`${name}@e`, j1);
    }
    // raccordements
    const mk = (eid: string, pts: P2[], from: string, to: string, track: string, diverge = '') => {
      const e = new Edge(eid, pts, 'ramp', track, 25); e.diverge = diverge;
      net.add(e, from, to); return e;
    };
    const e1 = mk(`${id}-c1`, g.conn.c1, `A@${id}.dv1`, `${cp}@s`, cp, id);
    const e3 = mk(`${id}-c3`, g.conn.c3, `${cp}@e`, `A@${id}.mg2`, cp);
    const [a2, x2, b2] = cutPoly(g.conn.c2, g.cross.c2[0], g.cross.c2[1]);
    const e2a = mk(`${id}-c2a`, a2, `${dm}@e`, `${id}.c2a`, dm), e2x = mk(`${id}-c2x`, x2, `${id}.c2a`, `${id}.c2b`, dm), e2b = mk(`${id}-c2b`, b2, `${id}.c2b`, `B@${id}.mg1`, dm);
    const [a4, x4, b4] = cutPoly(g.conn.c4, g.cross.c4[0], g.cross.c4[1]);
    const e4a = mk(`${id}-c4a`, a4, `B@${id}.dv2`, `${id}.c4a`, dm, id), e4x = mk(`${id}-c4x`, x4, `${id}.c4a`, `${id}.c4b`, dm), e4b = mk(`${id}-c4b`, b4, `${id}.c4b`, `${dm}@s`, dm);
    net.ring[cp] = [e1, ...net.ring[cp], e3];
    net.ring[dm] = [e4a, e4x, e4b, ...net.ring[dm], e2a, e2x, e2b];
    // enclenchements : la traversée de D- exclut le canton de la voie A qu'elle coupe
    for (const [x, a, b] of [[e2x, `A@${id}.x1a`, `A@${id}.x1b`], [e4x, `A@${id}.x2a`, `A@${id}.x2b`]] as [Edge, string, string][]) {
      const na = net.nodes.get(a), nb = net.nodes.get(b);
      const ring = na?.outs.find(o => o.to === nb);
      if (!ring) throw new Error(`Corde ${id} : canton de traversée introuvable`);
      ring.lock.push(x); x.lock.push(ring);
    }
    // convergences : la dernière portion du raccordement longe la voie principale, donc exclusion mutuelle avec le canton qui y mène
    for (const [m, ids] of [[e2b, `B@${id}.mg1`], [e3, `A@${id}.mg2`]] as [Edge, string][]) {
      const nd = net.nodes.get(ids);
      for (const r of nd?.ins ?? []) if (r !== m) { r.lock.push(m); m.lock.push(r); }
    }
    for (const st of g.def.stations ?? []) net.stations.push(st.name);
  });

  // ----- Les antennes : voie unique (un canton par sens, de même géométrie), évitements, terminus -----
  bgeos.forEach(g => {
    const id = g.def.id, fw = `${id}>`, bw = `${id}<`, K = g.K, M = g.M, side = g.side;
    for (const c of [...g.cutsA.map(x => `A@${x.id}`), ...g.cutsB.map(x => `B@${x.id}`)]) if (!net.nodes.has(c)) throw new Error(`Antenne ${id} : la bifurcation ${c} tombe dans une zone de gare ou de dépôt`);
    net.ring[fw] = []; net.ring[bw] = [];
    const Kr = [...K].reverse(), fF = frames(K), fR = frames(Kr), o = half;
    const sliceF = (i0: number, i1: number, lat: (k: number) => number): P2[] => {
      const r: P2[] = []; for (let i = i0; i <= i1; i++) { const q = lat(i - i0); r.push({ x: K[i].x + fF[i].n.x * q, y: K[i].y, z: K[i].z + fF[i].n.z * q }); } return r;
    };
    const sliceB = (i0: number, i1: number, lat: (k: number) => number): P2[] => {         // indices du repère inversé
      const r: P2[] = []; for (let i = i0; i <= i1; i++) { const q = lat(i - i0); r.push({ x: Kr[i].x + fR[i].n.x * q, y: Kr[i].y, z: Kr[i].z + fR[i].n.z * q }); } return r;
    };
    const F: Edge[][] = [[]], B: Edge[][] = [[]];
    const fn = (p: number) => `${fw}${p}`, bn = (p: number) => `${bw}${p}`;
    let pos = 0, seq = 0, prevI = 0, cur = 0;
    const addAxis = (iEnd: number) => {
      const len = (iEnd - prevI) * g.step, cnt = Math.max(1, Math.round(len / def.blockLength));
      for (let q = 1; q <= cnt; q++) {
        const ie = q === cnt ? iEnd : prevI + Math.round(((iEnd - prevI) * q) / cnt);
        const fe = new Edge(`${fw}b${++seq}`, sliceF(prevI, ie, () => 0), 'block', fw, 33);
        const be = new Edge(`${bw}b${seq}`, [...fe.pts].reverse(), 'block', bw, 33);
        fe.twin = be; be.twin = fe; be.mirror = true;
        net.add(fe, fn(pos), fn(pos + 1)); net.add(be, bn(pos + 1), bn(pos));
        F[cur].push(fe); B[cur].push(be); net.ring[fw].push(fe); net.ring[bw].unshift(be);
        pos++; prevI = ie;
      }
    };
    const mk = (eid: string, pts: P2[], from: string, to: string, track: string, diverge = '') => {
      const e = new Edge(eid, pts, 'ramp', track, 22); e.diverge = diverge; net.add(e, from, to); return e;
    };
    let e3: Edge | null = null;
    if (!g.free) {
      const e1 = mk(`${id}-c1`, g.c1, `${side}@${id}.dv`, fn(0), fw, id);
      e3 = mk(`${id}-c3`, g.c3, bn(0), `${side}@${id}.mg`, bw);
      F[0].push(e1); B[0].push(e3); net.ring[fw].unshift(e1); net.ring[bw].push(e3);
    } else {      // terminus de départ : à quai sur le canton retour (cul-de-sac), la rame repart sur le canton aller
      const f0 = new Edge(`${fw}T0`, sliceF(0, g.s0, () => 0), 'block', fw, 20);
      const b0 = new Edge(`${bw}T0`, [...f0.pts].reverse(), 'plat', bw, 20);
      f0.twin = b0; b0.twin = f0; b0.mirror = true; b0.turn = true;
      b0.station = g.def.origin!; b0.stopOffset = b0.len - 8;
      net.add(f0, `${fw}beg`, fn(0)); net.add(b0, bn(0), `${bw}end0`);
      F[0].push(f0); B[0].push(b0); net.ring[fw].push(f0); net.ring[bw].push(b0);
      net.stations.push(g.def.origin!);
      prevI = g.s0;
    }
    const bodyStop = (SPAN - 2 * R) * g.step - 8;
    g.loops.forEach(l => {
      const name = g.def.loops![l.k].name, D = l.ic - SPAN / 2, Mz = l.ic + SPAN / 2, jD = M - 1 - Mz;
      addAxis(D);
      const pin = new Edge(`${fw}L${l.k}-in`, sliceF(D, D + R, kk => o * sm(kk / R)), 'ramp', fw, 25);
      const pb = new Edge(`${fw}L${l.k}`, sliceF(D + R, Mz - R, () => o), 'plat', fw, 25);
      const pout = new Edge(`${fw}L${l.k}-out`, sliceF(Mz - R, Mz, kk => o * sm((R - kk) / R)), 'ramp', fw, 25);
      const qin = new Edge(`${bw}L${l.k}-in`, sliceB(jD, jD + R, kk => o * sm(kk / R)), 'ramp', bw, 25);
      const qb = new Edge(`${bw}L${l.k}`, sliceB(jD + R, jD + SPAN - R, () => o), 'plat', bw, 25);
      const qout = new Edge(`${bw}L${l.k}-out`, sliceB(jD + SPAN - R, jD + SPAN, kk => o * sm((R - kk) / R)), 'ramp', bw, 25);
      for (const b of [pb, qb]) { b.stopOffset = Math.min(bodyStop, b.len - 8); b.station = name; }
      for (const e of [pin, pout, qin, qout]) e.via = 'plat';
      net.add(pin, fn(pos), `${fw}L${l.k}a`); net.add(pb, `${fw}L${l.k}a`, `${fw}L${l.k}b`); net.add(pout, `${fw}L${l.k}b`, fn(pos + 1));
      net.add(qin, bn(pos + 1), `${bw}L${l.k}a`); net.add(qb, `${bw}L${l.k}a`, `${bw}L${l.k}b`); net.add(qout, `${bw}L${l.k}b`, bn(pos));
      F[cur].push(pin); B[cur].push(qout);
      net.ring[fw].push(pin, pb, pout); net.ring[bw].unshift(qout, qb, qin);
      cur++; F[cur] = [pout]; B[cur] = [qin];
      pos++; prevI = Mz;
      net.stations.push(name);
    });
    addAxis(g.t0);
    // terminus : canton à quai en cul-de-sac ; la rame s'y arrête puis repart sur le canton jumeau
    const tf = new Edge(`${fw}T`, sliceF(g.t0, M - 1, () => 0), 'plat', fw, 20);
    const tb = new Edge(`${bw}T`, [...tf.pts].reverse(), 'block', bw, 20);
    tf.twin = tb; tb.twin = tf; tb.mirror = true; tf.turn = true;
    tf.station = g.def.terminus; tf.stopOffset = tf.len - 8;
    net.add(tf, fn(pos), `${fw}end`); net.add(tb, `${bw}end`, bn(pos));
    F[cur].push(tf); B[cur].push(tb); net.ring[fw].push(tf); net.ring[bw].unshift(tb);
    net.stations.push(g.def.terminus);
    // enclenchements : un seul train à la fois par section de voie unique (tous sens confondus)
    for (let k = 0; k <= cur; k++) { const all = [...F[k], ...B[k]]; for (const e of all) e.lock.push(...all.filter(x => x !== e)); }
    // convergence avec la boucle : le bras de retour longe la voie principale sur ses derniers mètres
    if (e3) { const mg = net.nodes.get(`${side}@${id}.mg`); for (const r of mg?.ins ?? []) if (r !== e3) { r.lock.push(e3); e3.lock.push(r); } }
    if (g.free) net.starts[fw] = F.map(sec => sec.find(e => e.kind === 'block' && e.len >= 170) ?? sec.find(e => e.kind === 'block')!).filter(Boolean);
  });

  net.guides = [...net.center, ...net.lines.slice(1).flatMap(l => l.center), ...net.edges.filter(e => e.kind === 'plat' || e.kind === 'depot' || e.kind === 'ramp').flatMap(e => e.pts.filter((_, i) => i % 2 === 0))];
  return net;
}

/** Une zone de gare ou de dépôt sur une voie : aiguillage d'entrée, voie directe, voies annexes, aiguillage de sortie. */
function zoneEdges(
  net: Network, def: LayoutDef, depots: DepotDef[], name: string, slice: (i0: number, i1: number, lat: (k: number) => number) => P2[],
  z: { kind: 'station' | 'depot'; k: number; ic: number }, n: number, D: number, M: number, SPAN: number, R: number, step: number,
  dId: string, mId: string, where: 'main' | 'chord', stationName?: string,
): void {
  const bodyStop = (SPAN - 2 * R) * step - 8;
  type Route = { tag: string; via: 'main' | 'plat' | 'depot'; off: number; cap: number };
  const routes: Route[] = [{ tag: 'main', via: 'main', off: 0, cap: 40 }];
  if (z.kind === 'station') routes.push({ tag: 'plat', via: 'plat', off: def.platformOffset, cap: 25 });
  else for (let j = 0; j < depots[z.k].tracks; j++) routes.push({ tag: `dep${j}`, via: 'depot', off: def.platformOffset * (j + 1), cap: 25 });
  const ins: Edge[] = [], outs: Edge[] = [], bodies: Edge[] = [];
  routes.forEach((r, ri) => {
    const aId = `${name}A${n}${r.tag}`, bId = `${name}B${n}${r.tag}`;
    const eIn = new Edge(`${name}-z${n}-${r.tag}-in`, slice(D, D + R, kk => r.off * sm(kk / R)), 'ramp', name, r.cap);
    const body = new Edge(`${name}-z${n}-${r.tag}`, slice(D + R, M - R, () => r.off), r.via, name, r.cap);
    const eOut = new Edge(`${name}-z${n}-${r.tag}-out`, slice(M - R, M, kk => r.off * sm((R - kk) / R)), 'ramp', name, r.cap);
    eIn.via = eOut.via = r.via;
    if (r.via !== 'main') { body.stopOffset = Math.min(bodyStop, body.len - 8); if (r.via === 'plat') body.station = stationName ?? def.stations[z.k].name; else body.depot = depots[z.k].name; }
    if (ri > 0) { eIn.ref = ins[ri - 1]; eOut.ref = outs[ri - 1]; }
    net.add(eIn, dId, aId); net.add(body, aId, bId); net.add(eOut, bId, mId);
    ins.push(eIn); outs.push(eOut); bodies.push(body);
    if (r.via === 'main' && where === 'main') net.ring[name].push(eIn, body, eOut);
    if (r.via === 'main' && where === 'chord') net.ring[name].push(eIn, body, eOut);
  });
  for (const g of [ins, outs]) for (const e of g) e.lock = g.filter(x => x !== e);
  if (z.kind === 'depot') net.depots.push({ name: depots[z.k].name, track: name, edges: bodies.slice(1) });
}
