import * as THREE from 'three';
import { MeshBuilder, type V } from './geom';
import type { Ships, ShipKind } from './sim/boats';
import { portAt, portGeom } from './sim/pois';
import { sailboat } from './faunaview';

const C = (h: number) => new THREE.Color(h);
const lam = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** Coque : stations (t de la poupe 0 à la proue 1, demi-largeur relative), fond en V, bordé au-dessus de la flottaison (y = 0). */
function hull(b: MeshBuilder, len: number, beam: number, draft: number, free: number, st: [number, number][], low: THREE.Color, up: THREE.Color, deck: THREE.Color) {
  const z = (t: number) => -len / 2 + t * len, hw = beam / 2;
  for (let i = 0; i < st.length - 1; i++) {
    const [ta, wa] = st[i], [tb, wb] = st[i + 1], za = z(ta), zb = z(tb), xa = wa * hw, xb = wb * hw;
    for (const s of [-1, 1]) {
      b.quad([[s * xa * 0.55, -draft, za], [s * xb * 0.55, -draft, zb], [s * xb, 0, zb], [s * xa, 0, za]], low, [s, -0.2, 0]);
      b.quad([[s * xa, 0, za], [s * xb, 0, zb], [s * xb, free, zb], [s * xa, free, za]], up, [s, 0, 0]);
    }
    b.quad([[-xa * 0.55, -draft, za], [xa * 0.55, -draft, za], [xb * 0.55, -draft, zb], [-xb * 0.55, -draft, zb]], low, [0, -1, 0]);
    b.quad([[-xa, free, za], [xa, free, za], [xb, free, zb], [-xb, free, zb]], deck, [0, 1, 0]);
  }
  const [t0, w0] = st[0], x0 = w0 * hw, z0 = z(t0);       // tableau arrière
  b.quad([[-x0 * 0.55, -draft, z0], [x0 * 0.55, -draft, z0], [x0, 0, z0], [-x0, 0, z0]], low, [0, 0, -1]);
  b.quad([[-x0, 0, z0], [x0, 0, z0], [x0, free, z0], [-x0, free, z0]], up, [0, 0, -1]);
}
const STERN_BOW: [number, number][] = [[0, 0.8], [0.06, 0.96], [0.16, 1], [0.7, 1], [0.82, 0.93], [0.92, 0.7], [0.97, 0.38], [1, 0.06]];

