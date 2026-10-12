// Tramway : dans chaque grande ville, une navette sur deux avenues opposées reliées par le centre, et — quand un boulevard circulaire est fermé —
// une boucle où plusieurs petites voitures seules se suivent. Le tram est prioritaire : les véhicules cèdent aux carrefours (voir `laneBlocked`),
// lui ne freine que devant un obstacle réel ; aux croisements de deux lignes, un seul tram à la fois. Aucune dépendance à Three.js.
import type { CityPlan, Street } from './cityplan';
import { rng } from './cityplan';

export interface TramLine {
  name: string;
  /** tracé rééchantillonné tous les STEP mètres (une boucle se referme sur son premier point) : x, z, hauteur de la voie */
  x: number[]; z: number[]; y: number[]; len: number; loop: boolean;
  /** abscisses des stations (triées) et côté du trottoir où se trouve l'abri (+1 : à droite du sens de tracé, −1 : à gauche) */
  stops: number[]; sides: number[];
  /** demi-largeur de la chaussée (le quai se place au-delà) */
  hw: number;
  city: string;
  trams: Tram[];
}
export type TramState = 'roule' | 'arrêt';
export interface Tram {
  id: number; line: TramLine; s: number; dir: 1 | -1; v: number; state: TramState; dwell: number;
  x: number; y: number; z: number; yaw: number; pitch: number;
  /** vrai quand le tram est en service (sinon garé, invisible) */
  active: boolean; color: number; name: string; stuck: number;
  /** temps restant (s) d'avance au pas à travers les véhicules après une longue attente */
  crawl: number;
  /** station où il se trouve ou qu'il vient de quitter (indice dans `line.stops`), pour l'affichage et les voyageurs */
  atStop: number;
}
/** Croisement de deux lignes : un seul tram à la fois. */
interface Cross { x: number; z: number; a: { line: TramLine; s: number }; b: { line: TramLine; s: number }; holder: Tram | null }
/** Un nœud routier traversé par la ligne, que les véhicules de la voie `lane` doivent laisser au tram. */
interface Prio { line: TramLine; s: number }

export interface LoopEdge { a: { x: number; z: number }; b: { x: number; z: number }; hw: number; tier: number; render: boolean; oneWay?: boolean; poly: { len: number; pts: { x: number; y: number; z: number }[] } }
export const STEP = 3, TRAM_LEN = 11.6, TRAM_W = 2.2;
const VMAX = 7.5, ACC = 1.1, DEC = 1.6, EMG = 4.5;
const TRACK_Y = 0.235, PLAZA_Y = 0.285;

const dirOf = (s: Street, c: { x: number; z: number }) => { const e = s.pts[s.pts.length - 1], l = Math.hypot(e[0] - c.x, e[1] - c.z) || 1; return [(e[0] - c.x) / l, (e[1] - c.z) / l]; };
const lenOf = (s: Street) => { let t = 0; for (let k = 1; k < s.pts.length; k++) t += Math.hypot(s.pts[k][0] - s.pts[k - 1][0], s.pts[k][1] - s.pts[k - 1][1]); return t; };

/** Rééchantillonne une polyligne tous les STEP mètres, puis l'adoucit (aux extrémités fixes, ou en boucle). */
function resample(raw: [number, number][], loop: boolean): [number, number][] {
  const pts: [number, number][] = [raw[0]]; let acc = 0;
  for (let i = 1; i < raw.length; i++) {
    const [ax, az] = raw[i - 1], [bx, bz] = raw[i], l = Math.hypot(bx - ax, bz - az); if (l < 1e-6) continue;
    for (let d = STEP - acc; d <= l; d += STEP) pts.push([ax + ((bx - ax) * d) / l, az + ((bz - az) * d) / l]);
    acc = (acc + l) % STEP;
  }
  if (!loop) pts.push(raw[raw.length - 1]);
  else if (Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) < STEP * 0.3) pts.pop();
  const n = pts.length;
  for (let it = 0; it < 3; it++) {
    const c = pts.map(p => [...p] as [number, number]);
    for (let i = loop ? 0 : 3; i < (loop ? n : n - 3); i++) { let x = 0, z = 0; for (let k = -3; k <= 3; k++) { const j = loop ? (i + k + n) % n : i + k; x += c[j][0]; z += c[j][1]; } pts[i] = [x / 7, z / 7]; }
  }
  if (loop) pts.push([pts[0][0], pts[0][1]]);
  return pts;
}

