import type { RoadNet } from './roads';
import type { CityPlan } from './cityplan';
import type { Figure } from './streetlife';
import { activity } from './pedestrians';

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fig = (kind: number, phase = 0): Figure => ({ x: 0, y: 0, z: 0, hx: 0, hz: 1, phase, pause: 0, kind });

/** Un étal de marché : position, cap (face au chaland) et couleur d'auvent. */
export interface Stall { x: number; y: number; z: number; yaw: number; color: number }
/** Une table de terrasse (avec parasol) et ses deux chaises. */
export interface Table { x: number; y: number; z: number; yaw: number }
interface Seat extends Figure { table: number; slot: number; from: number; until: number }
interface Shopper extends Figure { cx: number; cz: number; r: number; a: number; w: number; wait: number; mk: number }
/** Un passage piéton : de A à B en travers de la chaussée, au niveau y. */
export interface Crossing { ax: number; az: number; bx: number; bz: number; y: number }
interface Crosser extends Figure { c: Crossing; t: number; dir: 1 | -1; wait: number }
interface Pupil extends Figure { sx: number; sz: number; dx: number; dz: number; mode: 0 | 1; wait: number; ph: number; offs: number }

/** Un lieu de vie : un parc de ville où se tiennent marché, terrasses et, à côté, l'école. */
export interface Place { x: number; y: number; z: number; r: number; market: boolean; stalls: Stall[]; tables: Table[]; school: { x: number; y: number; z: number; tx: number; tz: number } | null; village: boolean }

/** Quel marché ce jour-là ? Le marché tient de 7 h à 13 h, plus calme à la fin. */
export function marketLevel(hour: number): number { return hour < 6.8 || hour > 13.5 ? 0 : hour < 8 ? (hour - 6.8) / 1.2 : hour > 12.5 ? (13.5 - hour) : 1; }
/** Écoliers dehors : à l'arrivée du matin (8 h – 8 h 40) et à la sortie du soir (16 h 15 – 17 h 15), un peu à midi. */
export function schoolLevel(hour: number): { arrive: number; leave: number } {
  const g = (c: number, w: number) => Math.exp(-((hour - c) ** 2) / (2 * w * w));
  return { arrive: g(8.3, 0.28), leave: g(16.7, 0.4) };
}

/**
 * Vie quotidienne des villes, première version. Simulation pure : à partir des parcs des plans de ville,
 * installe un marché (étals + chalands qui flânent, le matin), des terrasses de café (clients assis en journée,
 * hors pluie) et une sortie d'école (groupes d'enfants qui arrivent / repartent aux heures de classe).
 */
export class DailyLife {
  readonly places: Place[] = [];
  readonly list: Figure[] = [];
  private seats: Seat[] = []; private shoppers: Shopper[] = []; private pupils: Pupil[] = []; private crossers: Crosser[] = [];
  private r: () => number;
  /** chalands et écoliers visibles (pour les tests) */
  counts = { seated: 0, shoppers: 0, pupils: 0, crossing: 0 };

