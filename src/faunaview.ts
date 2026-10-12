import * as THREE from 'three';
import { MeshBuilder, type V } from './geom';
import type { Fauna } from './sim/fauna';
import type { DayNight } from './env';

const C = (h: number) => new THREE.Color(h);
const lam = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function cow(): THREE.BufferGeometry {
  const b = new MeshBuilder(), w = C(0xf1eee6), k = C(0x2b2b2b), br = C(0xd9a0a0);
  b.box(-0.45, 0.45, 0.7, 1.4, -0.9, 0.9, w); b.box(-0.47, 0.1, 0.9, 1.4, -0.2, 0.6, k);
  b.box(-0.25, 0.25, 1.0, 1.55, 0.85, 1.45, w); b.box(-0.18, 0.18, 1.0, 1.15, 1.4, 1.62, br);
  for (const [x, z] of [[-0.3, -0.7], [0.3, -0.7], [-0.3, 0.7], [0.3, 0.7]]) b.box(x - 0.09, x + 0.09, 0, 0.7, z - 0.09, z + 0.09, k);
  return b.build();
}
function sheep(): THREE.BufferGeometry {
  const b = new MeshBuilder(), w = C(0xf4f1ea), k = C(0x3a3430);
  b.box(-0.4, 0.4, 0.45, 1.05, -0.55, 0.55, w);
  b.box(-0.14, 0.14, 0.7, 1.05, 0.5, 0.85, k);
  for (const [x, z] of [[-0.22, -0.4], [0.22, -0.4], [-0.22, 0.4], [0.22, 0.4]]) b.box(x - 0.05, x + 0.05, 0, 0.45, z - 0.05, z + 0.05, k);
  return b.build();
}
function bird(): THREE.BufferGeometry {
  const b = new MeshBuilder(), k = C(0x2f2f35);
  const q = (s: number): [V, V, V, V] => [[0, 0, 0.5], [s * 1.5, 0.35, 0.1], [s * 1.5, 0.35, -0.3], [0, 0, -0.5]];
  b.quad(q(1), k, [0, 1, 0]); b.quad(q(1), k, [0, -1, 0]); b.quad(q(-1), k, [0, 1, 0]); b.quad(q(-1), k, [0, -1, 0]);
  return b.build();
}
function planeGeo(kind: 'rouge' | 'biplan' | 'hydravion' | 'ligne'): THREE.BufferGeometry {
  const b = new MeshBuilder(), w = C(0xf0f0ee);
  if (kind === 'ligne') {                   // avion de ligne, un peu grossi pour rester visible à 1 000 m
    const k = 1.9, bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: THREE.Color) => b.box(x0 * k, x1 * k, y0 * k, y1 * k, z0 * k, z1 * k, c);
    bx(-1.7, 1.7, -1.7, 1.7, -17, 16, w); bx(-1.4, 1.4, 1.7, 1.78, -14, 12, C(0x2a4a8a)); bx(-1.5, 1.5, -1.3, 1.3, 16, 19, w);
    bx(-17, 17, -0.4, 0.2, -4, 3, w); bx(-6.5, 6.5, 0, 0.3, -17, -13, w); bx(-0.2, 0.2, 0, 5.2, -18, -12, C(0x2a4a8a));
    for (const x of [-6, 6]) bx(x - 0.9, x + 0.9, -1.6, -0.3, -2, 2.5, C(0x9aa0a6));
    return b.build();
  }
  const r = kind === 'hydravion' ? C(0xe3b52a) : kind === 'biplan' ? C(0x2a5aa8) : C(0xc23a2f);
  b.box(-0.9, 0.9, -0.9, 0.9, -7, 7, w); b.box(-0.9, 0.9, 0.9, 1.0, -5, 5, r);
  b.box(-10, 10, 0, 0.3, -1.2, 1.8, kind === 'biplan' ? r : w); b.box(-4, 4, 0.2, 0.3, -7.5, -5.5, w); b.box(-0.15, 0.15, 0.2, 2.6, -7, -5.5, r);
  b.box(-0.5, 0.5, -0.5, 0.5, 7, 7.8, r);
  if (kind === 'biplan') { b.box(-9, 9, 2.4, 2.65, -1, 1.9, r); for (const x of [-5, 5]) b.box(x - 0.08, x + 0.08, 0.3, 2.4, 0.2, 0.4, C(0x333333)); }
  if (kind === 'hydravion') { for (const x of [-2.6, 2.6]) { b.box(x - 0.45, x + 0.45, -2.3, -1.2, -5.5, 4.5, r); for (const z of [-2, 2.5]) b.box(x - 0.08, x + 0.08, -1.3, -0.5, z - 0.1, z + 0.1, C(0x555555)); } }
  else for (const x of [-1.5, 1.5]) { b.box(x - 0.08, x + 0.08, -1.6, -0.9, 2.6, 2.8, C(0x333333)); b.box(x - 0.2, x + 0.2, -1.8, -1.4, 2.3, 3.1, C(0x222222)); }
  return b.build();
}
function balloon(hue: number): THREE.BufferGeometry {
  const b = new MeshBuilder(), N = 12, R = 11, rings = 6;
  const cols = [C(0xd83a3a), C(0xf2d04a), C(0x3a76d8), C(0xf0f0ee)].map((c, i) => c.offsetHSL(hue * 0.2, 0, 0).multiplyScalar(i ? 1 : 1));
  const prof = (i: number): [number, number] => { const a = (i / rings) * Math.PI; return [Math.sin(a) * R, 14 - Math.cos(a) * R]; };
  for (let j = 0; j < N; j++) for (let i = 0; i < rings; i++) {
    const a0 = (j / N) * Math.PI * 2, a1 = ((j + 1) / N) * Math.PI * 2, [r0, y0] = prof(i), [r1, y1] = prof(i + 1), m = (a0 + a1) / 2;
    const p = (r: number, a: number, y: number): V => [Math.cos(a) * r, y, Math.sin(a) * r];
    b.quad([p(r0, a0, y0), p(r0, a1, y0), p(r1, a1, y1), p(r1, a0, y1)], cols[j % cols.length], [Math.cos(m), (y0 - 14), Math.sin(m)]);
  }
  b.box(-1.1, 1.1, 0, 1.4, -1.1, 1.1, C(0x6b4a2f));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(x * 0.9 - 0.04, x * 0.9 + 0.04, 1.4, 4, z * 0.9 - 0.04, z * 0.9 + 0.04, C(0x444444));
  return b.build();
}
export function sailboat(): THREE.BufferGeometry {
  const b = new MeshBuilder(), h = C(0xf0f0ee), r = C(0x2a4a8a), s = C(0xfafafa);
  b.box(-0.9, 0.9, -0.2, 0.7, -3, 2.4, h); b.box(-0.92, 0.92, 0.5, 0.7, -3, 2.4, r);
  b.tri([[-0.9, -0.2, 2.4], [0.9, -0.2, 2.4], [0, 0.3, 4.2]], h, [0, 1, 0]); b.tri([[-0.9, 0.7, 2.4], [0.9, 0.7, 2.4], [0, 0.7, 4.2]], h, [0, 1, 0]);
  b.box(-0.07, 0.07, 0.7, 9, 0.2, 0.34, C(0x555555));
  const a: V[] = [[0, 1.2, 0.1], [0, 8.6, 0.1], [0, 1.2, -2.8]], c: V[] = [[0, 1.2, 0.5], [0, 7.5, 0.5], [0, 1.2, 2.2]];
  b.tri(a as [V, V, V], s, [1, 0, 0]); b.tri(a as [V, V, V], s, [-1, 0, 0]); b.tri(c as [V, V, V], C(0xe86a3a), [1, 0, 0]); b.tri(c as [V, V, V], C(0xe86a3a), [-1, 0, 0]);
  return b.build();
}