export class TramNet {
  readonly lines: TramLine[] = [];
  readonly trams: Tram[] = [];
  private rand;
  private crosses: Cross[] = [];
  private crossOf = new Map<TramLine, Cross[]>();
  /** voie routière → nœuds d'arrivée traversés par une ligne (les véhicules y cèdent au tram) */
  private prio = new Map<object, Prio[]>();

  constructor(plans: CityPlan[], height: (x: number, z: number) => number, seed = 77, junctions: { x: number; z: number }[] = [], edges: LoopEdge[] = []) {
    this.rand = rng(seed); let id = 1;
    const palette = [0xe2b92b, 0xd9d6cc, 0xc4503a, 0x3f7a9a, 0x5d9a6a];
    const jd = (px: number, pz: number) => { let m = 1e9; for (const j of junctions) { const d = Math.hypot(j.x - px, j.z - pz); if (d < m) m = d; } return m; };
    const addLine = (pl: CityPlan, name: string, path: [number, number][], loop: boolean, nTrams: number, hw: number) => {
      const n = path.length, x = path.map(p => p[0]), z = path.map(p => p[1]);
      const y = path.map(([px, pz]) => { const d = Math.hypot(px - pl.c.x, pz - pl.c.z); return height(px, pz) + (d < 12 ? PLAZA_Y : d < 16 ? PLAZA_Y - (PLAZA_Y - TRACK_Y) * ((d - 12) / 4) : TRACK_Y); });
      const len = (n - 1) * STEP, okAt = (i: number) => jd(x[i % (n - 1)], z[i % (n - 1)]) >= 17;
      const stops: number[] = [];
      const place = (s0: number) => { for (let o = 0; o <= 60; o += 3) for (const sg of [1, -1]) { let s1 = s0 + o * sg; if (loop) s1 = ((s1 % len) + len) % len; const i = Math.round(s1 / STEP); if (!loop && (i < 2 || i > n - 3)) continue; if (okAt(i) && stops.every(q => { const d = Math.abs(q - i * STEP); return Math.min(d, loop ? len - d : d) > 40; })) return i * STEP; } return null; };
      if (loop) { const k = Math.max(3, Math.round(len / 170)); for (let q = 0; q < k; q++) { const p = place((q * len) / k); if (p !== null) stops.push(p); } }
      else { stops.push(0, len); let hubI = 0, hd = 1e9; path.forEach(([px, pz], i) => { const d = Math.hypot(px - pl.c.x, pz - pl.c.z); if (d < hd) { hd = d; hubI = i; } }); const hubS = hubI * STEP; for (const c of [hubS - 36, hubS + 36, hubS - 36 - 170, hubS + 36 + 170]) { if (c < 60 || c > len - 60) continue; const q = place(c); if (q !== null) stops.push(q); } }
      stops.sort((a, b) => a - b);
      const line: TramLine = { name, x, z, y, len, loop, hw, stops, sides: stops.map((_, i) => (loop ? 1 : i % 2 ? -1 : 1)), city: pl.zone.name ?? '', trams: [] };
      this.lines.push(line);
      for (let k = 0; k < nTrams; k++) {
        const s0 = loop ? (k * len) / nTrams : this.rand() * len;
        const t: Tram = { id: id++, line, s: s0, dir: loop ? 1 : this.rand() < 0.5 ? 1 : -1, v: 0, state: 'roule', dwell: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, active: true, color: palette[(id + this.lines.length) % palette.length], name: `Tram ${name}`, stuck: 0, crawl: 0, atStop: -1 };
        line.trams.push(t); this.trams.push(t); this.pose(t);
      }
    };
    for (const pl of plans) {
      if (pl.village || pl.zone.r < 150) continue;
      // ---- boucle : un circuit fermé de rues du réseau routier autour du centre, plusieurs voitures qui se suivent (grandes villes)
      if (pl.zone.r >= 230) {
        const cyc = this.findCycle(pl, edges, height, []);
        if (cyc) {
          const path = resample(cyc.pts, true), len = (path.length - 1) * STEP;
          addLine(pl, `${pl.zone.name ?? 'Ville'} boucle`, path, true, Math.max(2, Math.min(7, Math.round(len / 230))), cyc.hw);
        }
      }
      const lp = this.lines.find(l => l.loop && l.city === (pl.zone.name ?? ''));
      // une avenue qui longe la boucle sur plus de 40 m est écartée (deux lignes ne partagent jamais un tronçon)
      const nearLoop = (st: Street) => { if (!lp) return false; let near = 0; for (const q of resample(st.pts.map(p => [p[0], p[1]] as [number, number]), false)) if (lp.x.some((lx, i) => Math.hypot(lx - q[0], lp.z[i] - q[1]) < 9)) near += STEP; return near > 40; };
      // ---- navette : paire d'avenues opposées la plus longue ; à défaut, la plus longue avenue seule
      let ave = pl.streets.filter(s => s.tier === 0 && s.hw >= 4 && lenOf(s) >= 70 && !nearLoop(s));
      const want = pl.zone.r > 300 ? 2 : 1;
      for (let li = 0; li < want; li++) {
        let best: [Street, Street | null] | null = null, bs = 0;
        for (let i = 0; i < ave.length; i++) for (let j = i + 1; j < ave.length; j++) {
          const a = dirOf(ave[i], pl.c), b = dirOf(ave[j], pl.c), d = a[0] * b[0] + a[1] * b[1], sc = lenOf(ave[i]) + lenOf(ave[j]);
          if (d < -0.25 && sc > bs) { bs = sc; best = [ave[i], ave[j]]; }
        }
        if (!best) { const one = ave.slice().sort((a, b) => lenOf(b) - lenOf(a))[0]; if (one && lenOf(one) >= 130) best = [one, null]; }
        if (!best) break;
        ave = ave.filter(s => s !== best![0] && s !== best![1]);
        const raw: [number, number][] = best[1] ? [...best[0].pts.slice().reverse(), ...best[1].pts] : best[0].pts.slice();
        const full = resample(raw, false);
        // les terminus restent à l'écart des carrefours
        let i0 = 0, i1 = full.length - 1; const okF = (i: number) => jd(full[i][0], full[i][1]) >= 17;
        while (i0 < i1 - 20 && (i0 < 6 || !okF(i0))) i0++;
        while (i1 > i0 + 20 && (full.length - 1 - i1 < 6 || !okF(i1))) i1--;
        addLine(pl, `${pl.zone.name ?? 'Ville'} ${li + 1}`, full.slice(i0, i1 + 1), false, 1, Math.min(best[0].hw, best[1]?.hw ?? 9));
      }
    }
    // croisements de lignes (un seul tram à la fois)
    for (let i = 0; i < this.lines.length; i++) for (let j = i + 1; j < this.lines.length; j++) this.crossLines(this.lines[i], this.lines[j]);
  }


