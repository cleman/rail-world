import * as THREE from 'three';
import type { World } from './sim/world';
import type { Terrain } from './sim/terrain';
import { MeshBuilder, type V } from './geom';
import { addCutSlice, clearCutSlices } from './tunnelcut';

const col = (h: number) => new THREE.Color(h);

interface F { x: number; y: number; z: number; tx: number; tz: number; nx: number; nz: number }

export interface StructuresOut {
  /** Vrai si le point (x,y,z) est à l'intérieur d'un tunnel (pour assombrir la lumière). */
  inTunnel(x: number, y: number, z: number): boolean;
  /** Intérieur d'un tunnel au point (x, z) pour un drone à l'altitude y : sol de la voie, plafond de la voûte à cet endroit (null hors du gabarit). */
  tunnelAt(x: number, y: number, z: number): { floor: number; ceil: number } | null;
  /** Vrai si (x,z) est à la verticale d'un tunnel (la caméra serait sous terre). */
  overTunnel(x: number, z: number): boolean;
}

/** Ponts, viaducs, tunnels et rivières, générés depuis `net.structures` et le terrain. */
export function buildStructures(scene: THREE.Scene, world: World, terrain: Terrain, waterColor = 0x3f86b8): StructuresOut {
  const net = world.net;
  let C = net.center, N = C.length, closed = true;    // ligne en cours de traitement (la boucle, puis chaque corde)
  const c = (i: number) => (closed ? C[((i % N) + N) % N] : C[Math.max(0, Math.min(N - 1, i))]);
  const tangent = (k: number) => {
    const a = c(k - 1), b = c(k + 1), l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { tx: (b.x - a.x) / l, tz: (b.z - a.z) / l };
  };
  /** Repère le long de l'axe à l'abscisse fractionnaire s (en échantillons). */
  const frame = (s: number): F => {
    const i = Math.floor(s), u = s - i, a = c(i), b = c(i + 1), ta = tangent(i), tb = tangent(i + 1);
    let tx = ta.tx + (tb.tx - ta.tx) * u, tz = ta.tz + (tb.tz - ta.tz) * u;
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, tx, tz, nx: -tz, nz: tx };
  };
  const P = (f: F, lat: number, y: number): V => [f.x + f.nx * lat, f.y + y, f.z + f.nz * lat];

  /** Prisme orienté le long de l'axe, de s0 à s1, entre les décalages latéraux latA/latB et les hauteurs y0/y1 (relatives à l'axe). */
  function prism(mb: MeshBuilder, s0: number, s1: number, latA: number, latB: number, y0: number, y1: number, c0: THREE.Color, step = 1) {
    const cnt = Math.max(1, Math.ceil(Math.abs(s1 - s0) / step)), fs: F[] = [];
    for (let i = 0; i <= cnt; i++) fs.push(frame(s0 + ((s1 - s0) * i) / cnt));
    for (let i = 0; i < cnt; i++) {
      const a = fs[i], b = fs[i + 1];
      mb.quad([P(a, latA, y1), P(a, latB, y1), P(b, latB, y1), P(b, latA, y1)], c0, [0, 1, 0]);
      mb.quad([P(a, latA, y0), P(a, latB, y0), P(b, latB, y0), P(b, latA, y0)], c0, [0, -1, 0]);
      mb.quad([P(a, latA, y0), P(b, latA, y0), P(b, latA, y1), P(a, latA, y1)], c0, [-a.nx, 0, -a.nz]);
      mb.quad([P(a, latB, y0), P(b, latB, y0), P(b, latB, y1), P(a, latB, y1)], c0, [a.nx, 0, a.nz]);
    }
    const f0 = fs[0], f1 = fs[cnt], dir = s1 >= s0 ? 1 : -1;
    mb.quad([P(f0, latA, y0), P(f0, latB, y0), P(f0, latB, y1), P(f0, latA, y1)], c0, [-f0.tx * dir, 0, -f0.tz * dir]);
    mb.quad([P(f1, latA, y0), P(f1, latB, y0), P(f1, latB, y1), P(f1, latA, y1)], c0, [f1.tx * dir, 0, f1.tz * dir]);
  }
  const ground = (f: F, lat: number) => terrain.height(f.x + f.nx * lat, f.z + f.nz * lat);

  // ---------- Ponts et viaducs ----------
  const concrete = col(0xaaa8a0), dark = col(0x8d8b84), rail = col(0xd8d6cf);
  const bridge = new MeshBuilder();
  const forEachStructure = (kind: 'bridge' | 'tunnel', fn: (st: { i0: number; n: number }) => void) => {
    for (const l of net.lines) { C = l.center; N = C.length; closed = l.closed; for (const st of l.structures.filter(x => x.kind === kind)) fn(st); }
  };
  forEachStructure('bridge', st => {
    const a = st.i0 - 0.5, b = st.i0 + st.n - 0.5;
    prism(bridge, a, b, -5.4, 5.4, -2.1, -0.05, concrete, 1);                 // tablier
    prism(bridge, a, b, 4.9, 5.4, -0.05, 0.95, rail, 1);                      // garde-corps pleins
    prism(bridge, a, b, -5.4, -4.9, -0.05, 0.95, rail, 1);
    for (const s of [a, b]) {                                                  // culées : cachent le talus de la plateforme
      const f = frame(s);
      const g = Math.min(ground(f, -7), ground(f, 0), ground(f, 7)) - 1.5;
      const d = s === a ? -1 : 1;
      prism(bridge, s, s + d * 2.4, -6.4, 6.4, g - f.y, -0.05, dark, 1);
    }
    // franchissement d'une rivière : pas de pile dans le chenal (les péniches passent dessous), arc à tirants à la place
    const wetAt = (s: number, m: number) => { const f = frame(s), q = terrain.riverNear(f.x, f.z); return !!q && q.d < q.hw + m; };
    let w0 = Infinity, w1 = -Infinity;
    for (let s = a; s <= b; s += 0.25) if (wetAt(s, 3)) { w0 = Math.min(w0, s); w1 = Math.max(w1, s); }
    if (w1 - w0 >= 6) {
      const s0 = Math.max(a + 0.5, w0 - 1), s1 = Math.min(b - 0.5, w1 + 1), L = (s1 - s0) * 5, H = Math.max(8, Math.min(12, L * 0.15));
      const hAt = (s: number) => { const u = (s - s0) / (s1 - s0); return 1 + (H - 1) * 4 * u * (1 - u); };
      const steel = col(0x5d6c78), steel2 = col(0x7d8b96);
      const cnt = Math.max(8, Math.ceil((s1 - s0) / 0.5));
      for (const side of [-1, 1]) {
        const lat = side * 5.15;
        for (let i = 0; i < cnt; i++) {
          const sa = s0 + ((s1 - s0) * i) / cnt, sb = s0 + ((s1 - s0) * (i + 1)) / cnt, fa = frame(sa), fb = frame(sb), ya = hAt(sa), yb = hAt(sb);
          const lo = lat - 0.32, hi = lat + 0.32, t = 0.5;
          bridge.quad([P(fa, lo, ya + t), P(fa, hi, ya + t), P(fb, hi, yb + t), P(fb, lo, yb + t)], steel, [0, 1, 0]);
          bridge.quad([P(fa, lo, ya - t), P(fb, lo, yb - t), P(fb, hi, yb - t), P(fa, hi, ya - t)], steel, [0, -1, 0]);
          bridge.quad([P(fa, lo, ya - t), P(fa, lo, ya + t), P(fb, lo, yb + t), P(fb, lo, yb - t)], steel, [-fa.nx, 0, -fa.nz]);
          bridge.quad([P(fa, hi, ya - t), P(fb, hi, yb - t), P(fb, hi, yb + t), P(fa, hi, ya + t)], steel, [fa.nx, 0, fa.nz]);
        }
        for (let s = s0 + 1; s < s1 - 0.6; s += 1.2) prism(bridge, s - 0.05, s + 0.05, lat - 0.08, lat + 0.08, 0.95, hAt(s) - 0.3, steel2, 1);   // suspentes
      }
      for (let s = s0 + 1; s < s1 - 0.6; s += 2.4) if (hAt(s) > 6.8) prism(bridge, s - 0.12, s + 0.12, -5.15, 5.15, hAt(s) - 0.35, hAt(s) + 0.25, steel, 1);   // entretoises hautes
      prism(bridge, s0 - 0.5, s0 + 0.5, -5.4, 5.4, -2.1, 0.3, dark, 1); prism(bridge, s1 - 0.5, s1 + 0.5, -5.4, 5.4, -2.1, 0.3, dark, 1);   // sabots d'appui
    }
    const every = 6;                                                           // piles : une tous les 6 échantillons (30 m)
    for (let s = a + every; s < b - 2; s += every) {
      if (wetAt(s - 1.6, 4) || wetAt(s, 4) || wetAt(s + 1.6, 4)) continue;    // jamais de pile dans le chenal
      const f = frame(s);
      const g = Math.min(ground(f, -3.2), ground(f, 0), ground(f, 3.2)) - 1.0 - f.y;
      if (g > -2.8) continue;                                                  // pas de pile quand le sol est tout près du tablier
      prism(bridge, s - 1.1, s + 1.1, -3.4, 3.4, g, -2.1, dark, 1);
      prism(bridge, s - 1.6, s + 1.6, -4.4, 4.4, -3.4, -2.1, concrete, 1);     // chevêtre
    }
  });
  if (!bridge.empty) {
    const m = new THREE.Mesh(bridge.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }

  // ---------- Tunnels ----------
  // profil intérieur (décalage latéral, hauteur) : voûte basse
  const prof: [number, number][] = [[-5.4, -0.3], [-5.4, 3.4], [-4.4, 4.9], [-2.6, 5.9], [0, 6.3], [2.6, 5.9], [4.4, 4.9], [5.4, 3.4], [5.4, -0.3]];
  const tube = new MeshBuilder(), portal = new MeshBuilder();
  const wallC = [col(0x4b4e53), col(0x42454a)], floorC = col(0x35373b), concr = col(0xb9b5aa), concr2 = col(0xa29e94);
  const lampPos: { f: F; lat: number }[] = [];
  const inside: { x: number; y: number; z: number }[] = [];
  const tsegs: { ax: number; ay: number; az: number; bx: number; by: number; bz: number }[] = [];
  clearCutSlices();
  forEachStructure('tunnel', st => {
    const s0 = st.i0 - 2.5, s1 = st.i0 + st.n - 0.5 + 2.5 - 0.0;
    for (let s = Math.ceil(s0); s <= s1; s++) { const f = frame(s); inside.push({ x: f.x, y: f.y, z: f.z }); }
    for (let s = Math.ceil(s0); s + 1 <= s1; s++) { const a = frame(s), b = frame(s + 1); tsegs.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z }); }
    for (let s = s0; s < s1 - 1e-6; s += 1) {
      const fa = frame(s), fb = frame(Math.min(s1, s + 1));
      const k = Math.round(s) % 2;
      for (let j = 0; j < prof.length; j++) {
        const [la, ya] = prof[j], [lb, yb] = prof[(j + 1) % prof.length];
        const mid: V = [(P(fa, la, ya)[0] + P(fb, lb, yb)[0]) / 2, 0, (P(fa, la, ya)[2] + P(fb, lb, yb)[2]) / 2];
        const axis: V = [(fa.x + fb.x) / 2, fa.y + 2.5, (fa.z + fb.z) / 2];
        const my = (P(fa, la, ya)[1] + P(fb, lb, yb)[1]) / 2;
        const floor = j === prof.length - 1;
        tube.quad([P(fa, la, ya), P(fb, la, ya), P(fb, lb, yb), P(fa, lb, yb)], floor ? floorC : wallC[k],
          [axis[0] - mid[0], axis[1] - my, axis[2] - mid[2]]);
      }
      if (Math.round(s - s0) % 5 === 2) { lampPos.push({ f: fa, lat: -1.8 }); lampPos.push({ f: fa, lat: 1.8 }); }
    }
    // têtes de tunnel : mur de soutènement avec ouverture voûtée
    for (const end of [0, 1]) {
      const sF = end === 0 ? s0 : s1, dir = end === 0 ? 1 : -1;         // dir : sens du front vers l'intérieur
      const sB = sF + dir * 3.0;                                          // épaisseur 15 m
      const fF = frame(sF), fB = frame(sB);
      for (let k = 0; k < 9; k++) {                                       // cavité à écarter du terrain, du mur de tête vers l'intérieur
        const a = frame(sF + dir * k), b = frame(sF + dir * (k + 1)), m = frame(sF + dir * (k + 0.5));
        addCutSlice(m.x, m.y, m.z, m.tx, m.tz, Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.05);
      }
      for (let k = 1; k <= 3; k++) {                                      // devant le mur : le talus ne doit pas gêner le gabarit
        const a = frame(sF - dir * (k - 1)), b = frame(sF - dir * k), m = frame(sF - dir * (k - 0.5));
        addCutSlice(m.x, m.y, m.z, m.tx, m.tz, Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.05, true);
      }
      const out: V = [-fF.tx * dir, 0, -fF.tz * dir];
      const top = 10.2;
      const arch = prof.slice(1, prof.length - 1);                        // points de la voûte (sans le sol)
      for (const sg of [-1, 1]) {                                         // piédroits larges
        const l0 = sg * 5.4, l1 = sg * 11;
        portal.quad([P(fF, l0, -0.6), P(fF, l1, -0.6), P(fF, l1, top), P(fF, l0, top)], concr, out);
      }
      for (let j = 0; j < arch.length - 1; j++) {                         // au-dessus de la voûte
        portal.quad([P(fF, arch[j][0], arch[j][1]), P(fF, arch[j + 1][0], arch[j + 1][1]), P(fF, arch[j + 1][0], top), P(fF, arch[j][0], top)], concr, out);
      }
      portal.quad([P(fF, -11, top), P(fF, 11, top), P(fB, 11, top), P(fB, -11, top)], concr2, [0, 1, 0]);
      for (const sg of [-1, 1]) {
        portal.quad([P(fF, sg * 11, -0.6), P(fB, sg * 11, -0.6), P(fB, sg * 11, top), P(fF, sg * 11, top)], concr2, [sg * fF.nx, 0, sg * fF.nz]);
        portal.quad([P(fF, sg * 5.4, -0.6), P(fB, sg * 5.4, -0.6), P(fB, sg * 5.4, 3.4), P(fF, sg * 5.4, 3.4)], concr2, [-sg * fF.nx, 0, -sg * fF.nz]);
      }
      // bandeau de couronnement, un peu plus clair
      portal.quad([P(fF, -11.4, top), P(fF, 11.4, top), P(fF, 11.4, top + 0.5), P(fF, -11.4, top + 0.5)], concr2, out);
      portal.quad([P(fF, -11.4, top + 0.5), P(fF, 11.4, top + 0.5), P(fB, 11.4, top + 0.5), P(fB, -11.4, top + 0.5)], concr, [0, 1, 0]);
    }
  });
  if (!tube.empty) {
    scene.add(new THREE.Mesh(tube.build(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    const pm = new THREE.Mesh(portal.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    pm.castShadow = true; pm.receiveShadow = true; scene.add(pm);
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.12, 1.4), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), lampPos.length);
    const o = new THREE.Object3D();
    lampPos.forEach(({ f, lat }, i) => {
      o.position.set(f.x + f.nx * lat, f.y + 5.7, f.z + f.nz * lat); o.lookAt(o.position.x + f.tx, o.position.y, o.position.z + f.tz); o.updateMatrix();
      lamps.setMatrixAt(i, o.matrix);
    });
    scene.add(lamps);
  }

  // ---------- Rivières ----------
  for (const r of terrain.rivers) {
    const pos: number[] = [], idx: number[] = [], n = r.pts.length;
    r.pts.forEach((p, i) => {
      const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(n - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
      const hw = (r.width / 2) * p.k + 2.5 * p.k;
      pos.push(p.x + nx * hw, p.level, p.z + nz * hw, p.x - nx * hw, p.level, p.z - nz * hw);
    });
    for (let i = 0; i < n - 1; i++) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: waterColor, transparent: true, opacity: 0.88, side: THREE.DoubleSide, flatShading: true }));
    m.receiveShadow = true; scene.add(m);
  }

  // plafond de la voûte selon le décalage latéral (profil `prof`, symétrique)
  const VAULT: [number, number][] = [[0, 6.3], [2.6, 5.9], [4.4, 4.9], [5.4, 3.4]];
  const vault = (l: number) => { l = Math.abs(l); for (let i = 0; i < VAULT.length - 1; i++) { const [la, ya] = VAULT[i], [lb, yb] = VAULT[i + 1]; if (l <= lb) return ya + (yb - ya) * ((l - la) / (lb - la)); } return -1; };
  return {
    tunnelAt(x, y, z) {
      let bd = 1e9, fy = 0;
      for (const t of tsegs) {
        const dx = t.bx - t.ax, dz = t.bz - t.az, l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - t.ax) * dx + (z - t.az) * dz) / l2)), d = Math.hypot(x - t.ax - dx * u, z - t.az - dz * u);
        if (d < bd) { bd = d; fy = t.ay + (t.by - t.ay) * u; }
      }
      if (bd > 5.2) return null;
      const c = vault(bd); if (c < 0) return null;
      const floor = fy - 0.05, ceil = fy + c;
      return y >= floor - 1 && y <= ceil + 0.6 ? { floor, ceil } : null;
    },
    overTunnel(x, z) {
      for (const p of inside) if (Math.hypot(p.x - x, p.z - z) < 14) return true;
      return false;
    },
    inTunnel(x, y, z) {
      for (const p of inside) {
        if (Math.abs(p.x - x) < 6.5 && Math.abs(p.z - z) < 6.5 && Math.hypot(p.x - x, p.z - z) < 6.5 && y > p.y - 1 && y < p.y + 6.5) return true;
      }
      return false;
    },
  };
}
