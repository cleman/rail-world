import * as THREE from 'three';
import type { Terrain } from './sim/terrain';
import { vnoise } from './sim/terrain';
import { flatRoof, gableRoof, wallBox } from './geom';
import { Chunked } from './chunks';
import { overlap, type Rand, type Rect } from './city';

export interface RuralCtx {
  terrain: Terrain; rand: Rand;
  trackD(x: number, z: number): number; riverD(x: number, z: number): number; roadD(x: number, z: number): number; zoneRatio(x: number, z: number): number;
  inLake(x: number, z: number, m: number): boolean;
  houseTile: [number, number];
  houses: Chunked; roofs: Chunked;
  half: number;
  avoid?: (x: number, z: number) => boolean;
  biomeAt?: (x: number, z: number) => import('./biome').Biome;
}
export interface RuralOut {
  /** vrai si (x,z) est dans un champ, une ferme ou à moins de m mètres */
  occupied(x: number, z: number, m: number): boolean;
  trees: [number, number, number][];
}

const FIELD_COLORS = [0x9cbc5a, 0x86aa4b, 0xc9bb62, 0xb7a257, 0x7a8f45, 0x8d6f4a, 0xa9c36b, 0xd3c36e].map(h => new THREE.Color(h));

/** Champs en parcelles (rayures de culture), haies et fermes. Tout est en maillage plat « collé » au terrain. */
export function buildRural(scene: THREE.Scene, X: RuralCtx): RuralOut {
  const { terrain, rand } = X;
  const fieldMb = new Chunked(600), plain = new Chunked(600), hedgeC = new THREE.Color(), hedgeC2 = new THREE.Color();
  const fieldCache = new Map<string, THREE.Color[]>();
  const fieldsAt = (x: number, z: number) => { const b = X.biomeAt?.(x, z); if (!b?.fields) return FIELD_COLORS; let l = fieldCache.get(b.id); if (!l) { l = b.fields.map(h => new THREE.Color(h)); fieldCache.set(b.id, l); } return l; };
  const rects: Rect[] = [], cellMap = new Map<number, number[]>(), CELL = 60;
  const key = (cx: number, cz: number) => cx * 100003 + cz;
  const addRect = (r: Rect) => {
    rects.push(r);
    const i = rects.length - 1;
    for (let cx = Math.floor((r.x - r.r) / CELL); cx <= Math.floor((r.x + r.r) / CELL); cx++)
      for (let cz = Math.floor((r.z - r.r) / CELL); cz <= Math.floor((r.z + r.r) / CELL); cz++) { const k = key(cx, cz), l = cellMap.get(k); if (l) l.push(i); else cellMap.set(k, [i]); }
  };
  const hit = (r: Rect, m: number) => {
    for (let cx = Math.floor((r.x - r.r) / CELL); cx <= Math.floor((r.x + r.r) / CELL); cx++)
      for (let cz = Math.floor((r.z - r.r) / CELL); cz <= Math.floor((r.z + r.r) / CELL); cz++)
        for (const i of cellMap.get(key(cx, cz)) ?? []) if (overlap(r, rects[i], m)) return true;
    return false;
  };
  const local = (r: Rect, lx: number, lz: number): [number, number] => [r.x + lx * r.c - lz * r.s, r.z + lx * r.s + lz * r.c];
  const okPoint = (x: number, z: number) => X.trackD(x, z) > 42 && X.riverD(x, z) > 12 && X.roadD(x, z) > 14 && X.zoneRatio(x, z) > 1.12 && !X.inLake(x, z, 14) && !X.avoid?.(x, z);

  const fields: Rect[] = [];
  const S = 112;
  for (let gx = -X.half; gx < X.half; gx += S) for (let gz = -X.half; gz < X.half; gz += S) {
    const x = gx + S / 2 + (rand() - 0.5) * 16, z = gz + S / 2 + (rand() - 0.5) * 16;
    if (vnoise(x / 650 + 2, z / 650 + 5, 31) < 0.4) continue;
    const reg = Math.floor(vnoise(x / 1000, z / 1000, 5) * 4);
    const rot = reg * (Math.PI / 8) + (rand() - 0.5) * 0.1;
    const w = 72 + rand() * 24, d = 62 + rand() * 24;
    const r: Rect = { x, z, w, d, c: Math.cos(rot), s: Math.sin(rot), r: Math.hypot(w, d) / 2 };
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]].map(([a, b]) => local(r, a, b));
    if (!pts.every(([px, pz]) => okPoint(px, pz))) continue;
    const hs = pts.map(([px, pz]) => terrain.height(px, pz));
    if (Math.max(...hs) - Math.min(...hs) > 5.5 || Math.min(...hs) < -34 || Math.max(...hs) > 55) continue;
    if (hit(r, 4)) continue;
    addRect(r); fields.push(r);

    // surface : bandes de culture alternées, chaque bande suit le relief
    const FIELDS = fieldsAt(x, z), base = FIELDS[Math.floor(rand() * FIELDS.length)], alt = base.clone().multiplyScalar(0.93 + rand() * 0.04);
    const strips = 7, parts = 5;
    for (let i = 0; i < strips; i++) for (let j = 0; j < parts; j++) {
      const l0 = -w / 2 + (w * i) / strips, l1 = -w / 2 + (w * (i + 1)) / strips, m0 = -d / 2 + (d * j) / parts, m1 = -d / 2 + (d * (j + 1)) / parts;
      const v = ([[l0, m0], [l1, m0], [l1, m1], [l0, m1]] as [number, number][]).map(([a, b]) => { const [px, pz] = local(r, a, b); return [px, terrain.height(px, pz) + 0.35, pz] as [number, number, number]; });
      fieldMb.at(x, z).quad(v as [[number, number, number], [number, number, number], [number, number, number], [number, number, number]], i % 2 ? base : alt, [0, 1, 0]);
    }
    // haies : sur certains côtés
    { const hb = X.biomeAt?.(x, z)?.hedge; hedgeC.set(hb?.[0] ?? 0x3f6f33); hedgeC2.set(hb?.[1] ?? 0x4f7f3a); }
    const sides: [number, number, number, number, number][] = [   // centre local x, z, longueur, angle local, décalage
      [0, -d / 2 - 1.2, w, 0, 0], [0, d / 2 + 1.2, w, 0, 0], [-w / 2 - 1.2, 0, d, Math.PI / 2, 0], [w / 2 + 1.2, 0, d, Math.PI / 2, 0]];
    for (const [lx, lz, len, la] of sides) {
      if (rand() > 0.38) continue;
      const n = Math.ceil(len / 13), seg = len / n;
      for (let k = 0; k < n; k++) {
        const off = -len / 2 + seg * (k + 0.5), ax = la === 0 ? lx + off : lx, az = la === 0 ? lz : lz + off;
        const [hx, hz] = local(r, ax, az);
        const y0 = Math.min(terrain.height(hx, hz), terrain.height(...local(r, ax + (la === 0 ? seg / 2 : 0), az + (la === 0 ? 0 : seg / 2))), terrain.height(...local(r, ax - (la === 0 ? seg / 2 : 0), az - (la === 0 ? 0 : seg / 2)))) - 0.2;
        const col = (k + fields.length) % 2 ? hedgeC : hedgeC2, rr = Math.atan2(r.s, r.c) + la;
        const PL = plain.at(hx, hz);
        wallBox(PL, hx, hz, y0, seg + 0.4, 1.7, 1.6, rr, col, 1e9, 1e9);
        flatRoof(PL, hx, hz, y0 + 1.6, seg + 0.4, 1.7, rr, col);
      }
    }
  }

  // fermes : cour, maison, grange, silo, quelques arbres, posées contre un champ
  const trees: [number, number, number][] = [];
  const farmable = fields.filter((_, i) => i % 9 === 4);
  for (const f of farmable) {
    const side = rand() < 0.5 ? 1 : -1, off = (f.d / 2 + 22) * side;
    const x = f.x - f.s * off, z = f.z + f.c * off;
    const rot = Math.atan2(f.s, f.c), cs = Math.cos(rot), sn = Math.sin(rot);
    const yard: Rect = { x, z, w: 44, d: 36, c: cs, s: sn, r: 29 };
    const cp = (lx: number, lz: number): [number, number] => [x + lx * cs - lz * sn, z + lx * sn + lz * cs];
    const corners = [[-22, -18], [22, -18], [22, 18], [-22, 18], [0, 0]].map(([a, b]) => cp(a, b));
    if (!corners.every(([px, pz]) => okPoint(px, pz)) || hit(yard, 3)) continue;
    const hs = corners.map(([px, pz]) => terrain.height(px, pz));
    if (Math.max(...hs) - Math.min(...hs) > 3) continue;
    addRect(yard);
    const y0 = Math.min(...hs) - 0.3, yardC = new THREE.Color(0x9b8f78);
    const PL = plain.at(x, z), HO = X.houses.at(x, z), RO = X.roofs.at(x, z);
    const yp = (lx: number, lz: number): [number, number, number] => { const [px, pz] = cp(lx, lz); return [px, y0 + 0.5, pz]; };
    PL.quad([yp(-22, -18), yp(22, -18), yp(22, 18), yp(-22, 18)], yardC, [0, 1, 0]);
    const [hx, hz] = cp(-10, -8), [bx, bz] = cp(8, 4), [sx, sz] = cp(-4, 11), [tx, tz] = cp(16, -10);
    const [hU, hV] = X.houseTile;
    wallBox(HO, hx, hz, y0, 11, 8, 5.4, rot, new THREE.Color(0xe6dcc8), hU, hV);
    gableRoof(RO, hx, hz, y0 + 5.4, 11, 8, 2.8, rot, new THREE.Color(0x9c4a3a), 0.5);
    wallBox(PL, bx, bz, y0, 24, 13, 7, rot, new THREE.Color(0x8b4b34), 1e9, 1e9);
    gableRoof(RO, bx, bz, y0 + 7, 24, 13, 4.6, rot, new THREE.Color(0x5b4a40), 0.7);
    wallBox(PL, sx, sz, y0, 12, 6, 4, rot, new THREE.Color(0xa9a79c), 1e9, 1e9);
    gableRoof(RO, sx, sz, y0 + 4, 12, 6, 2, rot, new THREE.Color(0x6d6a66), 0.4);
    wallBox(PL, tx, tz, y0, 4.2, 4.2, 12, rot, new THREE.Color(0xc9ccd0), 1e9, 1e9);
    flatRoof(PL, tx, tz, y0 + 12, 4.2, 4.2, rot, new THREE.Color(0x8f949a));
    for (let k = 0; k < 5; k++) { const [px, pz] = cp(-26 + rand() * 6 * (k % 2 ? -1 : 1) + (k % 2 ? 52 : 0), -22 + rand() * 44); trees.push([px, terrain.height(px, pz) - 0.3, pz]); }
  }

  fieldMb.addTo(scene, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), false, true);
  plain.addTo(scene, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), true, true);

  return {
    trees,
    occupied(x, z, m) {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
        for (const k of cellMap.get(key(cx + i, cz + j)) ?? []) {
          const r = rects[k], dx = x - r.x, dz = z - r.z, lx = dx * r.c + dz * r.s, lz = -dx * r.s + dz * r.c;
          if (Math.abs(lx) < r.w / 2 + m && Math.abs(lz) < r.d / 2 + m) return true;
        }
      return false;
    },
  };
}