  /** Plus grand circuit de rues (hors rond-point, ponts et sens uniques) (le plus long, 300 à 1100 m) ; null s'il n'y en a pas. */
  private findCycle(pl: CityPlan, edges: LoopEdge[], height: (x: number, z: number) => number, used: TramLine[]): { pts: [number, number][]; hw: number } | null {
    const R = pl.zone.r * 1.1, c = pl.c;
    const cand = edges.filter(e => !e.render && e.tier <= 2 && !e.oneWay && Math.hypot(e.a.x - c.x, e.a.z - c.z) > 32 && Math.hypot(e.b.x - c.x, e.b.z - c.z) > 32
      && e.poly.pts.every(q => Math.hypot(q.x - c.x, q.z - c.z) < R && q.y - height(q.x, q.z) < 2 ));
    const adj = new Map<object, LoopEdge[]>(); for (const e of cand) for (const nd of [e.a, e.b]) { const l = adj.get(nd); if (l) l.push(e); else adj.set(nd, [e]); }
    // plus long circuit simple (au plus 1800 m) par recherche en profondeur à budget limité
    let best: { len: number; seq: LoopEdge[]; start: object } | null = null, budget = 600000;
    const MAXL = 1800;
    for (const start of adj.keys()) {
      const seen = new Set<object>([start]), seq: LoopEdge[] = [];
      const dfs = (u: object, len: number) => {
        if (budget-- < 0) return;
        for (const e of adj.get(u) ?? []) {
          if (seq.includes(e)) continue;
          const w = e.a === u ? e.b : e.a, nl = len + e.poly.len; if (nl > MAXL) continue;
          if (w === start) { if (seq.length >= 2 && nl >= 300 && (!best || nl > best.len)) best = { len: nl, seq: [...seq, e], start }; continue; }
          if (seen.has(w)) continue;
          seen.add(w); seq.push(e); dfs(w, nl); seq.pop(); seen.delete(w);
        }
      };
      dfs(start, 0); if (budget < 0) break;
    }
    const bb = best as { len: number; seq: LoopEdge[]; start: object } | null;
    if (!bb) return null;
    const pts: [number, number][] = []; let at: object = bb.start;
    for (const e of bb.seq) { const fw = e.a === at, P = fw ? e.poly.pts : e.poly.pts.slice().reverse(); for (const q of P) pts.push([q.x, q.z]); at = fw ? e.b : e.a; }
    pts.push([pts[0][0], pts[0][1]]);
    return { pts, hw: Math.min(...bb.seq.map(e => e.hw)) };
  }