  constructor(plans: CityPlan[], ground: (x: number, z: number) => number, seed = 77, crossings: Crossing[] = []) {
    this.r = rng(seed); const r = this.r, COL = [0xc23b32, 0x2f6fb5, 0xe0a82e, 0x3f9a5c, 0xd9d4c4, 0xb7569a];
    for (const p of plans) {
      if (p.village) continue;
      for (const pk of p.parks) {
        if (pk.r < 28) continue;
        const y = ground(pk.x, pk.z), pl: Place = { x: pk.x, y, z: pk.z, r: pk.r, market: this.places.length % 2 === 0 || pk.r > 40, stalls: [], tables: [], school: null, village: false };
        // étals : un anneau ouvert au milieu du parc, tournés vers le centre
        if (pl.market) {
          const n = Math.max(4, Math.min(10, Math.round(pk.r / 5))), R = pk.r * 0.5;
          for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + 0.3, x = pk.x + Math.cos(a) * R, z = pk.z + Math.sin(a) * R; pl.stalls.push({ x, y: ground(x, z), z, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), color: COL[Math.floor(r() * COL.length)] }); }
          for (let i = 0; i < n * 2; i++) { const a = r() * 6.283, d = r() * pk.r * 0.35; this.shoppers.push({ ...fig(Math.floor(r() * 6), r() * 6), cx: pk.x, cz: pk.z, r: pk.r * 0.78, a, w: 0, wait: r() * 6, mk: this.places.length, x: pk.x + Math.cos(a) * d, y, z: pk.z + Math.sin(a) * d }); }
        }
        // terrasses : tables au bord du parc, le long de la rue la plus proche (si elle est bien là), visage vers le parc
        const nt = 3 + Math.floor(r() * 3), a0 = r() * 6.283;
        for (let i = 0; i < nt; i++) {
          const a = a0 + i * 0.42, x = pk.x + Math.cos(a) * (pk.r * 0.86), z = pk.z + Math.sin(a) * (pk.r * 0.86), t: Table = { x, y: ground(x, z), z, yaw: a };
          pl.tables.push(t); const ti = this.tablesCount() + pl.tables.length - 1;
          for (let k = 0; k < 2; k++) this.seats.push({ ...fig(Math.floor(r() * 6)), table: ti, slot: k, from: 8.5 + r() * 3, until: 15 + r() * 8.5, x: 0, y: 0, z: 0, pause: 1, sit: true });
        }
        // école : à l'arrière d'un parc sur deux, un portail et un groupe d'enfants
        if (this.places.length % 2 === 1) {
          const a = a0 + 3.1, x = pk.x + Math.cos(a) * (pk.r + 6), z = pk.z + Math.sin(a) * (pk.r + 6);
          pl.school = { x, y: ground(x, z), z, tx: -Math.cos(a), tz: -Math.sin(a) };
          for (let k = 0; k < 9; k++) { const b = a + (r() - 0.5) * 2.4, d = pk.r * (0.55 + r() * 0.5); this.pupils.push({ ...fig(Math.floor(r() * 6), r() * 6), sx: x, sz: z, dx: pk.x + Math.cos(b) * d, dz: pk.z + Math.sin(b) * d, mode: 0, wait: r() * 3, ph: r(), offs: r() * 6, x, y: pl.school.y + 0.15, z, size: 0.72 }); }
        }
        this.places.push(pl);
      }
    }
    // piétons qui traversent aux passages : un ou deux par passage (au plus 60), selon l'heure
    crossings.slice(0, 60).forEach((c, i) => { for (let k = 0; k < 1 + (i % 2); k++) this.crossers.push({ ...fig(Math.floor(r() * 6), r() * 6), c, t: r() < 0.5 ? 0 : 1, dir: r() < 0.5 ? 1 : -1, wait: r() * 20, x: c.ax, y: c.y, z: c.az }); });
  }

  private tablesCount(): number { let n = 0; for (const p of this.places) n += p.tables.length; return n; }
  private tableAt(i: number): Table | null { for (const p of this.places) { if (i < p.tables.length) return p.tables[i]; i -= p.tables.length; } return null; }

  /** `rain` entre 0 et 1 (la terrasse se vide sous la pluie, le marché aussi). */
  step(dt: number, hour: number, rain = 0, vehicles: { x: number; z: number }[] = []) {
    const L = this.list; L.length = 0; const r = this.r;
    const dry = rain < 0.25;
    // --- terrasses
    this.counts.seated = 0;
    for (const s of this.seats) {
      const t = this.tableAt(s.table); if (!t) continue;
      if (!dry || hour < s.from || hour > s.until) continue;
      const side = s.slot ? 1 : -1, c = Math.cos(t.yaw), n = Math.sin(t.yaw);
      s.x = t.x + n * side * 0.75; s.z = t.z + c * side * 0.75; s.y = t.y;       // sur la chaise (même repère que dailyview.ts), face à la table
      s.hx = -n * side; s.hz = -c * side; s.pause = 1; s.phase = 0; L.push(s); this.counts.seated++;
    }
    // --- passages piétons : on attend au bord tant qu'un véhicule approche
    const act = activity(hour) * (dry ? 1 : 0.5), nc = Math.round(this.crossers.length * act); this.counts.crossing = 0;
    for (let i = 0; i < nc; i++) {
      const w = this.crossers[i], c = w.c, len = Math.hypot(c.bx - c.ax, c.bz - c.az) || 1;
      if (w.wait > 0) { w.wait -= dt; w.pause = 1; }
      else {
        const mx = (c.ax + c.bx) / 2, mz = (c.az + c.bz) / 2; let busy = false;
        if (w.t === 0 || w.t === 1) for (const v of vehicles) if ((v.x - mx) ** 2 + (v.z - mz) ** 2 < 16 * 16) { busy = true; break; }
        if (busy) { w.pause = 1; }
        else {
          w.pause = 0; if (w.t === 0) w.dir = 1; else if (w.t === 1) w.dir = -1;
          w.t = Math.max(0, Math.min(1, w.t + w.dir * (1.3 / len) * dt)); w.phase += dt * 5.5;
          if (w.t === 0 || w.t === 1) w.wait = 5 + r() * 25;
        }
      }
      w.x = c.ax + (c.bx - c.ax) * w.t; w.z = c.az + (c.bz - c.az) * w.t; w.y = c.y + 0.12; w.hx = (c.bx - c.ax) * (w.t === 1 ? -1 : w.t === 0 ? 1 : w.dir); w.hz = (c.bz - c.az) * (w.t === 1 ? -1 : w.t === 0 ? 1 : w.dir);
      L.push(w); this.counts.crossing++;
    }
    // --- marché
    const ml = dry ? marketLevel(hour) : 0; this.counts.shoppers = 0;
    for (let wi = 0; wi < this.shoppers.length; wi++) {
      const w = this.shoppers[wi], pl = this.places[w.mk]; if (!pl || ml <= 0) continue;
      if (wi % 4 >= Math.ceil(ml * 4)) continue;
      if (w.wait > 0) { w.wait -= dt; w.pause = 1; }
      else {
        w.pause = 0; const tx = pl.x + Math.cos(w.a) * pl.r * 0.62, tz = pl.z + Math.sin(w.a) * pl.r * 0.62, dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
        if (d < 1.2) { w.wait = 2 + r() * 7; w.a = r() * 6.283; w.hx = Math.cos(w.a); w.hz = Math.sin(w.a); }
        else { w.x += (dx / d) * 1.0 * dt; w.z += (dz / d) * 1.0 * dt; w.hx = dx; w.hz = dz; w.phase += dt * 7; }
      }
      w.y = pl.y + 0.15; L.push(w); this.counts.shoppers++;
    }
    // --- école : arrivée du matin (de la rue vers le portail), sortie du soir (du portail vers la rue)
    const sl = schoolLevel(hour), want = Math.max(sl.arrive, sl.leave); this.counts.pupils = 0;
    for (const p of this.pupils) {
      const toward = sl.arrive > sl.leave;
      if (want < 0.12) { p.x = toward ? p.dx : p.sx; p.z = toward ? p.dz : p.sz; continue; }   // pas d'élève hors des heures : tous « à l'intérieur »
      if (p.wait > 0) { p.wait -= dt; p.pause = 1; }
      else {
        p.pause = 0; const gx = toward ? p.sx : p.dx, gz = toward ? p.sz : p.dz, dx = gx - p.x, dz = gz - p.z, d = Math.hypot(dx, dz);
        if (d < 1.5) { p.wait = 1 + r() * 3; p.x = toward ? p.dx : p.sx; p.z = toward ? p.dz : p.sz; }
        else { const v = 1.5 + 0.6 * Math.sin(p.offs + hour * 200); p.x += (dx / d) * v * dt; p.z += (dz / d) * v * dt; p.hx = dx; p.hz = dz; p.phase += dt * 10; }
      }
      if (Math.hypot(p.x - p.sx, p.z - p.sz) > 1.5) { L.push(p); this.counts.pupils++; }
    }
  }
}

/** Passages piétons : à chaque carrefour de rues de ville (au moins 3 branches), un passage sur les branches assez longues, à 7 m du centre. Renvoie aussi la demi-largeur de chaussée. */
export function planCrossings(roads: RoadNet, max = 140, seed = 5): { crossings: Crossing[]; hw: number[] } {
  const r = rng(seed), all: { c: Crossing; hw: number }[] = [];
  for (const n of roads.nodes) {
    const es = n.edges.filter(e => !e.render && e.poly.len > 22 && e.hw < 6);
    if (es.length < 3 || n.crossing) continue;
    for (const e of es) {
      const atA = e.a === n, s = atA ? 7 : e.poly.len - 7, p = e.poly.at(s), off = e.hw + 0.65, nx = -p.tz, nz = p.tx;
      all.push({ c: { ax: p.x + nx * off, az: p.z + nz * off, bx: p.x - nx * off, bz: p.z - nz * off, y: p.y }, hw: e.hw });
    }
  }
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  const pick = all.slice(0, max);
  return { crossings: pick.map(a => a.c), hw: pick.map(a => a.hw) };
}
