// La nuit sur l'eau : feux de navigation et fenêtres des navires, lampes et balises des quais, feux rouges des portiques,
// et traînées de reflets sur l'eau sous les feux les plus vifs.
import * as THREE from 'three';
import type { Ships, ShipKind } from './sim/boats';
import { portAt, portGeom } from './sim/pois';
import type { DayNight } from './env';

type Col = 'w' | 'r' | 'g' | 'y';
type L = [number, number, number, Col];
const RGB: Record<Col, [number, number, number]> = { w: [1, 0.96, 0.85], r: [1, 0.12, 0.08], g: [0.12, 1, 0.4], y: [1, 0.78, 0.38] };
/** Longueur native de chaque modèle (voir boatsview.ts), pour mettre les feux à l'échelle. */
const NATIVE: Record<ShipKind, number> = { cargo: 104, pétrolier: 120, ferry: 48, péniche: 36, voilier: 10, pêcheur: 16 };

const row = (x0: number, x1: number, n: number, y: number, z: number, c: Col): L[] => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / Math.max(1, n - 1), y, z, c]);
const along = (x: number, y: number, z0: number, z1: number, n: number, c: Col): L[] => Array.from({ length: n }, (_, i) => [x, y, z0 + ((z1 - z0) * i) / Math.max(1, n - 1), c]);

/** Feux par type de navire, repère du modèle : x à droite, y en haut, z vers l'avant. Rouge à bâbord (gauche, x<0), vert à tribord. */
const LIGHTS: Record<ShipKind, L[]> = {
  cargo: [[0, 9.4, 40.3, 'w'], [0, 18.6, -44, 'w'], [-8.2, 6.6, 30, 'r'], [8.2, 6.6, 30, 'g'], [0, 4.9, -48.2, 'w'], ...row(-5, 5, 5, 11.4, -35.8, 'y'), ...row(-5, 5, 5, 8.2, -35.8, 'y'), ...along(-8.4, 5.4, -30, 36, 4, 'w')],
  pétrolier: [[0, 5.6, 44, 'w'], [0, 17.8, -52, 'w'], [-10.6, 6, 40, 'r'], [10.6, 6, 40, 'g'], ...row(-5.5, 5.5, 5, 12, -43.8, 'y'), ...row(-5.5, 5.5, 5, 10, -43.8, 'y'), ...along(0, 5.6, -30, 38, 4, 'w')],
  ferry: [[0, 13.4, -8.5, 'w'], [0, 5.5, 22.5, 'w'], [-5.6, 5, 16, 'r'], [5.6, 5, 16, 'g'], ...[-1, 1].flatMap(s => [...along(s * 4.9, 4.8, -19, 10, 8, 'y'), ...along(s * 4.1, 7.6, -12, 4, 6, 'y')]), ...row(-2.5, 2.5, 3, 10.2, 4.2, 'y')],
  péniche: [[0, 5.5, -14, 'w'], [-2.5, 2.2, 16, 'r'], [2.5, 2.2, 16, 'g'], [0, 3.1, -10.3, 'y'], [-1, 3, -10.3, 'y'], [1, 3, -10.3, 'y']],
  voilier: [[0, 9.1, 0.25, 'w'], [-0.8, 0.7, 2, 'r'], [0.8, 0.7, 2, 'g'], [0, 0.8, -3, 'w']],
  pêcheur: [[0, 7.7, 3.6, 'w'], [-2.2, 2.3, 5.5, 'r'], [2.2, 2.3, 5.5, 'g'], [0, 3.4, 1.25, 'y'], [0, 3.0, -2.5, 'w'], [1.5, 3.2, -1, 'w']],
};
/** Points (repère du modèle) sous lesquels une traînée de reflet se dessine. */
const GLOW: Record<ShipKind, [number, number, number][]> = {
  cargo: [[0, 9, -36], [0, 14, 40]], pétrolier: [[0, 10, -44], [0, 6, 20]], ferry: [[0, 6, -4], [0, 6, 12]], péniche: [[0, 3, -10], [0, 4, 8]], voilier: [[0, 2, 0]], pêcheur: [[0, 3, 0]],
};

const MAX = 3600, MAX_STREAK = 160;

