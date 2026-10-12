// Géométrie pure des cordes (lignes secondaires à double voie qui relient deux points de la boucle) : échantillonnage,
// connexions de Hermite entre la boucle et la corde, découpe, profil en long d'une ligne ouverte.
import type { P2 } from './network';

export interface V2 { x: number; z: number }

/** Spline de Catmull-Rom ouverte (extrémités prolongées par symétrie), rééchantillonnée au pas `step`. */
export function resampleOpen(ctrl: number[][], step: number): { pts: P2[]; step: number } {
  const n = ctrl.length, per = 40, dense: P2[] = [];
  const get = (i: number): number[] => i < 0 ? [2 * ctrl[0][0] - ctrl[1][0], 2 * ctrl[0][1] - ctrl[1][1]] : i >= n ? [2 * ctrl[n - 1][0] - ctrl[n - 2][0], 2 * ctrl[n - 1][1] - ctrl[n - 2][1]] : ctrl[i];
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [get(i - 1), ctrl[i], ctrl[i + 1], get(i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (c: number) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
      dense.push({ x: f(0), y: 0, z: f(1) });
    }
  }
  dense.push({ x: ctrl[n - 1][0], y: 0, z: ctrl[n - 1][1] });
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
  const total = cum[cum.length - 1], N = Math.max(3, Math.round(total / step) + 1), pts: P2[] = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = (i * total) / (N - 1);
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const u = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    pts.push({ x: dense[j].x + (dense[j + 1].x - dense[j].x) * u, y: 0, z: dense[j].z + (dense[j + 1].z - dense[j].z) * u });
  }
  return { pts, step: total / (N - 1) };
}

/** Tangentes unitaires et normales à gauche d'une ligne ouverte (voisins bornés aux extrémités). */
export function frames(Q: V2[]): { t: V2; n: V2 }[] {
  const N = Q.length;
  return Q.map((_, i) => {
    const a = Q[Math.max(0, i - 1)], b = Q[Math.min(N - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { t: { x: dx / l, z: dz / l }, n: { x: -dz / l, z: dx / l } };
  });
}

/** Courbe de Hermite de p0 (tangente t0) à p1 (tangente t1), altitude linéaire. */
export function hermite(p0: V2, t0: V2, p1: V2, t1: V2, y0: number, y1: number, step = 4): P2[] {
  const L = Math.hypot(p1.x - p0.x, p1.z - p0.z), m = L * 0.9, n = Math.max(8, Math.ceil(L / step)), out: P2[] = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    out.push({ x: h00 * p0.x + h10 * m * t0.x + h01 * p1.x + h11 * m * t1.x, y: y0 + (y1 - y0) * u, z: h00 * p0.z + h10 * m * t0.z + h01 * p1.z + h11 * m * t1.z });
  }
  return out;
}

export function polyLen(pts: V2[]): number { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return s; }

/** Découpe une polyligne aux abscisses d0 < d1 : trois morceaux qui partagent leurs extrémités. */
export function cutPoly(pts: P2[], d0: number, d1: number): [P2[], P2[], P2[]] {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const at = (d: number): P2 => {
    let j = 0; while (j < pts.length - 2 && cum[j + 1] < d) j++;
    const u = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    return { x: pts[j].x + (pts[j + 1].x - pts[j].x) * u, y: pts[j].y + (pts[j + 1].y - pts[j].y) * u, z: pts[j].z + (pts[j + 1].z - pts[j].z) * u };
  };
  const a = at(d0), b = at(d1), p0: P2[] = [], p1: P2[] = [a], p2: P2[] = [b];
  pts.forEach((p, i) => { if (cum[i] < d0 - 1e-6) p0.push(p); else if (cum[i] > d1 + 1e-6) p2.push(p); else if (cum[i] > d0 + 1e-6) p1.push(p); });
  p0.push(a); p1.push(b);
  return [p0, p1, p2];
}

/** Intersection de deux segments : paramètres (t sur ab, u sur cd) ou null. */
export function segInter(a: V2, b: V2, c: V2, d: V2): [number, number] | null {
  const r1 = b.x - a.x, r2 = b.z - a.z, s1 = d.x - c.x, s2 = d.z - c.z, den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s2 - (c.z - a.z) * s1) / den, u = ((c.x - a.x) * r2 - (c.z - a.z) * r1) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [t, u];
}

/** Limite de pente sur une ligne ouverte (passes aller-retour), points ancrés fixes. */
export function limitOpen(Y: number[], anch: boolean[], lim: number) {
  const N = Y.length;
  for (let it = 0; it < 10; it++) {
    for (let i = 1; i < N; i++) if (!anch[i]) Y[i] = Math.max(Y[i - 1] - lim, Math.min(Y[i - 1] + lim, Y[i]));
    for (let i = N - 2; i >= 0; i--) if (!anch[i]) Y[i] = Math.max(Y[i + 1] - lim, Math.min(Y[i + 1] + lim, Y[i]));
  }
}

/**
 * Profil en long d'une ligne ouverte : relief lissé, raccordé aux altitudes imposées au début (et à la fin si elle est imposée),
 * gares plates, pente limitée. Les paliers de gare sont d'abord ramenés dans le domaine faisable (cône de pente depuis les points
 * déjà fixés), sinon la limitation de pente ne peut pas être respectée.
 */
export function profileOpen(C: P2[], raw: (x: number, z: number) => number, step: number, ics: number[], ends: [number | null, number | null], maxGrade: number, half: number, smooth: number): number[] {
  const N = C.length, w = Math.round(smooth / step), sm = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
  let Y = C.map(p => raw(p.x, p.z));
  for (let pass = 0; pass < 2; pass++) {
    const s = Y;
    Y = s.map((_, i) => { let a = 0, n = 0; for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < N) { a += s[j]; n++; } } return a / n; });
  }
  const e0 = ends[0] === null ? 0 : ends[0] - Y[0], e1 = ends[1] === null ? 0 : ends[1] - Y[N - 1], Wc = Math.min(N / 2, 90);
  Y = Y.map((y, i) => y + e0 * (1 - sm(i / Wc)) + e1 * (1 - sm((N - 1 - i) / Wc)));
  const lim = maxGrade * step;
  const anchors: { i: number; y: number; w: number }[] = ends[0] === null ? [] : [{ i: 0, y: ends[0], w: 0 }];
  if (ends[1] !== null) anchors.push({ i: N - 1, y: ends[1], w: 0 });
  const range = (x: number) => {
    let lo = -Infinity, hi = Infinity;
    for (const a of anchors) { const d = Math.max(0, Math.abs(x - a.i) - a.w) * lim * 0.98; lo = Math.max(lo, a.y - d); hi = Math.min(hi, a.y + d); }
    return [lo, hi];
  };
  for (const ic of [...ics].sort((a, b) => a - b)) {
    const [l1, h1] = range(Math.max(0, ic - half)), [l2, h2] = range(Math.min(N - 1, ic + half));    // palier : faisable aux deux bords
    const lo = Math.max(l1, l2), hi = Math.min(h1, h2);
    anchors.push({ i: ic, y: Math.max(lo, Math.min(hi, Y[ic])), w: half });
  }
  const anch = new Array<boolean>(N).fill(false);
  for (const a of anchors) for (let k = -a.w; k <= a.w; k++) { const j = a.i + k; if (j >= 0 && j < N) { Y[j] = a.y; anch[j] = true; } }
  for (let i = 0; i < N; i++) if (!anch[i]) { const [lo, hi] = range(i); Y[i] = Math.max(lo, Math.min(hi, Y[i])); }
  limitOpen(Y, anch, lim);
  return Y;
}
