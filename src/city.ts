import * as THREE from 'three';
import type { Terrain } from './sim/terrain';
import { vnoise } from './sim/terrain';
import { flatRoof, gableRoof, wallBox } from './geom';
import type { Chunked } from './chunks';

const CELL = 40;
const hkey = (cx: number, cz: number) => cx * 100003 + cz;
export { planCity, rng, type Rand, type Street, type Seg, type Park, type Near, type CityPlan, type Env } from './sim/cityplan';
import { deckProfile, type CityPlan, type Env, type Rand } from './sim/cityplan';

export interface CityBuilders {
  towers: Chunked; houses: Chunked; roofs: Chunked; roads: Chunked; marks: Chunked; walks: Chunked;
  lamps: [number, number, number][]; trees: [number, number, number][];
  towerTile: [number, number]; houseTile: [number, number];
  /** (essais) rectangles des bâtiments posés */
  placed?: Rect[];
}
export interface Rect { x: number; z: number; w: number; d: number; c: number; s: number; r: number }

const wallPal = [0xe4dccd, 0xd9c9ad, 0xc4ae94, 0xb88a75, 0xc9cfd6, 0xa9b2bd, 0xe9d8b0, 0xcfb9a0].map(h => new THREE.Color(h));
const roofPal = [0x9c4a3a, 0x7a3e32, 0x5b5f66, 0x8a5a3c, 0xa65a3c].map(h => new THREE.Color(h));
const shedPal = [0x9aa0a6, 0xa9a39a, 0x8c949c].map(h => new THREE.Color(h));
const flatC = new THREE.Color(0x70757c), machineC = new THREE.Color(0x9aa0a6);
const concreteC = new THREE.Color(0xb4b2ac), parapetC = new THREE.Color(0xc9c7c0), roadC = new THREE.Color(0x4a4d52), walkC = new THREE.Color(0x9b9c9e), markC = new THREE.Color(0xdfdcd0), plazaC = new THREE.Color(0x8f8e8a);

export function overlap(a: Rect, b: Rect, margin: number): boolean {
  const dx = b.x - a.x, dz = b.z - a.z;
  if (dx * dx + dz * dz > (a.r + b.r + margin) ** 2) return false;
  for (const R of [a, b]) for (const [ax, az] of [[R.c, R.s], [-R.s, R.c]] as [number, number][]) {
    const pa = Math.abs(a.c * ax + a.s * az) * a.w / 2 + Math.abs(-a.s * ax + a.c * az) * a.d / 2;
    const pb = Math.abs(b.c * ax + b.s * az) * b.w / 2 + Math.abs(-b.s * ax + b.c * az) * b.d / 2;
    if (Math.abs(dx * ax + dz * az) > pa + pb + margin) return false;
  }
  return true;
}

