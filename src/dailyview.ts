// Mobilier de la vie quotidienne : étals de marché (auvents rayés) et tables de terrasse avec parasol.
import * as THREE from 'three';
import { MeshBuilder, type V } from './geom';
import type { DailyLife } from './sim/daily';
import { marketLevel, type Crossing } from './sim/daily';
import { glowTexture } from './nightwater';
import type { DayNight } from './env';

/** Un panneau (texte sur fond de couleur) planté sur un mât. */
function sign(text: string, bg: string, fg = '#fff'): THREE.Group {
  const c = document.createElement('canvas'); c.width = 256; c.height = 80; const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 256, 80); g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(5, 5, 246, 70);
  g.fillStyle = fg; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 42);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // deux faces dos à dos : le texte se lit des deux côtés
  const grp = new THREE.Group(), geo = new THREE.PlaneGeometry(2.4, 0.75), mat = new THREE.MeshBasicMaterial({ map: t });
  const f = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat); b.rotation.y = Math.PI; b.position.z = -0.01; f.position.z = 0.01; grp.add(f, b);
  return grp;
}

export function buildDailyView(scene: THREE.Scene, daily: DailyLife, env?: DayNight, crossings: Crossing[] = [], crossHW: number[] = []) {
  const rot = (x: number, z: number, yaw: number, ox: number, oz: number): [number, number] => { const c = Math.cos(yaw), s = Math.sin(yaw); return [x + ox * c + oz * s, z - ox * s + oz * c]; };
  const wood = new THREE.Color(0x7a5a3a), cloth = new THREE.Color(0xf0eadc), white = new THREE.Color(0xf4f1e8), dark = new THREE.Color(0x3a3a40);
  const sb = new MeshBuilder(), tb = new MeshBuilder();
  const box = (b: MeshBuilder, x: number, y: number, z: number, yaw: number, w: number, h: number, d: number, y0: number, c: THREE.Color) => {
    // boîte tournée de `yaw` : 4 faces latérales + dessus (faces assemblées à la main pour éviter une rotation de géométrie)
    const hw = w / 2, hd = d / 2, P = (ox: number, oy: number, oz: number): V => { const [px, pz] = rot(x, z, yaw, ox, oz); return [px, y + oy, pz]; };
    const c0 = P(-hw, y0, -hd), c1 = P(hw, y0, -hd), c2 = P(hw, y0, hd), c3 = P(-hw, y0, hd), t0 = P(-hw, y0 + h, -hd), t1 = P(hw, y0 + h, -hd), t2 = P(hw, y0 + h, hd), t3 = P(-hw, y0 + h, hd);
    const ctr: V = [x, y + y0 + h / 2, z];
    for (const q of [[c0, c1, t1, t0], [c1, c2, t2, t1], [c2, c3, t3, t2], [c3, c0, t0, t3], [t0, t1, t2, t3]] as V[][]) b.quad(q as [V, V, V, V], c, [(q[0][0] + q[2][0]) / 2 - ctr[0], (q[0][1] + q[2][1]) / 2 - ctr[1], (q[0][2] + q[2][2]) / 2 - ctr[2]]);
  };
  for (const p of daily.places) {
    for (const s of p.stalls) {
      box(sb, s.x, s.y, s.z, s.yaw, 2.6, 0.9, 1.1, 0, wood);                                  // comptoir
      const awn = new THREE.Color(s.color);
      box(sb, s.x, s.y, s.z, s.yaw, 3.0, 0.12, 1.9, 2.2, awn);                                // auvent coloré
      box(sb, s.x, s.y, s.z, s.yaw, 3.02, 0.13, 0.5, 2.2, cloth);                             // bande claire (effet rayé)
      for (const sx of [-1.4, 1.4]) { const [px, pz] = rot(s.x, s.z, s.yaw, sx, -0.5); box(sb, px, s.y, pz, s.yaw, 0.08, 2.2, 0.08, 0, wood); }
      box(sb, s.x, s.y, s.z, s.yaw, 2.2, 0.28, 0.5, 0.9, new THREE.Color(s.color).offsetHSL(0, -0.2, 0.15));   // cageots de marchandise
    }
    for (const t of p.tables) {
      box(tb, t.x, t.y, t.z, t.yaw, 0.7, 0.05, 0.7, 0.72, white);                              // plateau
      box(tb, t.x, t.y, t.z, t.yaw, 0.06, 0.72, 0.06, 0, dark);                                // pied
      box(tb, t.x, t.y, t.z, t.yaw, 0.04, 2.2, 0.04, 0, dark);                                 // mât du parasol
      box(tb, t.x, t.y, t.z, t.yaw, 2.2, 0.08, 2.2, 2.2, new THREE.Color(0xc9473a));           // parasol
      for (const k of [-1, 1]) { const [px, pz] = rot(t.x, t.z, t.yaw, 0, 0.75 * k); box(tb, px, t.y, pz, t.yaw, 0.4, 0.04, 0.4, 0.42, dark); }   // chaises (assise)
    }
  }
  // passages piétons : bandes blanches sur la chaussée
  const zb = new MeshBuilder(), zc = new THREE.Color(0xe9e9e4);
  crossings.forEach((c, i) => {
    const hw = crossHW[i] ?? 4, dx = c.bx - c.ax, dz = c.bz - c.az, L = Math.hypot(dx, dz) || 1, nx = dx / L, nz = dz / L, tx = -nz, tz = nx, mx = (c.ax + c.bx) / 2, mz = (c.az + c.bz) / 2;
    for (let q = -hw + 0.7; q <= hw - 0.7; q += 1.0) {
      const cx0 = mx + nx * q, cz0 = mz + nz * q, y = c.y + 0.05, a = 0.25, b = 1.6;
      zb.quad([[cx0 - nx * a - tx * b, y, cz0 - nz * a - tz * b], [cx0 + nx * a - tx * b, y, cz0 + nz * a - tz * b], [cx0 + nx * a + tx * b, y, cz0 + nz * a + tz * b], [cx0 - nx * a + tx * b, y, cz0 - nz * a + tz * b]], zc, [0, 1, 0]);
    }
  });
  if (crossings.length) { const zm = new THREE.Mesh(zb.build(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); zm.receiveShadow = true; zm.frustumCulled = false; scene.add(zm); }
  // enseignes : café au bord de chaque terrasse, banderole du marché, portail et panneau de l'école
  const lights: { x: number; y: number; z: number; c: number; pool: number }[] = [];
  const signs: THREE.Object3D[] = [];
  const post = (x: number, y: number, z: number, h: number, c = dark) => box(tb, x, y, z, 0, 0.08, h, 0.08, 0, c);
  for (const p of daily.places) {
    if (p.tables.length) {
      const t = p.tables[Math.floor(p.tables.length / 2)], ox = Math.cos(t.yaw) * 3.2 + t.x, oz = Math.sin(t.yaw) * 3.2 + t.z, yy = t.y;
      post(ox, yy, oz, 2.5); const m = sign(['CAFÉ', 'BRASSERIE', 'BAR', 'GLACIER'][Math.abs(Math.round(p.x)) % 4], ['#8a2f2a', '#2a5a3c', '#2f4a8a', '#7a4a1e'][Math.abs(Math.round(p.z)) % 4]); m.position.set(ox, yy + 2.5, oz); m.rotation.y = -t.yaw + Math.PI / 2; m.scale.setScalar(0.9); signs.push(m); lights.push({ x: ox, y: yy + 2.2, z: oz, c: 0xffd9a0, pool: 0 });
      for (const tb2 of p.tables) lights.push({ x: tb2.x, y: tb2.y + 2.0, z: tb2.z, c: 0xffc27a, pool: 4.5 });
    }
    if (p.stalls.length) {
      const s0 = p.stalls[0], ex = s0.x + (s0.x - p.x) * 0.45, ez = s0.z + (s0.z - p.z) * 0.45; post(ex, s0.y, ez, 3.2); const m = sign('MARCHÉ', '#c9792b'); m.position.set(ex, s0.y + 3.2, ez); m.rotation.y = Math.atan2(s0.x - p.x, s0.z - p.z); m.scale.setScalar(1.2); signs.push(m);
    }
    if (p.school) {
      const S = p.school, nx = -S.tz, nz = S.tx;     // perpendiculaire à la direction du parc : le portail est large de 6 m
      for (const k of [-1, 1]) box(tb, S.x + nx * 3 * k, S.y, S.z + nz * 3 * k, 0, 0.6, 2.6, 0.6, 0, white);
      const m = sign('ÉCOLE', '#2f5f9f'); m.position.set(S.x, S.y + 2.9, S.z); m.rotation.y = Math.atan2(S.tx, S.tz); m.scale.setScalar(1.8); signs.push(m);
      lights.push({ x: S.x + nx * 3, y: S.y + 2.7, z: S.z + nz * 3, c: 0xffe6b0, pool: 7 }, { x: S.x - nx * 3, y: S.y + 2.7, z: S.z - nz * 3, c: 0xffe6b0, pool: 7 });
    }
  }
  for (const m of signs) scene.add(m);
  // la nuit : halos chauds sous les parasols et au portail de l'école, flaques de lumière au sol
  const lp = new Float32Array(Math.max(1, lights.length) * 3), lc = new Float32Array(Math.max(1, lights.length) * 3);
  lights.forEach((l, i) => { lp.set([l.x, l.y, l.z], i * 3); const cc = new THREE.Color(l.c); lc.set([cc.r, cc.g, cc.b], i * 3); });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
  const tex = glowTexture(), lmat = new THREE.PointsMaterial({ size: 3.2, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 });
  const lpts = new THREE.Points(lg, lmat); lpts.frustumCulled = false; lpts.visible = false; scene.add(lpts);
  const poolsL = lights.filter(l => l.pool > 0), pmat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffc27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), pmat, Math.max(1, poolsL.length)); pools.count = poolsL.length; pools.frustumCulled = false; pools.renderOrder = 3; pools.visible = false;
  { const o = new THREE.Object3D(); poolsL.forEach((l, i) => { o.position.set(l.x, l.y - 2.0 + 0.1, l.z); o.scale.set(l.pool * 2, 1, l.pool * 2); o.updateMatrix(); pools.setMatrixAt(i, o.matrix); }); }
  scene.add(pools);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const stalls = new THREE.Mesh(sb.build(), mat), tables = new THREE.Mesh(tb.build(), mat);
  for (const m of [stalls, tables]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  stalls.visible = false;
  return {
    /** Le marché ne s'installe que le matin, et se replie quand il pleut ; les terrasses restent en place. */
    update(hour: number, rain: number) {
      stalls.visible = marketLevel(hour) > 0 && rain < 0.4; tables.visible = true;
      const k = env ? Math.max(0, Math.min(1, (env.night - 0.15) / 0.4)) : 0; lpts.visible = pools.visible = k > 0.01; lmat.opacity = k; pmat.opacity = 0.5 * k;
    },
  };
}
