import * as THREE from 'three';
import { MeshBuilder, gableRoof, type V } from './geom';
import { RUNWAY, portGeom, type Poi } from './sim/pois';
import type { DayNight } from './env';

const C = (h: number) => new THREE.Color(h);
const STONE = [C(0xb4ada0), C(0xa59f93), C(0x9c968a)], DARK = C(0x7d786f), RED = C(0xa8442f), WOOD = C(0x6e4a30), WHITE = C(0xe8e4da);

/** Prisme à n côtés, de rayon r0 en bas à r1 en haut, fermé en haut. */
function prism(mb: MeshBuilder, cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, n: number, c: THREE.Color, rot = 0, cap: THREE.Color | null = c) {
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2, m = (a0 + a1) / 2;
    const p = (r: number, a: number, y: number): V => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
    mb.quad([p(r0, a0, y0), p(r0, a1, y0), p(r1, a1, y1), p(r1, a0, y1)], c, [Math.cos(m), 0, Math.sin(m)]);
    if (cap) mb.tri([[cx, y1, cz], p(r1, a0, y1), p(r1, a1, y1)], cap, [0, 1, 0]);
  }
}
function cone(mb: MeshBuilder, cx: number, cz: number, y0: number, h: number, r: number, n: number, c: THREE.Color, rot = 0) {
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2, m = (a0 + a1) / 2;
    mb.tri([[cx, y0 + h, cz], [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r]], c, [Math.cos(m), 0.6, Math.sin(m)]);
  }
}
/** Boîte tournée de `rot` autour de (cx, cz). */
function rbox(mb: MeshBuilder, cx: number, cz: number, y0: number, y1: number, w: number, d: number, rot: number, c: THREE.Color) {
  const cs = Math.cos(rot), sn = Math.sin(rot), p = (lx: number, lz: number, y: number): V => [cx + lx * cs - lz * sn, y, cz + lx * sn + lz * cs];
  const L: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  for (let i = 0; i < 4; i++) {
    const a = L[i], b = L[(i + 1) % 4], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, o = p(mx, mz, y0);
    mb.quad([p(a[0], a[1], y0), p(b[0], b[1], y0), p(b[0], b[1], y1), p(a[0], a[1], y1)], c, [o[0] - cx, 0, o[2] - cz]);
  }
  mb.quad([p(L[0][0], L[0][1], y1), p(L[1][0], L[1][1], y1), p(L[2][0], L[2][1], y1), p(L[3][0], L[3][1], y1)], c, [0, 1, 0]);
}

function castle(mb: MeshBuilder, P: Poi) {
  const { x, y, z, rot } = P, cs = Math.cos(rot), sn = Math.sin(rot), at = (lx: number, lz: number): [number, number] => [x + lx * cs - lz * sn, z + lx * sn + lz * cs];
  rbox(mb, x, z, y - 9, y + 0.8, 66, 66, rot, DARK);                           // soubassement enterré dans la colline
  const S = 24, H = 11;
  // courtines
  for (const [lx, lz, w, d] of [[0, -S, 2 * S, 2.6], [0, S, 2 * S, 2.6], [-S, 0, 2.6, 2 * S], [S, 0, 2.6, 2 * S]] as number[][]) {
    const [px, pz] = at(lx, lz); rbox(mb, px, pz, y, y + H, w, d, rot, STONE[0]);
    // créneaux
    const n = Math.floor((w > d ? w : d) / 4);
    for (let i = 0; i < n; i++) { const t = -((w > d ? w : d) / 2) + 2 + i * 4, [qx, qz] = at(lx + (w > d ? t : 0), lz + (w > d ? 0 : t)); rbox(mb, qx, qz, y + H, y + H + 1.4, w > d ? 2 : w, w > d ? d : 2, rot, STONE[1]); }
  }
  // tours d'angle
  for (const [lx, lz] of [[-S, -S], [S, -S], [S, S], [-S, S]]) {
    const [px, pz] = at(lx, lz);
    prism(mb, px, pz, y - 1, y + H + 8, 5.4, 5, 8, STONE[1], rot, null);
    prism(mb, px, pz, y + H + 8, y + H + 9, 6.2, 6.2, 8, DARK, rot, DARK);
    cone(mb, px, pz, y + H + 9, 8, 6.4, 8, RED, rot);
  }
  // donjon
  const [kx, kz] = at(-4, 4);
  rbox(mb, kx, kz, y, y + 30, 15, 15, rot, STONE[2]);
  rbox(mb, kx, kz, y + 30, y + 32, 17, 17, rot, DARK);
  for (const [lx, lz] of [[-7, -7], [7, -7], [7, 7], [-7, 7]]) { const [qx, qz] = at(-4 + lx, 4 + lz); rbox(mb, qx, qz, y + 32, y + 34, 3, 3, rot, STONE[0]); }
  cone(mb, kx, kz, y + 32, 10, 8, 4, RED, rot + Math.PI / 4);
  // logis
  const [lx2, lz2] = at(10, -12); rbox(mb, lx2, lz2, y, y + 10, 18, 9, rot, STONE[0]);
  const rbx = lx2, rbz = lz2; cone(mb, rbx, rbz, y + 10, 6, 11, 4, RED, rot + Math.PI / 4);
  // porte
  const [gx, gz] = at(0, S); rbox(mb, gx, gz, y, y + 6, 7, 3, rot, DARK);
}

