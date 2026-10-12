// Sport : où l'on s'entraîne. Complexe sportif (stade d'athlétisme, tennis, foot à 5, basket), chemins hors des routes, site de parapente, parcours d'aviron.
// Simulation pure (sans Three.js), déterministe pour une graine.
import type { Terrain } from './terrain';
import type { WorldPlan } from './planning';
import { rng } from './cityplan';

export interface Pt { x: number; z: number }
/** Repère local : origine (x, z) à la hauteur y, axe u tourné de `rot` (u = (cos rot, sin rot), v à sa gauche : (−sin rot, cos rot)). */
export interface Frame { x: number; y: number; z: number; rot: number }
export const toWorld = (f: Frame, u: number, v: number): Pt => { const c = Math.cos(f.rot), s = Math.sin(f.rot); return { x: f.x + c * u - s * v, z: f.z + s * u + c * v }; };
/** Cap monde (atan2(x, z)) d'un vecteur local (hu, hv). */
export const yawOf = (f: Frame, hu: number, hv: number) => { const c = Math.cos(f.rot), s = Math.sin(f.rot); return Math.atan2(c * hu - s * hv, s * hu + c * hv); };
const TAU = Math.PI * 2, mod = (a: number, n: number) => ((a % n) + n) % n;

// ---------------------------------------------------------------------------------------------------------------------------------
// La piste de 400 m (norme : lignes droites de 84,39 m, rayon de 36,8 m au couloir 1, couloirs de 1,22 m)
// ---------------------------------------------------------------------------------------------------------------------------------
export const TRACK = { straight: 84.39, r0: 36.8, lane: 1.22, lanes: 8 };
export const laneR = (i: number) => TRACK.r0 + TRACK.lane * i;
/** Point (u, v) et direction (hu, hv) du couloir `i` à l'abscisse `s` mètres du début de la ligne droite du bas (v < 0), dans le sens trigonométrique. */
export function trackAt(i: number, s: number): { u: number; v: number; hu: number; hv: number } {
  const r = laneR(i), L = TRACK.straight, h = L / 2, arc = Math.PI * r, tot = 2 * L + 2 * arc; s = mod(s, tot);
  if (s < L) return { u: -h + s, v: -r, hu: 1, hv: 0 };
  if (s < L + arc) { const a = (s - L) / r; return { u: h + r * Math.sin(a), v: -r * Math.cos(a), hu: Math.cos(a), hv: Math.sin(a) }; }
  if (s < 2 * L + arc) { const t = s - L - arc; return { u: h - t, v: r, hu: -1, hv: 0 }; }
  const a = (s - 2 * L - arc) / r; return { u: -h - r * Math.sin(a), v: r * Math.cos(a), hu: -Math.cos(a), hv: -Math.sin(a) };
}
export const trackLen = (i: number) => 2 * TRACK.straight + 2 * Math.PI * laneR(i);

// ---------------------------------------------------------------------------------------------------------------------------------
// Complexe sportif
// ---------------------------------------------------------------------------------------------------------------------------------
export type CourtKind = 'tennis' | 'foot' | 'basket';
export interface Court { kind: CourtKind; u: number; v: number; /** longueur (selon u) et largeur (selon v) du terrain de jeu */ len: number; wid: number; surface: number }
export interface Complex {
  f: Frame; name: string; courts: Court[];
  /** centre et demi-dimensions de la plate-forme à aplanir (repère monde) */
  flat: { x: number; z: number; ux: number; uz: number; hl: number; hw: number };
  /** entrée du complexe (repère local) */
  gate: { u: number; v: number };
  /** tribunes : côté v positif */
  stands: { u0: number; u1: number; v0: number; rows: number };
}
export const COURTS: Omit<Court, 'surface'>[] = [
  { kind: 'tennis', u: -72, v: 88, len: 23.77, wid: 10.97 },
  { kind: 'tennis', u: -34, v: 88, len: 23.77, wid: 10.97 },
  { kind: 'foot', u: 18, v: 88, len: 38, wid: 20 },
  { kind: 'basket', u: 70, v: 88, len: 28, wid: 15 },
];

