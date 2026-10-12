import * as THREE from 'three';
import type { Terrain } from './sim/terrain';
import { crossHalf, type RoadNet } from './sim/roads';
import { lightState, type Traffic, type VKind } from './sim/traffic';
import type { DayNight } from './env';
import { Chunked } from './chunks';
import { MeshBuilder } from './geom';

const C = (h: number) => new THREE.Color(h);
const asphalt = [C(0x4a4d52), C(0x4e5156), C(0x474a4f)], shoulder = C(0x8c8576), lineC = C(0xe6e2d0), concrete = C(0xb4b2ac), stone = C(0x9b9384);
const white = C(0xffffff), dark = C(0x15171a), slabC = C(0x3a3c40), red = C(0xc4262e), pale = C(0xe8e8e8);

type V3 = [number, number, number];
function addMesh(scene: THREE.Scene, mb: MeshBuilder, material: THREE.Material) {
  if (mb.empty) return;
  const m = new THREE.Mesh(mb.build(), material); m.castShadow = true; m.receiveShadow = true; scene.add(m);
}

function carGeo(): { body: THREE.BufferGeometry; head: THREE.BufferGeometry; tail: THREE.BufferGeometry } {
  const b = new MeshBuilder(), h = new MeshBuilder(), t = new MeshBuilder();
  b.box(-0.9, 0.9, 0.3, 0.95, -2.2, 2.2, white);
  b.box(-0.78, 0.78, 0.95, 1.45, -1.25, 1.0, white);
  b.box(-0.8, 0.8, 1.02, 1.4, -1.15, 0.9, dark);
  b.box(-0.7, 0.7, 1.0, 1.4, 0.99, 1.03, dark);
  b.box(-0.7, 0.7, 1.0, 1.4, -1.28, -1.24, dark);
  for (const sx of [-1, 1]) for (const z of [-1.4, 1.4]) b.box(sx > 0 ? 0.76 : -0.98, sx > 0 ? 0.98 : -0.76, 0, 0.62, z - 0.3, z + 0.3, dark);
  for (const sx of [-1, 1]) { h.box(sx * 0.55 - 0.15, sx * 0.55 + 0.15, 0.6, 0.78, 2.2, 2.25, white); t.box(sx * 0.6 - 0.15, sx * 0.6 + 0.15, 0.62, 0.78, -2.25, -2.2, white); }
  return { body: b.build(), head: h.build(), tail: t.build() };
}
function busGeo(): { body: THREE.BufferGeometry; head: THREE.BufferGeometry; tail: THREE.BufferGeometry } {
  const b = new MeshBuilder(), h = new MeshBuilder(), t = new MeshBuilder();
  b.box(-1.27, 1.27, 0.45, 3.1, -5.75, 5.75, white);
  b.box(-1.29, 1.29, 1.65, 2.75, -5.4, 5.2, dark);
  b.box(-1.1, 1.1, 1.6, 2.8, 5.74, 5.78, dark);
  b.box(-1.1, 1.1, 1.8, 2.7, -5.78, -5.74, dark);
  for (const sx of [-1, 1]) for (const z of [-3.9, 3.9]) b.box(sx > 0 ? 1.1 : -1.4, sx > 0 ? 1.4 : -1.1, 0, 0.95, z - 0.5, z + 0.5, dark);
  for (const sx of [-1, 1]) { h.box(sx * 0.9 - 0.2, sx * 0.9 + 0.2, 0.7, 0.95, 5.75, 5.8, white); t.box(sx * 0.9 - 0.2, sx * 0.9 + 0.2, 0.8, 1.05, -5.8, -5.75, white); }
  return { body: b.build(), head: h.build(), tail: t.build() };
}
function truckGeo(): { body: THREE.BufferGeometry; head: THREE.BufferGeometry; tail: THREE.BufferGeometry } {
  const b = new MeshBuilder(), h = new MeshBuilder(), t = new MeshBuilder();
  b.box(-1.25, 1.25, 0.9, 3.0, 2.5, 4.75, white);
  b.box(-1.0, 1.0, 1.9, 2.8, 4.74, 4.78, dark);
  b.box(-1.27, 1.27, 0.9, 3.5, -4.75, 2.3, pale);
  b.box(-1.0, 1.0, 0.45, 0.9, -4.75, 4.75, dark);
  for (const sx of [-1, 1]) for (const z of [-3.8, -2.6, 3.6]) b.box(sx > 0 ? 1.0 : -1.3, sx > 0 ? 1.3 : -1.0, 0, 0.95, z - 0.5, z + 0.5, dark);
  for (const sx of [-1, 1]) { h.box(sx * 0.9 - 0.2, sx * 0.9 + 0.2, 0.9, 1.15, 4.75, 4.8, white); t.box(sx * 0.9 - 0.2, sx * 0.9 + 0.2, 0.7, 0.95, -4.8, -4.75, white); }
  return { body: b.build(), head: h.build(), tail: t.build() };
}

