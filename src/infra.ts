import * as THREE from 'three';
import type { Aspect, World } from './sim/world';
import type { Edge } from './sim/network';
import type { DayNight } from './env';
import { MeshBuilder, gableRoof, wallBox } from './geom';

const mat = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const col = (h: number) => new THREE.Color(h);

export interface Lamp { e: Edge; mesh: THREE.Mesh; aspect: Aspect }

function signTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d4f91'; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(6, 6, 500, 84);
  g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.fillText(text, 256, 67);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Voies (ballast, rails, traverses), quais, dépôts, signaux. Tout est généré depuis le graphe. */
export function buildInfra(scene: THREE.Scene, world: World, env: DayNight): { lamps: Lamp[]; setAspect: (l: Lamp, a: Aspect) => void } {
  const net = world.net;
  const dummy = new THREE.Object3D();

  // ---------- Voies ----------
  function ribbons(color: number, specs: [number, number, number][]): THREE.Mesh {
    const pos: number[] = [], idx: number[] = [];
    for (const e of net.edges) if (!e.mirror) for (const [off, w, y] of specs) {
      const n = e.pts.length, base = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const a = e.pts[Math.max(i - 1, 0)], b = e.pts[Math.min(i + 1, n - 1)], p = e.pts[i];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, lx = -dz / l, lz = dx / l;
        for (const sg of [-1, 1]) pos.push(p.x + lx * (off + (sg * w) / 2), p.y + y, p.z + lz * (off + (sg * w) / 2));
      }
      for (let i = 0; i < n - 1; i++) { const j = base + i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat(color, { side: THREE.DoubleSide }));
    m.receiveShadow = true;
    return m;
  }
  scene.add(ribbons(0x8a8478, [[0, 3.4, 0.05]]));
  scene.add(ribbons(0x555a60, [[-0.72, 0.15, 0.2], [0.72, 0.15, 0.2]]));

  const sleeperMats: THREE.Matrix4[] = [];
  for (const e of net.edges) if (!e.mirror) for (let i = 0; i < Math.floor(e.len / 0.7); i++) {
    const d = i * 0.7 + 0.35, p = e.at(d);
    if (e.ref) { const q = e.ref.at(Math.min(d, e.ref.len)); if (Math.hypot(p.x - q.x, p.z - q.z) < 3.1) continue; }   // voies encore confondues
    dummy.position.set(p.x, p.y + 0.12, p.z); dummy.lookAt(p.x + p.tx, p.y + 0.12, p.z + p.tz); dummy.updateMatrix();
    sleeperMats.push(dummy.matrix.clone());
  }
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.12, 0.25), mat(0x4a3b2e), sleeperMats.length);
  sleeperMats.forEach((m, i) => sleepers.setMatrixAt(i, m));
  scene.add(sleepers);

  // ---------- Gares : quai, auvent, bâtiment voyageurs, panneaux, lampadaires (suivent la courbe) ----------
  const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const postMat = mat(0x333638);
  const lampPole = new THREE.BoxGeometry(0.14, 4.2, 0.14).translate(0, 2.1, 0), lampHead = new THREE.BoxGeometry(0.6, 0.22, 0.6).translate(0, 4.3, 0);
  const postGeo = new THREE.BoxGeometry(0.2, 4.0, 0.2).translate(0, 2.0, 0);
  const signTex = new Map<string, THREE.CanvasTexture>();
  const platC = col(0xb9b9b0), canopyC = col(0x5d6b7a), wallC0 = col(0xe0d6c4), roofC0 = col(0x8a4a3a), edgeC = col(0xe2c14a);
  const stBuild = new MeshBuilder(), stRoof = new MeshBuilder(), stPlat = new MeshBuilder();
  const [hU, hV] = env.houseTile;
  type Fr = { x: number; y: number; z: number; tx: number; tz: number; nx: number; nz: number };
  const frame = (e: Edge, d: number): Fr => { const p = e.at(Math.max(0, Math.min(e.len, d))); return { x: p.x, y: p.y, z: p.z, tx: p.tx, tz: p.tz, nx: -p.tz, nz: p.tx }; };
  /** Prisme le long de la voie : entre les distances d0 et d1, entre les décalages latéraux (gauche > 0) latA et latB, entre les hauteurs y0 et y1. */
  function prism(mb: MeshBuilder, e: Edge, d0: number, d1: number, latA: number, latB: number, y0: number, y1: number, c: THREE.Color) {
    const steps = Math.max(2, Math.ceil((d1 - d0) / 4)), fs: Fr[] = [];
    for (let i = 0; i <= steps; i++) fs.push(frame(e, d0 + ((d1 - d0) * i) / steps));
    const P = (f: Fr, lat: number, y: number): [number, number, number] => [f.x + f.nx * lat, f.y + y, f.z + f.nz * lat];
    for (let i = 0; i < steps; i++) {
      const a = fs[i], b = fs[i + 1];
      mb.quad([P(a, latA, y1), P(a, latB, y1), P(b, latB, y1), P(b, latA, y1)], c, [0, 1, 0]);
      mb.quad([P(a, latA, y0), P(a, latB, y0), P(b, latB, y0), P(b, latA, y0)], c, [0, -1, 0]);
      mb.quad([P(a, latA, y0), P(b, latA, y0), P(b, latA, y1), P(a, latA, y1)], c, [-a.nx, 0, -a.nz]);   // côté voie
      mb.quad([P(a, latB, y0), P(b, latB, y0), P(b, latB, y1), P(a, latB, y1)], c, [a.nx, 0, a.nz]);      // côté extérieur
    }
    const f0 = fs[0], f1 = fs[steps];
    mb.quad([P(f0, latA, y0), P(f0, latB, y0), P(f0, latB, y1), P(f0, latA, y1)], c, [-f0.tx, 0, -f0.tz]);
    mb.quad([P(f1, latA, y0), P(f1, latB, y0), P(f1, latB, y1), P(f1, latA, y1)], c, [f1.tx, 0, f1.tz]);
  }
  for (const e of net.edges.filter(x => x.kind === 'plat')) {
    const dEnd = e.stopOffset, dMid = dEnd - 70, name = e.station;
    prism(stPlat, e, Math.max(2, dEnd - 140), dEnd, 1.9, 5.5, -0.3, 0.9, platC);
    prism(stPlat, e, Math.max(2, dEnd - 140), dEnd, 1.9, 2.3, 0.9, 0.95, edgeC);                // bande de sécurité
    prism(stPlat, e, dMid - 40, dMid + 40, 1.6, 6.8, 4.55, 4.8, canopyC);                       // auvent
    for (let d = dMid - 36; d <= dMid + 36; d += 12) {
      const f = frame(e, d), post = new THREE.Mesh(postGeo, postMat);
      post.position.set(f.x + f.nx * 5.8, f.y + 0.9, f.z + f.nz * 5.8); post.castShadow = true; scene.add(post);
    }
    for (let d = dEnd - 130; d <= dEnd - 10; d += 20) {                                          // lampadaires
      const f = frame(e, d), x = f.x + f.nx * 2.6, z = f.z + f.nz * 2.6;
      const pole = new THREE.Mesh(lampPole, postMat); pole.position.set(x, f.y + 0.9, z);
      const head = new THREE.Mesh(lampHead, env.lampHead); head.position.set(x, f.y + 0.9, z);
      scene.add(pole, head);
    }
    if (!signTex.has(name)) signTex.set(name, signTexture(name));
    for (const d of [dMid - 24, dMid + 24]) {
      const f = frame(e, d);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.1), new THREE.MeshBasicMaterial({ map: signTex.get(name), side: THREE.DoubleSide }));
      board.position.set(f.x + f.nx * 5.7, f.y + 3.6, f.z + f.nz * 5.7);
      board.rotation.y = Math.atan2(f.tz, -f.tx);   // la face avant regarde la voie (normale = -n)
      scene.add(board);
    }
    // bâtiment voyageurs, derrière le quai, orienté selon la voie à cet endroit
    const f = frame(e, dMid), cx = f.x + f.nx * 14, cz = f.z + f.nz * 14, rot = Math.atan2(-f.tx, f.tz);
    wallBox(stBuild, cx, cz, f.y - 0.3, 8, 34, 6.3, rot, wallC0, hU, hV);
    gableRoof(stRoof, cx, cz, f.y + 6, 8, 34, 2.6, rot, roofC0, 0.6);
  }
  for (const e of net.edges.filter(x => x.turn)) {          // heurtoir au bout du terminus
    const f = frame(e, e.len - 0.4), rot = Math.atan2(-f.tx, -f.tz);
    for (const [w, h, y, z, c] of [[3.0, 0.5, 0.75, 0, 0x7a2a22], [0.35, 1.1, 0.55, -0.9, 0x3a3a3c], [0.35, 1.1, 0.55, 0.9, 0x3a3a3c]] as number[][]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), mat(c));
      b.position.set(f.x + f.nx * z, f.y + y, f.z + f.nz * z); b.rotation.y = rot; b.castShadow = true; scene.add(b);
    }
  }
  const addStation = (mb: MeshBuilder, m: THREE.Material) => {
    if (mb.empty) return;
    const mesh = new THREE.Mesh(mb.build(), m); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  };
  addStation(stPlat, vcMat); addStation(stBuild, env.houseWin); addStation(stRoof, vcMat);

  // ---------- Dépôts : halle couverte, entrepôts, conteneurs ----------
  const containerCol = [0xb03a2e, 0x2e6da4, 0xd9a21b, 0x3d8b5a, 0x7a7f86, 0xc9602b].map(h => new THREE.Color(h));
  const containers: { x: number; y: number; z: number; rot: number; c: THREE.Color }[] = [];
  for (const dep of net.depots) {
    const eR = dep.edges[0], eL = dep.edges[dep.edges.length - 1];
    const nP = eL.pts.length;
    const tan = (k: number) => {
      const a = eL.pts[Math.max(k - 1, 0)], b = eL.pts[Math.min(k + 1, nP - 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      return { tx: dx / l, tz: dz / l, nx: -dz / l, nz: dx / l };
    };
    const k0 = 0, k1 = nP - 1, hallMb = new MeshBuilder();
    const ring = (kk: number) => {
      const t = tan(kk), L = eL.pts[kk], R = eR.pts[kk], y = L.y;
      const bL: [number, number, number] = [L.x + t.nx * 2.6, y - 0.2, L.z + t.nz * 2.6];
      const bR: [number, number, number] = [R.x - t.nx * 2.6, y - 0.2, R.z - t.nz * 2.6];
      return {
        bL, bR, tL: [bL[0], y + 6.5, bL[2]] as [number, number, number], tR: [bR[0], y + 6.5, bR[2]] as [number, number, number],
        rg: [(bL[0] + bR[0]) / 2, y + 8.6, (bL[2] + bR[2]) / 2] as [number, number, number], n: t,
      };
    };
    const wallC = col(0xb4b8bc), roofC = col(0x626872);
    for (let kk = k0; kk < k1; kk++) {
      const a = ring(kk), b = ring(kk + 1), n = a.n;
      hallMb.quad([a.bL, a.tL, b.tL, b.bL], wallC, [n.nx, 0, n.nz]);
      hallMb.quad([a.tL, a.rg, b.rg, b.tL], roofC, [n.nx * 0.5, 1, n.nz * 0.5]);
      hallMb.quad([a.rg, a.tR, b.tR, b.rg], roofC, [-n.nx * 0.5, 1, -n.nz * 0.5]);
      hallMb.quad([a.tR, a.bR, b.bR, b.tR], wallC, [-n.nx, 0, -n.nz]);
    }
    const hall = new THREE.Mesh(hallMb.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    hall.castShadow = true; hall.receiveShadow = true; scene.add(hall);

    // entrepôts et piles de conteneurs, côté extérieur
    const wh = new MeshBuilder();
    for (const kk of [Math.round(nP * 0.2), Math.round(nP * 0.6)]) {
      const t = tan(kk), L = eL.pts[kk], off = 2.6 + 20, cx = L.x + t.nx * off, cz = L.z + t.nz * off, rot = Math.atan2(-t.tx, t.tz);
      wallBox(wh, cx, cz, L.y - 0.3, 16, 36, 9, rot, col(kk < nP / 2 ? 0xa65b3a : 0x8f979f), 4, 4);
      gableRoof(wh, cx, cz, L.y + 8.7, 16, 36, 3, rot, col(0x5d636b), 0.5);
    }
    const whMesh = new THREE.Mesh(wh.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    whMesh.castShadow = true; whMesh.receiveShadow = true; scene.add(whMesh);
    for (let kk = Math.round(nP * 0.1); kk <= nP - 3; kk += 3) for (const off of [36.6, 40.2]) {
      const t = tan(kk), L = eL.pts[kk], rot = Math.atan2(-t.tx, t.tz);
      for (let lvl = 0; lvl < (kk % 2 ? 1 : 2); lvl++)
        containers.push({ x: L.x + t.nx * off, y: L.y - 0.3 + lvl * 2.5, z: L.z + t.nz * off, rot, c: containerCol[(kk * 7 + lvl * 3 + (off > 38 ? 1 : 0)) % containerCol.length] });
    }
  }
  if (containers.length) {
    const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.5, 2.4, 6).translate(0, 1.2, 0), mat(0xffffff), containers.length);
    containers.forEach((c, i) => { dummy.position.set(c.x, c.y, c.z); dummy.rotation.set(0, c.rot, 0); dummy.updateMatrix(); cm.setMatrixAt(i, dummy.matrix); cm.setColorAt(i, c.c); });
    cm.castShadow = true; cm.receiveShadow = true; scene.add(cm);
    dummy.rotation.set(0, 0, 0);
  }

  // ---------- Caténaires : fil de contact au-dessus de chaque voie, portiques tous les ~60 m ----------
  {
    const wire: number[] = [];
    for (const name of Object.keys(net.ring)) for (const e of net.ring[name]) if (!e.mirror) for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i];
      wire.push(a.x, a.y + 5.3, a.z, b.x, b.y + 5.3, b.z);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x25272a })));
    const avoid = net.lines.flatMap(l => l.center).filter(p => p.tf || p.bf);
    const half = 2.25, masts: THREE.Matrix4[] = [], beams: THREE.Matrix4[] = [];
    for (const e of Object.keys(net.ring).filter(k => k === 'A' || k.endsWith('+')).flatMap(k => net.ring[k]).filter(x => x.kind === 'block')) for (let d = 18; d < e.len - 18; d += 60) {
      const p = e.at(d);
      if (avoid.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 14)) continue;
      const nx = -p.tz, nz = p.tx;                                       // normale à gauche de la voie A
      const lx = p.x + nx * 2.8, lz = p.z + nz * 2.8, rx = p.x - nx * (2 * half + 2.8), rz = p.z - nz * (2 * half + 2.8);
      for (const [x, z] of [[lx, lz], [rx, rz]]) { dummy.position.set(x, p.y + 3.4, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); masts.push(dummy.matrix.clone()); }
      dummy.position.set((lx + rx) / 2, p.y + 6.7, (lz + rz) / 2); dummy.rotation.set(0, Math.atan2(-p.tx, -p.tz), 0); dummy.updateMatrix(); beams.push(dummy.matrix.clone());
    }
    for (const e of Object.keys(net.ring).filter(k => k.endsWith('>')).flatMap(k => net.ring[k]).filter(x => x.kind === 'block')) for (let d = 14; d < e.len - 14; d += 55) {   // voie unique : un mât latéral
      const p = e.at(d);
      if (avoid.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 14)) continue;
      dummy.position.set(p.x - p.tz * 2.8, p.y + 3.4, p.z + p.tx * 2.8); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); masts.push(dummy.matrix.clone());
    }
    const mm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 6.8, 0.3), mat(0x6c7075), masts.length);
    masts.forEach((m, i) => mm.setMatrixAt(i, m));
    const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(2 * half + 5.6, 0.28, 0.28), mat(0x6c7075), beams.length);
    beams.forEach((m, i) => bm.setMatrixAt(i, m));
    mm.castShadow = bm.castShadow = true;
    scene.add(mm, bm);
    dummy.rotation.set(0, 0, 0);
  }

  // ---------- Signaux ----------
  const lampMats: Record<string, THREE.Material> = {
    red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    yellow: new THREE.MeshBasicMaterial({ color: 0xffc400 }),
    green: new THREE.MeshBasicMaterial({ color: 0x2aff5a }),
  };
  const poleGeo = new THREE.BoxGeometry(0.2, 4.5, 0.2), lampGeo = new THREE.SphereGeometry(0.4, 8, 6), pm = mat(0x333333);
  const lamps: Lamp[] = net.edges.filter(e => e.kind === 'block' || e.kind === 'main' || e.kind === 'plat').map(e => {
    const p = e.at(e.len - 3), x = p.x - p.tz * 2.8, z = p.z + p.tx * 2.8;
    const pole = new THREE.Mesh(poleGeo, pm); pole.position.set(x, p.y + 2.25, z);
    const mesh = new THREE.Mesh(lampGeo, lampMats.red); mesh.position.set(x, p.y + 4.6, z);
    scene.add(pole, mesh);
    return { e, mesh, aspect: 'red' as Aspect };
  });
  const setAspect = (l: Lamp, a: Aspect) => { if (a !== l.aspect) { l.aspect = a; l.mesh.material = lampMats[a]; } };
  return { lamps, setAspect };
}
