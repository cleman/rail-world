import type { Zone } from './terrain';
import { vnoise } from './terrain';

export type Rand = () => number;
export function rng(seed: number): Rand {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** `deck` : la rue franchit la voie sur un pont-route ; c0 / c1 = indices des points juste avant et juste après l'emprise ferroviaire */
export interface Street { pts: [number, number][]; hw: number; tier: 0 | 1 | 2; deck?: { c0: number; c1: number }; /** rond-point : sens unique, dans le sens inverse des aiguilles d'une montre vu de dessus */ oneWay?: boolean }
/** Rayon (axe) de l'anneau du rond-point central des villes. */
export const ROUNDABOUT_R = 20;

export const DECK_CLEAR = 7.6, DECK_GRADE = 0.085;
/** Altitude de la chaussée d'une rue à pont-route : plateau au-dessus des voies, rampes d'accès à 8,5 % qui rejoignent le sol. */
export function deckProfile(s: Street, h: (x: number, z: number) => number): number[] {
  const d = s.deck!, P = s.pts, u = [0];
  for (let i = 1; i < P.length; i++) u.push(u[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  let top = -1e9; for (let i = d.c0; i <= d.c1; i++) top = Math.max(top, h(P[i][0], P[i][1]));
  top += DECK_CLEAR;
  return P.map(([x, z], i) => {
    const g = h(x, z);
    if (i >= d.c0 && i <= d.c1) return top;
    const dist = i < d.c0 ? u[d.c0] - u[i] : u[i] - u[d.c1];
    return Math.max(g, top - DECK_GRADE * dist);
  });
}
export interface Seg { ax: number; az: number; bx: number; bz: number; hw: number; tier: number }
export interface Park { x: number; z: number; r: number }
export interface Near { d: number; px: number; pz: number; tx: number; tz: number; hw: number; tier: number }
export interface CityPlan {
  zone: Zone; village: boolean; streets: Street[]; parks: Park[]; segs: Seg[];
  /** centre du réseau de rues : le centre de la zone, ou le point dégagé le plus proche s'il tombe sur la voie ferrée */
  c: { x: number; z: number };
  near(x: number, z: number): Near | null;
}

/** Ce que la ville a besoin de savoir du reste du monde. */
export interface Env {
  /** distance à la voie la plus proche (m) */
  trackD(x: number, z: number): number;
  /** distance libre au bord de la rivière (m, négatif dans l'eau) */
  riverD(x: number, z: number): number;
  /** vrai si le segment ab peut franchir la voie par un passage à niveau : une seule voie coupée, loin des gares, aiguillages et ouvrages */
  crossable?(ax: number, az: number, bx: number, bz: number): boolean;
  /** vrai si le segment ab peut passer sur un pont-route (hors halls de gare, dépôts, ouvrages) */
  bridgeable?(ax: number, az: number, bx: number, bz: number): boolean;
  /** points d'axe des voies à moins de R de (x, z), avec leur tangente */
  axisNear?(x: number, z: number, R: number): { x: number; z: number; tx: number; tz: number }[];
}

const CELL = 40;
const hkey = (cx: number, cz: number) => cx * 100003 + cz;

const distSeg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, u = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return { d: Math.hypot(px - ax - dx * u, pz - az - dz * u), x: ax + dx * u, z: az + dz * u };
};
const segCross = (p: [number, number], q: [number, number], r: [number, number], u: [number, number]) => {
  const r1 = q[0] - p[0], r2 = q[1] - p[1], s1 = u[0] - r[0], s2 = u[1] - r[1], den = r1 * s2 - r2 * s1; if (Math.abs(den) < 1e-9) return false;
  const tt = ((r[0] - p[0]) * s2 - (r[1] - p[1]) * s1) / den, uu = ((r[0] - p[0]) * r2 - (r[1] - p[1]) * r1) / den; return tt > 0.02 && tt < 0.98 && uu >= 0 && uu <= 1;
};
/** Rues qui se touchent (croisement, ou extrémité à moins de 5 m d'une autre rue). */
export function streetsTouch(A: Street, B: Street): boolean {
  for (let i = 1; i < A.pts.length; i++) for (let j = 1; j < B.pts.length; j++) {
    const p = A.pts[i - 1], q = A.pts[i], r = B.pts[j - 1], u = B.pts[j];
    const r1 = q[0] - p[0], r2 = q[1] - p[1], s1 = u[0] - r[0], s2 = u[1] - r[1], den = r1 * s2 - r2 * s1;
    if (Math.abs(den) > 1e-9) { const tt = ((r[0] - p[0]) * s2 - (r[1] - p[1]) * s1) / den, uu = ((r[0] - p[0]) * r2 - (r[1] - p[1]) * r1) / den; if (tt >= 0 && tt <= 1 && uu >= 0 && uu <= 1) return true; }
  }
  for (const [X, Y] of [[A, B], [B, A]] as [Street, Street][]) for (const e of [X.pts[0], X.pts[X.pts.length - 1]]) for (let j = 1; j < Y.pts.length; j++) if (distSeg(e[0], e[1], Y.pts[j - 1][0], Y.pts[j - 1][1], Y.pts[j][0], Y.pts[j][1]).d < 5) return true;
  return false;
}
/**
 * Garantit un réseau d'un seul tenant : chaque groupe de rues isolé du plus grand est relié par une rue courte (extrémité → rue la plus proche,
 * libre de tout obstacle et sans croiser une autre rue), à défaut il est supprimé. Les ponts-routes restent toujours.
 */
export function connectStreets(streets: Street[], ok: (x: number, z: number) => boolean, onDeck: (x: number, z: number, pad: number) => boolean, maxLink = 120) {
  const n = streets.length; if (n < 2) return;
  const par = streets.map((_, i) => i), f = (i: number): number => (par[i] === i ? i : (par[i] = f(par[i])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (f(i) !== f(j) && streetsTouch(streets[i], streets[j])) par[f(i)] = f(j);
  const len = (s: Street) => { let t = 0; for (let k = 1; k < s.pts.length; k++) t += Math.hypot(s.pts[k][0] - s.pts[k - 1][0], s.pts[k][1] - s.pts[k - 1][1]); return t; };
  const total = new Map<number, number>(); streets.forEach((s, i) => total.set(f(i), (total.get(f(i)) ?? 0) + len(s)));
  const roots = [...total.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]); if (roots.length < 2) return;
  const main = new Set<number>(), done = new Set<number>([roots[0]]); streets.forEach((_, i) => { if (f(i) === roots[0]) main.add(i); });
  const drop = new Set<number>(), added: Street[] = [];
  for (const root of roots.slice(1)) {
    const mine = streets.map((_, i) => i).filter(i => f(i) === root);
    let best: { d: number; e: [number, number]; q: [number, number] } | null = null;
    for (const i of mine) for (const e of [streets[i].pts[0], streets[i].pts[streets[i].pts.length - 1]] as [number, number][]) {
      for (const j of main) { const S = streets[j]; for (let k = 1; k < S.pts.length; k++) { const c = distSeg(e[0], e[1], S.pts[k - 1][0], S.pts[k - 1][1], S.pts[k][0], S.pts[k][1]); if (c.d > 3 && c.d < maxLink && (!best || c.d < best.d) && !onDeck(c.x, c.z, 8)) {
        let good = true; const q: [number, number] = [c.x, c.z];
        for (let t = 0.1; t < 1 && good; t += 0.1) if (!ok(e[0] + (q[0] - e[0]) * t, e[1] + (q[1] - e[1]) * t) || onDeck(e[0] + (q[0] - e[0]) * t, e[1] + (q[1] - e[1]) * t, 8)) good = false;
        if (good) for (let m = 0; m < n && good; m++) { if (f(m) === root) continue; const O = streets[m]; for (let kk = 1; kk < O.pts.length; kk++) if (segCross(e, q, O.pts[kk - 1], O.pts[kk])) { good = false; break; } }
        if (good) best = { d: c.d, e, q };
      } } }
    }
    if (best) { const st: Street = { pts: [best.e, best.q], hw: 3.0, tier: 2 }; added.push(st); for (const i of mine) main.add(i); done.add(root); }
    else if (!mine.some(i => streets[i].deck)) mine.forEach(i => drop.add(i));
    else for (const i of mine) main.add(i);
  }
  const keep = streets.filter((_, i) => !drop.has(i)); streets.length = 0; streets.push(...keep, ...added);
}

/** Réseau de rues d'une ville : avenues rayonnantes, boulevards circulaires, rues de quartier, parcs. */
export function planCity(q: Zone, rand: Rand, env: Env): CityPlan {
  const village = q.kind === 'village', R = q.r;
  const ok = (x: number, z: number) => Math.hypot(x - q.x, z - q.z) < R * 0.97 && env.trackD(x, z) > 26 && env.riverD(x, z) > 14;
  const streets: Street[] = [];
  const decks: Street[] = [];
  /** vrai si (x, z) est dans l'emprise d'un pont-route et de ses rampes (la rue y est surélevée : rien ne doit s'y raccorder) */
  const onDeck = (x: number, z: number, pad: number) => {
    for (const s of decks) {
      const P = s.pts, d = s.deck!; let a = d.c0, b = d.c1, acc = 0;
      while (a > 0 && acc < 115) { acc += Math.hypot(P[a][0] - P[a - 1][0], P[a][1] - P[a - 1][1]); a--; }
      acc = 0; while (b < P.length - 1 && acc < 115) { acc += Math.hypot(P[b + 1][0] - P[b][0], P[b + 1][1] - P[b][1]); b++; }
      for (let i = a; i <= b; i++) if (Math.hypot(P[i][0] - x, P[i][1] - z) < pad + s.hw) return true;
    }
    return false;
  };
  const crosses: [number, number][] = [];           // milieux des passages à niveau déjà tracés
  const maxCross = village ? 1 : R > 300 ? 3 : 2;
  let c0 = { x: q.x, z: q.z };
  if (env.trackD(q.x, q.z) < 70 || env.riverD(q.x, q.z) < 20) {
    search: for (let r = 20; r < R * 0.5; r += 20) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, x = q.x + Math.cos(a) * r, z = q.z + Math.sin(a) * r;
      if (env.trackD(x, z) > 70 && env.riverD(x, z) > 20) { c0 = { x, z }; break search; }
    }
  }

  /**
   * Trace une rue. Pour une rue de quartier (`parent` donné), elle s'arrête en T sur la première rue qu'elle rencontre
   * (si l'angle est franc), s'arrête avant si elle la frôle à angle faible, et ne longe jamais une autre rue de trop près :
   * plus de croisements en X ni de rubans superposés.
   */
  const walk = (x: number, z: number, a: number, len: number, hw: number, tier: 0 | 1 | 2, curve: number, parent?: Street): Street | null => {
    if (!ok(x, z)) return null;
    const pts: [number, number][] = [[x, z]];
    const step = 12;
    let ang = a, joined = false;
    for (let d = 0, n = 0; d < len; d += step, n++) {
      ang += curve + (rand() - 0.5) * 0.05;
      const nx = x + Math.cos(ang) * step, nz = z + Math.sin(ang) * step;
      if (decks.length && onDeck(nx, nz, hw + 6)) break;
      if (!ok(nx, nz)) break;
      if (parent) {
        let hit: { t: number; x: number; z: number; sin: number } | null = null, crowd = false;
        for (const o of streets) {
          if (o === parent) continue;
          for (let i = 1; i < o.pts.length; i++) {
            const [ax, az] = o.pts[i - 1], [bx, bz] = o.pts[i], ex = bx - ax, ez = bz - az, dx = nx - x, dz = nz - z, den = dx * ez - dz * ex;
            if (Math.abs(den) > 1e-6) {
              const t = ((ax - x) * ez - (az - z) * ex) / den, u = ((ax - x) * dz - (az - z) * dx) / den;
              if (t > 0 && t <= 1 && u >= 0 && u <= 1 && (!hit || t < hit.t)) hit = { t, x: x + dx * t, z: z + dz * t, sin: Math.abs(den) / (Math.hypot(dx, dz) * Math.hypot(ex, ez)) };
            }
            const ux = Math.max(0, Math.min(1, ((nx - ax) * ex + (nz - az) * ez) / (ex * ex + ez * ez || 1)));
            if (Math.hypot(nx - ax - ex * ux, nz - az - ez * ux) < o.hw + hw + 3.5) crowd = true;
          }
        }
        if (hit) { if (hit.sin >= 0.5 && n >= 1) { pts.push([hit.x, hit.z]); joined = true; } break; }
        if (crowd) break;
      }
      x = nx; z = nz;
      pts.push([x, z]);
    }
    return pts.length >= 3 || (joined && pts.length >= 2) ? { pts, hw, tier } : null;
  };

  // rues de franchissement : perpendiculaires à la voie, elles la traversent (passage à niveau, ou pont-route sur l'emprise d'une gare)
  // et gardent la ville d'un seul tenant. Tracées avant tout le reste : rien ne doit ensuite se raccorder sur leurs rampes.
  if (env.axisNear && env.crossable && !village) {
    const want = R > 300 ? 3 : 2, cand = env.axisNear(c0.x, c0.z, R * 0.85).filter(p => Math.hypot(p.x - c0.x, p.z - c0.z) > 40);
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    cand.sort((p, r) => (Math.hypot(p.x - c0.x, p.z - c0.z) + rand() * 120) - (Math.hypot(r.x - c0.x, r.z - c0.z) + rand() * 120));
    const found: { st: Street; P: { x: number; z: number }; bridge: boolean }[] = [];
    for (const P of cand) {
      if (found.length >= want) break;
      if (found.some(f => Math.hypot(f.P.x - P.x, f.P.z - P.z) < 150)) continue;
      const nx = -P.tz, nz = P.tx, edge = (sg: number) => { for (let L = 20; L <= 70; L += 3) { const x = P.x + nx * L * sg, z = P.z + nz * L * sg; if (ok(x, z) && env.trackD(x, z) > 28) return L; } return 0; };
      const l0 = edge(-1), l1 = edge(1); if (!l0 || !l1) continue;
      const ax = P.x - nx * l0, az = P.z - nz * l0, bx = P.x + nx * l1, bz = P.z + nz * l1;
      const level = env.crossable(ax, az, bx, bz), bridge = !level && !!env.bridgeable?.(ax, az, bx, bz);
      if (!level && !bridge) continue;
      let clear = true; for (let k = 0; k <= 8; k++) if (env.riverD(ax + ((bx - ax) * k) / 8, az + ((bz - az) * k) / 8) < 14) clear = false;
      if (!clear) continue;
      const hA = walk(ax, az, Math.atan2(-nz, -nx), R * 0.9, 3.6, 1, 0), hB = walk(bx, bz, Math.atan2(nz, nx), R * 0.9, 3.6, 1, 0);
      if (!hA || !hB) continue;
      const lenOf = (pts: [number, number][]) => { let t = 0; for (let k = 1; k < pts.length; k++) t += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return t; };
      if (lenOf(hA.pts) < (bridge ? 105 : 40) || lenOf(hB.pts) < (bridge ? 105 : 40)) continue;
      const mid: [number, number][] = []; const span = Math.hypot(bx - ax, bz - az);
      for (let L = 12; L < span - 6; L += 12) mid.push([ax + ((bx - ax) * L) / span, az + ((bz - az) * L) / span]);
      const pts: [number, number][] = [...hA.pts.slice().reverse(), ...mid, ...hB.pts], c0i = hA.pts.length - 1;
      const st: Street = { pts, hw: 3.6, tier: 1 };
      if (bridge) st.deck = { c0: c0i, c1: c0i + mid.length + 1 };
      found.push({ st, P, bridge });
      if (bridge) decks.push(st);          // tout de suite : les rues suivantes évitent ses rampes
    }
    // un pont isolé ne relie rien (deux rives en impasse) : il en faut au moins deux, reliés de chaque côté par une rue de rive pour former des boucles
    if (found.length < 2) { for (const f of found.filter(f => f.bridge)) { const i = decks.indexOf(f.st); if (i >= 0) decks.splice(i, 1); } found.splice(0, found.length, ...found.filter(f => !f.bridge)); }
    if (found.length) {
      for (const f of found) { streets.push(f.st); crosses.push([f.P.x, f.P.z]); }
      for (let k = 1; k < found.length; k++) {
        const A = found[k - 1].st, Bq = found[k].st, a0 = A.pts[0], a1 = A.pts[A.pts.length - 1], b0 = Bq.pts[0], b1 = Bq.pts[Bq.pts.length - 1];
        const same = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]) + Math.hypot(a1[0] - b1[0], a1[1] - b1[1]) <= Math.hypot(a0[0] - b1[0], a0[1] - b1[1]) + Math.hypot(a1[0] - b0[0], a1[1] - b0[1]);
        for (const [p, r] of same ? [[a0, b0], [a1, b1]] : [[a0, b1], [a1, b0]]) {
          const L = Math.hypot(r[0] - p[0], r[1] - p[1]); let good = L > 20 && L < 480;
          const link: [number, number][] = [[p[0], p[1]]];
          for (let d = 12; good && d < L; d += 12) { const x = p[0] + ((r[0] - p[0]) * d) / L, z = p[1] + ((r[1] - p[1]) * d) / L; if (!ok(x, z) || onDeck(x, z, 8)) good = false; else link.push([x, z]); }
          if (good) { link.push([r[0], r[1]]); streets.push({ pts: link, hw: 3.0, tier: 1 }); }
        }
      }
    }
  }
  // avenues rayonnantes
  const nAve = village ? 3 : R > 300 ? 6 + Math.floor(rand() * 3) : 5 + Math.floor(rand() * 2);
  const ave: Street[] = [];
  for (let k = 0; k < nAve; k++) {
    const a = (k / nAve) * Math.PI * 2 + (rand() - 0.5) * (village ? 0.9 : 0.5);
    const off = village ? 8 : ROUNDABOUT_R, jit = village ? 8 : 0;      // en ville, les avenues partent de l'anneau du rond-point central
    const s = walk(c0.x + Math.cos(a) * off + (rand() - 0.5) * jit, c0.z + Math.sin(a) * off + (rand() - 0.5) * jit, a, R * (0.8 + rand() * 0.2), village ? 3.2 : 4.6, 0, (rand() - 0.5) * 0.012);
    if (s) { streets.push(s); ave.push(s); }
  }
  // rond-point central : anneau à sens unique (sens inverse des aiguilles d'une montre) sur lequel se raccordent les avenues
  if (!village && ave.length >= 3) {
    const n = 28, ring: [number, number][] = [];
    for (let k = 0; k <= n; k++) { const th = -(k / n) * Math.PI * 2; ring.push([c0.x + Math.cos(th) * ROUNDABOUT_R, c0.z + Math.sin(th) * ROUNDABOUT_R]); }
    if (ring.every(p => ok(p[0], p[1]))) streets.push({ pts: ring, hw: 3.4, tier: 1, oneWay: true });
  }
  // boulevards circulaires : anneaux déformés, coupés où la voie ou l'eau gênent
  if (!village) {
    for (const f of R > 300 ? [0.28, 0.52, 0.76] : [0.36, 0.68]) {
      const phase = rand() * 6.28, amp = 0.1 + rand() * 0.1, rr = R * f;
      let cur: [number, number][] = [];
      const flush = () => { if (cur.length >= 3) streets.push({ pts: cur, hw: 3.8, tier: 1 }); cur = []; };
      const n = Math.ceil((2 * Math.PI * rr) / 12);
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI * 2, r2 = rr * (1 + amp * (vnoise(Math.cos(t + phase) * 2 + 7, Math.sin(t + phase) * 2 + 7, 5) - 0.5) * 1.6);
        const x = c0.x + Math.cos(t) * r2, z = c0.z + Math.sin(t) * r2;
        if (ok(x, z) && !(i % 53 > 47 && f > 0.5) && !onDeck(x, z, 10)) cur.push([x, z]); else flush();
      }
      flush();
    }
  }
  // rues de quartier : perpendiculaires aux avenues et aux boulevards, avec un peu d'angle
  const primary = [...streets];
  const starts: [number, number][] = [];
  for (const s of primary) {
    if (s.oneWay) continue;
    let acc = 30 + rand() * 40;
    for (let i = 1; i < s.pts.length; i++) {
      const [ax, az] = s.pts[i - 1], [bx, bz] = s.pts[i], l = Math.hypot(bx - ax, bz - az);
      acc -= l;
      if (acc > 0) continue;
      acc = (village ? 38 : 48) + rand() * (village ? 35 : 50);
      if (Math.hypot(ax - c0.x, az - c0.z) < R * 0.1 || onDeck(ax, az, 12)) continue;
      const base = Math.atan2(bz - az, bx - ax);
      for (const sg of [-1, 1]) {
        if (rand() < 0.2) continue;
        if (starts.some(p => Math.hypot(p[0] - ax, p[1] - az) < 22 && rand() < 0.8)) continue;
        const side = walk(ax, az, base + sg * (Math.PI / 2 + (rand() - 0.5) * 0.6), (village ? 40 : 55) + rand() * (village ? 60 : 110), village ? 2.6 : 3.0, 2, (rand() - 0.5) * 0.03, s);
        if (side) { streets.push(side); starts.push([ax, az]); }
      }
    }
  }

  // rues de franchissement : si leurs extrémités sont libres, on les raccorde en T à la rue la plus proche (sinon elles restent isolées du réseau routier)
  for (const st of streets) {
    if (!crosses.length || st.hw !== 3.6 || st.tier !== 1 || !(st.deck || crosses.some(c => st.pts.some(p => Math.hypot(p[0] - c[0], p[1] - c[1]) < 60)))) continue;
    for (const end of [0, 1]) {
      const e = end ? st.pts[st.pts.length - 1] : st.pts[0];
      let best: { d: number; x: number; z: number } | null = null;
      for (const o of streets) {
        if (o === st) continue;
        for (let i = 1; i < o.pts.length; i++) {
          if (o.deck && onDeck(o.pts[i][0], o.pts[i][1], 0)) continue;
          const [ax, az] = o.pts[i - 1], [bx, bz] = o.pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const u = Math.max(0, Math.min(1, ((e[0] - ax) * dx + (e[1] - az) * dz) / l2)), px = ax + dx * u, pz = az + dz * u, d = Math.hypot(e[0] - px, e[1] - pz);
          if (d > 2 && (!best || d < best.d) && !onDeck(px, pz, 6)) best = { d, x: px, z: pz };
        }
      }
      if (best && best.d < 130 && ok(best.x, best.z)) {
        if (end) st.pts.push([best.x, best.z]); else { st.pts.unshift([best.x, best.z]); if (st.deck) { st.deck.c0++; st.deck.c1++; } }
      }
    }
  }

  // connectivité : toute rue doit se raccorder au reste du réseau ; sinon on la relie (stub court et libre), sinon on la supprime
  connectStreets(streets, ok, onDeck);

  // bouts de rue en plein champ : on les raccorde à la rue voisine (devant eux), sinon on supprime les courts, sinon on les termine par une placette ronde
  const strLen = (st: Street) => { let t = 0; for (let k = 1; k < st.pts.length; k++) t += Math.hypot(st.pts[k][0] - st.pts[k - 1][0], st.pts[k][1] - st.pts[k - 1][1]); return t; };
  const clearOf = (st: Street, x: number, z: number, r: number) => { for (const o of streets) { if (o === st) continue; for (let i = 1; i < o.pts.length; i++) if (distSeg(x, z, o.pts[i - 1][0], o.pts[i - 1][1], o.pts[i][0], o.pts[i][1]).d < r + o.hw) return false; } return true; };
  const dropped = new Set<Street>(), bulbs: Street[] = [];
  for (const st of streets.slice()) {
    if (st.tier === 1 || st.deck || st.oneWay) continue;
    for (const end of [0, 1]) {
      if (dropped.has(st)) break;
      const n = st.pts.length, e = end ? st.pts[n - 1] : st.pts[0], b2 = end ? st.pts[n - 2] : st.pts[1]; if (!b2) continue;
      if (!clearOf(st, e[0], e[1], 6)) continue;                        // déjà raccordé
      const tl = Math.hypot(e[0] - b2[0], e[1] - b2[1]) || 1, tx = (e[0] - b2[0]) / tl, tz = (e[1] - b2[1]) / tl;
      let best: { d: number; x: number; z: number } | null = null;
      for (const o of streets) {
        if (o === st || (o.deck && onDeck(e[0], e[1], 30))) continue;
        for (let i = 1; i < o.pts.length; i++) {
          const [ax, az] = o.pts[i - 1], [bx, bz] = o.pts[i], c = distSeg(e[0], e[1], ax, az, bx, bz);
          if (c.d < 3 || c.d > 80 || (best && c.d >= best.d)) continue;
          const lx = (c.x - e[0]) / c.d, lz = (c.z - e[1]) / c.d, sl = Math.hypot(bx - ax, bz - az) || 1;
          if (lx * tx + lz * tz < 0.62 || Math.abs(lx * (bz - az) / sl - lz * (bx - ax) / sl) < 0.5 || onDeck(c.x, c.z, 8)) continue;
          let good = true; for (let t = 0.1; t < 1 && good; t += 0.1) { const x = e[0] + (c.x - e[0]) * t, z = e[1] + (c.z - e[1]) * t; if (!ok(x, z) || onDeck(x, z, 8)) good = false; }
          if (good) for (const m of streets) { if (m === st || m === o) continue; for (let kk = 1; kk < m.pts.length && good; kk++) if (segCross(e as [number, number], [c.x, c.z], m.pts[kk - 1], m.pts[kk])) good = false; }
          if (good) best = { d: c.d, x: c.x, z: c.z };
        }
      }
      if (best) { if (end) st.pts.push([best.x, best.z]); else st.pts.unshift([best.x, best.z]); continue; }
      if (st.tier === 0) continue;
      if (strLen(st) < 58) { dropped.add(st); continue; }
      const BR = 9.5, cx = e[0] + tx * BR, cz = e[1] + tz * BR, ring: [number, number][] = [];
      for (let k = 0; k <= 20; k++) { const th = Math.atan2(-tz, -tx) + (k / 20) * Math.PI * 2; ring.push([cx + Math.cos(th) * BR, cz + Math.sin(th) * BR]); }
      if (ring.every(r => ok(r[0], r[1]) && !onDeck(r[0], r[1], 8) && clearOf(st, r[0], r[1], 3.2) ) && ring.every(r => bulbs.every(bl => bl.pts.every(q => Math.hypot(q[0] - r[0], q[1] - r[1]) > 6)))) bulbs.push({ pts: ring, hw: 2.6, tier: 2 });
    }
  }
  if (dropped.size || bulbs.length) { const keep = streets.filter(x => !dropped.has(x)); streets.length = 0; streets.push(...keep, ...bulbs); }

  const segs: Seg[] = [], grid = new Map<number, Seg[]>();
  for (const s of streets) for (let i = 1; i < s.pts.length; i++) {
    const g: Seg = { ax: s.pts[i - 1][0], az: s.pts[i - 1][1], bx: s.pts[i][0], bz: s.pts[i][1], hw: s.hw, tier: s.tier };
    segs.push(g);
    for (let cx = Math.floor(Math.min(g.ax, g.bx) / CELL); cx <= Math.floor(Math.max(g.ax, g.bx) / CELL); cx++)
      for (let cz = Math.floor(Math.min(g.az, g.bz) / CELL); cz <= Math.floor(Math.max(g.az, g.bz) / CELL); cz++) {
        const k = hkey(cx, cz), l = grid.get(k); if (l) l.push(g); else grid.set(k, [g]);
      }
  }
  const near = (x: number, z: number): Near | null => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best: Near | null = null;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const lst = grid.get(hkey(cx + i, cz + j));
      if (!lst) continue;
      for (const g of lst) {
        const dx = g.bx - g.ax, dz = g.bz - g.az, l2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / l2));
        const px = g.ax + dx * u, pz = g.az + dz * u, d = Math.hypot(x - px, z - pz) - g.hw;
        if (!best || d < best.d) { const sl = Math.sqrt(l2); best = { d, px, pz, tx: dx / sl, tz: dz / sl, hw: g.hw, tier: g.tier }; }
      }
    }
    return best;
  };

  // parcs
  const parks: Park[] = [];
  if (!village) for (let k = 0; k < (R > 300 ? 3 : 1 + Math.floor(rand() * 2)); k++) {
    for (let tries = 0; tries < 30; tries++) {
      const a = rand() * 6.28, rr = R * (0.3 + rand() * 0.5), r = 28 + rand() * 24, x = c0.x + Math.cos(a) * rr, z = c0.z + Math.sin(a) * rr;
      if (!ok(x, z) || env.trackD(x, z) < 26 + r || parks.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r + 20)) continue;
      parks.push({ x, z, r }); break;
    }
  }
  return { zone: q, village, streets, parks, segs, near, c: c0 };
}


