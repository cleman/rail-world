// Abribus et poteau d'arrêt, dessinés à chaque arrêt de bus du réseau routier (une InstancedMesh).
import * as THREE from 'three';
import type { Traffic } from './sim/traffic';
import { MeshBuilder } from './geom';

export function buildBusStops(scene: THREE.Scene, traffic: Traffic) {
  const stops = traffic.busStops; if (!stops.length) return;
  const b = new MeshBuilder(), C = (h: number) => new THREE.Color(h);
  const metal = C(0x3a3d42), glass = C(0x6d8a9a), wood = C(0x8a6a44), signC = C(0x2a62b8), white = C(0xf2f2f2);
  b.box(0.85, 0.92, 0.35, 2.25, -1.8, 1.8, glass);          // vitre du fond
  b.box(-0.2, 1.3, 2.3, 2.42, -2.0, 2.0, metal);            // toit
  for (const z of [-1.85, 1.85]) b.box(0.8, 0.92, 0, 2.3, z - 0.05, z + 0.05, metal);
  b.box(0.35, 0.8, 0.45, 0.55, -1.3, 1.3, wood);            // banc
  b.box(0.7, 0.8, 0, 0.45, -1.2, -1.1, metal); b.box(0.7, 0.8, 0, 0.45, 1.1, 1.2, metal);
  b.box(-0.55, -0.45, 0, 3.0, 2.9, 3.0, metal);             // poteau (côté route)
  b.box(-0.9, -0.1, 2.9, 3.5, 2.95, 3.05, signC);           // panneau
  b.box(-0.6, -0.4, 3.1, 3.4, 3.05, 3.08, white);
  const mesh = new THREE.InstancedMesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), stops.length);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const o = new THREE.Object3D();
  stops.forEach((s, i) => { o.position.set(s.x, s.y + 0.12, s.z); o.rotation.set(0, Math.atan2(-s.oz, s.ox), 0); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
  scene.add(mesh);
}