/** Cherche, près de la plus grande ville mais hors de ses rues, un terrain assez plat pour le complexe. */
export function planComplex(terrain: Terrain, wp: WorldPlan, roadD: (x: number, z: number) => number, avoid: { x: number; z: number; r: number }[], seed: number, half = 2250): Complex | null {
  const rand = rng(seed ^ 0x5b027), cities = terrain.zones.filter(z => z.kind === 'city').sort((a, b) => b.r - a.r);
  if (!cities.length) return null;
  const SURF = [0x3d6fb0, 0x4c8a54, 0xbf6b3c];
  for (const city of cities.slice(0, 3)) {
    let best: { f: Frame; score: number } | null = null;
    for (let g = 0; g < 700; g++) {
      const a = rand() * TAU, d = city.r * (1.25 + rand() * 0.9) + 80, rot = rand() * Math.PI;
      const x = city.x + Math.cos(a) * d, z = city.z + Math.sin(a) * d;
      if (Math.abs(x) > half - 220 || Math.abs(z) > half - 220) continue;
      const f: Frame = { x, y: 0, z, rot };
      let lo = 1e9, hi = -1e9, sum = 0, n = 0, bad = false;
      for (let u = -112; u <= 112 && !bad; u += 28) for (let v = -66; v <= 112; v += 25) {
        const p = toWorld(f, u, v);
        if (wp.zoneRatio(p.x, p.z) < 1.08 || wp.trackD(p.x, p.z) < 40 || roadD(p.x, p.z) < 26 || wp.riverD(p.x, p.z) < 35 || wp.inLake(p.x, p.z, 40)) { bad = true; break; }
        const h = terrain.height(p.x, p.z); lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
      }
      if (bad || hi - lo > 6 || avoid.some(q => Math.hypot(q.x - x, q.z - z) < q.r + 170)) continue;
      const score = -(hi - lo) * 2 - d * 0.02 + rand();
      if (!best || score > best.score) best = { f: { ...f, y: sum / n }, score };
    }
    if (best) {
      const f = best.f, c = toWorld(f, 0, 22);
      return {
        f, name: 'Complexe sportif de ' + (city.name ?? 'la ville'), courts: COURTS.map((c0, i) => ({ ...c0, surface: c0.kind === 'tennis' ? SURF[i % 3 === 1 ? 2 : 0] : c0.kind === 'foot' ? 0x4d9a4e : 0xc8663a })),
        flat: { x: c.x, z: c.z, ux: Math.cos(f.rot), uz: Math.sin(f.rot), hl: 112, hw: 90 }, gate: { u: 0, v: -66 }, stands: { u0: -58, u1: 58, v0: 52, rows: 7 },
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Chemins hors des routes
// ---------------------------------------------------------------------------------------------------------------------------------
export interface Trail { kind: 'sentier' | 'parc' | 'accès'; pts: Pt[]; closed: boolean; width: number; name: string }
export const trailLen = (t: Trail) => { let l = 0; for (let i = 1; i < t.pts.length; i++) l += Math.hypot(t.pts[i].x - t.pts[i - 1].x, t.pts[i].z - t.pts[i - 1].z); if (t.closed && t.pts.length > 1) l += Math.hypot(t.pts[0].x - t.pts[t.pts.length - 1].x, t.pts[0].z - t.pts[t.pts.length - 1].z); return l; };

/** Rééchantillonne une polyligne tous les `step` mètres. */
export function densify(pts: Pt[], closed: boolean, step = 6): Pt[] {
  const out: Pt[] = [], n = pts.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % n], k = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / step)); for (let j = 0; j < k; j++) out.push({ x: a.x + ((b.x - a.x) * j) / k, z: a.z + ((b.z - a.z) * j) / k }); }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
/** Courbe fermée lisse (Catmull-Rom) par des points de contrôle. */
export function smoothClosed(c: Pt[], per = 6): Pt[] {
  const n = c.length, out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = c[(i + n - 1) % n], p1 = c[i], p2 = c[(i + 1) % n], p3 = c[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t, f = (a: number, b: number, c2: number, d: number) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  return out;
}

export function planTrails(terrain: Terrain, wp: WorldPlan, roadD: (x: number, z: number) => number, complex: Complex | null, seed: number, half = 2250): Trail[] {
  const rand = rng(seed ^ 0x7a11), out: Trail[] = [];
  const dry = (x: number, z: number) => Math.abs(x) < half - 30 && Math.abs(z) < half - 30 && !wp.inLake(x, z, 6) && wp.riverD(x, z) > 7 && wp.trackD(x, z) > 24 && (!terrain.sea || terrain.height(x, z) > terrain.sea.level + 1.2);
  const gentle = (a: Pt, b: Pt) => Math.abs(terrain.height(b.x, b.z) - terrain.height(a.x, a.z)) / Math.max(1, Math.hypot(b.x - a.x, b.z - a.z)) < 0.28;
  const okLine = (pts: Pt[], closed: boolean) => { const d = densify(pts, closed, 8); return d.every((p, i) => dry(p.x, p.z) && (i === 0 || gentle(d[i - 1], p))); };
  let no = 0;
  for (const city of terrain.zones.filter(z => z.kind === 'city')) {
    const loops = city.r > 260 ? 2 : 1;
    for (let k = 0; k < loops; k++) {
      let done = false;
      for (let tries = 0; tries < 60 && !done; tries++) {
        const a = rand() * TAU, R = 190 + rand() * 260, d = city.r * 1.05 + R * 0.8 + 40, cx = city.x + Math.cos(a) * d, cz = city.z + Math.sin(a) * d, ex = 0.6 + rand() * 0.5, rot = rand() * Math.PI;
        const ctl: Pt[] = []; for (let i = 0; i < 12; i++) { const b = (i / 12) * TAU, rr = R * (0.8 + rand() * 0.4), px = Math.cos(b) * rr, pz = Math.sin(b) * rr * ex; ctl.push({ x: cx + px * Math.cos(rot) - pz * Math.sin(rot), z: cz + px * Math.sin(rot) + pz * Math.cos(rot) }); }
        const loop = smoothClosed(ctl, 5);
        if (!okLine(loop, true) || loop.some(p => wp.zoneRatio(p.x, p.z) < 1.02)) continue;
        // départ : le point de la boucle le plus proche de la ville, relié en ligne droite au bord de la zone
        let bi = 0, bd = 1e9; loop.forEach((p, i) => { const q = Math.hypot(p.x - city.x, p.z - city.z); if (q < bd) { bd = q; bi = i; } });
        const s = loop[bi], dx = city.x - s.x, dz = city.z - s.z, dl = Math.hypot(dx, dz), e = { x: s.x + (dx / dl) * (dl - city.r * 0.97), z: s.z + (dz / dl) * (dl - city.r * 0.97) };
        const link = [e, s];
        if (!okLine(link, false)) continue;
        no++; out.push({ kind: 'sentier', pts: loop, closed: true, width: 2.4, name: `Boucle ${city.name ?? 'de la ville'} ${no}` });
        out.push({ kind: 'sentier', pts: densify(link, false, 6), closed: false, width: 2.4, name: `Accès ${city.name ?? ''}` });
        done = true;
      }
    }
  }
  for (const pl of wp.plans) for (const pk of pl.parks) {
    if (pk.r < 26) continue;
    const ctl: Pt[] = Array.from({ length: 10 }, (_, i) => { const b = (i / 10) * TAU, rr = pk.r * (0.68 + 0.06 * Math.sin(i * 2.3)); return { x: pk.x + Math.cos(b) * rr, z: pk.z + Math.sin(b) * rr }; });
    out.push({ kind: 'parc', pts: smoothClosed(ctl, 4), closed: true, width: 2.2, name: 'Allée du parc' });
  }
  if (complex) {
    const g = toWorld(complex.f, complex.gate.u, complex.gate.v - 6), city = terrain.zones.filter(z => z.kind === 'city').sort((a, b) => Math.hypot(a.x - g.x, a.z - g.z) - Math.hypot(b.x - g.x, b.z - g.z))[0];
    if (city) {
      const dx = city.x - g.x, dz = city.z - g.z, dl = Math.hypot(dx, dz), e = { x: g.x + (dx / dl) * (dl - city.r * 0.95), z: g.z + (dz / dl) * (dl - city.r * 0.95) };
      const link = [g, e]; if (okLine(link, false) || true) out.push({ kind: 'accès', pts: densify(link, false, 6), closed: false, width: 3.2, name: 'Allée du stade' });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Parapente : une colline, un décollage face à la pente, un atterrissage en contrebas
// ---------------------------------------------------------------------------------------------------------------------------------
export interface GliderSite { launch: { x: number; y: number; z: number }; land: { x: number; y: number; z: number }; /** direction (rad) vers laquelle la pente descend */ down: number; ridge: Pt }
export function planGliderSite(terrain: Terrain, wp: WorldPlan, roadD: (x: number, z: number) => number, seed: number, half = 2250): GliderSite | null {
  const rand = rng(seed ^ 0x9a7a);
  let best: { x: number; z: number; score: number } | null = null;
  for (let g = 0; g < 1600; g++) {
    const x = (rand() * 2 - 1) * (half - 700), z = (rand() * 2 - 1) * (half - 700), h = terrain.height(x, z);
    if (wp.zoneRatio(x, z) < 1.4 || wp.trackD(x, z) < 90 || roadD(x, z) < 40 || wp.inLake(x, z, 80)) continue;
    let lo = 1e9; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; lo = Math.min(lo, terrain.height(x + Math.cos(a) * 700, z + Math.sin(a) * 700)); }
    const score = h - lo; if (score > 25 && (!best || score > best.score)) best = { x, z, score };
  }
  if (!best) return null;
  // sommet local : on monte le long du gradient
  let { x, z } = best;
  for (let k = 0; k < 40; k++) {
    const e = 12, gx = terrain.height(x + e, z) - terrain.height(x - e, z), gz = terrain.height(x, z + e) - terrain.height(x, z - e), l = Math.hypot(gx, gz); if (l < 0.05) break;
    x += (gx / l) * 10; z += (gz / l) * 10;
  }
  const e = 25, gx = terrain.height(x + e, z) - terrain.height(x - e, z), gz = terrain.height(x, z + e) - terrain.height(x, z - e), down = Math.atan2(-gz, -gx);
  // décollage : un peu sous le sommet, côté pente ; atterrissage : le terrain le plus plat à 600–1000 m, dans la direction de la pente
  const lx = x + Math.cos(down) * 28, lz = z + Math.sin(down) * 28;
  let land: { x: number; y: number; z: number; s: number } | null = null;
  for (let g = 0; g < 300; g++) {
    const d = 550 + rand() * 500, a = down + (rand() - 0.5) * 1.3, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (Math.abs(px) > half - 60 || Math.abs(pz) > half - 60 || wp.zoneRatio(px, pz) < 1.2 || wp.trackD(px, pz) < 60 || wp.inLake(px, pz, 40) || wp.riverD(px, pz) < 30) continue;
    const h = terrain.height(px, pz); let lo = h, hi = h; for (let i = 0; i < 8; i++) { const b = (i / 8) * TAU, q = terrain.height(px + Math.cos(b) * 40, pz + Math.sin(b) * 40); lo = Math.min(lo, q); hi = Math.max(hi, q); }
    const s = -(hi - lo) - (h > terrain.height(lx, lz) - 30 ? 20 : 0) + rand();
    if (!land || s > land.s) land = { x: px, y: h, z: pz, s };
  }
  if (!land) return null;
  return { launch: { x: lx, y: terrain.height(lx, lz), z: lz }, land: { x: land.x, y: land.y, z: land.z }, down, ridge: { x, z } };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Aviron : tronçons de rivière et ovales sur les lacs
// ---------------------------------------------------------------------------------------------------------------------------------
export interface RowCourse { name: string; pts: Pt[]; closed: boolean; level: number; width: number; levelAt: (x: number, z: number) => number }
export function planRowing(terrain: Terrain, wp: WorldPlan, seed: number): RowCourse[] {
  const rand = rng(seed ^ 0x40a7), out: RowCourse[] = [];
  for (const rv of terrain.rivers) {
    if (rv.width < 13 || rv.pts.length < 12) continue;
    const n = rv.pts.length, i0 = Math.floor(n * (0.35 + rand() * 0.3)), seg: Pt[] = []; let len = 0;
    for (let i = i0; i < n && len < 700; i++) { seg.push({ x: rv.pts[i].x, z: rv.pts[i].z }); if (i > i0) len += Math.hypot(rv.pts[i].x - rv.pts[i - 1].x, rv.pts[i].z - rv.pts[i - 1].z); }
    if (len > 300) out.push({ name: rv.name, pts: densify(seg, false, 8), closed: false, level: rv.pts[i0].level, width: rv.width, levelAt: (x, z) => terrain.riverNear(x, z)?.level ?? rv.pts[i0].level });
  }
  wp.lakes.forEach((L, li) => {
    if (L.r < 120) return;
    for (let tr = 0, R = L.r * 0.62; tr < 6; tr++, R *= 0.88) {
      const pts: Pt[] = Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * TAU; return { x: L.x + Math.cos(a) * R, z: L.z + Math.sin(a) * R * 0.7 }; });
      if (pts.every(p => terrain.height(p.x, p.z) < L.level - 1.2)) { out.push({ name: `Lac ${li + 1}`, pts, closed: true, level: L.level, width: 40, levelAt: () => L.level }); break; }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Horaires
// ---------------------------------------------------------------------------------------------------------------------------------
const g = (h: number, c: number, w: number) => Math.exp(-((h - c) ** 2) / (2 * w * w));
/** Part de joggeurs dehors selon l'heure : pointes du matin, de midi et du soir, quelques-uns le reste du temps. */
export function jogLevel(h: number): number { return Math.min(1, 0.05 + 0.55 * g(h, 7, 0.9) + 0.45 * g(h, 12.6, 0.7) + 1.0 * g(h, 18.4, 1.2) + 0.2 * g(h, 21, 1.2)); }
/** Cyclistes : trajets domicile-travail et sorties du week-end. */
export function bikeLevel(h: number, weekend: boolean): number { return Math.min(1, (weekend ? 0.15 + 0.9 * g(h, 10.5, 2.4) + 0.4 * g(h, 16, 2) : 0.08 + 0.7 * g(h, 8, 1) + 0.6 * g(h, 17.8, 1.3) + 0.25 * g(h, 12.5, 1))); }
/** Le jour du monde est-il un jour de week-end ? (le jour 0 est un lundi) */
export const weekday = (day: number) => ((Math.floor(day) % 7) + 7) % 7;
export const isWeekend = (day: number) => weekday(day) >= 5;
export const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