  private crossLines(A: TramLine, B: TramLine) {
    const segS = (_L: TramLine, k: number) => k * STEP;
    for (let i = 0; i + 1 < A.x.length; i++) for (let j = 0; j + 1 < B.x.length; j++) {
      const ax = A.x[i], az = A.z[i], bx = A.x[i + 1], bz = A.z[i + 1], cx = B.x[j], cz = B.z[j], dx = B.x[j + 1], dz = B.z[j + 1];
      if (Math.max(ax, bx) < Math.min(cx, dx) - 1 || Math.min(ax, bx) > Math.max(cx, dx) + 1 || Math.max(az, bz) < Math.min(cz, dz) - 1 || Math.min(az, bz) > Math.max(cz, dz) + 1) continue;
      const r1 = bx - ax, r2 = bz - az, s1 = dx - cx, s2 = dz - cz, den = r1 * s2 - r2 * s1; if (Math.abs(den) < 1e-9) continue;
      const t = ((cx - ax) * s2 - (cz - az) * s1) / den, u = ((cx - ax) * r2 - (cz - az) * r1) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const c: Cross = { x: ax + r1 * t, z: az + r2 * t, a: { line: A, s: segS(A, i) + t * STEP }, b: { line: B, s: segS(B, j) + u * STEP }, holder: null };
      if (this.crosses.some(o => Math.hypot(o.x - c.x, o.z - c.z) < 14)) continue;
      this.crosses.push(c); for (const L of [A, B]) { const l = this.crossOf.get(L); if (l) l.push(c); else this.crossOf.set(L, [c]); }
    }
  }

