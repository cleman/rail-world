import type { Network } from './network';
import type { Terrain } from './terrain';
import { planCity, rng, type CityPlan, type Env } from './cityplan';

export interface Lake { x: number; z: number; r: number; level: number }

/** Distance au plus proche d'un ensemble de points (grille de cellules de 100 m), plafonnée à `cap`. */
export function nearestDist(pts: { x: number; z: number }[], cap: number) {
  const cell = 100, grid = new Map<number, { x: number; z: number }[]>();
  for (const p of pts) { const k = Math.floor(p.x / cell) * 100003 + Math.floor(p.z / cell), l = grid.get(k); if (l) l.push(p); else grid.set(k, [p]); }
  const rad = Math.ceil(cap / cell);
  return (x: number, z: number) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let best = cap * cap;
    for (let i = -rad; i <= rad; i++) for (let j = -rad; j <= rad; j++) {
      const l = grid.get((cx + i) * 100003 + (cz + j));
      if (l) for (const p of l) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) best = d; }
    }
    return Math.sqrt(best);
  };
}

/** Ce qui est décidé avant de construire quoi que ce soit : plans des villes, lac, fonctions de distance. */
export interface WorldPlan {
  plans: CityPlan[];
  /** Premier (et plus grand) lac, ou null. */
  lake: Lake | null;
  /** Tous les lacs du monde (jusqu'à 3). */
  lakes: Lake[];
  trackD(x: number, z: number): number;
  riverD(x: number, z: number): number;
  zoneRatio(x: number, z: number): number;
  inLake(x: number, z: number, m: number): boolean;
  env: Env;
}

export function planWorld(net: Network, terrain: Terrain): WorldPlan {
  const trackD = nearestDist(net.guides.filter((_, i) => i % 2 === 0), 400);
  const riverD = (x: number, z: number) => { const r = terrain.riverNear(x, z); return r ? r.d - r.hw - 2.5 : 1e9; };
  const zoneRatio = (x: number, z: number) => Math.min(1e9, ...terrain.zones.map(q => Math.hypot(x - q.x, z - q.z) / q.r));
  // franchissements : passage à niveau loin des gares, dépôts, aiguillages et ouvrages (une seule ligne coupée) ; pont-route pour traverser les emprises de gare
  const keepPts: { x: number; z: number }[] = [], hallPts: { x: number; z: number }[] = [];
  for (const e of net.edges) {
    if (e.kind === 'plat' || e.kind === 'depot' || e.kind === 'ramp') for (let i = 0; i < e.pts.length; i += 2) keepPts.push(e.pts[i]);
    if (e.kind === 'plat' || e.kind === 'depot') for (let i = 0; i < e.pts.length; i += 2) hallPts.push(e.pts[i]);
  }
  for (const l of net.lines) for (const st of l.structures) for (let k = 0; k < st.n; k += 2) { const p = l.center[(st.i0 + k) % l.center.length]; keepPts.push(p); hallPts.push(p); }
  const keepD = nearestDist(keepPts, 200), hallD = nearestDist(hallPts, 200);
  const axes: { a: { x: number; z: number }; b: { x: number; z: number } }[] = [];
  for (const l of net.lines) { const n = l.center.length; for (let i = 0; i < (l.closed ? n : n - 1); i++) axes.push({ a: l.center[i], b: l.center[(i + 1) % n] }); }
  const along = (ax: number, az: number, bx: number, bz: number, f: (x: number, z: number) => boolean) => { for (let k = 0; k <= 8; k++) if (!f(ax + ((bx - ax) * k) / 8, az + ((bz - az) * k) / 8)) return false; return true; };
  const crossable = (ax: number, az: number, bx: number, bz: number) => {
    if (!along(ax, az, bx, bz, (x, z) => keepD(x, z) >= 90)) return false;
    const hits: number[] = [];
    for (const s of axes) {
      if (Math.min(s.a.x, s.b.x) > Math.max(ax, bx) + 4 || Math.max(s.a.x, s.b.x) < Math.min(ax, bx) - 4 || Math.min(s.a.z, s.b.z) > Math.max(az, bz) + 4 || Math.max(s.a.z, s.b.z) < Math.min(az, bz) - 4) continue;
      const r1 = bx - ax, r2 = bz - az, s1 = s.b.x - s.a.x, s2 = s.b.z - s.a.z, den = r1 * s2 - r2 * s1;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((s.a.x - ax) * s2 - (s.a.z - az) * s1) / den, u = ((s.a.x - ax) * r2 - (s.a.z - az) * r1) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) hits.push(t * Math.hypot(r1, r2));
    }
    return hits.length === 1 && hits[0] > 20 && hits[0] < Math.hypot(bx - ax, bz - az) - 20;
  };
  const bridgeable = (ax: number, az: number, bx: number, bz: number) => along(ax, az, bx, bz, (x, z) => hallD(x, z) >= 48);
  const axisPts: { x: number; z: number; tx: number; tz: number }[] = [];
  for (const l of net.lines) { const n = l.center.length; for (let i = 0; i < (l.closed ? n : n - 1); i += 4) { const a = l.center[i], b = l.center[Math.min(n - 1, (i + 2) % n)], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1; axisPts.push({ x: a.x, z: a.z, tx: dx / d, tz: dz / d }); } }
  const axisNear = (x: number, z: number, R: number) => axisPts.filter(p => Math.hypot(p.x - x, p.z - z) < R);
  const env: Env = { trackD, riverD, crossable, bridgeable, axisNear };

  // lacs : creux du terrain loin des voies, des zones, des rivières et de la mer ; le plus grand d'abord
  const lakes: Lake[] = [];
  const findLake = (R: number): Lake | null => {
    let best: { x: number; z: number; h: number } | null = null;
    for (let x = -1900; x <= 1900; x += 60) for (let z = -1900; z <= 1900; z += 60) {
      if (trackD(x, z) < R + 70 || zoneRatio(x, z) < 1.5 || riverD(x, z) < R + 30) continue;
      if (terrain.zones.some(q => Math.hypot(x - q.x, z - q.z) < q.r + R + 60) || terrain.inSea(x, z, R + 120)) continue;
      if (lakes.some(l => Math.hypot(x - l.x, z - l.z) < l.r + R + 260)) continue;
      const h = terrain.height(x, z);
      if (!best || h < best.h) best = { x, z, h };
    }
    if (!best) return null;
    let ringMin = 1e9;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      ringMin = Math.min(ringMin, terrain.height(best.x + Math.cos(a) * R, best.z + Math.sin(a) * R));
    }
    const level = Math.min(ringMin - 0.5, best.h + 10);
    return level > best.h + 1 ? { x: best.x, z: best.z, r: R, level } : null;
  };
  for (const R of [250, 190, 150, 130]) { if (lakes.length >= 3) break; const l = findLake(R); if (l) lakes.push(l); }
  const lake = lakes[0] ?? null;
  const inLake = (x: number, z: number, m: number) => lakes.some(l => Math.hypot(x - l.x, z - l.z) < l.r + m) || terrain.inSea(x, z, m);
  const plans = terrain.zones.filter(z => z.kind === 'city' || z.kind === 'village').map(z => planCity(z, rng(Math.round(z.x * 7 + z.z * 13)), env));
  return { plans, lake, lakes, trackD, riverD, zoneRatio, inLake, env };
}