function lighthouse(mb: MeshBuilder, P: Poi) {
  const { x, y, z } = P;
  prism(mb, x, z, y - 5, y + 1.5, 6.6, 6.2, 10, DARK, 0, DARK);
  const bands = 6, H = 26;
  for (let i = 0; i < bands; i++) prism(mb, x, z, y + 1.5 + (H / bands) * i, y + 1.5 + (H / bands) * (i + 1), 5 - (3 * i) / bands * 0.9, 5 - (3 * (i + 1)) / bands * 0.9, 10, i % 2 ? RED : WHITE, 0, null);
  prism(mb, x, z, y + 1.5 + H, y + 2.1 + H, 3.6, 3.6, 10, DARK, 0, DARK);       // galerie
  prism(mb, x, z, y + 2.1 + H + 3.2, y + 2.1 + H + 3.4, 2.6, 2.6, 10, DARK, 0, DARK);
  cone(mb, x, z, y + 2.1 + H + 3.4, 3.2, 2.7, 10, RED);
}
function ruin(mb: MeshBuilder, P: Poi, rand: () => number) {
  const { x, y, z, rot } = P, cs = Math.cos(rot), sn = Math.sin(rot), at = (lx: number, lz: number): [number, number] => [x + lx * cs - lz * sn, z + lx * sn + lz * cs];
  rbox(mb, x, z, y - 6, y + 0.4, 30, 24, rot, DARK);
  // murs en dents de scie
  for (const [lx, lz, w, d] of [[0, -11, 28, 1.8], [-14, 0, 1.8, 22], [14, 1, 1.8, 14], [3, 11, 14, 1.8]] as number[][]) {
    const n = Math.max(2, Math.round(Math.max(w, d) / 4)), seg = Math.max(w, d) / n;
    for (let i = 0; i < n; i++) {
      const t = -Math.max(w, d) / 2 + seg * (i + 0.5), [px, pz] = at(lx + (w > d ? t : 0), lz + (w > d ? 0 : t)), h = 1.5 + rand() * 7;
      rbox(mb, px, pz, y, y + h, w > d ? seg : w, w > d ? d : seg, rot, STONE[i % 3]);
    }
  }
  // tour tronquée + blocs tombés
  const [tx, tz] = at(-9, 7); prism(mb, tx, tz, y - 1, y + 13, 4.4, 4, 8, STONE[1], rot, null);
  for (let i = 0; i < 9; i++) { const [bx, bz] = at(-15 + rand() * 30, -12 + rand() * 24); rbox(mb, bx, bz, y, y + 0.7 + rand() * 0.9, 1.2 + rand() * 1.4, 1.2 + rand(), rand() * 6, STONE[i % 3]); }
}
function millBody(mb: MeshBuilder, P: Poi) {
  const { x, y, z } = P;
  prism(mb, x, z, y - 3, y + 1, 5.4, 5, 8, DARK, 0, DARK);
  prism(mb, x, z, y + 1, y + 13, 5, 3.4, 8, WHITE, 0, null);
  prism(mb, x, z, y + 13, y + 13.4, 4, 4, 8, WOOD, 0, WOOD);
  cone(mb, x, z, y + 13.4, 4, 3.8, 8, WOOD);
  rbox(mb, x + 5, z, y, y + 2.6, 2.4, 1.6, 0, WOOD);
}