  /**
   * Relie le réseau routier : pour chaque voie qui arrive à un nœud traversé par une ligne (à moins de 4 m, sous un angle d'au moins 33°),
   * les véhicules devront céder au tram. `lanesIn` de chaque nœud donne les voies d'arrivée.
   */
  bindRoads(nodes: { x: number; z: number; lanesIn: { len: number; poly: { at(s: number): { tx: number; tz: number } } }[] }[]) {
    this.prio.clear();
    for (const L of this.lines) for (const nd of nodes) {
      let best = { d: 1e9, s: 0, tx: 0, tz: 0 };
      for (let i = 0; i + 1 < L.x.length; i++) {
        const dx = L.x[i + 1] - L.x[i], dz = L.z[i + 1] - L.z[i], l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((nd.x - L.x[i]) * dx + (nd.z - L.z[i]) * dz) / l2)), d = Math.hypot(nd.x - L.x[i] - dx * u, nd.z - L.z[i] - dz * u);
        if (d < best.d) { const l = Math.sqrt(l2); best = { d, s: i * STEP + u * STEP, tx: dx / l, tz: dz / l }; }
      }
      if (best.d > 4) continue;
      for (const ln of nd.lanesIn) { const a = ln.poly.at(Math.max(0, ln.len - 2)); if (Math.abs(a.tx * best.tz - a.tz * best.tx) < 0.55) continue; const l = this.prio.get(ln); if (l) l.push({ line: L, s: best.s }); else this.prio.set(ln, [{ line: L, s: best.s }]); }
    }
  }
  /** Vrai si un tram occupe ou va occuper à court terme le nœud d'arrivée de cette voie : les véhicules doivent s'arrêter avant. */
  laneBlocked(lane: object): boolean {
    const list = this.prio.get(lane); if (!list) return false;
    for (const p of list) for (const t of p.line.trams) {
      if (!t.active || t.stuck > 2.5) continue;   // un tram qui attend lui-même un véhicule ne bloque pas le carrefour (sinon impasse)
      const d = this.ahead(t, p.s);
      if (t.v < 0.4 && t.state === 'arrêt') { if (Math.abs(d) < 9) return true; continue; }
      if (d > -(TRAM_LEN / 2 + 4) && d < 14 + t.v * 3.5) return true;
    }
    return false;
  }

  /** Tram actif le plus proche devant un véhicule (position, cap) dans un couloir de ±1,6 m, à moins de 30 m : distance du nez du véhicule à l'arrière du tram, et vitesse du tram. */
  obstacle(x: number, z: number, yaw: number): { d: number; v: number } | null {
    const hx = Math.sin(yaw), hz = Math.cos(yaw); let best: { d: number; v: number } | null = null;
    for (const t of this.trams) {
      if (!t.active) continue; const dx = t.x - x, dz = t.z - z; if (dx * dx + dz * dz > 1600) continue;
      const thx = Math.sin(t.yaw), thz = Math.cos(t.yaw); if (thx * hx + thz * hz < 0.8) continue;   // seulement un tram qui roule dans le même sens (les autres cas : priorité aux carrefours)
      for (const k of [-5.8]) {   // seul l'arrière du tram compte : un véhicule déjà à cheval sur la caisse doit pouvoir partir
        const px = dx + thx * k, pz = dz + thz * k, a = px * hx + pz * hz, lat = Math.abs(-px * hz + pz * hx);
        if (a > 0 && a < 30 && lat < 1.7 && (!best || a - 1 < best.d)) best = { d: a - 1, v: t.v };
      }
    }
    return best;
  }

  /** Prochain arrêt dans le sens de marche : position, tangente (sens de marche) et distance le long de la ligne ; null si la ligne n'a pas d'arrêt devant. */
  nextStop(t: Tram): { x: number; y: number; z: number; tx: number; tz: number; d: number } | null {
    const L = t.line; let best = 1e9, at = -1;
    for (const sp of L.stops) { let d = (sp - t.s) * t.dir; if (L.loop) d = ((d % L.len) + L.len) % L.len; if (d > 0.05 && d < best) { best = d; at = sp; } }
    if (at < 0) return null;
    const a = this.at(L, at); return { x: a.x, y: a.y, z: a.z, tx: a.tx * t.dir, tz: a.tz * t.dir, d: best };
  }

  /** Distance le long de la ligne, dans le sens de marche, entre le tram et l'abscisse sc (négative : déjà passé). */
  private ahead(t: Tram, sc: number): number {
    const L = t.line; let d = (sc - t.s) * t.dir;
    if (L.loop) { d = ((d % L.len) + L.len) % L.len; if (d > L.len - (TRAM_LEN / 2 + 8)) d -= L.len; }
    return d;
  }

  /** Point, hauteur et cap du tracé à l'abscisse s. */
  at(line: TramLine, s: number) {
    const n = line.x.length, m = n - 1;
    if (line.loop) s = ((s % line.len) + line.len) % line.len; else s = Math.max(0, Math.min(line.len, s));
    const f = s / STEP, i = Math.min(m - 1, Math.floor(f)), u = f - i;
    const x = line.x[i] + (line.x[i + 1] - line.x[i]) * u, z = line.z[i] + (line.z[i + 1] - line.z[i]) * u, y = line.y[i] + (line.y[i + 1] - line.y[i]) * u;
    const j0 = line.loop ? (i - 1 + m) % m : Math.max(0, i - 1), j1 = line.loop ? (i + 2) % m : Math.min(m, i + 2), tx = line.x[j1] - line.x[j0], tz = line.z[j1] - line.z[j0], l = Math.hypot(tx, tz) || 1;
    return { x, y, z, tx: tx / l, tz: tz / l };
  }
  private pose(t: Tram) {
    const p = this.at(t.line, t.s), q0 = this.at(t.line, t.s - 4), q1 = this.at(t.line, t.s + 4);
    t.x = p.x; t.y = p.y; t.z = p.z; t.yaw = Math.atan2(p.tx * t.dir, p.tz * t.dir); t.pitch = Math.atan2((q1.y - q0.y) * t.dir, 8);
  }

  /** Distance libre devant le nez (m) : seulement ce qui est réellement dans la trajectoire. */
  private freeAhead(t: Tram, pts: { x: number; z: number }[]): number {
    const hx = Math.sin(t.yaw), hz = Math.cos(t.yaw); let best = 1e9;
    for (const q of pts) {
      const dx = q.x - t.x, dz = q.z - t.z; if (dx * dx + dz * dz > 900) continue;
      const ahead = dx * hx + dz * hz, lat = Math.abs(-dx * hz + dz * hx);
      if (lat < 1.3 && ahead > 0) best = Math.min(best, Math.max(0, ahead - TRAM_LEN / 2 - 1.5));
    }
    return best;
  }

  step(dt: number, vehicles: { x: number; z: number }[], hour: number) {
    const open = hour >= 5.5 || hour < 0.5;
    const body: { x: number; z: number }[][] = this.trams.map(o => [-4.5, 0, 4.5].map(k => ({ x: o.x + Math.sin(o.yaw) * k, z: o.z + Math.cos(o.yaw) * k })));
    this.trams.forEach((t, ti) => {
      const L = t.line;
      if (!open) { t.active = false; t.v = 0; for (const c of this.crossOf.get(L) ?? []) if (c.holder === t) c.holder = null; return; }
      t.active = true;
      if (t.state === 'arrêt') {
        t.v = 0; t.dwell -= dt;
        if (t.dwell <= 0) { if (!L.loop) { if (t.s <= 0.5) t.dir = 1; else if (t.s >= L.len - 0.5) t.dir = -1; } t.state = 'roule'; }
        this.pose(t); return;
      }
      // prochaine station dans le sens de marche
      let next = 0, ni = -1;
      if (L.loop) { let bd = 1e9; L.stops.forEach((sp, i) => { const d = ((sp - t.s) % L.len + L.len) % L.len; if (d > 0.05 && d < bd) { bd = d; next = t.s + d; ni = i; } }); if (ni < 0) { next = t.s + L.len; ni = 0; } }
      else { next = t.dir > 0 ? L.len : 0; ni = t.dir > 0 ? L.stops.length - 1 : 0; for (let i = 0; i < L.stops.length; i++) { const sp = L.stops[i]; if (t.dir > 0 && sp > t.s + 0.05) { next = sp; ni = i; break; } if (t.dir < 0 && sp < t.s - 0.05) { next = sp; ni = i; } } }
      const dStop = L.loop ? ((next - t.s) % L.len + L.len) % L.len : Math.abs(next - t.s);
      let target = Math.min(VMAX, Math.sqrt(2 * DEC * Math.max(0, dStop - 0.25)) + 0.2);
      // obstacles réels devant : autres trams et véhicules dans la trajectoire (les véhicules cèdent au tram aux carrefours, ils ne devraient pas y être)
      if (t.stuck > 8) t.crawl = 5; else if (t.crawl > 0) t.crawl -= dt;
      const crawl = t.crawl > 0;   // bloqué trop longtemps (impasse voiture–voiture–tram) : on avance au pas à travers les véhicules
      const others: { x: number; z: number }[] = crawl ? [] : vehicles.slice(); body.forEach((b, k) => { const o = this.trams[k]; if (k === ti) return; if (t.stuck > 6 && o.stuck > 3 && o.line !== L && t.id < o.id) return; others.push(...b); });   // impasse entre deux lignes : le plus petit numéro passe
      if (crawl) target = Math.min(target, 2.5);
      const free = this.freeAhead(t, others);
      if (free < 12) target = Math.min(target, Math.sqrt(2 * EMG * Math.max(0, free - 1.2)));
      // croisement avec une autre ligne : un seul tram à la fois
      for (const c of this.crossOf.get(L) ?? []) {
        const sc = c.a.line === L ? c.a.s : c.b.s, d = this.ahead(t, sc);
        if (Math.abs(d) < 9) { if (!c.holder || c.holder === t) c.holder = t; }
        else if (c.holder === t && d < -(TRAM_LEN / 2 + 6)) c.holder = null;
        else if (d > 0 && d < 40) {
          if (c.holder && c.holder !== t && c.holder.active) target = Math.min(target, Math.sqrt(2 * DEC * Math.max(0, d - 11)) + 0.05);
          else if (!c.holder || !c.holder.active) c.holder = t;
        }
      }
      t.v += Math.max(-EMG * dt, Math.min(ACC * dt, target - t.v));
      if (t.v < 0) t.v = 0;
      t.stuck = t.v < 0.1 ? t.stuck + dt : 0;
      t.s += t.dir * t.v * dt;
      if (L.loop) t.s = ((t.s % L.len) + L.len) % L.len;
      const dd = L.loop ? ((next % L.len) - t.s + L.len) % L.len : (next - t.s) * t.dir;
      if ((dd < 0.3 || dd > L.len - 0.5) && t.v < 1.5 && (!L.loop || dStop < 2)) {
        t.s = L.loop ? next % L.len : next; t.v = 0; t.state = 'arrêt'; t.atStop = ni; t.dwell = !L.loop && (next <= 0 || next >= L.len) ? 14 : 8;
      }
      if (!L.loop) t.s = Math.max(0, Math.min(L.len, t.s));
      this.pose(t);
    });
  }
}
