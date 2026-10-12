import * as THREE from 'three';
import type { TramNet } from './sim/tram';
import { TRAM_LEN, TRAM_W, STEP } from './sim/tram';
import type { DayNight } from './env';
import { MeshBuilder, type V } from './geom';

const C = (h: number) => new THREE.Color(h);

/** Voie de tramway posée sur la chaussée (dalle sombre, deux rails) et petites voitures. */
export function buildTramView(scene: THREE.Scene, net: TramNet, env?: DayNight) {
  // ---------- voie ----------
  const slab = new MeshBuilder(), rails = new MeshBuilder(), ties = new MeshBuilder();
  const slabC = C(0x3b3d41), railC = C(0xb9bcc0), bedC = C(0x4b4d51);
  for (const L of net.lines) {
    const n = L.x.length, nrm = (i: number): [number, number] => { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), l = Math.hypot(L.x[b] - L.x[a], L.z[b] - L.z[a]) || 1; return [-(L.z[b] - L.z[a]) / l, (L.x[b] - L.x[a]) / l]; };
    const P = (i: number, off: number, dy: number): V => { const [nx, nz] = nrm(i); return [L.x[i] + nx * off, L.y[i] + dy, L.z[i] + nz * off]; };
    for (let i = 0; i < n - 1; i++) {
      slab.quad([P(i, -1.15, 0.015), P(i, 1.15, 0.015), P(i + 1, 1.15, 0.015), P(i + 1, -1.15, 0.015)], i % 2 ? slabC : bedC, [0, 1, 0]);
      for (const sg of [-1, 1]) {
        const o0 = sg * 0.72 - 0.045, o1 = sg * 0.72 + 0.045;
        rails.quad([P(i, o0, 0.05), P(i, o1, 0.05), P(i + 1, o1, 0.05), P(i + 1, o0, 0.05)], railC, [0, 1, 0]);
      }
    }
  }
  const mkMat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  for (const mb of [slab, rails]) if (!mb.empty) { const m = new THREE.Mesh(mb.build(), mkMat()); m.receiveShadow = true; scene.add(m); }
  void ties;

  // ---------- arrêts : quai, abri vitré, mât et panneau ----------
  const quay = new MeshBuilder(), post = new MeshBuilder(), glass = new MeshBuilder(), signs = new MeshBuilder();
  const quayC = C(0x9a9890), edgeC = C(0xe8c53a), postC = C(0x2e3238), roofC = C(0x3f7a9a), glassC = C(0xffffff), signC = C(0xe8c53a);
  for (const L of net.lines) L.stops.forEach(sp => {
    const a = net.at(L, sp), tx = a.tx, tz = a.tz, nx = -tz, nz = tx;
    // quai sur le trottoir, du côté droit du sens de marche (navettes : des deux côtés, chaque sens s'arrête à droite)
    for (const sg of L.loop ? [1] : [1, -1]) {
      const W = (u: number, off: number, y: number): V => [a.x + tx * u + nx * off * sg, a.y + y, a.z + tz * u + nz * off * sg];
      /** pavé orienté (axes : le long de la voie, vers le trottoir, vertical) */
      const ob = (mb: MeshBuilder, u0: number, u1: number, o0: number, o1: number, y0: number, y1: number, c: THREE.Color) => {
        const q = (f: (u: number, o: number, y: number) => V, hint: V, A: [number, number, number][]) => mb.quad(A.map(p => f(p[0], p[1], p[2])) as [V, V, V, V], c, hint);
        const id = (u: number, o: number, y: number) => W(u, o, y), T: V = [tx, 0, tz], N: V = [nx * sg, 0, nz * sg], up: V = [0, 1, 0], neg = (v: V): V => [-v[0], -v[1], -v[2]];
        q(id, T, [[u1, o0, y0], [u1, o1, y0], [u1, o1, y1], [u1, o0, y1]]); q(id, neg(T), [[u0, o0, y0], [u0, o1, y0], [u0, o1, y1], [u0, o0, y1]]);
        q(id, N, [[u0, o1, y0], [u1, o1, y0], [u1, o1, y1], [u0, o1, y1]]); q(id, neg(N), [[u0, o0, y0], [u1, o0, y0], [u1, o0, y1], [u0, o0, y1]]);
        q(id, up, [[u0, o0, y1], [u1, o0, y1], [u1, o1, y1], [u0, o1, y1]]); q(id, neg(up), [[u0, o0, y0], [u1, o0, y0], [u1, o1, y0], [u0, o1, y0]]);
      };
      const o0 = L.hw + 0.05, o1 = o0 + 2.0, yb = 0.12;
      ob(quay, -7.5, 7.5, o0, o1, 0, yb, quayC);
      ob(quay, -7.5, 7.5, o0, o0 + 0.14, yb, yb + 0.01, edgeC);                // liseré jaune côté rue
      // abri : quatre poteaux, toit, vitrage du fond, banc
      for (const u of [-2.4, 2.4]) for (const o of [o0 + 0.35, o1 - 0.2]) ob(post, u - 0.05, u + 0.05, o - 0.05, o + 0.05, yb, yb + 2.45, postC);
      ob(post, -2.8, 2.8, o0 + 0.1, o1 + 0.1, yb + 2.45, yb + 2.6, roofC);
      const gx = o1 - 0.2; glass.quad([W(-2.4, gx, yb + 0.1), W(2.4, gx, yb + 0.1), W(2.4, gx, yb + 2.4), W(-2.4, gx, yb + 2.4)], glassC, [nx * sg, 0, nz * sg]);
      ob(post, -1.0, 1.0, o1 - 0.7, o1 - 0.3, yb + 0.4, yb + 0.5, postC);
      // mât et panneau à l'entrée du quai
      ob(post, -5.8, -5.7, o0 + 0.3, o0 + 0.4, yb, yb + 3.2, postC);
      ob(signs, -5.95, -5.55, o0 + 0.2, o0 + 0.5, yb + 2.9, yb + 3.5, signC);
    }
  });
  const lam = (mb: MeshBuilder, mat: THREE.Material, shadow = true) => { if (mb.empty) return; const m = new THREE.Mesh(mb.build(), mat); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); };
  lam(quay, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), false);
  lam(post, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  lam(signs, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x3a3010 }));
  { const gm = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }); lam(glass, gm, false); }

  // ---------- voitures ----------
  const hl = TRAM_LEN / 2, hw = TRAM_W / 2;
  const body = (color: number) => {
    const b = new MeshBuilder(), col = C(color), roof = C(0xe9e9e6), skirt = C(0x2b2d31), stripe = C(0xb42a2a), pant = C(0x2e3238);
    b.box(-hw, hw, 0.5, 2.95, -hl, hl, col);                       // caisse
    b.box(-hw - 0.01, hw + 0.01, 0.95, 1.15, -hl, hl, stripe);     // bandeau rouge
    b.box(-hw + 0.1, hw - 0.1, 2.95, 3.12, -hl + 0.3, hl - 0.3, roof);
    b.box(-hw + 0.05, hw - 0.05, 0.28, 0.5, -hl + 0.5, hl - 0.5, skirt);
    for (const z of [-3.6, 3.6]) b.box(-0.85, 0.85, 0.08, 0.42, z - 0.9, z + 0.9, skirt);   // bogies
    b.box(-0.7, 0.7, 3.12, 3.2, -2.4, -1.0, pant); b.box(-0.05, 0.05, 3.2, 3.75, -1.75, -1.65, pant); b.box(-0.5, 0.5, 3.74, 3.8, -2.1, -1.2, pant);   // pantographe
    return b.build();
  };
  const win = (() => {   // vitres : bande sur les deux flancs et pare-brise aux extrémités
    const b = new MeshBuilder(), c = C(0xffffff);
    for (const sg of [-1, 1]) for (let k = 0; k < 6; k++) { const z0 = -hl + 0.9 + k * 1.7; b.box(sg > 0 ? hw : -hw - 0.02, sg > 0 ? hw + 0.02 : -hw, 1.55, 2.55, z0, z0 + 1.35, c); }
    for (const e of [-1, 1]) b.box(-hw + 0.25, hw - 0.25, 1.5, 2.6, e > 0 ? hl : -hl - 0.02, e > 0 ? hl + 0.02 : -hl, c);
    return b.build();
  })();
  const lights = (() => {
    const front = new MeshBuilder(), back = new MeshBuilder();
    for (const sg of [-1, 1]) { front.box(sg * 0.8 - 0.18, sg * 0.8 + 0.18, 0.75, 0.95, hl, hl + 0.04, C(0xfff4d0)); back.box(sg * 0.8 - 0.14, sg * 0.8 + 0.14, 0.75, 0.9, -hl - 0.04, -hl, C(0xff2a1a)); }
    return { front: front.build(), back: back.build() };
  })();
  const winMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x2a3a48 }), headMat = new THREE.MeshBasicMaterial({ vertexColors: true }), tailMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const groups = net.trams.map(t => {
    const g = new THREE.Group(), m = new THREE.Mesh(body(t.color), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.castShadow = true; m.receiveShadow = true; g.add(m, new THREE.Mesh(win, winMat), new THREE.Mesh(lights.front, headMat), new THREE.Mesh(lights.back, tailMat));
    g.rotation.order = 'YXZ'; scene.add(g); return g;
  });
  const day = new THREE.Color(0x2a3a48), nightC = new THREE.Color(0xffe3a0), tmp = new THREE.Color();
  return {
    update() {
      const k = env ? Math.max(0, Math.min(1, (env.night - 0.1) / 0.3)) : 0;
      winMat.color.copy(tmp.copy(day).lerp(nightC, k));
      net.trams.forEach((t, i) => { const g = groups[i]; g.visible = t.active; g.position.set(t.x, t.y, t.z); g.rotation.set(-t.pitch, t.yaw, 0); });
    },
  };
}
void STEP;
