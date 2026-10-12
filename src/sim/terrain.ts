import type { Guide, Network } from './network';
import { inSea, seaS, seaShape, SEA_BAND, type Sea } from './water';

export interface FeatureDef { a: [number, number]; b: [number, number]; width: number; height: number }
export interface TerrainDef { seed: number; amplitude: number; scale: number; maxGrade: number; features?: FeatureDef[]; smooth?: number }
export interface RiverDef { name?: string; points: [number, number][]; width: number }
/** Zone urbaine : autour d'une gare ou d'un dépôt, ou à un point libre (`at`), ville ou village. */
export interface UrbanDef { station?: string; depot?: string; at?: [number, number]; village?: boolean; name?: string; radius: number }
export interface Zone { x: number; z: number; y: number; r: number; kind: 'city' | 'depot' | 'village'; name?: string }
/** `k` : facteur de largeur (1 sauf près de la source, où la rivière s'effile) */
export interface RiverPt { x: number; z: number; level: number; k: number }
export interface River { name: string; pts: RiverPt[]; width: number }

const sm = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

function hash(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), u = sm(x - ix), v = sm(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Relief naturel (sans la voie) : bruit de valeurs sur 3 octaves, plus crêtes et vallées décrites dans le layout. */
export function rawHeight(T: TerrainDef): (x: number, z: number) => number {
  const F = T.features ?? [];
  return (x, z) => {
    let h = T.amplitude * (
      0.65 * vnoise(x / T.scale, z / T.scale, T.seed) +
      0.25 * vnoise(x / (T.scale / 2.3), z / (T.scale / 2.3), T.seed + 1) +
      0.10 * vnoise(x / (T.scale / 5), z / (T.scale / 5), T.seed + 2) - 0.5);
    for (const f of F) {
      const dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1], l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - f.a[0]) * dx + (z - f.a[1]) * dz) / l2));
      const d = Math.hypot(x - (f.a[0] + dx * u), z - (f.a[1] + dz * u));
      if (d < f.width) h += f.height * 0.5 * (1 + Math.cos(Math.PI * d / f.width));
    }
    return h;
  };
}

/** Courbe de Catmull-Rom ouverte passant par les points (échantillonnée tous les `step` mètres environ). */
export function riverPath(points: [number, number][], step = 12): { x: number; z: number }[] {
  const n = points.length, out: { x: number; z: number }[] = [];
  const P = (i: number) => points[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), per = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (c: number) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
      out.push({ x: f(0), z: f(1) });
    }
  }
  out.push({ x: points[n - 1][0], z: points[n - 1][1] });
  return out;
}

const BANK = 24;     // largeur de berge (m)
const DEPTH = 7.5;     // la surface de l'eau est sous le relief lissé de DEPTH mètres
const VALLEY = 0.3;  // pente maximale des versants de la vallée (m par m)
const CHANNEL = 2.2; // profondeur du lit sous la surface

/** Altitude du sol : relief naturel, aplani en ville, creusé par les rivières, puis terrassé autour des voies (sauf tunnels et ponts). */
export class Terrain {
  readonly zones: Zone[] = [];
  /** Plates-formes rectangulaires aplanies (piste d'aérodrome) : centre, axe (ux, uz), demi-longueur, demi-largeur, altitude, raccord. */
  readonly flats: { x: number; z: number; ux: number; uz: number; hl: number; hw: number; y: number; fade: number }[] = [];
  addFlat(f: { x: number; z: number; ux: number; uz: number; hl: number; hw: number; y: number; fade: number }) { this.flats.push(f); }
  readonly rivers: River[] = [];
  private grid = new Map<number, Guide[]>();
  private rgrid = new Map<number, { r: number; k: number }[]>();
  private readonly cell = 40;

  constructor(private net: Network, urban: UrbanDef[] = [], readonly flatR = 26, readonly fadeR = 110, readonly sea: Sea | null = null) {
    for (const p of net.guides) {
      const key = Math.floor(p.x / this.cell) * 100003 + Math.floor(p.z / this.cell);
      const l = this.grid.get(key);
      if (l) l.push(p); else this.grid.set(key, [p]);
    }
    for (const u of urban) {
      if (u.at) {
        const y = net.raw(u.at[0], u.at[1]);
        this.zones.push({ x: u.at[0], z: u.at[1], y: y + 0.3, r: u.radius, kind: u.village ? 'village' : 'city', name: u.name });
        continue;
      }
      if (u.depot) {
        const dep = net.depots.find(d => d.name === u.depot && d.track === 'A') ?? net.depots.find(d => d.name === u.depot);
        if (!dep) continue;
        const p = dep.edges[0].at(dep.edges[0].len / 2);
        this.zones.push({ x: p.x, z: p.z, y: p.y, r: u.radius, kind: 'depot' });
        continue;
      }
      const e = net.edges.find(x => x.kind === 'plat' && x.station === u.station && x.track === 'A') ?? net.edges.find(x => x.kind === 'plat' && x.station === u.station);
      if (!e) continue;
      const p = e.at(e.stopOffset - 70);
      this.zones.push({ x: p.x, z: p.z, y: p.y, r: u.radius, kind: 'city', name: u.station });
    }
    this.buildRivers();
  }