export function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildNightWater(scene: THREE.Scene, ships: Ships, env: DayNight) {
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({ size: 5.5, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);

  // traînées de reflet : un plan à plat sur l'eau, plein du côté du feu et qui s'efface vers l'observateur
  const sg = new THREE.BufferGeometry(), sp = [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1], sc2 = [1, 0.9, 0.7, 0.5, 1, 0.9, 0.7, 0.35, 1, 0.9, 0.7, 0, 1, 0.9, 0.7, 0];
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp.map((v, i) => (i % 3 === 0 ? v - 0.5 : v)), 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(sc2, 4)); sg.setIndex([0, 2, 1, 0, 3, 2]);
  const streaks = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }), MAX_STREAK);
  streaks.frustumCulled = false; streaks.count = 0; streaks.renderOrder = 4; scene.add(streaks);

  // flaques de lumière au sol sous les lampes des quais
  const poolTex = glowTexture(), pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffc27a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), 400);
  pools.frustumCulled = false; pools.count = 0; pools.renderOrder = 3; scene.add(pools);
  // lampes fixes des ports (quais, jetée, portiques) : calculées une fois
  const fixed: { x: number; y: number; z: number; c: Col; blink: number; pool?: number }[] = [];
  ships.ports.forEach((ps, pi) => {
    const G = portGeom(ps.poi), y = ps.poi.y + 2;
    for (let p = 8; p <= G.pier - 4; p += 20) for (const s of [-1, 1]) { const [x, z] = portAt(ps.poi, p, s * (G.half - 1.4)); fixed.push({ x, y: y + 5.4, z, c: 'w', blink: 0, pool: y }); }
    for (const s of [-1, 1]) { const [x, z] = portAt(ps.poi, G.pier, s * G.half); fixed.push({ x, y: y + 3, z, c: s < 0 ? 'r' : 'g', blink: 1 }); }   // balises de bout de jetée (clignotantes)
    if (ps.poi.water === 'mer') G.craneP.forEach((cp, k) => { const [x, z] = portAt(ps.poi, cp, 0); fixed.push({ x, y: y + 35.5, z, c: 'r', blink: 2 + k }); });
    void pi;
  });
  const o = new THREE.Object3D();

  return {
    update(cam: THREE.Vector3, t: number) {
      const k = Math.max(0, Math.min(1, (env.night - 0.12) / 0.35));
      mat.opacity = k; pts.visible = streaks.visible = pools.visible = k > 0.01; if (!pts.visible) return;
      let n = 0, ns = 0;
      const put = (x: number, y: number, z: number, c: Col, a = 1) => { if (n >= MAX) return; const r = RGB[c]; pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z; col[n * 3] = r[0] * a; col[n * 3 + 1] = r[1] * a; col[n * 3 + 2] = r[2] * a; n++; };
      const R2 = 3200 ** 2;
      for (const sh of ships.ships) {
        if (sh.hidden) continue; const dx = sh.x - cam.x, dz = sh.z - cam.z, d2 = dx * dx + dz * dz; if (d2 > R2) continue;
        const sc = sh.len / NATIVE[sh.kind], c = Math.cos(sh.yaw), s = Math.sin(sh.yaw), far = d2 > 900 ** 2;
        // le voilier et le pêcheur n'allument que leurs feux de route ; à quai, les navires gardent fenêtres et feux de pont
        for (const [lx, ly, lz, cc] of LIGHTS[sh.kind]) {
          if (far && cc === 'y' && sh.len < 60) continue;
          put(sh.x + (lz * s - lx * c) * sc, sh.y + ly * sc, sh.z + (lz * c + lx * s) * sc, cc);
        }
        if (ns < MAX_STREAK && d2 < 1600 ** 2) for (const [lx, ly, lz] of GLOW[sh.kind]) {
          if (ns >= MAX_STREAK) break;
          const wx = sh.x + (lz * s - lx * c) * sc, wz = sh.z + (lz * c + lx * s) * sc, vx = cam.x - wx, vz = cam.z - wz, vl = Math.hypot(vx, vz) || 1, len = Math.min(10 + ly * sc * 2.2, vl * 0.5);
          o.position.set(wx, sh.y + 0.13, wz); o.rotation.set(0, Math.atan2(vx, vz), 0); o.scale.set(Math.max(1.5, sh.len * 0.05), 1, len); o.updateMatrix(); streaks.setMatrixAt(ns++, o.matrix);
        }
      }
      let np = 0;
      for (const f of fixed) {
        if ((f.x - cam.x) ** 2 + (f.z - cam.z) ** 2 > R2) continue;
        if (f.pool !== undefined && np < 400 && (f.x - cam.x) ** 2 + (f.z - cam.z) ** 2 < 900 ** 2) { o.position.set(f.x, f.pool + 0.08, f.z); o.rotation.set(0, 0, 0); o.scale.set(26, 1, 26); o.updateMatrix(); pools.setMatrixAt(np++, o.matrix); }
        const a = f.blink === 0 ? 1 : f.blink === 1 ? (Math.sin(t * 2.4) > 0.2 ? 1 : 0.08) : (Math.sin(t * 1.6 + f.blink) > -0.3 ? 1 : 0.1);
        put(f.x, f.y, f.z, f.c, a);
      }
      // projecteur de travail sur les portiques qui déchargent un navire
      ships.ports.forEach(ps => { if (ps.busy < 0 || ps.poi.water !== 'mer') return; const G = portGeom(ps.poi); for (const cp of G.craneP) { const [x, z] = portAt(ps.poi, cp, 0); put(x, ps.poi.y + 34, z, 'w', 1); } });
      g.setDrawRange(0, n); g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
      pools.count = np; pools.instanceMatrix.needsUpdate = true; (pools.material as THREE.MeshBasicMaterial).opacity = 0.5 * k;
      streaks.count = ns; streaks.instanceMatrix.needsUpdate = true;
    },
  };
}
