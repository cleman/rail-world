import { riverPath, type Terrain } from './terrain';
import { nearestDist } from './planning';

/**
 * Mer : une côte (ligne ondulée) sur un côté du monde. `s` = distance signée à la côte vers le large (s > 0 : côté mer).
 * Le relief est aplani vers la côte puis plonge sous le niveau de la mer ; la surface de l'eau est un plan à `level`.
 */
export interface Sea { ux: number; uz: number; c0: number; level: number; amp: number; ph: number }
/** Largeur (m) sur laquelle la terre descend vers la côte. */
export const SEA_BAND = 300;
const sm = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

/** Distance signée à la côte (positive en mer). */
export function seaS(sea: Sea, x: number, z: number): number {
  const a = -x * sea.uz + z * sea.ux;
  return x * sea.ux + z * sea.uz - sea.c0 - sea.amp * (0.6 * Math.sin(a / 310 + sea.ph) + 0.4 * Math.sin(a / 131 + sea.ph * 1.7));
}
/** Relief final au point de coordonnée côtière s, à partir du relief naturel h. */
export function seaShape(sea: Sea, h: number, s: number): number {
  if (s < -SEA_BAND) return h;
  const w = s > 0 ? 1 : sm((s + SEA_BAND) / SEA_BAND);
  const target = sea.level + 2.2 - 18 * sm(s / 220);
  return h + (target - h) * w;
}
/** Vrai si (x,z) est dans l'eau de mer, ou à moins de m mètres du rivage. */
export function inSea(sea: Sea | null | undefined, x: number, z: number, m = 0): boolean { return !!sea && seaS(sea, x, z) > 40 - m; }

/**
 * Choisit la côte : la direction (parmi 16) qui laisse le plus de terre libre, c'est-à-dire où voies, zones urbaines et rivières
 * (hors lit) sont les plus éloignées du bord. Renvoie null si aucun côté n'a assez de place (< 250 m de mer dans le monde).
 * `t0` est un relief sans mer, servant à situer les zones.
 */
export function planSea(t0: Terrain, guides: { x: number; z: number }[], seed: number, half = 2400, rand: () => number = Math.random): Sea | null {
  let best: { a: number; c0: number } | null = null;
  const off = rand() * Math.PI * 2 / 16;
  for (let k = 0; k < 16; k++) {
    const a = off + (k / 16) * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
    let ext = -1e9;
    for (let i = 0; i < guides.length; i += 3) ext = Math.max(ext, guides[i].x * ux + guides[i].z * uz + 70);
    for (const z of t0.zones) ext = Math.max(ext, z.x * ux + z.z * uz + z.r * 1.25 + 60);
    const c0 = ext + 120 + SEA_BAND + 80;                   // 80 m : marge pour l'ondulation de la côte (amp ≤ 60 m)
    if (c0 > half * 0.98 - 250) continue;                    // il faut au moins ~250 m d'eau dans le monde
    if (!best || c0 < best.c0) best = { a, c0 };
  }
  if (!best) return null;
  const ux = Math.cos(best.a), uz = Math.sin(best.a);
  // niveau : moyenne du relief naturel le long de la bande littorale, un peu plus bas
  let sum = 0, n = 0;
  for (let i = -8; i <= 8; i++) for (const d of [-SEA_BAND * 0.6, -SEA_BAND * 0.2, 0]) {
    const x = ux * (best.c0 + d) - uz * i * 200, z = uz * (best.c0 + d) + ux * i * 200;
    sum += t0.natural(x, z); n++;
  }
  void seed;
  return { ux, uz, c0: best.c0, level: sum / n - 3, amp: 40 + rand() * 20, ph: rand() * 6.28 };
}

/**
 * Affluent : part de la rivière principale, s'en éloigne en serpentant sur ~1,4 km, loin des voies, des zones urbaines, de la mer et de la rivière,
 * et reste au-dessus du niveau d'eau de la jonction. Renvoie le tracé (de l'amont vers la jonction) ou null.
 */
export function planTributary(t: Terrain, guides: { x: number; z: number }[], rand: () => number, half = 2250): { points: [number, number][]; width: number } | null {
  const R = t.rivers[0]; if (!R || R.pts.length < 40) return null;
  const trackD = nearestDist(guides.filter((_, i) => i % 2 === 0), 300);
  for (let tries = 0; tries < 80; tries++) {
    const k = Math.floor(R.pts.length * (0.2 + rand() * 0.6)), p = R.pts[k], q = R.pts[Math.min(R.pts.length - 1, k + 3)], side = rand() < 0.5 ? 1 : -1;
    const tl = Math.hypot(q.x - p.x, q.z - p.z) || 1; let ang = Math.atan2((q.x - p.x) / tl, (q.z - p.z) / tl) + side * (1.1 + rand() * 0.5);
    const pts: [number, number][] = [[p.x, p.z]]; let x = p.x, z = p.z;
    for (let i = 0; i < 6; i++) { ang += (rand() - 0.5) * 0.8; x += Math.sin(ang) * 240; z += Math.cos(ang) * 240; pts.push([x, z]); }
    const path = riverPath(pts, 30); let ok = true;
    path.forEach((s, i) => {
      if (!ok) return;
      if (Math.abs(s.x) > half - 120 || Math.abs(s.z) > half - 120 || trackD(s.x, s.z) < 120 || t.inSea(s.x, s.z, 90)) { ok = false; return; }
      if (t.zones.some(zn => Math.hypot(s.x - zn.x, s.z - zn.z) < zn.r * 1.3 + 70)) { ok = false; return; }
      if (i > 8 && R.pts.some((r, ri) => ri % 3 === 0 && Math.hypot(r.x - s.x, r.z - s.z) < 150)) { ok = false; return; }
      if (i > 6 && t.height(s.x, s.z) < p.level + 0.8) ok = false;
    });
    if (ok) return { points: pts.reverse(), width: 13 + Math.round(rand() * 8) };
  }
  return null;
}