function airfield(mb: MeshBuilder, P: Poi) {
  const rr = Math.PI / 2 - P.rot, ux = Math.sin(P.rot), uz = Math.cos(P.rot), nx = Math.cos(P.rot), nz = -Math.sin(P.rot);
  const at = (p: number, q: number): [number, number] => [P.x + ux * p + nx * q, P.z + uz * p + nz * q];
  const y = P.y + 0.4, conc = C(0xa8a69f), asph = C(0x3b3d41), white = C(0xf2f2f0);
  rbox(mb, P.x, P.z, y - 14, y, RUNWAY.len + 24, RUNWAY.wid + 8, rr, conc);
  rbox(mb, P.x, P.z, y, y + 0.08, RUNWAY.len, RUNWAY.wid, rr, asph);
  for (let p = -150; p <= 150; p += 30) { const [qx, qz] = at(p, 0); rbox(mb, qx, qz, y + 0.08, y + 0.14, 14, 0.8, rr, white); }
  for (const e of [-1, 1]) for (let q = -9; q <= 9; q += 3) { const [qx, qz] = at(e * (RUNWAY.len / 2 - 8), q); rbox(mb, qx, qz, y + 0.08, y + 0.14, 10, 1.2, rr, white); }
  // aire de stationnement et hangar
  const [ax, az] = at(-40, 36); rbox(mb, ax, az, y - 8, y + 0.05, 100, 40, rr, conc);
  const [hx, hz] = at(-40, 50); rbox(mb, hx, hz, y, y + 8, 46, 22, rr, C(0xc9ccd0)); gableRoof(mb, hx, hz, y + 8, 46, 22, 4.5, rr, C(0x6d7a8a), 0.6);
  const [tx, tz] = at(30, 40); rbox(mb, tx, tz, y, y + 3.2, 10, 8, rr, C(0xe6dcc8)); rbox(mb, tx, tz, y + 3.2, y + 3.5, 11, 9, rr, DARK);   // petit bâtiment
  const [wx, wz] = at(-120, -22); rbox(mb, wx, wz, y, y + 6, 0.3, 0.3, rr, DARK); cone(mb, wx, wz, y + 5, 3, 0.9, 6, C(0xe8761f));        // manche à air
}

function harbour(mb: MeshBuilder, P: Poi, level: number) {
  const dx = Math.cos(P.rot), dz = Math.sin(P.rot), at = (p: number, q: number): [number, number] => [P.x + dx * p - dz * q, P.z + dz * p + dx * q];
  const top = level + 1.5, conc = C(0xb3b0a8), red = C(0xc4472f);
  const [yx, yz] = at(-18, 0); rbox(mb, yx, yz, level - 8, top, 44, 56, P.rot, conc);             // terre-plein
  const [px, pz] = at(28, 0); rbox(mb, px, pz, level - 4, top, 62, 15, P.rot, C(0x9d9a92));          // quai dans l'eau
  const cols = [C(0xc4472f), C(0x2f6bb5), C(0xe0a22a), C(0x3f8f5a), C(0x8a8f96), C(0xd9d4c8)];
  let k = 0;
  for (let i = 0; i < 3; i++) for (let j = -2; j <= 2; j += 2) {
    const [cx, cz] = at(-26 + i * 7.5, j * 6.4); const h = 1 + ((i * 3 + j + 7) % 3);
    for (let n = 0; n < h; n++) rbox(mb, cx, cz, top + n * 2.6, top + (n + 1) * 2.6 - 0.05, 6.6, 2.5, P.rot, cols[(k++) % cols.length]);
  }
  for (const [p, hi] of [[40, 22], [8, 18]] as const) {                                                // portiques
    for (const q of [-5.5, 5.5]) { const [lx, lz] = at(p, q); rbox(mb, lx, lz, top, top + hi, 1.3, 1.3, P.rot, red); }
    const [bx, bz] = at(p, 0); rbox(mb, bx, bz, top + hi, top + hi + 1.8, 2.6, 17, P.rot, red);
    const [jx, jz] = at(p + 11, 0); rbox(mb, jx, jz, top + hi + 0.2, top + hi + 1.6, 28, 1.6, P.rot, C(0xe8ae2e));   // flèche vers l'eau
  }
  const [sx, sz] = at(-4, 18); rbox(mb, sx, sz, top, top + 5, 9, 6, P.rot, C(0xe6dcc8)); rbox(mb, sx, sz, top + 5, top + 5.3, 10, 7, P.rot, DARK);
}


