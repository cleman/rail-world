// Rendu des piétons : une seule InstancedMesh (corps + tête), couleur de vêtement par instance, dessinés près de la caméra.
import * as THREE from 'three';
import type { Pedestrians } from './sim/pedestrians';
import type { Figure } from './sim/streetlife';
import { MeshBuilder } from './geom';

const CLOTHES = [0xb23a3a, 0x3a64b2, 0x3f8f5a, 0xd0a53a, 0x6b6b72, 0x8a4fa0, 0xe8e4da, 0x2f3338];

export function buildPeople(scene: THREE.Scene, ped: Pedestrians, extra: () => Figure[] = () => []) {
  const b = new MeshBuilder(), skin = new THREE.Color(0xe0b58f), pants = new THREE.Color(0x2b2e36), top = new THREE.Color(0xffffff);
  b.box(-0.13, 0.13, 0, 0.82, -0.08, 0.08, pants);
  b.box(-0.2, 0.2, 0.82, 1.42, -0.1, 0.1, top);
  b.box(-0.09, 0.09, 1.46, 1.68, -0.09, 0.09, skin);
  const mesh = new THREE.InstancedMesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), Math.max(1, ped.walkers.length + 600));
  mesh.frustumCulled = false; mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = false; mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  scene.add(mesh);
  // clients assis : cuisses à l'horizontale, jambes pendantes (assise à 0,46 m, comme les chaises de dailyview.ts)
  const sb = new MeshBuilder();
  sb.box(-0.13, 0.13, 0.46, 0.58, -0.1, 0.42, pants); sb.box(-0.13, 0.13, 0, 0.46, 0.34, 0.46, pants);
  sb.box(-0.2, 0.2, 0.46, 1.02, -0.12, 0.08, top); sb.box(-0.09, 0.09, 1.06, 1.28, -0.1, 0.08, skin);
  const seatM = new THREE.InstancedMesh(sb.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 400);
  seatM.frustumCulled = false; seatM.count = 0; seatM.castShadow = false; seatM.receiveShadow = false; seatM.setColorAt(0, new THREE.Color(1, 1, 1)); scene.add(seatM);
  const o = new THREE.Object3D(), c = new THREE.Color();
  ped.walkers.forEach((w, i) => mesh.setColorAt(i, c.setHex(CLOTHES[w.kind % CLOTHES.length])));
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return {
    update(cam: THREE.Vector3, range = 160) {
      let n = 0, ns = 0; const vis = ped.visible, r2 = range * range, ex = extra(), cap = mesh.instanceMatrix.count;
      for (let i = 0; i < vis + ex.length && n < cap; i++) {
        const w = i < vis ? ped.walkers[i] : ex[i - vis], dx = w.x - cam.x, dz = w.z - cam.z;
        if (dx * dx + dz * dz > r2) continue;
        const moving = w.pause <= 0, sc = (w as Figure).size ?? 1;
        o.position.set(w.x, w.y + (moving ? Math.abs(Math.sin(w.phase)) * 0.04 * sc : 0), w.z);
        o.rotation.set(0, Math.atan2(w.hx, w.hz), 0); o.scale.setScalar(sc); o.updateMatrix();
        if ((w as Figure).sit) { if (ns < seatM.instanceMatrix.count) { seatM.setMatrixAt(ns, o.matrix); seatM.setColorAt(ns, c.setHex(CLOTHES[w.kind % CLOTHES.length])); ns++; } continue; }
        mesh.setMatrixAt(n, o.matrix); mesh.setColorAt(n, c.setHex(CLOTHES[w.kind % CLOTHES.length])); n++;
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      seatM.count = ns; seatM.instanceMatrix.needsUpdate = true; if (seatM.instanceColor) seatM.instanceColor.needsUpdate = true;
    },
  };
}