function cargo(): THREE.BufferGeometry {
  const b = new MeshBuilder(), W = C(0xf2efe6), D = C(0x3c4046);
  hull(b, 104, 17, 5, 4.6, STERN_BOW, C(0x7a2f26), C(0x2d3d52), C(0x5b5f63));
  b.box(-7.5, 7.5, 4.6, 9, -48, -36, W); b.box(-6.2, 6.2, 9, 12.6, -47, -39, W); b.box(-6.3, 6.3, 11.2, 12, -39.1, -38.9, D); b.box(-6.3, 6.3, 9.8, 10.4, -39.1, -38.9, D);
  b.box(-6.8, 6.8, 12.6, 13, -47.4, -38.4, D); b.box(-2, 2, 13, 18, -46, -42, C(0xc4472f)); b.box(-2.05, 2.05, 17, 18, -46, -42, D);
  b.box(-0.3, 0.3, 4.6, 9, 40, 40.6, C(0x777777)); b.box(-0.6, 0.6, 4.6, 5.6, 38, 44, C(0x777777));
  return b.build();
}
function tanker(): THREE.BufferGeometry {
  const b = new MeshBuilder(), W = C(0xf2efe6), D = C(0x3c4046);
  hull(b, 120, 21, 7, 4.2, STERN_BOW, C(0x24323a), C(0x7a2f26), C(0x4b5a4e));
  for (let i = 0; i < 6; i++) b.box(-2.5, 2.5, 4.2, 5.4, -36 + i * 13, -30 + i * 13, C(0xb5b9bd));
  b.box(-0.4, 0.4, 4.2, 5.2, -40, 44, C(0xd8d4c8));
  b.box(-8, 8, 4.2, 9, -56, -44, W); b.box(-6.6, 6.6, 9, 13, -55, -46, W); b.box(-6.7, 6.7, 11.6, 12.4, -45.9, -45.7, D); b.box(-2, 2, 13, 17.5, -54, -50, C(0x2d3d52));
  return b.build();
}
function ferry(): THREE.BufferGeometry {
  const b = new MeshBuilder(), W = C(0xf4f3ee), Bl = C(0x2f5f9f), D = C(0x36404c);
  hull(b, 48, 11, 2.4, 3.4, STERN_BOW, C(0x2a2f36), W, C(0xd8d4c8));
  for (const s of [-1, 1]) b.quad([[s * 5.5, 0.6, -22], [s * 5.5, 0.6, 18], [s * 5.5, 1.5, 18], [s * 5.5, 1.5, -22]], Bl, [s, 0, 0]);
  b.box(-4.8, 4.8, 3.4, 6.4, -20, 12, W); b.box(-4, 4, 6.4, 9.2, -13, 6, W);
  for (const s of [-1, 1]) { b.quad([[s * 4.85, 4.2, -19], [s * 4.85, 4.2, 11], [s * 4.85, 5.4, 11], [s * 4.85, 5.4, -19]], D, [s, 0, 0]); b.quad([[s * 4.05, 7, -12], [s * 4.05, 7, 5], [s * 4.05, 8.2, 5], [s * 4.05, 8.2, -12]], D, [s, 0, 0]); }
  b.box(-3.2, 3.2, 9.2, 11, -2, 4, W); b.box(-3.25, 3.25, 9.8, 10.6, 3.9, 4.1, D);
  b.box(-1.4, 1.4, 9.2, 13, -10, -7, C(0xc4472f)); b.box(-1.45, 1.45, 12.2, 13, -10.1, -6.9, D);
  return b.build();
}
function barge(): THREE.BufferGeometry {
  const b = new MeshBuilder(), D = C(0x2b2e33);
  hull(b, 36, 5.2, 1.1, 1.4, [[0, 0.9], [0.04, 1], [0.92, 1], [0.97, 0.7], [1, 0.25]], C(0x1f2226), D, C(0x4b4f55));
  b.box(-2, 2, 1.4, 3.8, -17, -10.5, C(0xf0ebe0)); b.box(-2.1, 2.1, 3.8, 4.1, -17.2, -10.3, C(0xc4472f)); b.box(-2.05, 2.05, 2.4, 3.2, -10.6, -10.4, D);
  b.box(-2, 2, 1.4, 1.9, -8, 15, C(0x6b5a44)); b.box(-0.8, 0.8, 4.1, 5.3, -15, -13, C(0x555a60));
  return b.build();
}
function trawler(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  hull(b, 16, 4.6, 1.5, 1.6, STERN_BOW, C(0x2a2f36), C(0x2f5f9f), C(0xb7ad98));
  b.box(-1.6, 1.6, 1.6, 4.2, -3.6, 1.2, C(0xf4f3ee)); b.box(-1.65, 1.65, 2.8, 3.5, 1.1, 1.3, C(0x36404c));
  b.box(-0.1, 0.1, 1.6, 7.5, 3.5, 3.7, C(0x555555)); b.box(-0.07, 0.07, 6.2, 6.4, -2, 3.7, C(0x555555));
  return b.build();
}
const CONT_COLS = [0xc4472f, 0x2f6bb5, 0xe0a22a, 0x3f8f5a, 0x8a8f96, 0xd9d4c8, 0x7a3b8f, 0xb35a2a].map(C);
const MAX_SLOTS = 108;

const GEO: Record<ShipKind, () => THREE.BufferGeometry> = { cargo, pétrolier: tanker, ferry, péniche: barge, voilier: sailboat, pêcheur: trawler };
const COUNT: Record<ShipKind, number> = { cargo: 6, pétrolier: 3, ferry: 6, péniche: 8, voilier: 16, pêcheur: 8 };

export interface BoatViews { /** Marée (m) et niveau de la mer : les navires de mer montent et descendent avec elle. */ tide: number; seaLevel: number | null; update(cam: THREE.Vector3, t: number, night?: number): void }

