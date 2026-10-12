import * as THREE from 'three';
import type { Weather } from './sim/weather';
import type { BiomeMap } from './biome';
import type { DayNight } from './env';

/** Rendu de la météo : nuages qui dérivent (plus nombreux et plus sombres selon le temps), pluie autour de la caméra, éclairs. */
export function buildWeatherView(scene: THREE.Scene, weather: Weather, env: DayNight, map: BiomeMap) {
  // ----- nuages : 70 amas de 5 blobs aplatis à ~650 m, sur le monde entier -----
  const N = 170, PER = 5, SPAN = 3200, blob = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.93, depthWrite: false });
  const clouds = new THREE.InstancedMesh(blob, mat, N * PER); clouds.frustumCulled = false; scene.add(clouds);
  let sd = 1337; const r = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  const cl = Array.from({ length: N }, () => ({ x: (r() - 0.5) * 2 * SPAN, z: (r() - 0.5) * 2 * SPAN, y: 600 + r() * 160, s: 55 + r() * 70, rank: r(), blobs: Array.from({ length: PER }, () => [(r() - 0.5) * 1.6, (r() - 0.3) * 0.25, (r() - 0.5) * 1.1, 0.55 + r() * 0.6]) }));
  const o = new THREE.Object3D(), col = new THREE.Color();
  // ----- pluie : traits qui tombent dans une boîte autour de la caméra -----
  const D = 7000, R = 70, H = 46, rpos = new Float32Array(D * 6), rx = new Float32Array(D), ry = new Float32Array(D), rz = new Float32Array(D);
  for (let i = 0; i < D; i++) { rx[i] = (Math.random() - 0.5) * 2 * R; ry[i] = Math.random() * H; rz[i] = (Math.random() - 0.5) * 2 * R; }
  const rg = new THREE.BufferGeometry(), rattr = new THREE.BufferAttribute(rpos, 3); rattr.setUsage(THREE.DynamicDrawUsage); rg.setAttribute('position', rattr);
  const rmat = new THREE.LineBasicMaterial({ color: 0xc4d0dc, transparent: true, opacity: 0.4, depthWrite: false });
  const rain = new THREE.LineSegments(rg, rmat); rain.frustumCulled = false; rain.visible = false; scene.add(rain);
  let drift = 0;
  return {
    /** Intensité de pluie visible ici (0 s'il neige à cet endroit) ; neige météo (0..1) pour precip.update. */
    update(dt: number, cam: THREE.Camera, sunElev: number) {
      weather.step(dt);
      const W = weather, c = cam.position, local = map.at(c.x, c.z), snowy = local.precip === 'neige';
      env.dim = Math.min(1, W.cloud * 0.6 + W.rain * 0.35 + W.storm * 0.4); env.grey = Math.min(1, W.cloud * 0.8 + W.fog * 0.6 + W.rain * 0.4); env.flash = W.flash;
      // nuages
      drift += dt * W.wind;
      const cover = W.cloud, dark = Math.min(1, W.rain * 0.45 + W.storm * 0.4 + W.cloud * 0.15);
      let n = 0;
      for (const k of cl) {
        const vis = k.rank < 0.12 + cover * 0.88, sc = vis ? 1 : 0;
        const x = ((k.x + drift + SPAN * 3) % (2 * SPAN)) - SPAN, z = k.z;
        for (const b of k.blobs) {
          o.position.set(x + b[0] * k.s, k.y + b[1] * k.s + (W.storm > 0.5 ? -60 : 0), z + b[2] * k.s);
          o.scale.set(k.s * b[3], k.s * b[3] * 0.38, k.s * b[3] * 0.9).multiplyScalar(sc * (0.7 + 0.5 * cover)); o.updateMatrix();
          clouds.setMatrixAt(n, o.matrix); n++;
        }
      }
      clouds.instanceMatrix.needsUpdate = true;
      const day = Math.max(0.08, Math.min(1, sunElev * 2 + 0.2));
      mat.color.setRGB(1, 1, 1).multiplyScalar(day * (1 - dark * 0.62)); if (W.flash > 0.05) mat.color.lerp(col.set(0xdfe6ff), W.flash * 0.7);
      // pluie
      const I = snowy ? 0 : W.rain;
      rain.visible = I > 0.03;
      if (rain.visible) {
        const cnt = Math.round(D * Math.min(1, I)), fall = 28 + W.storm * 8, sl = 4.2, wx = -W.wind * 0.12;
        for (let i = 0; i < cnt; i++) {
          ry[i] -= fall * dt; if (ry[i] < 0) ry[i] += H;
          const x = ((rx[i] - c.x + R * 3) % (2 * R)) - R, z = ((rz[i] - c.z + R * 3) % (2 * R)) - R, y = c.y - 12 + ry[i];
          rpos[i * 6] = c.x + x; rpos[i * 6 + 1] = y; rpos[i * 6 + 2] = c.z + z; rpos[i * 6 + 3] = c.x + x + wx * sl * 0.1; rpos[i * 6 + 4] = y + sl; rpos[i * 6 + 5] = c.z + z;
        }
        rg.setDrawRange(0, cnt * 2); rattr.needsUpdate = true; rmat.opacity = 0.35 + 0.45 * I;
      }
      return { rain: I, snow: snowy ? W.rain : 0 };
    },
  };
}