/** Routes de campagne, ponts routiers, passages à niveau, feux tricolores et véhicules. */
const cityRoad = new THREE.Color(0x4a4d52);
export function buildRoadView(scene: THREE.Scene, roads: RoadNet, terrain: Terrain, traffic: Traffic, env: DayNight) {
  // ---------- routes de campagne et ponts ----------
  const flat = new Chunked(300), struct = new Chunked(300);
  for (const e of roads.edges) {
    if (!e.render) continue;
    const n = Math.max(2, Math.ceil(e.poly.len / 8));
    const rows: { x: number; z: number; yc: number; lx: number; lz: number; deck: boolean; ce: number }[] = [];
    const cityA = e.a.edges.some(o => !o.render), cityB = e.b.edges.some(o => !o.render);
    for (let i = 0; i <= n; i++) {
      const d = (e.poly.len * i) / n, s = e.poly.at(d), a = e.poly.at(Math.max(0, d - 4)), b = e.poly.at(Math.min(e.poly.len, d + 4));
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      rows.push({ x: s.x, z: s.z, yc: s.y, lx: -dz / l, lz: dx / l, deck: s.y - terrain.height(s.x, s.z) > 0.9, ce: Math.min(cityA ? d : 1e9, cityB ? e.poly.len - d : 1e9) });
    }
    const hw = e.hw;
    // arches : sur chaque tronçon de tablier qui franchit l'eau, une voûte en pierre (intrados circulaire) ; le chenal reste libre pour les bateaux
    const archU: (number | null)[] = rows.map(() => null), archLev: number[] = rows.map(() => 0);
    for (let i = 0; i < rows.length;) {
      const rv = (k: number) => (rows[k].deck ? terrain.riverNear(rows[k].x, rows[k].z) : null), wet = (k: number) => { const q = rv(k); return !!q && q.d < q.hw + 5; };
      if (!wet(i)) { i++; continue; }
      let j = i; while (j + 1 < rows.length && wet(j + 1)) j++;
      const i0 = Math.max(0, i - 1), i1 = Math.min(rows.length - 1, j + 1);
      if ((i1 - i0) * (e.poly.len / n) >= 30 && rows[i0].deck && rows[i1].deck) { const lev = rv(Math.round((i + j) / 2))!.level; for (let k = i0; k <= i1; k++) { archU[k] = (k - i0) / (i1 - i0); archLev[k] = lev; } }
      i = j + 1;
    }
    const ground = (r: typeof rows[0], lat: number) => (r.deck ? r.yc : terrain.height(r.x + r.lx * lat, r.z + r.lz * lat) + 0.22 + 0.08 * Math.min(1, r.ce / 14));
    for (let i = 0; i < n; i++) {
      const a = rows[i], b = rows[i + 1], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, F = flat.at(mx, mz), col = a.ce < 14 || b.ce < 14 ? cityRoad : asphalt[i % 3], nearCity = a.ce < 14 || b.ce < 14;
      const P = (r: typeof rows[0], lat: number, dy = 0): V3 => [r.x + r.lx * lat, ground(r, lat) + dy, r.z + r.lz * lat];
      F.quad([P(a, -hw), P(a, hw), P(b, hw), P(b, -hw)], col, [0, 1, 0]);
      if (nearCity) { /* raccord avec une rue : ni accotement ni lignes */ } else {
      if (!a.deck) {
        F.quad([P(a, hw), P(a, hw + 0.9, -0.05), P(b, hw + 0.9, -0.05), P(b, hw)], shoulder, [0, 1, 0]);
        F.quad([P(a, -hw - 0.9, -0.05), P(a, -hw), P(b, -hw), P(b, -hw - 0.9, -0.05)], shoulder, [0, 1, 0]);
      }
      for (const sg of [-1, 1]) F.quad([P(a, sg * (hw - 0.45), 0.03), P(a, sg * (hw - 0.25), 0.03), P(b, sg * (hw - 0.25), 0.03), P(b, sg * (hw - 0.45), 0.03)], lineC, [0, 1, 0]);
      if (i % 2 === 0) F.quad([P(a, -0.1, 0.03), P(a, 0.1, 0.03), P(b, 0.1, 0.03), P(b, -0.1, 0.03)], lineC, [0, 1, 0]);
      }
      if (a.deck && b.deck) {                                       // pont : tablier, garde-corps, piles
        const S = struct.at(mx, mz), th = 0.9;
        const Q = (r: typeof rows[0], lat: number, dy: number): V3 => [r.x + r.lx * lat, r.yc + dy, r.z + r.lz * lat];
        S.quad([Q(a, -hw - 0.5, -th), Q(a, hw + 0.5, -th), Q(b, hw + 0.5, -th), Q(b, -hw - 0.5, -th)], concrete, [0, -1, 0]);
        for (const sg of [-1, 1]) {
          const out: V3 = [sg * a.lx, 0, sg * a.lz];
          S.quad([Q(a, sg * (hw + 0.5), -th), Q(a, sg * (hw + 0.5), 0.9), Q(b, sg * (hw + 0.5), 0.9), Q(b, sg * (hw + 0.5), -th)], concrete, out);
          S.quad([Q(a, sg * (hw - 0.1), 0.02), Q(a, sg * (hw - 0.1), 0.9), Q(b, sg * (hw - 0.1), 0.9), Q(b, sg * (hw - 0.1), 0.02)], concrete, [-out[0], 0, -out[2]]);
          S.quad([Q(a, sg * (hw + 0.5), 0.9), Q(a, sg * (hw - 0.1), 0.9), Q(b, sg * (hw - 0.1), 0.9), Q(b, sg * (hw + 0.5), 0.9)], concrete, [0, 1, 0]);
        }
        const ua = archU[i], ub = archU[i + 1];
        if (ua !== null && ub !== null) {                          // voûte : intrados circulaire, tympans pleins de chaque côté
          const lev = archLev[i] - 0.3, crown = Math.max(a.yc, b.yc) - th - 1.0, ay = (r: typeof rows[0], u: number) => lev + (Math.min(crown, r.yc - th - 1.0) - lev) * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
          const ya = ay(a, ua), yb = ay(b, ub);
          S.quad([[a.x + a.lx * (-hw - 0.5), ya, a.z + a.lz * (-hw - 0.5)], [b.x + b.lx * (-hw - 0.5), yb, b.z + b.lz * (-hw - 0.5)], [b.x + b.lx * (hw + 0.5), yb, b.z + b.lz * (hw + 0.5)], [a.x + a.lx * (hw + 0.5), ya, a.z + a.lz * (hw + 0.5)]], stone, [0, -1, 0]);
          for (const sg of [-1, 1]) {
            const out: V3 = [sg * a.lx, 0, sg * a.lz], X = (r: typeof rows[0], y: number): V3 => [r.x + r.lx * sg * (hw + 0.5), y, r.z + r.lz * sg * (hw + 0.5)];
            S.quad([X(a, ya), X(a, a.yc - th), X(b, b.yc - th), X(b, yb)], stone, out);
          }
        }
        if (i % 3 === 0) for (const sg of [-1, 1]) {
          const px = a.x + a.lx * hw * 0.5 * sg, pz = a.z + a.lz * hw * 0.5 * sg, g0 = terrain.height(px, pz) - 0.8;
          const rv = terrain.riverNear(px, pz); if (rv && rv.d < rv.hw + 4) continue;     // pas de pile dans le chenal
          S.box(px - 0.6, px + 0.6, g0, a.yc - th, pz - 0.6, pz + 0.6, concrete);
        }
      }
    }
  }
  // raccords : à chaque jonction de routes de campagne, un disque d'asphalte arrondit le coude (sans lui, deux tronçons qui se rejoignent en biais laissent un décrochement)
  for (const nd of roads.nodes) {
    const re = nd.edges.filter(e => e.render); if (re.length < 1 || nd.edges.length < 2 || nd.y - terrain.height(nd.x, nd.z) > 0.9) continue;
    const hw = Math.max(...nd.edges.map(e => e.hw)), col = nd.edges.some(o => !o.render) ? cityRoad : asphalt[0], F = flat.at(nd.x, nd.z), y = terrain.height(nd.x, nd.z) + 0.235;
    const rim = (k: number, dy = 0): V3 => { const th = -(k / 12) * Math.PI * 2; const x = nd.x + Math.cos(th) * hw, z = nd.z + Math.sin(th) * hw; return [x, terrain.height(x, z) + 0.235 + dy, z]; };
    for (let k = 0; k < 12; k += 2) F.quad([[nd.x, y, nd.z], rim(k), rim(k + 1), rim(k + 2)], col, [0, 1, 0]);
  }
  flat.addTo(scene, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), false, true);
  struct.addTo(scene, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), true, true);

  // ---------- passages à niveau : dalle, croix, feux, demi-barrières ----------
  const xmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const xs = new MeshBuilder();
  const armLen = 4.3;
  const armGeo = (() => {
    const mb = new MeshBuilder(), n = 5, seg = armLen / n;
    for (let i = 0; i < n; i++) mb.box(i * seg, (i + 1) * seg, -0.07, 0.07, -0.07, 0.07, i % 2 ? white : red);
    return mb.build();
  })();
  const lampGeo = new THREE.SphereGeometry(0.2, 8, 6);
  const xing = roads.crossings.map(cr => {
    const mA = new THREE.MeshBasicMaterial({ color: 0x401010 }), mB = new THREE.MeshBasicMaterial({ color: 0x401010 });
    const hwX = Math.max(3.6, cr.hw), H = crossHalf(cr);
    const u: [number, number] = [cr.rx, cr.rz], v: [number, number] = [-cr.rz, cr.rx], y = cr.y + 0.02;
    const Pq = (a: number, b: number, dy = 0): V3 => [cr.x + u[0] * a + v[0] * b, y + dy, cr.z + u[1] * a + v[1] * b];
    xs.quad([Pq(-H, -hwX), Pq(-H, hwX), Pq(H, hwX), Pq(H, -hwX)], slabC, [0, 1, 0]);
    for (const sg of [-1, 1]) xs.quad([Pq(-H, sg * (hwX - 0.4), 0.02), Pq(-H, sg * (hwX - 0.25), 0.02), Pq(H, sg * (hwX - 0.25), 0.02), Pq(H, sg * (hwX - 0.4), 0.02)], lineC, [0, 1, 0]);
    const arms: { pivot: THREE.Group; dir: [number, number] }[] = [];
    for (const side of [1, -1]) {                                   // un poste par sens, à droite de la route dans le sens de marche
      const px = cr.x - u[0] * (H + 1.2) * side + v[0] * (hwX + 0.9) * side, pz = cr.z - u[1] * (H + 1.2) * side + v[1] * (hwX + 0.9) * side;
      xs.box(px - 0.08, px + 0.08, y, y + 3.2, pz - 0.08, pz + 0.08, pale);
      // normale du panneau : vers les véhicules qui arrivent (-u*side)
      const nx = -u[0] * side, nz = -u[1] * side, tx = -nz, tz = nx;          // normale (vers les véhicules) et tangente du panneau
      for (const sgn of [-1, 1]) {
        const c = 0.7071, ax = tx * c, az = tz * c, ay = sgn * c;               // barre à ±45°
        const o: V3 = [px + nx * 0.1, y + 2.5, pz + nz * 0.1];
        xs.quad([[o[0] - ax * 0.6, o[1] - ay * 0.6 - 0.07, o[2] - az * 0.6], [o[0] + ax * 0.6, o[1] + ay * 0.6 - 0.07, o[2] + az * 0.6], [o[0] + ax * 0.6, o[1] + ay * 0.6 + 0.07, o[2] + az * 0.6], [o[0] - ax * 0.6, o[1] - ay * 0.6 + 0.07, o[2] - az * 0.6]], white, [nx, 0, nz]);
      }
      [[mA, -0.35], [mB, 0.35]].forEach(([m, lx]) => {
        const lamp = new THREE.Mesh(lampGeo, m as THREE.Material);
        lamp.position.set(px + nx * 0.15 + tx * (lx as number), y + 2.95, pz + nz * 0.15 + tz * (lx as number));
        scene.add(lamp);
      });
      const pivot = new THREE.Group(), arm = new THREE.Mesh(armGeo, xmat);
      pivot.position.set(px, y + 1.05, pz); pivot.add(arm); scene.add(pivot);
      arms.push({ pivot, dir: [-v[0] * side, -v[1] * side] });
    }
    return { cr, mA, mB, arms };
  });
  addMesh(scene, xs, xmat);

  // ---------- feux tricolores ----------
  const poles = new MeshBuilder();
  const lampPos: { x: number; y: number; z: number; node: RoadNet['nodes'][0]; lane: RoadNet['lanes'][0]; group: number; k: number }[] = [];
  for (const n of roads.nodes) {
    if (!n.lights) continue;
    for (const lane of n.lanesIn) {
      const g = n.lights.get(lane); if (g === undefined) continue;
      const a = lane.poly.at(Math.max(0, lane.len - 3)), b = lane.poly.at(lane.len), tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1, ux = tx / l, uz = tz / l;
      const off = lane.edge.hw + 1.2, px = a.x - uz * off, pz = a.z + ux * off, y = a.y;
      poles.box(px - 0.09, px + 0.09, y, y + 4.2, pz - 0.09, pz + 0.09, C(0x2b2e32));
      poles.box(px - 0.22, px + 0.22, y + 3.0, y + 4.4, pz - 0.22, pz + 0.22, C(0x1d1f22));
      for (let k = 0; k < 3; k++) lampPos.push({ x: px - ux * 0.25, y: y + 4.05 - k * 0.35, z: pz - uz * 0.25, node: n, lane, group: g, k });
    }
  }
  addMesh(scene, poles, xmat);
  const lampMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, lampPos.length));
  const dm = new THREE.Object3D();
  lampPos.forEach((p, i) => { dm.position.set(p.x, p.y, p.z); dm.updateMatrix(); lampMesh.setMatrixAt(i, dm.matrix); lampMesh.setColorAt(i, white); });
  lampMesh.frustumCulled = false; lampMesh.count = lampPos.length; scene.add(lampMesh);
  const LAMP_ON = [C(0xff2a2a), C(0xffc000), C(0x2aff5a)], LAMP_OFF = [C(0x300808), C(0x302400), C(0x08300f)];

  // ---------- véhicules ----------
  const geos: Record<VKind, ReturnType<typeof carGeo>> = { car: carGeo(), bus: busGeo(), truck: truckGeo() };
  const CAP: Record<VKind, number> = { car: 500, bus: 80, truck: 120 };
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const sets = (['car', 'bus', 'truck'] as VKind[]).map(kind => {
    const g = geos[kind];
    const body = new THREE.InstancedMesh(g.body, bodyMat, CAP[kind]), head = new THREE.InstancedMesh(g.head, env.headlight, CAP[kind]), tail = new THREE.InstancedMesh(g.tail, env.tailLight, CAP[kind]);
    for (const m of [body, head, tail]) { m.frustumCulled = false; m.count = 0; m.castShadow = m === body; scene.add(m); }
    body.setColorAt(0, white); tail.setColorAt(0, white);
    return { kind, body, head, tail };
  });
  const col = new THREE.Color(), brake = new THREE.Color(1, 1, 1), idle = new THREE.Color(0.5, 0.5, 0.5);
  const obj = new THREE.Object3D();

  return {
    /** `hide` : véhicule à ne pas dessiner (celui dont on occupe la place du conducteur). */
    update(hide: import('./sim/traffic').Vehicle | null = null) {
      for (const x of xing) {
        const on = x.cr.closed ? Math.floor(traffic.time * 2) % 2 : -1;
        x.mA.color.set(on === 0 ? 0xff2020 : 0x401010); x.mB.color.set(on === 1 ? 0xff2020 : 0x401010);
        for (const a of x.arms) {
          const th = (1 - x.cr.bar) * 1.35, c = Math.cos(th), s = Math.sin(th);
          a.pivot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(a.dir[0] * c, s, a.dir[1] * c).normalize());
        }
      }
      if (lampPos.length) {
        lampPos.forEach((p, i) => {
          const st = lightState(p.node, p.group, traffic.time), active = st === 'red' ? 0 : st === 'yellow' ? 1 : 2;
          lampMesh.setColorAt(i, (p.k === active ? LAMP_ON : LAMP_OFF)[p.k]);
        });
        lampMesh.instanceColor!.needsUpdate = true;
      }
      const idx: Record<VKind, number> = { car: 0, bus: 0, truck: 0 };
      for (const v of traffic.vehicles) {
        if (v === hide) continue;
        const set = sets.find(s => s.kind === v.kind)!, i = idx[v.kind]++;
        if (i >= CAP[v.kind]) continue;
        obj.position.set(v.x, v.y, v.z); obj.rotation.set(v.pitch, v.yaw, 0, 'YXZ'); obj.updateMatrix();
        set.body.setMatrixAt(i, obj.matrix); set.head.setMatrixAt(i, obj.matrix); set.tail.setMatrixAt(i, obj.matrix);
        set.body.setColorAt(i, col.set(v.color)); set.tail.setColorAt(i, v.braking ? brake : idle);
      }
      for (const s of sets) {
        const n = Math.min(idx[s.kind], CAP[s.kind]);
        s.body.count = s.head.count = s.tail.count = n;
        s.body.instanceMatrix.needsUpdate = s.head.instanceMatrix.needsUpdate = s.tail.instanceMatrix.needsUpdate = true;
        if (s.body.instanceColor) s.body.instanceColor.needsUpdate = true;
        if (s.tail.instanceColor) s.tail.instanceColor.needsUpdate = true;
      }
    },
  };
}