/** Grand port maritime : terre-plein, entrepôts, jetée de 130 m aux deux flancs (navires à quai), portiques, piles de conteneurs. */
function harbourSea(mb: MeshBuilder, P: Poi) {
  const G = portGeom(P), dx = Math.cos(P.rot), dz = Math.sin(P.rot), at = (p: number, q: number): [number, number] => [P.x + dx * p - dz * q, P.z + dz * p + dx * q];
  const lv = P.y, yTop = lv + 2.5, pTop = lv + 2.0, conc = C(0xb3b0a8), conc2 = C(0x9d9a92), red = C(0xc4472f);
  const cols = [C(0xc4472f), C(0x2f6bb5), C(0xe0a22a), C(0x3f8f5a), C(0x8a8f96), C(0xd9d4c8), C(0x7a3b8f)];
  const [yx, yz] = at(-40, 0); rbox(mb, yx, yz, lv - 10, yTop, 84, 170, P.rot, conc);                                // terre-plein
  const [px, pz] = at(G.pier / 2, 0); rbox(mb, px, pz, lv - 9, pTop, G.pier, G.half * 2, P.rot, conc2);               // jetée
  for (let k = 0; k < 9; k++) for (const q of [-1, 1]) { const [bx, bz] = at(10 + k * 14, q * (G.half - 0.5)); rbox(mb, bx, bz, pTop, pTop + 0.5, 0.7, 0.7, P.rot, DARK); }  // bollards
  // piles de conteneurs : sur le terre-plein et au milieu de la jetée
  let k = 0;
  const stack = (p: number, q: number, h: number, top: number) => { const [cx, cz] = at(p, q); for (let n = 0; n < h; n++) rbox(mb, cx, cz, top + n * 2.6, top + (n + 1) * 2.6 - 0.05, 12.2, 2.5, P.rot, cols[(k++) % cols.length]); };
  for (let i = 0; i < 6; i++) for (let j = -5; j <= 5; j++) { if ((i * 7 + j * 3 + 20) % 4 === 0) continue; stack(-8 - i * 14, j * 5.6, 1 + ((i * 5 + j + 11) % 4), yTop); }
  for (let i = 0; i < 5; i++) for (const q of [-4.5, 0, 4.5]) { if ((i + q * 2 + 9) % 5 === 0) continue; stack(24 + i * 20 + (i > 1 ? 14 : 0), q, 1 + ((i * 3 + (q > 0 ? 1 : 0)) % 3), pTop); }
  // entrepôts
  for (const [p, q] of [[-58, -62], [-58, 62]]) { const [wx, wz] = at(p, q); rbox(mb, wx, wz, yTop, yTop + 8, 20, 46, P.rot, C(0xc9ccd0)); rbox(mb, wx, wz, yTop + 8, yTop + 9.2, 21.4, 47.4, P.rot, C(0x7d8791)); }
  // bureau avec vigie
  const [ox, oz] = at(-12, 70); rbox(mb, ox, oz, yTop, yTop + 5, 10, 18, P.rot, C(0xe6dcc8)); rbox(mb, ox, oz, yTop + 5, yTop + 5.4, 11, 19, P.rot, DARK);
  rbox(mb, ox, oz, yTop + 5.4, yTop + 17, 2.6, 2.6, P.rot, WHITE); rbox(mb, ox, oz, yTop + 17, yTop + 20, 6, 6, P.rot, C(0x5b8aa8)); rbox(mb, ox, oz, yTop + 20, yTop + 20.5, 7, 7, P.rot, DARK);
  // portiques (leurs parties mobiles sont dessinées par boatsview)
  for (const cp of G.craneP) {
    const H = 30;
    for (const q of [-G.half - 1.5, G.half + 1.5]) for (const dp of [-4, 4]) { const [lx, lz] = at(cp + dp, q); rbox(mb, lx, lz, pTop, pTop + H, 1.5, 1.5, P.rot, red); }
    for (const q of [-G.half - 1.5, G.half + 1.5]) { const [lx, lz] = at(cp, q); rbox(mb, lx, lz, pTop + H * 0.55, pTop + H * 0.55 + 1, 1, 8, P.rot, red); }
    const [bx, bz] = at(cp, 0); rbox(mb, bx, bz, pTop + H, pTop + H + 2.4, 10, 2 * (G.half + 24), P.rot, red);                 // poutre transversale, avec avancée au-dessus des deux navires
    rbox(mb, bx, bz, pTop + H + 2.4, pTop + H + 2.9, 10.4, 2 * (G.half + 24) + 0.4, P.rot, C(0xe8ae2e));
  }
}

