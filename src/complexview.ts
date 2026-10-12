// Le complexe sportif : piste de 400 m, aires de saut et de lancer, tribunes, projecteurs, courts de tennis, terrain de foot, panier de basket.
// Tout est construit dans le repère local du complexe (u → x, v → z) puis placé par un groupe.
import * as THREE from 'three';
import { MeshBuilder, type V } from './geom';
import { TRACK, laneR, type Complex } from './sim/sport';
import { ST } from './sim/athletics';

const C = (h: number) => new THREE.Color(h);
const UP: V = [0, 1, 0];

/** Contour fermé de la piste à la distance `r` de l'axe (u,v) : droite basse, demi-cercle droit, droite haute, demi-cercle gauche. */
export function outline(r: number, n = 28): [number, number][] {
  const h = TRACK.straight / 2, pts: [number, number][] = [];
  pts.push([-h, -r], [h, -r]);
  for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI; pts.push([h + r * Math.sin(a), -r * Math.cos(a)]); }
  pts.push([h, r], [-h, r]);
  for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI; pts.push([-h - r * Math.sin(a), r * Math.cos(a)]); }
  return pts;
}

export function buildComplex(scene: THREE.Scene, cx: Complex, env: { night: number }) {
  const g = new THREE.Group(); g.position.set(cx.f.x, cx.f.y, cx.f.z); g.rotation.y = -cx.f.rot; scene.add(g);
  const mats: THREE.MeshLambertMaterial[] = [];
  const mat = (po = -2) => { const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: po !== 0, polygonOffsetFactor: po, polygonOffsetUnits: po, emissive: new THREE.Color(0, 0, 0) }); mats.push(m); return m; };
  const flat = new MeshBuilder(), solid = new MeshBuilder();
  const Y = 0.05;
  /** rectangle à plat (centre, dimensions, rotation autour de Y), épaisseur de décalage `y` */
  const rect = (b: MeshBuilder, u: number, v: number, len: number, wid: number, y: number, col: THREE.Color, rot = 0) => {
    const c = Math.cos(rot), s = Math.sin(rot), p = (a: number, d: number): V => [u + c * a - s * d, y, v + s * a + c * d];
    b.quad([p(-len / 2, -wid / 2), p(len / 2, -wid / 2), p(len / 2, wid / 2), p(-len / 2, wid / 2)], col, UP);
  };
  const strip = (b: MeshBuilder, a: [number, number][], r0: number, r1: number, y: number, col: THREE.Color) => { void a; void r0; void r1; void y; void col; void b; };
  void strip;

  // --- herbe de l'intérieur, piste, couloirs
  const track = C(0xb4552f), line = C(0xf4f4ee), grass = C(0x4f9a4a), sand = C(0xe3cf95);
  {
    const inner = outline(TRACK.r0 - 0.6), cen: V = [0, Y, 0];
    for (let i = 0; i < inner.length; i++) { const a = inner[i], b = inner[(i + 1) % inner.length]; flat.tri([[a[0], Y, a[1]], [b[0], Y, b[1]], cen], grass, UP); }
    const ring = (ra: number, rb: number, y: number, col: THREE.Color, n = 28) => {
      const A = outline(ra, n), B = outline(rb, n);
      for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; flat.quad([[A[i][0], y, A[i][1]], [A[j][0], y, A[j][1]], [B[j][0], y, B[j][1]], [B[i][0], y, B[i][1]]], col, UP); }
    };
    ring(TRACK.r0 - 0.6, laneR(TRACK.lanes - 1) + 0.6, Y + 0.012, track);
    for (let i = 0; i <= TRACK.lanes; i++) { const r = TRACK.r0 - 0.6 + i * TRACK.lane; ring(r - 0.03, r + 0.03, Y + 0.025, line); }
    // couloirs d'élan prolongés (100 m et 110 m haies)
    for (const sgn of [-1, 1]) rect(flat, -51.1, sgn * (TRACK.r0 + (TRACK.lane * TRACK.lanes) / 2 - 0.6), 17.8, TRACK.lane * TRACK.lanes, Y + 0.012, track);
    for (const sgn of [-1, 1]) for (let i = 0; i <= TRACK.lanes; i++) rect(flat, -51.1, sgn * (TRACK.r0 - 0.6 + i * TRACK.lane), 17.8, 0.06, Y + 0.025, line);
    // ligne d'arrivée
    rect(flat, TRACK.straight / 2, -(TRACK.r0 + (TRACK.lane * TRACK.lanes) / 2 - 0.6), 0.4, TRACK.lane * TRACK.lanes, Y + 0.03, line);
    // aires : saut en longueur (piste d'élan, sautoir), perche, hauteur
    const L = ST.longueur, P = ST.perche, H = ST.hauteur;
    rect(flat, (L.start + L.pit[0]) / 2, L.v, L.pit[0] - L.start, 1.25, Y + 0.012, track);
    rect(flat, (L.pit[0] + L.pit[1]) / 2, L.v, L.pit[1] - L.pit[0], L.w, Y + 0.02, sand);
    rect(flat, L.board, L.v, 0.2, 1.25, Y + 0.03, line);
    rect(flat, (P.start + P.mat[0]) / 2, P.v, P.mat[0] - P.start, 1.25, Y + 0.012, track);
    const ang = Math.atan2(H.along.v, H.along.u);
    for (let k = 0; k < 3; k++) { const f = H.from[k], nx = k < 2 ? H.from[k + 1] : [H.bar.u, H.bar.v]; rect(flat, (f[0] + nx[0]) / 2, (f[1] + nx[1]) / 2, Math.hypot(nx[0] - f[0], nx[1] - f[1]) + 1, 1.2, Y + 0.012, track, Math.atan2(nx[1] - f[1], nx[0] - f[0])); }
    void ang;
    // cercles de lancer (poids, disque)
    for (const T of [ST.poids, ST.disque]) { const r = T === ST.poids ? 1.07 : 1.25; for (let i = 0; i < 20; i++) { const a0 = (i / 20) * Math.PI * 2, a1 = ((i + 1) / 20) * Math.PI * 2; for (const [r0, r1] of [[r - 0.04, r + 0.04]]) flat.quad([[T.u + r0 * Math.cos(a0), Y + 0.03, T.v + r0 * Math.sin(a0)], [T.u + r1 * Math.cos(a0), Y + 0.03, T.v + r1 * Math.sin(a0)], [T.u + r1 * Math.cos(a1), Y + 0.03, T.v + r1 * Math.sin(a1)], [T.u + r0 * Math.cos(a1), Y + 0.03, T.v + r0 * Math.sin(a1)]], line, UP); }
      rect(flat, T.u, T.v, 2 * (T === ST.poids ? 1.07 : 1.25) - 0.1, 2 * (T === ST.poids ? 1.07 : 1.25) - 0.1, Y + 0.02, C(0xb9b6ae)); }
    rect(flat, ST.javelot.u + 11, ST.javelot.v, 30, 4, Y + 0.012, C(0x73ad62));
    // pourtour : dalle claire autour de la piste jusqu'aux tribunes
  }
  // --- matériel fixe : haies, sautoir de perche et de hauteur
  {
    const hu = TRACK.straight / 2, white = C(0xf6f6f2), org = C(0xe08a20), blue = C(0x2d5fae), dark = C(0x555a60);
    for (const l of ST.haies.lanes) for (let k = 0; k < ST.haies.n; k++) {
      const u = hu - ST.haies.first - k * ST.haies.gap, v = laneR(l);
      solid.box(u - 0.06, u + 0.06, 0, 0.84, v - 0.6, v - 0.54, white); solid.box(u - 0.06, u + 0.06, 0, 0.84, v + 0.54, v + 0.6, white); solid.box(u - 0.12, u + 0.0, 0.7, 0.84, v - 0.6, v + 0.6, org);
    }
    const P = ST.perche; // mat de réception + butoir + poteaux
    solid.box(P.mat[0], P.mat[1], 0, 0.7, P.v - P.w / 2, P.v + P.w / 2, blue); solid.box(P.mat[0] - 0.9, P.mat[0], 0, 0.7, P.v - 2.4, P.v + 2.4, C(0xcc3a2f));
    for (const s of [-1, 1]) { solid.box(P.bar - 0.04, P.bar + 0.04, 0, 5.2, P.v + s * 2.1 - 0.04, P.v + s * 2.1 + 0.04, dark); }
    solid.box(P.bar - 0.015, P.bar + 0.015, 4.2, 4.23, P.v - 2.1, P.v + 2.1, white);
    const H = ST.hauteur, al = H.along, nrm = { u: -al.v, v: al.u };
    const mu = H.mat.u, mv = H.mat.v;
    // tapis de hauteur : boîte tournée (on l'approxime par des tranches le long de `along`)
    for (let k = -4; k <= 4; k++) { const cu = mu + al.u * k * 0.5, cv = mv + al.v * k * 0.5; solid.box(cu - 0.45 - Math.abs(nrm.u) * 1.4, cu + 0.45 + Math.abs(nrm.u) * 1.4, 0, 0.7, cv - 0.45 - Math.abs(nrm.v) * 1.4, cv + 0.45 + Math.abs(nrm.v) * 1.4, blue); }
    for (const s of [-1, 1]) { const pu = H.bar.u + al.u * s * 2, pv = H.bar.v + al.v * s * 2; solid.box(pu - 0.04, pu + 0.04, 0, 2.6, pv - 0.04, pv + 0.04, dark); }
    // barre
    const bars: V[] = [[H.bar.u - al.u * 2, 1.95, H.bar.v - al.v * 2], [H.bar.u + al.u * 2, 1.95, H.bar.v + al.v * 2]];
    for (let k = 0; k < 8; k++) { const f = k / 8, pu = bars[0][0] + (bars[1][0] - bars[0][0]) * f, pv = bars[0][2] + (bars[1][2] - bars[0][2]) * f; solid.box(pu - 0.03, pu + 0.03, 1.95, 1.98, pv - 0.03, pv + 0.03, white); }
    // arrivée / départ : petits blocs
  }
  // --- tribunes (côté v+), toit et poteaux
  const st = cx.stands;
  {
    const conc = C(0x9aa0a6), seat = [C(0x2d5fae), C(0xd8352f), C(0xf2f2f2)], len = st.u1 - st.u0;
    for (let r = 0; r < st.rows; r++) {
      const v0 = st.v0 + r * 1.0, h = (r + 1) * 0.5;
      solid.box(st.u0, st.u1, 0, h, v0, v0 + 1.0, conc);
      for (let k = 0; k < len / 2; k++) { const u = st.u0 + 1 + k * 2; if (u + 1.2 > st.u1) break; solid.box(u, u + 1.2, h, h + 0.08, v0 + 0.2, v0 + 0.8, seat[(k + (r >> 1)) % 3]); }
    }
    const top = st.v0 + st.rows, hh = st.rows * 0.5;
    solid.box(st.u0, st.u1, 0, hh + 0.6, top, top + 0.5, C(0x6d737a));
    solid.box(st.u0 - 0.5, st.u0, 0, hh, st.v0, top, conc); solid.box(st.u1, st.u1 + 0.5, 0, hh, st.v0, top, conc);
    // toit léger
    for (let k = 0; k <= 4; k++) { const u = st.u0 + (len * k) / 4; solid.box(u - 0.15, u + 0.15, 0, 6.6, top - 0.2, top + 0.1, C(0x555b63)); }
    solid.box(st.u0 - 1, st.u1 + 1, 6.6, 6.85, st.v0 - 0.5, top + 0.5, C(0xdedfe0));
  }
  // --- accueil : portique, abri, vestiaires
  {
    const gu = cx.gate.u, gv = cx.gate.v;
    solid.box(gu - 4, gu - 3.6, 0, 3.4, gv - 0.2, gv + 0.2, C(0x555b63)); solid.box(gu + 3.6, gu + 4, 0, 3.4, gv - 0.2, gv + 0.2, C(0x555b63)); solid.box(gu - 4, gu + 4, 3.2, 3.8, gv - 0.25, gv + 0.25, C(0xd8352f));
    solid.box(40, 70, 0, 3.6, -80, -70, C(0xd4cfc4)); solid.box(39.5, 70.5, 3.6, 3.9, -80.5, -69.5, C(0x7c4a3a));
    for (let k = 0; k < 6; k++) solid.box(42 + k * 5, 44 + k * 5, 1.2, 2.5, -70.02, -70.0, C(0x9ac3dd));
  }
  // --- terrains annexes
  const nets: THREE.BufferGeometry[] = [];
  for (const c of cx.courts) {
    const surf = C(c.surface), wl = c.kind === 'foot' ? C(0xf2f2f2) : C(0xf6f6f2);
    const ru = c.kind === 'tennis' ? 6 : 3, rv = c.kind === 'tennis' ? 4 : 2.5;
    rect(flat, c.u, c.v, c.len + ru * 2, c.wid + rv * 2, Y + 0.02, c.kind === 'foot' ? C(0x4a9448) : c.kind === 'tennis' ? C(c.surface).multiplyScalar(0.85) : C(c.surface).multiplyScalar(0.9));
    rect(flat, c.u, c.v, c.len, c.wid, Y + 0.035, c.kind === 'foot' ? C(0x55a653) : surf);
    const ln = (cu: number, cv: number, lu: number, lv: number) => rect(flat, c.u + cu, c.v + cv, lu, lv, Y + 0.05, wl);
    const hl = c.len / 2, hw = c.wid / 2, t = 0.07;
    ln(0, -hw, c.len, t); ln(0, hw, c.len, t); ln(-hl, 0, t, c.wid); ln(hl, 0, t, c.wid);
    if (c.kind === 'tennis') { ln(0, 0, 0.0001, 0); ln(0, -hw * 0.75, c.len, t); ln(0, hw * 0.75, c.len, t); ln(-hl * 0.46, 0, t, c.wid * 1.5 * 0.5 + 0.0001); ln(hl * 0.46, 0, t, hw * 1.5); ln(0, 0, hl * 0.92, t);
      solid.box(c.u - 0.03, c.u + 0.03, 0, 1.07, c.v - hw - 0.8, c.v - hw - 0.7, C(0x333)); solid.box(c.u - 0.03, c.u + 0.03, 0, 1.07, c.v + hw + 0.7, c.v + hw + 0.8, C(0x333)); solid.box(c.u - 0.02, c.u + 0.02, 0.5, 0.95, c.v - hw - 0.75, c.v + hw + 0.75, C(0xe8e8e8)); solid.box(c.u - 0.03, c.u + 0.03, 0.92, 0.97, c.v - hw - 0.75, c.v + hw + 0.75, C(0xffffff));
      // chaise d'arbitre
      solid.box(c.u - 0.6, c.u - 0.1, 0, 2.2, c.v + hw + 1.2, c.v + hw + 1.7, C(0x3d4350)); solid.box(c.u - 0.8, c.u + 0.0, 2.2, 2.5, c.v + hw + 1.0, c.v + hw + 1.9, C(0x2d5fae));
    } else if (c.kind === 'foot') {
      ln(0, 0, t, c.wid); const cc = 2.6; for (let i = 0; i < 16; i++) { const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2; flat.quad([[c.u + (cc - t) * Math.cos(a0), Y + 0.05, c.v + (cc - t) * Math.sin(a0)], [c.u + (cc + t) * Math.cos(a0), Y + 0.05, c.v + (cc + t) * Math.sin(a0)], [c.u + (cc + t) * Math.cos(a1), Y + 0.05, c.v + (cc + t) * Math.sin(a1)], [c.u + (cc - t) * Math.cos(a1), Y + 0.05, c.v + (cc - t) * Math.sin(a1)]], wl, UP); }
      for (const s of [-1, 1]) { const gu = c.u + s * hl; solid.box(gu - 0.05, gu + 0.05, 0, 2.1, c.v - 1.5, c.v - 1.4, C(0xf6f6f2)); solid.box(gu - 0.05, gu + 0.05, 0, 2.1, c.v + 1.4, c.v + 1.5, C(0xf6f6f2)); solid.box(gu - 0.05, gu + 0.05, 2.0, 2.1, c.v - 1.5, c.v + 1.5, C(0xf6f6f2)); solid.box(gu + s * 0.1, gu + s * 0.12, 0, 2.0, c.v - 1.5, c.v + 1.5, C(0xdddddd)); ln(s * (hl - 2.4), 0, t, 6); }
    } else {
      ln(0, 0, t, c.wid);
      for (const s of [-1, 1]) { const bu = c.u + s * (hl + 0.6); solid.box(bu - 0.06, bu + 0.06, 0, 3.0, c.v - 0.06, c.v + 0.06, C(0x3d4350)); solid.box(bu - 0.04 - s * 0.35, bu + 0.04 - s * 0.35, 2.7, 3.7, c.v - 0.9, c.v + 0.9, C(0xf2f2f2)); solid.box(bu - s * 0.8, bu - s * 0.2, 3.0, 3.05, c.v - 0.22, c.v + 0.22, C(0xe0602a)); ln(s * (hl - 2.4), 0, t, 3.6); }
    }
  }
  // --- projecteurs : 4 mâts autour de la piste, 4 petits mâts sur les terrains annexes
  const heads: V[] = [];
  const mast = (u: number, v: number, h: number, w: number, hw2: number) => { solid.box(u - 0.22, u + 0.22, 0, h, v - 0.22, v + 0.22, C(0x70767c)); heads.push([u, h, v]); void w; void hw2; };
  for (const [u, v] of [[-100, -58], [100, -58], [-100, 60], [100, 60]] as [number, number][]) mast(u, v, 24, 4, 2.4);
  for (const c of cx.courts) if (c.kind !== 'foot') for (const s of [-1, 1]) mast(c.u + s * (c.len / 2 + 5), c.v + (c.kind === 'tennis' ? 8 : 10), 9, 1.8, 1.2);
  const headM = new MeshBuilder();
  for (const [u, y, v] of heads) { const big = y > 15, w = big ? 5.2 : 2.2, hh = big ? 3 : 1.2; headM.box(u - w / 2, u + w / 2, y, y + hh, v - 0.35, v + 0.35, C(0xffffff)); }
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffee, toneMapped: false });
  const lampMesh = new THREE.Mesh(headM.build(), glowMat); g.add(lampMesh);
  const lampMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });   // mâts (pas de lueur)
  void lampMat;

  const flatGeo = flat.build(), solidGeo = solid.build();
  const flatMesh = new THREE.Mesh(flatGeo, mat(-3)); flatMesh.receiveShadow = true; g.add(flatMesh);
  const solidMesh = new THREE.Mesh(solidGeo, mat(0)); solidMesh.castShadow = true; solidMesh.receiveShadow = true; g.add(solidMesh);
  // éclairage par les projecteurs : les mêmes maillages redessinés en additif sans ombrage, pour garder leurs couleurs
  const lightMat = (po: number) => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: po, polygonOffsetUnits: po, toneMapped: false });
  const lmF = lightMat(-6), lmS = lightMat(-1);
  g.add(new THREE.Mesh(flatGeo, lmF)); g.add(new THREE.Mesh(solidGeo, lmS));
  // lueur au sol (additive) sous les projecteurs
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cc = cv.getContext('2d')!, gr = cc.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,248,220,0.85)'); gr.addColorStop(0.55, 'rgba(255,240,200,0.35)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); cc.fillStyle = gr; cc.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(cv);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  glow.rotation.x = -Math.PI / 2; glow.scale.set(240, 190, 1); glow.position.set(0, 0.35, 22); g.add(glow);
  void nets;

  let lit = 0;
  return {
    group: g, get lit() { return lit; },
    update(on: boolean, dt: number) {
      lit += ((on ? 1 : 0) - lit) * Math.min(1, dt * 1.2);
      lmF.opacity = lit * 0.5 * env.night; lmS.opacity = lit * 0.34 * env.night;
      (glow.material as THREE.MeshBasicMaterial).opacity = lit * 0.1 * env.night;
      lampMesh.visible = true; glowMat.color.setRGB(0.35 + 0.65 * lit, 0.35 + 0.65 * lit, 0.32 + 0.6 * lit);
    },
  };
}
export type ComplexView = ReturnType<typeof buildComplex>;
