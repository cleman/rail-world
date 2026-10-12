// Visualisation des colonnes d'air ascendant (thermiques) : cylindres rouges translucides, activables.
import * as THREE from 'three';
import type { Thermal } from './sim/sailplane';

export function buildThermView(scene: THREE.Scene, thermals: () => Thermal[] | undefined, ground: (x: number, z: number) => number) {
  const g = new THREE.Group(); g.visible = false; scene.add(g);
  const wall = new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.MeshBasicMaterial({ color: 0xff6a4a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  let built = 0; const H = 1800;
  const api = {
    show: false,
    update() {
      g.visible = api.show; if (!api.show) return;
      const T = thermals(); if (!T) { g.visible = false; return; }
      if (built !== T.length) {
        g.clear(); built = T.length;
        for (const t of T) {
          const y0 = ground(t.x, t.z), cyl = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r * 1.15, H, 28, 1, true), wall);
          cyl.position.set(t.x, y0 + H / 2, t.z); cyl.renderOrder = 4; g.add(cyl);
          for (const f of [0.2, 0.4, 0.6, 0.8, 1]) { const rg = new THREE.Mesh(new THREE.RingGeometry(t.r * 0.96, t.r * 1.02, 40), ring); rg.rotation.x = -Math.PI / 2; rg.position.set(t.x, y0 + H * f, t.z); rg.renderOrder = 4; g.add(rg); }
        }
      }
    },
  };
  return api;
}