export interface PoiViews { update(t: number, wind: number): void; lights: THREE.Object3D[] }

export function buildPois(scene: THREE.Scene, pois: Poi[], env: DayNight, seed = 1, lakeLevel = 0): PoiViews {
  const mb = new MeshBuilder(), blades: { g: THREE.Mesh; face: number }[] = [];
  let k = 0; const rand = () => { k++; return (Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1 * 0.5 + 0.5; };
  const beams: THREE.Mesh[] = [];
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const lantern = new THREE.MeshBasicMaterial({ color: 0x777777 });
  for (const P of pois) {
    if (P.kind === 'château') castle(mb, P);
    else if (P.kind === 'aérodrome') airfield(mb, P);
    else if (P.kind === 'port') { if (P.water === 'mer') harbourSea(mb, P); else harbour(mb, P, P.y || lakeLevel); }
    else if (P.kind === 'ruine') ruin(mb, P, () => Math.abs(rand()));
    else if (P.kind === 'moulin') {
      millBody(mb, P);
      const g = new THREE.Group(), hubY = P.y + 10.5, arm = new MeshBuilder();
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), rot = (lx: number, ly: number): V => [lx * ca - ly * sa, lx * sa + ly * ca, 0];
        const pts = [rot(-0.2, 0.5), rot(0.2, 0.5), rot(0.2, 10), rot(-0.2, 10)] as [V, V, V, V];
        arm.quad(pts, WOOD, [0, 0, 1]); arm.quad(pts, WOOD, [0, 0, -1]);
        const sail = [rot(0.2, 2), rot(2.6, 2), rot(2.6, 9.4), rot(0.2, 9.4)] as [V, V, V, V];
        arm.quad(sail, WHITE, [0, 0, 1]); arm.quad(sail, WHITE, [0, 0, -1]);
      }
      const m = new THREE.Mesh(arm.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true }));
      m.castShadow = true; g.add(m); g.position.set(P.x, hubY + 1.2, P.z); g.rotation.y = P.rot; m.position.z = 4.8;
      scene.add(g); blades.push({ g: m, face: P.rot });
    } else {
      lighthouse(mb, P);
      const top = P.y + 2.1 + 26 + 1.7;
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.6, 10), lantern); lamp.position.set(P.x, top, P.z); scene.add(lamp);
      const bg = new THREE.PlaneGeometry(90, 3.4).translate(45, 0, 0), beam = new THREE.Mesh(bg, beamMat);
      beam.position.set(P.x, top, P.z); beam.rotation.x = 0; beams.push(beam); scene.add(beam);
    }
  }
  const m = new THREE.Mesh(mb.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.castShadow = true; m.receiveShadow = true; scene.add(m);
  return {
    lights: beams,
    update(t: number, wind: number) {
      for (const b of blades) b.g.rotation.z = t * 0.5 * wind;
      beamMat.opacity = Math.max(0, env.night - 0.2) * 0.35;
      lantern.color.setRGB(0.45 + env.night * 0.55, 0.45 + env.night * 0.5, 0.45 + env.night * 0.15);
      beams.forEach((b, i) => { b.rotation.set(-Math.PI / 2, 0, 0); b.rotation.order = 'YXZ'; b.rotation.y = t * 0.8 + i; });
    },
  };
}
