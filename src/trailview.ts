// Chemins hors des routes : sentiers de campagne, allées de parc, allée du stade. Rubans posés sur le relief.
import * as THREE from 'three';
import { MeshBuilder, type V } from './geom';
import { densify, type Trail } from './sim/sport';

const COL = { sentier: 0xb59f78, parc: 0xcdbf9e, accès: 0xa3a39c } as const;

export function buildTrails(scene: THREE.Scene, trails: Trail[], height: (x: number, z: number) => number) {
  const b = new MeshBuilder(), up: V = [0, 1, 0];
  for (const t of trails) {
    const p = densify(t.pts, t.closed, 5), n = p.length, col = new THREE.Color(COL[t.kind]), hw = t.width / 2, m = t.closed ? n : n - 1;
    const side = (i: number): [V, V] => {
      const a = p[(i + n - 1) % n], c = p[(i + 1) % n], q = p[i];
      let dx = (t.closed || i < n - 1 ? c.x : q.x) - (t.closed || i > 0 ? a.x : q.x), dz = (t.closed || i < n - 1 ? c.z : q.z) - (t.closed || i > 0 ? a.z : q.z);
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const L: V = [q.x - dz * hw, 0, q.z + dx * hw], R: V = [q.x + dz * hw, 0, q.z - dx * hw];
      L[1] = height(L[0], L[2]) + 0.07; R[1] = height(R[0], R[2]) + 0.07; return [L, R];
    };
    for (let i = 0; i < m; i++) { const [l0, r0] = side(i), [l1, r1] = side((i + 1) % n); b.quad([l0, l1, r1, r0], col, up); }
  }
  if (b.empty) return null;
  const mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.receiveShadow = true; scene.add(mesh); return mesh;
}