export interface FaunaViews { update(cam: THREE.Vector3): void }

/** Rendu de la faune : instances proches de la caméra uniquement ; avion et montgolfière en objets uniques. */
export function buildFauna(scene: THREE.Scene, fauna: Fauna, env: DayNight): FaunaViews {
  const mk = (geo: THREE.BufferGeometry, n: number, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, lam(), Math.max(1, n)); m.frustumCulled = false; m.count = 0; m.castShadow = shadow; scene.add(m); return m;
  };
  const cows = fauna.animals.filter(a => a.kind === 'vache').length, sheeps = fauna.animals.length - cows;
  const cowM = mk(cow(), cows), sheepM = mk(sheep(), sheeps);
  const nBirds = fauna.flocks.reduce((s, f) => s + f.birds.length, 0) + fauna.perched.length, birdM = mk(bird(), nBirds, false);
  const planes = fauna.aircraft.map(a => {
    const m = new THREE.Mesh(planeGeo(a.kind === 'hydravion' ? 'hydravion' : a.name === 'Biplan' ? 'biplan' : 'rouge'), lam()); m.castShadow = false; scene.add(m);
    const nav = (c: number, x: number) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: c })); l.position.set(x, 0.3, -0.3); m.add(l); return l; };
    const red = nav(0xff2020, -10), green = nav(0x20ff40, 10), strobe = nav(0xffffff, 0); strobe.position.set(0, 1.4, -7);
    return { a, m, red, green, strobe };
  });
  const plane0 = new THREE.Mesh(planeGeo('rouge'), lam()); plane0.visible = false; scene.add(plane0);   // avion de repli (sans aérodrome)
  const linerM = new THREE.Mesh(planeGeo('ligne'), lam()); linerM.visible = false; scene.add(linerM);
  // traînée : deux rubans croisés (horizontal et vertical), transparents, de plus en plus larges et pâles avec l'âge
  const TM = 120, tpos = new Float32Array(TM * 2 * 2 * 3), tcol = new Float32Array(TM * 2 * 2 * 4), tidx: number[] = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < TM - 1; i++) { const k = (r * TM + i) * 2; tidx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3).setUsage(THREE.DynamicDrawUsage)); tg.setAttribute('color', new THREE.BufferAttribute(tcol, 4).setUsage(THREE.DynamicDrawUsage)); tg.setIndex(tidx);
  const trailM = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false })); trailM.frustumCulled = false; trailM.renderOrder = 4; scene.add(trailM);
  const balM = new THREE.Mesh(balloon(fauna.balloon.hue), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })); scene.add(balM);
  const o = new THREE.Object3D(), tmp = { x: 0, y: 0, z: 0, yaw: 0, flap: 0 };
  const near = (x: number, z: number, cam: THREE.Vector3, r: number) => (x - cam.x) ** 2 + (z - cam.z) ** 2 < r * r;
  const put = (m: THREE.InstancedMesh, n: number, x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, rx = 0) => {
    o.position.set(x, y, z); o.rotation.set(rx, yaw, 0, 'YXZ'); o.scale.set(sx, sy, sx); o.updateMatrix(); m.setMatrixAt(n, o.matrix);
  };
  return {
    update(cam) {
      let nc = 0, ns = 0;
      for (const a of fauna.animals) {
        if (!near(a.x, a.z, cam, 520)) continue;
        if (a.kind === 'vache') put(cowM, nc++, a.x, a.y, a.z, a.h, 1.1, 1.1); else put(sheepM, ns++, a.x, a.y, a.z, a.h, 1, 1);
      }
      cowM.count = nc; sheepM.count = ns; cowM.instanceMatrix.needsUpdate = sheepM.instanceMatrix.needsUpdate = true;
      let nb = 0;
      for (const f of fauna.flocks) for (let i = 0; i < f.birds.length; i++) {
        fauna.bird(f, i, tmp);
        if (!near(tmp.x, tmp.z, cam, 1000)) continue;
        put(birdM, nb++, tmp.x, tmp.y, tmp.z, tmp.yaw, 1, 0.3 + 0.7 * Math.abs(tmp.flap));
      }
      for (const b of fauna.perched) {
        if (b.state === 'parti' || !near(b.x, b.z, cam, 600)) continue;
        put(birdM, nb++, b.x, b.y, b.z, b.yaw, b.state === 'posé' ? 0.7 : 1, b.state === 'posé' ? 0.35 : 0.3 + 0.7 * Math.abs(b.flap));
      }
      birdM.count = nb; birdM.instanceMatrix.needsUpdate = true;
      const B = fauna.balloon; balM.position.set(B.x, B.y, B.z); balM.rotation.y = fauna.t * 0.05;
      const n = env.night > 0.3, blink = Math.sin(fauna.t * 5) > 0.7;
      for (const p of planes) { const P = p.a; p.m.position.set(P.x, P.y, P.z); p.m.rotation.set(-P.pitch, P.yaw, P.bank, 'YXZ'); p.red.visible = p.green.visible = n; p.strobe.visible = n && blink; }
      plane0.visible = !planes.length; if (plane0.visible) { const P = fauna.plane; plane0.position.set(P.x, P.y, P.z); plane0.rotation.set(-P.pitch, P.yaw, P.bank, 'YXZ'); }
      const L = fauna.liner; linerM.visible = L.active; if (L.active) { linerM.position.set(L.x, L.y, L.z); linerM.rotation.set(0, L.yaw, 0); }
      // traînée
      const tr = L.trail, m = Math.min(tr.length, TM); let off = Math.max(0, tr.length - m);
      for (let i = 0; i < TM; i++) {
        const p = i < m ? tr[off + i] : tr[tr.length - 1] ?? { x: 0, y: -999, z: 0, age: 999 }, nxt = tr[Math.min(tr.length - 1, off + i + 1)] ?? p, prv = tr[Math.max(0, off + i - 1)] ?? p;
        let dx = nxt.x - prv.x, dz = nxt.z - prv.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        const wd = 3 + p.age * 0.22, al = (i < m ? 0.8 * Math.max(0, 1 - p.age / 80) ** 1.3 : 0) * (i === m - 1 && L.active ? 0.3 : 1);
        for (let r = 0; r < 2; r++) for (let sd = 0; sd < 2; sd++) {
          const k = ((r * TM + i) * 2 + sd) * 3, sg = sd ? 1 : -1;
          tpos[k] = p.x + (r === 0 ? -dz * wd * sg : 0); tpos[k + 1] = p.y + (r === 0 ? 0 : wd * sg * 0.8); tpos[k + 2] = p.z + (r === 0 ? dx * wd * sg : 0);
          const c = ((r * TM + i) * 2 + sd) * 4; tcol[c] = tcol[c + 1] = tcol[c + 2] = 1; tcol[c + 3] = al;
        }
      }
      tg.attributes.position.needsUpdate = true; tg.attributes.color.needsUpdate = true; trailM.visible = tr.length > 1;
    },
  };
}