  /** Niveau de l'eau : relief lissé sur ±170 m, DEPTH mètres plus bas, pente limitée. */
  private buildRivers() { this.net.riverPaths.forEach((full, r) => this.makeRiver(full, this.net.rivers[r].name ?? `Rivière ${r + 1}`, this.net.rivers[r].width)); }

  /** Affluent : rejoint la rivière principale (dernier point du tracé sur son axe), à son niveau d'eau. À appeler avant la planification du monde. */
  addTributary(points: [number, number][], width: number, name: string) {
    const path = riverPath(points), end = path[path.length - 1], j = this.riverNear(end.x, end.z);
    this.makeRiver(path, name, width, j ? j.level : undefined);
  }

  /**
   * Prolonge l'aval de la rivière jusqu'à la mer quand le tracé s'arrête à terre : un cap qui tourne doucement vers le large,
   * choisi parmi quelques variantes pour rester loin des voies et des villes (une variante qui les touche est écartée).
   */
  private toSea(full: { x: number; z: number }[]): { x: number; z: number }[] {
    const sea = this.sea!, n = full.length;
    if (n < 4) return full;
    const rev = seaS(sea, full[0].x, full[0].z) > seaS(sea, full[n - 1].x, full[n - 1].z), base = rev ? full.slice().reverse() : full;   // base : amont → aval le plus proche de la mer
    const e = base[base.length - 1];
    if (seaS(sea, e.x, e.z) > -30) return full;
    const q = base[base.length - 4], l0 = Math.hypot(e.x - q.x, e.z - q.z) || 1, d0 = [(e.x - q.x) / l0, (e.z - q.z) / l0];
    const gs = this.net.guides.filter((_, i) => i % 2 === 0);
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
      const ta = Math.atan2(sea.uz, sea.ux) + off, tx = Math.cos(ta), tz = Math.sin(ta);
      let x = e.x, z = e.z, dx = d0[0], dz = d0[1]; const ext: { x: number; z: number }[] = []; let ok = false;
      for (let i = 0; i < 220; i++) {
        dx = dx * 0.93 + tx * 0.07; dz = dz * 0.93 + tz * 0.07; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
        x += dx * 12; z += dz * 12; ext.push({ x, z });
        if (Math.abs(x) > 2300 || Math.abs(z) > 2300) break;
        if (seaS(sea, x, z) > 30) { ok = true; break; }
      }
      if (!ok) continue;
      const hw = 21 + 25;
      const clear = ext.every((p, i) => (i % 3 !== 0) || (gs.every(g => Math.hypot(g.x - p.x, g.z - p.z) > 130) && this.zones.every(zn => Math.hypot(zn.x - p.x, zn.z - p.z) > zn.r * 1.15 + hw)));
      if (!clear) continue;
      return rev ? base.concat(ext).reverse() : base.concat(ext);
    }
    return full;
  }

  private makeRiver(full: { x: number; z: number }[], name: string, width: number, joinLevel?: number) {
    {
      const sea = this.sea;
      let path = full;
      if (sea && joinLevel === undefined) { full = this.toSea(full); path = full; }
      if (sea) {   // la rivière s'arrête à la côte : on garde le plus long tronçon de terre (plus un point en mer pour l'embouchure)
        let bi = 0, bn = 0, i = 0;
        while (i < full.length) { if (seaS(sea, full[i].x, full[i].z) > 24) { i++; continue; } let j = i; while (j < full.length && seaS(sea, full[j].x, full[j].z) <= 24) j++; if (j - i > bn) { bi = i; bn = j - i; } i = j; }
        path = full.slice(Math.max(0, bi - 1), Math.min(full.length, bi + bn + 1)); if (path.length < 8) return;
      }
      let h = path.map(p => this.net.raw(p.x, p.z));
      const w = 14;
      h = h.map((_, i) => { let a = 0, c = 0; for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < h.length) { a += h[j]; c++; } } return a / c; });
      // niveau = relief lissé - DEPTH, avec une pente d'eau limitée à 4 % entre deux points consécutifs
      const lv = h.map((v, i) => { const base = v - DEPTH; if (!sea) return base; const w = sm((seaS(sea, path[i].x, path[i].z) + SEA_BAND * 1.6) / (SEA_BAND * 1.6)); return base + (sea.level + 0.1 - base) * w; }), lim = 0.1 * 12;
      for (let it = 0; it < 4; it++) {
        for (let i = 1; i < lv.length; i++) lv[i] = Math.max(lv[i - 1] - lim, Math.min(lv[i - 1] + lim, lv[i]));
        for (let i = lv.length - 2; i >= 0; i--) lv[i] = Math.max(lv[i + 1] - lim, Math.min(lv[i + 1] + lim, lv[i]));
      }
      if (joinLevel !== undefined) { const n = lv.length, K = Math.min(24, n - 1); for (let i = n - K; i < n; i++) lv[i] = lv[i] + (joinLevel - lv[i]) * sm((i - (n - K)) / K); }
      // la source s'effile : le bout de la rivière le plus loin de la mer (ou le début, sans mer ou pour un affluent)
      const nP = path.length, srcEnd = sea && joinLevel === undefined && seaS(sea, path[0].x, path[0].z) > seaS(sea, path[nP - 1].x, path[nP - 1].z) ? nP - 1 : 0;
      const pts = path.map((p, i) => { const di = Math.abs(i - srcEnd); return { x: p.x, z: p.z, level: lv[i], k: 0.12 + 0.88 * sm(di / 20) }; });
      this.rivers.push({ name, pts, width: width * 1.6 });
      const ri = this.rivers.length - 1;
      pts.forEach((p, k) => {
        const key = Math.floor(p.x / this.cell) * 100003 + Math.floor(p.z / this.cell);
        const l = this.rgrid.get(key);
        if (l) l.push({ r: ri, k }); else this.rgrid.set(key, [{ r: ri, k }]);
      });
    }
  }

  /** Distance à la rivière la plus proche (axe) et niveau de l'eau à cet endroit. */
  riverNear(x: number, z: number): { d: number; level: number; hw: number } | null {
    if (!this.rivers.length) return null;
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let bd = Infinity, bl = 0, bw = 0;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const l = this.rgrid.get((cx + i) * 100003 + (cz + j));
      if (!l) continue;
      for (const { r, k } of l) {
        const R = this.rivers[r];
        for (const k2 of [k - 1, k]) {
          if (k2 < 0 || k2 + 1 >= R.pts.length) continue;
          const a = R.pts[k2], b = R.pts[k2 + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
          const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
          const d = Math.hypot(x - (a.x + dx * u), z - (a.z + dz * u));
          if (d < bd) { bd = d; bl = a.level + (b.level - a.level) * u; bw = (R.width / 2) * (a.k + (b.k - a.k) * u); }
        }
      }
    }
    return bd < Infinity ? { d: bd, level: bl, hw: bw } : null;
  }

  /** Distance à la voie la plus proche (toutes voies), altitude de la voie, et facteurs tunnel / pont de ce point de la voie. */
  nearest(x: number, z: number): { d: number; y: number; tf: number; bf: number } {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let bd = Infinity, bg: Guide | null = null;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const l = this.grid.get((cx + i) * 100003 + (cz + j));
      if (!l) continue;
      for (const p of l) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; bg = p; } }
    }
    return { d: Math.sqrt(bd), y: bg?.y ?? 0, tf: bg?.tf ?? 0, bf: bg?.bf ?? 0 };
  }

  /** Vrai si (x,z) est en mer (ou à moins de m mètres du rivage). */
  inSea(x: number, z: number, m = 0) { return inSea(this.sea, x, z, m); }

  /** Relief sans la voie : naturel + zones plates + rivières. */
  natural(x: number, z: number): number {
    let h = this.net.raw(x, z);
    const rv = this.riverNear(x, z);
    // vallée : le relief ne peut pas s'élever plus vite que VALLEY m par mètre depuis la berge (évite une gorge étroite quand la rivière traverse une colline)
    if (rv) h = Math.min(h, rv.level - CHANNEL + Math.max(0, rv.d - rv.hw) * VALLEY);
    for (const q of this.zones) {
      const w = 1 - sm((Math.hypot(x - q.x, z - q.z) - q.r * 0.8) / (q.r * 0.7));
      h += (q.y - 0.3 - h) * w;
    }
    for (const f of this.flats) {
      const dx = x - f.x, dz = z - f.z, p = Math.abs(dx * f.ux + dz * f.uz), q = Math.abs(-dx * f.uz + dz * f.ux);
      const d = Math.hypot(Math.max(0, p - f.hl), Math.max(0, q - f.hw));
      if (d < f.fade) h += (f.y - h) * (1 - sm(d / f.fade));
    }
    if (this.sea) h = seaShape(this.sea, h, seaS(this.sea, x, z));
    if (rv) {
      const w = 1 - sm((rv.d - rv.hw) / BANK);
      h += (rv.level - CHANNEL - h) * w;
    }
    return h;
  }

  height(x: number, z: number): number {
    const h = this.natural(x, z);
    const n = this.nearest(x, z);
    const w = 1 - sm((n.d - this.flatR) / (this.fadeR - this.flatR));
    const rv = this.riverNear(x, z);
    // le remblai (et la butte de tunnel) s'efface vers la rivière : le lit et ses berges restent libres ; la plateforme de la voie elle-même reste intacte
    const clear = rv ? sm((rv.d - rv.hw - 2) / 50) : 1, bed = (1 - sm((n.d - 8) / 14)) * (rv ? sm((rv.d - rv.hw) / 5) : 1), wt = Math.max(w * clear, bed);
    let g = h + (n.y - 0.25 - h) * wt;                        // terrassement : talus ou déblai
    if (n.bf > 0) g += (h - g) * n.bf;                        // pont : le sol reste naturel sous le tablier
    if (n.tf > 0) {                                           // tunnel : une butte couvre la voie
      const mound = h + Math.max(0, n.y + 9 - h) * (1 - sm(n.d / 45));
      g += (mound - g) * n.tf * Math.max(clear, bed);
    }
    return g;
  }
}
