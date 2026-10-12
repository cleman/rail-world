import * as THREE from 'three';
import type { BiomeMap } from './biome';

type Kind = 'neige' | 'feuilles';

function system(scene: THREE.Scene, kind: Kind) {
  const N = kind === 'neige' ? 2200 : 900, R = 90, H = 60;
  const pos = new Float32Array(N * 3), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 2 * R; pos[i * 3 + 1] = Math.random() * H; pos[i * 3 + 2] = (Math.random() - 0.5) * 2 * R; ph[i] = Math.random() * 6.28; }
  const g = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos.slice(), 3); attr.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', attr);
  const m = new THREE.PointsMaterial({ color: kind === 'neige' ? 0xffffff : 0xd9772b, size: kind === 'neige' ? 0.5 : 0.9, transparent: true, opacity: 0.9, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; scene.add(pts);
  let t = 0;
  return {
    pts, m,
    update(dt: number, cam: THREE.Camera) {
      t += dt;
      const fall = kind === 'neige' ? 3.2 : 1.8, c = cam.position;
      for (let i = 0; i < N; i++) {
        let x = pos[i * 3], y = pos[i * 3 + 1] - fall * dt, z = pos[i * 3 + 2];
        x += Math.sin(t * 0.7 + ph[i]) * dt * (kind === 'neige' ? 0.8 : 2.2); z += Math.cos(t * 0.6 + ph[i]) * dt * 0.8;
        if (y < 0) y += H;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        const wx = ((x - c.x + R * 3) % (2 * R)) - R, wz = ((z - c.z + R * 3) % (2 * R)) - R;
        attr.setXYZ(i, c.x + wx, c.y - 15 + y, c.z + wz);
      }
      attr.needsUpdate = true;
    },
  };
}

/** Précipitations décoratives autour de la caméra, selon le biome du lieu : flocons ou feuilles mortes (la pluie est dans weatherview.ts). */
export function buildPrecip(scene: THREE.Scene, map: BiomeMap) {
  const kinds = [...new Set(map.biomes.map(b => b.precip).filter((k): k is Kind => !!k))];
  const sys = new Map(kinds.map(k => [k, system(scene, k)] as const));
  return {
    /** Neige forcée par la météo (0..1) en plus du biome. */
    update(dt: number, cam: THREE.Camera, snow = 0, agl = 0) {
      // en altitude (drone, avion), les particules proches de la caméra ne représentent plus rien : on les éteint progressivement
      const fade = Math.max(0, Math.min(1, (70 - agl) / 30));
      const here = map.at(cam.position.x, cam.position.z).precip;
      for (const [k, s] of sys) {
        const on = k === here || (k === 'neige' && snow > 0);
        s.pts.visible = on && fade > 0.02; s.m.opacity = 0.9 * fade; if (on && fade > 0.02) s.update(dt, cam);
      }
    },
  };
}