/** Navires (instances), sillages, conteneurs sur les cargos et portiques animés des ports. */
export function buildBoats(scene: THREE.Scene, ships: Ships): BoatViews {
  const meshes = new Map<ShipKind, THREE.InstancedMesh>();
  for (const k of Object.keys(GEO) as ShipKind[]) {
    const m = new THREE.InstancedMesh(GEO[k](), lam(), COUNT[k]); m.frustumCulled = false; m.count = 0; m.castShadow = true; m.receiveShadow = false; scene.add(m); meshes.set(k, m);
  }
  const contGeo = (() => { const b = new MeshBuilder(); b.box(-1.2, 1.2, 0, 2.55, -6, 6, C(0xffffff)); return b.build(); })();
  const contM = new THREE.InstancedMesh(contGeo, new THREE.MeshLambertMaterial({ flatShading: true }), COUNT.cargo * MAX_SLOTS); contM.frustumCulled = false; contM.count = 0; contM.castShadow = true; scene.add(contM);
  // sillage : deux bras en V et un remous central, plats, dont l'opacité s'efface avec la distance
  const wg = (() => {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const q = (a: [number, number], b: [number, number], c: [number, number], d: [number, number], al: [number, number, number, number]) => {
      const k = pos.length / 3; for (let i = 0; i < 4; i++) { const p = [a, b, c, d][i]; pos.push(p[0], 0, p[1]); col.push(1, 1, 1, al[i]); } idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    };
    for (const sg of [-1, 1]) q([sg * 0.04, 0.42], [sg * 0.13, 0.42], [sg * 0.62, -1.7], [sg * 0.5, -1.7], [0.5, 0.5, 0, 0]);   // bras
    q([-0.17, -0.45], [0.17, -0.45], [0.35, -1.5], [-0.35, -1.5], [0.4, 0.4, 0, 0]);                                              // remous
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); return g;
  })();
  const wake = new THREE.InstancedMesh(wg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }), 48); wake.frustumCulled = false; wake.count = 0; wake.renderOrder = 3; scene.add(wake);
  const o = new THREE.Object3D(), M = new THREE.Matrix4(), L = new THREE.Matrix4(), cc = new THREE.Color();
  // emplacements de conteneurs : 6 travées × 6 colonnes × 3 niveaux ; l'ordre d'apparition mélange les colonnes, niveau par niveau
  const slots = (() => { const a: { x: number; y: number; z: number; rank: number; ci: number }[] = []; let q = 7; const r = () => { q = (q * 16807) % 2147483647; return q / 2147483647; };
    for (let lv = 0; lv < 3; lv++) for (let bay = 0; bay < 6; bay++) for (let col = 0; col < 6; col++) a.push({ x: -6 + col * 2.4 + 1.2 - 0.6, y: 4.6 + lv * 2.6, z: -28 + bay * 13.6, rank: lv * 100 + r() * 100, ci: Math.floor(r() * CONT_COLS.length) });
    return a.sort((p, s) => p.rank - s.rank).map((s, i) => ({ ...s, rank: i })); })();
  // portiques mobiles des grands ports
  interface Crane { g: THREE.Group; trolley: THREE.Mesh; cable: THREE.Mesh; load: THREE.Mesh; port: number; cp: number; off: number }
  const cranes: Crane[] = [];
  ships.ports.forEach((ps, pi) => {
    if (ps.poi.water !== 'mer') return;
    const G = portGeom(ps.poi);
    G.craneP.forEach((cp, k) => {
      const g = new THREE.Group(), top = ps.poi.y + 2 + 30 + 2.9;
      const tr = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 5), new THREE.MeshLambertMaterial({ color: 0xe8ae2e, flatShading: true })); tr.position.y = top + 1.3; g.add(tr);
      const cable = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1, 0.16), new THREE.MeshBasicMaterial({ color: 0x222222 })); g.add(cable);
      const load = new THREE.Mesh(new THREE.BoxGeometry(12, 2.55, 2.4), new THREE.MeshLambertMaterial({ color: CONT_COLS[(pi + k) % CONT_COLS.length], flatShading: true })); g.add(load);
      const [gx, gz] = portAt(ps.poi, cp, 0); g.position.set(gx, ps.poi.y, gz); tr.position.y = top + 1.3 - ps.poi.y;
      g.rotation.y = -ps.poi.rot; scene.add(g); cranes.push({ g, trolley: tr, cable, load, port: pi, cp, off: k * 0.37 });
    });
  });
  const near = (x: number, z: number, cam: THREE.Vector3, r: number) => (x - cam.x) ** 2 + (z - cam.z) ** 2 < r * r;
  const smooth = (u: number) => u * u * (3 - 2 * u);
  return {
    tide: 0, seaLevel: null as number | null,
    update(cam, t, night = 0) {
      (wake.material as THREE.MeshBasicMaterial).color.setScalar(1 - 0.9 * night);   // le sillage n'est pas éclairé : on l'assombrit la nuit
      const cnt = new Map<ShipKind, number>(); let nw = 0, nc = 0;
      for (const sh of ships.ships) {
        if (sh.hidden || !near(sh.x, sh.z, cam, 4200)) continue;
        const m = meshes.get(sh.kind)!, i = cnt.get(sh.kind) ?? 0; if (i >= COUNT[sh.kind]) continue; cnt.set(sh.kind, i + 1);
        const big = sh.len > 60, bob = Math.sin(t * (big ? 0.5 : 1.1) + sh.ph) * (big ? 0.12 : 0.1), roll = Math.sin(t * (big ? 0.35 : 0.8) + sh.ph) * (sh.kind === 'voilier' ? 0.05 : big ? 0.012 : 0.03) - (sh.kind === 'voilier' ? 0.1 : 0);
        o.position.set(sh.x, sh.y + bob + (this.seaLevel !== null && Math.abs(sh.y - this.seaLevel) < 0.6 ? this.tide : 0), sh.z); o.rotation.set(Math.sin(t * 0.4 + sh.ph) * 0.006, sh.yaw, roll, 'YXZ'); { const sc = sh.len / ({ cargo: 104, pétrolier: 120, ferry: 48, péniche: 36, voilier: 10, pêcheur: 16 } as const)[sh.kind]; o.scale.set(sc, sc, sc); } o.updateMatrix(); m.setMatrixAt(i, o.matrix);
        if (sh.kind === 'cargo' && near(sh.x, sh.z, cam, 1500)) {
          M.copy(o.matrix); const n = Math.round(sh.load * MAX_SLOTS);
          for (const s of slots) { if (s.rank >= n || nc >= contM.instanceMatrix.count) continue; o.position.set(s.x, s.y, s.z); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix(); L.multiplyMatrices(M, o.matrix); contM.setMatrixAt(nc, L); contM.setColorAt(nc, cc.copy(CONT_COLS[s.ci])); nc++; }
        }
        if (Math.abs(sh.v) > 0.6 && nw < 48) { o.position.set(sh.x, sh.y + 0.07, sh.z); o.rotation.set(0, sh.yaw + (sh.v < 0 ? Math.PI : 0), 0); const L1 = sh.len, s = Math.min(1, Math.abs(sh.v) / 5); o.scale.set(L1 * (0.5 + 0.3 * s), 1, L1 * (0.8 + 1.4 * s)); o.updateMatrix(); wake.setMatrixAt(nw++, o.matrix); }
      }
      for (const [k, m] of meshes) { m.count = cnt.get(k) ?? 0; m.instanceMatrix.needsUpdate = true; }
      contM.count = nc; contM.instanceMatrix.needsUpdate = true; if (contM.instanceColor) contM.instanceColor.needsUpdate = true;
      wake.count = nw; wake.instanceMatrix.needsUpdate = true;
      // portiques
      for (const c of cranes) {
        const ps = ships.ports[c.port], G = portGeom(ps.poi), sh = ps.busy >= 0 ? ships.ships.find(s => s.id === ps.busy) : undefined, active = !!sh && sh.kind === 'cargo';
        const top = ps.poi.y + 2 + 30 + 2.9;
        let q = 0, hy = top - 4, carry = false;
        if (active && sh) {
          const [wx, wz] = portAt(ps.poi, 0, 0), dx = sh.x - wx, dz = sh.z - wz, qv = -dx * Math.sin(ps.poi.rot) + dz * Math.cos(ps.poi.rot), side = qv >= 0 ? 1 : -1;
          const T = 28, u = (((t / T) + c.off) % 1 + 1) % 1, qs = side * G.berthQ, qy = side * 4, deckTop = ps.poi.y + 4.6 + 2.6 * Math.round(sh.load * 3) + 2.6, quayTop = ps.poi.y + 2 + 2.6;
          const hHi = top - 5;
          if (u < 0.12) { q = qs; hy = hHi + (deckTop + 1.2 - hHi) * smooth(u / 0.12); }
          else if (u < 0.24) { q = qs; hy = deckTop + 1.2 + (hHi - deckTop - 1.2) * smooth((u - 0.12) / 0.12); carry = true; }
          else if (u < 0.48) { q = qs + (qy - qs) * smooth((u - 0.24) / 0.24); hy = hHi; carry = true; }
          else if (u < 0.6) { q = qy; hy = hHi + (quayTop + 1.2 - hHi) * smooth((u - 0.48) / 0.12); carry = u < 0.58; }
          else if (u < 0.72) { q = qy; hy = quayTop + 1.2 + (hHi - quayTop - 1.2) * smooth((u - 0.6) / 0.12); }
          else { q = qy + (qs - qy) * smooth((u - 0.72) / 0.28); hy = hHi; }
        }
        c.trolley.position.z = q; c.cable.position.set(0, (top + hy) / 2 - ps.poi.y, q); c.cable.scale.y = Math.max(0.1, top - hy);
        c.cable.position.y = (top + hy) / 2 - ps.poi.y; c.trolley.position.y = top + 1.3 - ps.poi.y;
        c.load.visible = carry; c.load.position.set(0, hy - 1.3 - ps.poi.y, q);
      }
    },
  };
}