/** Bâtiments, rues, trottoirs, marquages, lampadaires et arbres d'une ville ou d'un village. */
export function buildCity(plan: CityPlan, terrain: Terrain, env: Env, B: CityBuilders, rand: Rand, roadD: (x: number, z: number) => number = () => 1e9) {
  const q = plan.zone, R = q.r, big = R > 300, village = plan.village;
  const placed: Rect[] = [], hash = new Map<number, number[]>();
  const add = (r: Rect) => {
    placed.push(r); B.placed?.push(r);
    const i = placed.length - 1, cx0 = Math.floor((r.x - r.r) / CELL), cx1 = Math.floor((r.x + r.r) / CELL), cz0 = Math.floor((r.z - r.r) / CELL), cz1 = Math.floor((r.z + r.r) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) { const k = hkey(cx, cz), l = hash.get(k); if (l) l.push(i); else hash.set(k, [i]); }
  };
  const collides = (r: Rect, margin: number) => {
    if (roadD(r.x, r.z) < r.r + 6) return true;     // route de campagne qui traverse la ville
    const cx0 = Math.floor((r.x - r.r) / CELL), cx1 = Math.floor((r.x + r.r) / CELL), cz0 = Math.floor((r.z - r.r) / CELL), cz1 = Math.floor((r.z + r.r) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++)
      for (const i of hash.get(hkey(cx, cz)) ?? []) if (overlap(r, placed[i], margin)) return true;
    return false;
  };
  const zoneNoise = (x: number, z: number) => vnoise(x / 140 + 3.1, z / 140 + 1.7, 11);
  const industrial = (x: number, z: number) => !village && vnoise(x / 260 + 9, z / 260 + 4, 17) > 0.7 && Math.hypot(x - q.x, z - q.z) > R * 0.35;
  const center = plan.c;
  let churchDone = !village;

  const attempts = village ? 420 : Math.floor((R * R) / 20);
  for (let a = 0; a < attempts; a++) {
    const ang = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * R * 0.97;
    const sx = center.x + Math.cos(ang) * rr, sz = center.z + Math.sin(ang) * rr;
    const st = plan.near(sx, sz);
    if (!st || st.d > 34) continue;
    const rho = Math.min(1, rr / R), nz = zoneNoise(sx, sz), eff = rho + (nz - 0.5) * 0.3;
    // type de bâtiment selon la distance au centre, le bruit de quartier et les zones industrielles
    let kind: 'tower' | 'block' | 'house' | 'shed' | 'church';
    if (!churchDone && rho < 0.45) kind = 'church';
    else if (village) kind = 'house';
    else if (industrial(sx, sz)) kind = 'shed';
    else if (big && eff < 0.3) kind = 'tower';
    else if (eff < (big ? 0.62 : 0.45)) kind = 'block';
    else kind = 'house';
    if (kind === 'house' && !village && rand() < 0.12 * rho) continue;      // vides en périphérie
    let w: number, d: number, h: number;
    switch (kind) {
      case 'tower': w = 20 + rand() * 12; d = 18 + rand() * 8; h = (26 + rand() * 46) * (1.12 - eff * 0.9) + 6; break;
      case 'block': w = 16 + rand() * (rand() < 0.35 ? 36 : 14); d = 13 + rand() * 9; h = 11 + rand() * 13; break;
      case 'shed': w = 30 + rand() * 40; d = 20 + rand() * 12; h = 7 + rand() * 4; break;
      case 'church': w = 17; d = 9; h = 8; break;
      default: w = 8 + rand() * (rand() < 0.2 ? 14 : 6); d = 8 + rand() * 5; h = 4.8 + rand() * 2 + (rand() < 0.25 ? 3 : 0);
    }
    // on pose la façade en retrait de la rue, de l'un ou l'autre côté
    const side = (sx - st.px) * -st.tz + (sz - st.pz) * st.tx >= 0 ? 1 : -1;
    const nx = -st.tz * side, nzv = st.tx * side;
    const gap = (st.tier === 2 ? 2.2 : 4.2) + rand() * 1.6;
    const off = st.hw + gap + d / 2;
    const cx = st.px + nx * off, cz = st.pz + nzv * off, rot = Math.atan2(st.tz, st.tx);
    const rect: Rect = { x: cx, z: cz, w, d, c: Math.cos(rot), s: Math.sin(rot), r: Math.hypot(w, d) / 2 };
    if (Math.hypot(cx - q.x, cz - q.z) > R * 0.96) continue;
    if (collides(rect, 1.6)) continue;
    // les quatre coins doivent être loin de toute rue, de la voie, de l'eau et des parcs
    let bad = false;
    const probe: [number, number][] = [];
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) probe.push([(i / 8 - 0.5) * w, (j / 4 - 0.5) * d]);   // grille : une longue halle ne doit pas enjamber une rue
    for (const [lx, lz] of probe) {
      const x = cx + lx * rect.c - lz * rect.s, z = cz + lx * rect.s + lz * rect.c, s2 = plan.near(x, z);
      if ((s2 && s2.d < 1.4) || env.trackD(x, z) < 30 || env.riverD(x, z) < 12 || plan.parks.some(p => Math.hypot(p.x - x, p.z - z) < p.r + 3)) { bad = true; break; }
    }
    if (bad) continue;
    if (Math.hypot(cx - center.x, cz - center.z) < 11) continue;
    add(rect);

    let y0 = Infinity;
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]])
      y0 = Math.min(y0, terrain.height(cx + lx * rect.c - lz * rect.s, cz + lx * rect.s + lz * rect.c));
    y0 -= 0.7;
    const wc = wallPal[Math.floor(rand() * wallPal.length)], rc = roofPal[Math.floor(rand() * roofPal.length)];
    const [tU, tV] = B.towerTile, [hU, hV] = B.houseTile;
    const TW = B.towers.at(cx, cz), HO = B.houses.at(cx, cz), RO = B.roofs.at(cx, cz);
    if (kind === 'tower') {
      wallBox(TW, cx, cz, y0, w, d, h, rot, wc, tU, tV);
      let top = y0 + h;
      if (rand() < 0.5 && h > 40) { wallBox(TW, cx, cz, top, w * 0.6, d * 0.6, 6, rot, wc, tU, tV); flatRoof(RO, cx, cz, top + 6, w * 0.6, d * 0.6, rot, flatC); top += 6; }
      else flatRoof(RO, cx, cz, top, w, d, rot, flatC);
      RO.box(cx - 3, cx + 3, top, top + 2.5, cz - 3, cz + 3, machineC);
    } else if (kind === 'block') {
      wallBox(TW, cx, cz, y0, w, d, h, rot, wc, tU, tV);
      if (rand() < 0.45) gableRoof(RO, cx, cz, y0 + h, w, d, 3 + rand() * 2, rot, rc, 0.3);
      else { flatRoof(RO, cx, cz, y0 + h, w, d, rot, flatC); if (rand() < 0.4) RO.box(cx - 2, cx + 2, y0 + h, y0 + h + 2, cz - 2, cz + 2, machineC); }
    } else if (kind === 'shed') {
      wallBox(HO, cx, cz, y0, w, d, h, rot, shedPal[Math.floor(rand() * shedPal.length)], 12, 5);
      if (rand() < 0.6) gableRoof(RO, cx, cz, y0 + h, w, d, 2 + rand() * 1.5, rot, new THREE.Color(0x5d636b), 0.4);
      else flatRoof(RO, cx, cz, y0 + h, w, d, rot, new THREE.Color(0x6a7078));
    } else if (kind === 'church') {
      churchDone = true;
      wallBox(HO, cx, cz, y0, w, d, h, rot, new THREE.Color(0xd8d0bd), hU, hV);
      gableRoof(RO, cx, cz, y0 + h, w, d, 4, rot, new THREE.Color(0x6a4a3a), 0.5);
      const tx = cx + Math.cos(rot) * (w / 2 + 1.5), tz = cz + Math.sin(rot) * (w / 2 + 1.5);
      wallBox(HO, tx, tz, y0, 5.5, 5.5, 17, rot, new THREE.Color(0xd8d0bd), hU, hV);
      gableRoof(RO, tx, tz, y0 + 17, 5.5, 5.5, 6, rot, new THREE.Color(0x4f5a66), 0.3);
    } else {
      wallBox(HO, cx, cz, y0, w, d, h, rot, wc, hU, hV);
      gableRoof(RO, cx, cz, y0 + h, w, d, 2.6 + rand() * 1.6, rot, rc, 0.6);
      if (rand() < 0.6) RO.box(cx + w / 4 - 0.4, cx + w / 4 + 0.4, y0 + h + 1.5, y0 + h + 4, cz - 0.4, cz + 0.4, machineC);
    }
  }

  // ---- rues : rubans continus (angles d'onglet), trottoirs SOUS les chaussées ----
  // Hauteurs par couche : trottoir < chaussée (rang 0 < 1 < 2, la rue secondaire recouvre proprement l'artère) < marquage.
  const yAt = (x: number, z: number) => terrain.height(x, z);
  const onOther = (x: number, z: number, self: typeof plan.streets[0], pad: number) => {
    for (const o of plan.streets) {
      if (o === self) continue;
      for (let i = 1; i < o.pts.length; i++) {
        const [ax, az] = o.pts[i - 1], [bx, bz] = o.pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        if (Math.hypot(x - ax - dx * t, z - az - dz * t) < o.hw + pad) return true;
      }
    }
    return false;
  };
  for (const s of plan.streets) {
    const P = s.pts, n = P.length, hw = s.hw, yr = 0.2 + s.tier * 0.015;
    if (n < 2) continue;
    // normales de segment, puis normale d'onglet à chaque sommet
    const segN: [number, number, number, number][] = [];
    for (let i = 1; i < n; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) || 1, tx = (P[i][0] - P[i - 1][0]) / l, tz = (P[i][1] - P[i - 1][1]) / l; segN.push([-tz, tx, tx, tz]); }
    const prof = s.deck ? deckProfile(s, yAt) : null;
    const rows = P.map(([x, z], i) => {
      let nx: number, nz: number, tx: number, tz: number, m = 1;
      if (i === 0) { [nx, nz, tx, tz] = segN[0]; x -= tx * 0.8; z -= tz * 0.8; }
      else if (i === n - 1) { [nx, nz, tx, tz] = segN[n - 2]; x += tx * 0.8; z += tz * 0.8; }
      else {
        const A = segN[i - 1], Bn = segN[i];
        nx = A[0] + Bn[0]; nz = A[1] + Bn[1]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        m = Math.min(2, 1 / Math.max(0.5, nx * A[0] + nz * A[1])); tx = A[2] + Bn[2]; tz = A[3] + Bn[3];
      }
      return { x, z, nx, nz, m, tx, tz, y0: prof ? prof[i] : null as number | null, gy: yAt(x, z) };
    });
    const V = (r: typeof rows[0], o: number, dy: number): [number, number, number] => { const x = r.x + r.nx * o * r.m, z = r.z + r.nz * o * r.m; return [x, r.y0 !== null ? r.y0 + dy : yAt(x, z) + dy, z]; };
    const raised = (r: typeof rows[0]) => r.y0 !== null && r.y0 > r.gy + 0.4;
    for (let i = 1; i < n; i++) {
      const a = rows[i - 1], b = rows[i], mxs = (a.x + b.x) / 2, mzs = (a.z + b.z) / 2, RD = B.roads.at(mxs, mzs), WK = B.walks.at(mxs, mzs);
      RD.quad([V(a, -hw, yr), V(a, hw, yr), V(b, hw, yr), V(b, -hw, yr)], roadC, [0, 1, 0]);
      if (raised(a) || raised(b)) {                  // pont-route : parapets, flancs et sous-face
        const core = s.deck && i - 1 >= s.deck.c0 && i <= s.deck.c1;
        for (const sg of [-1, 1]) {
          const o = (hw + 1.35) * sg, W = B.walks.at(mxs, mzs), out: [number, number, number] = [sg * a.nx, 0, sg * a.nz];
          const bot = (r: typeof rows[0]): [number, number, number] => { const p = V(r, o, 0); return [p[0], core ? r.y0! - 1.2 : yAt(p[0], p[2]) - 0.4, p[2]]; };
          W.quad([bot(a), bot(b), V(b, o, 0.12), V(a, o, 0.12)], concreteC, out);
          W.quad([V(a, o, 0.12), V(b, o, 0.12), V(b, o, 1.0), V(a, o, 1.0)], parapetC, out);
          W.quad([V(a, o - sg * 0.3, 1.0), V(b, o - sg * 0.3, 1.0), V(b, o - sg * 0.3, 0.12), V(a, o - sg * 0.3, 0.12)], parapetC, [-out[0], 0, -out[2]]);
          W.quad([V(a, o, 1.0), V(b, o, 1.0), V(b, o - sg * 0.3, 1.0), V(a, o - sg * 0.3, 1.0)], parapetC, [0, 1, 0]);
        }
        if (core) B.walks.at(mxs, mzs).quad([V(a, -hw - 1.35, -1.2), V(b, -hw - 1.35, -1.2), V(b, hw + 1.35, -1.2), V(a, hw + 1.35, -1.2)], concreteC, [0, -1, 0]);
      }
      const onRail = env.trackD(mxs, mzs) < 30 && !raised(a);       // passage à niveau : ni trottoir ni marquage sur la voie
      for (const sg of onRail ? [] : [-1, 1]) {
        const o0 = hw * sg - sg * 0.3, o1 = (hw + 1.5) * sg;
        WK.quad([V(a, o0, 0.12), V(a, o1, 0.12), V(b, o1, 0.12), V(b, o0, 0.12)], walkC, [0, 1, 0]);
      }
      if (s.tier < 2 && i % 2 === 0 && !onRail) {
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1, ux = tx / l, uz = tz / l, nx = -uz, nz = ux;
        if (!onOther(mx, mz, s, 4.5) && l > 7) {
          const ym = (prof ? Math.max(yAt(mx, mz), (prof[i - 1] + prof[i]) / 2) : yAt(mx, mz)) + yr + 0.06;
          B.marks.at(mx, mz).quad([[mx - nx * 0.14 - ux * 3, ym, mz - nz * 0.14 - uz * 3], [mx + nx * 0.14 - ux * 3, ym, mz + nz * 0.14 - uz * 3], [mx + nx * 0.14 + ux * 3, ym, mz + nz * 0.14 + uz * 3], [mx - nx * 0.14 + ux * 3, ym, mz - nz * 0.14 + uz * 3]], markC, [0, 1, 0]);
        }
      }
    }
    // mobilier : lampadaires et arbres le long des artères (jamais sur une autre chaussée)
    if (s.tier < 2 || !village) {
      let acc = 10;
      for (let i = 1; i < n; i++) {
        const [ax, az] = P[i - 1], [bx, bz] = P[i], l = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / l, tz = (bz - az) / l;
        acc -= l;
        if (acc > 0) continue;
        acc = s.tier === 2 ? 52 : 34;
        const sg = i % 2 ? 1 : -1, ox = -tz * sg, oz = tx * sg, ym = yAt(ax, az) + yr;
        if (env.trackD(ax, az) < 34 || (prof && prof[i - 1] > yAt(ax, az) + 0.3)) continue;
        const rho = Math.hypot(ax - q.x, az - q.z) / R;
        const lx = ax + ox * (s.hw + 1.0), lz = az + oz * (s.hw + 1.0);
        if (rho < 0.9 && !onOther(lx, lz, s, 0.6)) B.lamps.push([lx, ym, lz]);
        if (s.tier < 2 && rho < 0.92) {
          const x = ax - ox * (s.hw + 2.0), z = az - oz * (s.hw + 2.0), cand: Rect = { x, z, w: 3, d: 3, c: 1, s: 0, r: 2 };
          if (!collides(cand, 0.5) && !onOther(x, z, s, 2) && roadD(x, z) > 6) B.trees.push([x, ym, z]);
        }
      }
    }
  }
  // place centrale (disque de chaussée) et parcs (arbres)
  if (!village && plan.streets.length) {
    const n = 14, y = yAt(center.x, center.z) + 0.26;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * 6.283, a1 = ((k + 1) / n) * 6.283;
      B.walks.at(center.x, center.z).tri([[center.x, y, center.z], [center.x + Math.cos(a0) * 14, y, center.z + Math.sin(a0) * 14], [center.x + Math.cos(a1) * 14, y, center.z + Math.sin(a1) * 14]], plazaC, [0, 1, 0]);
    }
  }
  for (const p of plan.parks) {
    for (let k = 0; k < 8 + Math.floor(p.r / 3); k++) {
      const a = rand() * 6.28, r = Math.sqrt(rand()) * (p.r - 4);
      const tx = p.x + Math.cos(a) * r, tz = p.z + Math.sin(a) * r, sn = plan.near(tx, tz);
      if (sn && sn.d < sn.hw + 2.2) continue;   // hors de la chaussée et du trottoir
      if (p.r >= 26 && r > p.r * 0.58 && r < p.r * 0.8) continue;   // l'allée du parc reste dégagée
      B.trees.push([tx, yAt(tx, tz), tz]);
    }
  }
}
