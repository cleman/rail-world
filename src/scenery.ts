import * as THREE from 'three';
import { applyTunnelCut } from './tunnelcut';
import { seaS } from './sim/water';
import type { World } from './sim/world';
import { vnoise, type Terrain } from './sim/terrain';
import type { DayNight } from './env';
import { Chunked, chunkKey } from './chunks';
import { buildCity, rng, type CityBuilders } from './city';
import type { WorldPlan } from './sim/planning';
import type { RoadNet } from './sim/roads';
import { buildRural } from './rural';
import type { Poi } from './sim/pois';
import { BIOMES, BiomeMap, type Biome } from './biome';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const sm = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const mat = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

export type { Lake } from './sim/planning';
export interface SceneryOut { lake: import('./sim/planning').Lake | null; half: number; /** Anime les rides de l'eau (t en secondes). */ update(t: number): void; /** Marée : décalage vertical (m) de la mer. */ setTide(dy: number): void; seaLevel: number | null }

/** Terrain, rivières (rendues dans structures.ts), villes, villages, campagne (champs, haies, fermes), forêts, rochers et lac. */
export function buildScenery(scene: THREE.Scene, world: World, terrain: Terrain, env: DayNight, wp: WorldPlan, roads: RoadNet, seed = 42, map: BiomeMap = new BiomeMap(BIOMES.tempéré, null), pois: Poi[] = []): SceneryOut {
  /** Zones réservées aux points d'intérêt (piste d'aérodrome, port, château...) : ni champs ni arbres. */
  const avoid = (x: number, z: number) => pois.some(p => Math.hypot(p.x - x, p.z - z) < (p.kind === 'aérodrome' ? 235 : p.kind === 'port' ? 60 : p.r + 14));
  const biome = map.a, sea = terrain.sea;
  const rand = rng(seed), net = world.net;
  const dummy = new THREE.Object3D();
  const HALF = 2400, SEG = 384;
  const { plans, lake, lakes, trackD, riverD, zoneRatio, inLake, env: cityEnv } = wp;
  const roadD = roads.dist;
  const parks = plans.flatMap(p => p.parks);

  // ----- Terrain -----
  const g = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG).rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const hs: number[] = [];
  let hmin = 1e9, hmax = -1e9;
  for (let i = 0; i < pos.count; i++) {
    const h = terrain.height(pos.getX(i), pos.getZ(i));
    pos.setY(i, h); hs.push(h); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
  }
  const pal = map.biomes.map(b => ({ grassA: new THREE.Color(b.grassA), grassB: new THREE.Color(b.grassB), high: new THREE.Color(b.high), rock: new THREE.Color(b.rock),
    park: new THREE.Color(b.id === 'tempéré' ? 0x5fa04c : b.grassB).multiplyScalar(b.id === 'tempéré' ? 1 : 0.92) }));
  const pa = pal[0], pb = pal[1] ?? pal[0];
  const grassA = new THREE.Color(), grassB = new THREE.Color(), high = new THREE.Color(), rock = new THREE.Color(), park = new THREE.Color();
  const paved = new THREE.Color(0x8d8f93), gravel = new THREE.Color(0x8a8378), sand = new THREE.Color(biome.sand).lerp(new THREE.Color((map.b ?? biome).sand), lake ? map.mix(lake.x, lake.z) : 0.3), vill = new THREE.Color(0x8aa45f);
  const mud = new THREE.Color(0x9a8d6b);
  const c = new THREE.Color(), col = new Float32Array(pos.count * 3), W = SEG + 1, cellW = (HALF * 2) / SEG;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), t = (hs[i] - hmin) / (hmax - hmin || 1);
    const ix = i % W, iz = Math.floor(i / W);
    const hx = hs[iz * W + Math.min(W - 1, ix + 1)] - hs[iz * W + Math.max(0, ix - 1)], hz = hs[Math.min(W - 1, iz + 1) * W + ix] - hs[Math.max(0, iz - 1) * W + ix];
    const slope = Math.hypot(hx, hz) / (2 * cellW);
    const bm = map.mix(x, z);
    grassA.lerpColors(pa.grassA, pb.grassA, bm); grassB.lerpColors(pa.grassB, pb.grassB, bm); high.lerpColors(pa.high, pb.high, bm); rock.lerpColors(pa.rock, pb.rock, bm); park.lerpColors(pa.park, pb.park, bm); vill.copy(grassB).multiplyScalar(0.92);
    c.copy(grassA).lerp(grassB, vnoise(x / 70, z / 70, 3) * 0.9);
    c.lerp(high, sm((t - 0.6) / 0.35) * 0.5).lerp(rock, Math.max(sm((t - 0.9) / 0.1) * 0.8, sm((slope - 0.42) / 0.3)));
    for (const q of terrain.zones) {
      const k = 1 - sm((Math.hypot(x - q.x, z - q.z) - q.r * 0.85) / (q.r * 0.3));
      if (k > 0) c.lerp(q.kind === 'city' ? paved : q.kind === 'village' ? vill : gravel, q.kind === 'village' ? k * 0.8 : q.kind === 'city' ? k * 0.55 : k);
    }
    for (const p of parks) { const k = 1 - sm((Math.hypot(x - p.x, z - p.z) - p.r * 0.9) / (p.r * 0.25)); if (k > 0) c.lerp(park, k); }
    const rv = terrain.riverNear(x, z);
    if (rv && rv.d < rv.hw + 12) c.lerp(mud, 0.75 * (1 - sm((rv.d - rv.hw) / 12)));
    for (const lk of lakes) if (Math.hypot(x - lk.x, z - lk.z) < lk.r * 1.1 && hs[i] < lk.level + 0.8) { c.lerp(sand, 0.85); break; }
    if (sea) { const ss = seaS(sea, x, z); if (ss > -40 && hs[i] < sea.level + 3.4) c.lerp(sand, 0.9 * sm((ss + 40) / 40)); if (hs[i] < sea.level) c.multiplyScalar(0.78 + 0.22 * sm((hs[i] - sea.level + 12) / 12)); }
    col.set([c.r, c.g, c.b], i * 3);
  }
  // découpage en tuiles de 32 x 32 cases : les tuiles hors champ ne sont pas dessinées
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), CS = 32, V = CS + 1;
  applyTunnelCut(groundMat);
  for (let tz = 0; tz < SEG / CS; tz++) for (let tx = 0; tx < SEG / CS; tx++) {
    const vp = new Float32Array(V * V * 3), vc = new Float32Array(V * V * 3), idx: number[] = [];
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const gi = (tz * CS + j) * W + (tx * CS + i), li = j * V + i;
      vp[li * 3] = pos.getX(gi); vp[li * 3 + 1] = pos.getY(gi); vp[li * 3 + 2] = pos.getZ(gi);
      vc[li * 3] = col[gi * 3]; vc[li * 3 + 1] = col[gi * 3 + 1]; vc[li * 3 + 2] = col[gi * 3 + 2];
    }
    for (let j = 0; j < CS; j++) for (let i = 0; i < CS; i++) {
      const a = i + V * j, b = i + V * (j + 1), c2 = i + 1 + V * (j + 1), d = i + 1 + V * j;
      idx.push(a, b, d, b, c2, d);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(vp, 3)); tg.setAttribute('color', new THREE.BufferAttribute(vc, 3)); tg.setIndex(idx);
    const m = new THREE.Mesh(tg, groundMat);
    m.receiveShadow = true; scene.add(m);
  }

  // ----- Eau : lacs, mer, avec des rides qui défilent -----
  const ripple = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d')!;
    let q = 99; const r = () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; };
    g.clearRect(0, 0, 256, 256); g.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const x = r() * 256, y = r() * 256, l = 10 + r() * 22; g.strokeStyle = `rgba(255,255,255,${0.12 + r() * 0.22})`; g.lineWidth = 1.2 + r() * 1.6;
      for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + l, y + dy + (r() - 0.5) * 3); g.stroke(); }
    }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  })();
  const rippleMats: THREE.MeshBasicMaterial[] = [];
  const waterAt = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rep: number, tone = 1) => {
    const base = new THREE.Color(biome.water).multiplyScalar(tone);
    const w = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: base, transparent: true, opacity: 0.87 }));
    w.position.set(x, y, z); scene.add(w);
    const tex = ripple.clone(); tex.needsUpdate = true; tex.repeat.set(rep, rep);
    const rm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, fog: true });
    const r = new THREE.Mesh(geo, rm); r.position.set(x, y + 0.04, z); r.renderOrder = 2; scene.add(r); rippleMats.push(rm);
    return [w, r] as const;
  };
  let seaMeshes: readonly THREE.Mesh[] = [];
  for (const lk of lakes) waterAt(new THREE.CircleGeometry(lk.r, 48).rotateX(-Math.PI / 2), lk.x, lk.level, lk.z, lk.r / 22);
  if (sea) {   // la mer : un ruban qui suit la côte (ondulante) jusqu'à l'horizon, sans recouvrir les creux de l'intérieur des terres
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], tx = -sea.uz, tz = sea.ux, N = 80, A0 = -12000, A1 = 12000;
    for (let i = 0; i <= N; i++) {
      const A = A0 + ((A1 - A0) * i) / N, wave = sea.amp * (0.6 * Math.sin(A / 310 + sea.ph) + 0.4 * Math.sin(A / 131 + sea.ph * 1.7));
      for (const d of [sea.c0 + wave + 6, sea.c0 + wave + 24000]) { const x = sea.ux * d + tx * A, z = sea.uz * d + tz * A; pos.push(x, 0, z); uv.push(x / 40, z / 40); }
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]]));
    seaMeshes = waterAt(g, 0, sea.level, 0, 1, 0.92);
  }

  // ----- Villes : un maillage par type -----
  const B: CityBuilders = {
    towers: new Chunked(300), houses: new Chunked(300), roofs: new Chunked(300), roads: new Chunked(300), marks: new Chunked(300), walks: new Chunked(300),
    lamps: [], trees: [], towerTile: env.towerTile, houseTile: env.houseTile,
  };
  for (const p of plans) buildCity(p, terrain, cityEnv, B, rand, roadD);

  // ----- Campagne -----
  const rural = buildRural(scene, {
    terrain, rand, trackD, riverD, roadD, zoneRatio, inLake, avoid, biomeAt: (x: number, z: number) => map.at(x, z), houseTile: env.houseTile, houses: B.houses, roofs: B.roofs, half: HALF - 150,
  });

  B.towers.addTo(scene, env.towerWin);
  B.houses.addTo(scene, env.houseWin);
  B.roofs.addTo(scene, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  const flatMat = (f: number) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });
  B.roads.addTo(scene, flatMat(-3), false); B.walks.addTo(scene, flatMat(-2), false); B.marks.addTo(scene, flatMat(-4), false);

  // lampadaires (mât + lampe qui s'allume la nuit)
  if (B.lamps.length) {
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 6, 5).translate(0, 3, 0), mat(0x333638), B.lamps.length);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.25, 0.7).translate(0, 6.1, 0), env.lampHead, B.lamps.length);
    B.lamps.forEach(([x, y, z], i) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix); heads.setMatrixAt(i, dummy.matrix); });
    scene.add(poles, heads);
  }

  // ----- Végétation : conifères (en altitude), feuillus, buissons, forêts par taches -----
  const crownGeo: Record<string, THREE.BufferGeometry> = {
    conifer: new THREE.ConeGeometry(2.5, 7, 6).translate(0, 5.5, 0),
    broad: new THREE.IcosahedronGeometry(2.8, 0).translate(0, 5.2, 0),
    bush: new THREE.IcosahedronGeometry(1.2, 0).translate(0, 0.8, 0),
  };
  const trunkGeo: Record<string, THREE.BufferGeometry | null> = {
    conifer: new THREE.CylinderGeometry(0.3, 0.4, 2, 5).translate(0, 1, 0),
    broad: new THREE.CylinderGeometry(0.3, 0.45, 3.6, 5).translate(0, 1.8, 0),
    bush: null,
  };
  // arbres typiques des biomes : cactus ou palmier
  const kinds = ['conifer', 'broad', 'bush', 'cactus', 'palm'] as const;
  type Kind = typeof kinds[number];
  if (map.biomes.some(b => b.deco === 'cactus')) {
    const body = new THREE.CylinderGeometry(0.45, 0.55, 4.2, 6).translate(0, 2.1, 0);
    const arm = (s: number) => [new THREE.CylinderGeometry(0.3, 0.3, 1.4, 5).rotateZ(Math.PI / 2).translate(s * 0.95, 2.2, 0), new THREE.CylinderGeometry(0.28, 0.3, 1.3, 5).translate(s * 1.5, 2.9, 0)];
    crownGeo.cactus = mergeGeometries([body, ...arm(1), ...arm(-1)].map(g => g.toNonIndexed()))!; trunkGeo.cactus = null;
  }
  if (map.biomes.some(b => b.deco === 'palm')) {
    crownGeo.palm = mergeGeometries([new THREE.ConeGeometry(4.2, 1.6, 7).rotateX(Math.PI).translate(0, 9.4, 0), new THREE.ConeGeometry(2.2, 1.2, 6).translate(0, 10.3, 0)].map(g => g.toNonIndexed()))!;
    trunkGeo.palm = new THREE.CylinderGeometry(0.28, 0.45, 9, 5).translate(0, 4.5, 0);
  }
  const DECO_GREEN = { cactus: [0x5f8a4a, 0x6a944f, 0x527a40], palm: [0x2f9a3f, 0x3fae4a, 0x4fb84a] };
  /** Nuances par biome (0 = premier, 1 = second) et par sorte d'arbre. */
  const greensOf = (kind: Kind, bi: number): number[] => { const b = map.biomes[Math.min(bi, map.biomes.length - 1)]; return kind === 'cactus' || kind === 'palm' ? DECO_GREEN[kind] : b[kind]; };
  /** Densité d'une sorte d'arbre dans un biome. */
  const dens = (b: Biome, kind: Kind) => kind === 'cactus' ? (b.deco === 'cactus' ? b.decoCount : 0) : kind === 'palm' ? (b.deco === 'palm' ? b.decoCount : 0) : b.mix[kind] * { conifer: 2600, broad: 2000, bush: 2200 }[kind];
  type Spot = [number, number, number, number, number, number];   // x, y, z, échelle, rotation, biome (0 ou 1)
  const spots: Record<string, Spot[]> = { conifer: [], broad: [], bush: [], cactus: [], palm: [] };
  const slopeAt = (x: number, z: number) => Math.max(Math.abs(terrain.height(x + 6, z) - terrain.height(x - 6, z)), Math.abs(terrain.height(x, z + 6) - terrain.height(x, z - 6))) / 12;
  const free = (x: number, z: number) =>
    zoneRatio(x, z) > 1.1 && trackD(x, z) > 40 && riverD(x, z) > 6 && roadD(x, z) > 7 && !inLake(x, z, 12) && !rural.occupied(x, z, 6) && !avoid(x, z);
  for (const kind of kinds) {
    const dmax = Math.max(...map.biomes.map(b => dens(b, kind))), total = Math.round(map.biomes.length > 1 ? dmax * 1.35 : dmax);
    let guard = 0;
    while (spots[kind].length < total && guard++ < total * 16) {
      const x = (rand() - 0.5) * HALF * 1.96, z = (rand() - 0.5) * HALF * 1.96;
      const bi = map.b && rand() < map.mix(x, z) ? 1 : 0, bio = map.biomes[bi];
      if (rand() > dens(bio, kind) / (dmax || 1)) continue;                                 // densité propre au biome du lieu
      const forest = vnoise(x / 420 + 4, z / 420 + 9, 77);
      const yy0 = terrain.height(x, z), rel0 = (yy0 - hmin) / (hmax - hmin || 1);
      if (kind === 'cactus' || kind === 'palm') { if (rand() > 0.5 + forest * 0.5) continue; }
      else if (kind !== 'bush' && rand() > Math.max(sm((forest - 0.4) / 0.25), kind === 'conifer' ? sm((rel0 - 0.5) / 0.2) * 0.6 : 0)) continue;
      else if (kind === 'bush' && rand() > 0.35 + forest * 0.3) continue;
      if (!free(x, z)) continue;
      const y = terrain.height(x, z), rel = (y - hmin) / (hmax - hmin || 1);
      if (kind === 'conifer' && rand() > 0.15 + rel * 1.4) continue;      // les conifères montent en altitude
      if (kind === 'broad' && rand() > 1.15 - rel * 1.2) continue;
      if ((kind === 'cactus' || kind === 'palm') && rel > 0.75) continue;
      spots[kind].push([x, y - 0.3, z, kind === 'cactus' || kind === 'palm' ? 0.8 + rand() * 0.6 : (kind === 'bush' ? 0.6 : 0.7) + rand() * 0.9, rand() * 6, bi]);
    }
  }
  const biomeIdx = (x: number, z: number) => (map.b && map.at(x, z) === map.b ? 1 : 0);
  for (const [x, y, z] of B.trees) spots.broad.push([x, y - 0.1, z, 0.55 + rand() * 0.25, rand() * 6, biomeIdx(x, z)]);
  for (const [x, y, z] of rural.trees) spots.broad.push([x, y, z, 0.8 + rand() * 0.5, rand() * 6, biomeIdx(x, z)]);
  const color = new THREE.Color(), CELLV = 450;
  const inst = (geo: THREE.BufferGeometry, material: THREE.Material, list: Spot[], tint: ((bi: number) => number[]) | null, cast: boolean) => {
    const groups = new Map<number, Spot[]>();
    for (const sp of list) { const k = chunkKey(sp[0], sp[2], CELLV), l = groups.get(k); if (l) l.push(sp); else groups.set(k, [sp]); }
    for (const l of groups.values()) {
      const im = new THREE.InstancedMesh(geo, material, l.length);
      l.forEach(([x, y, z, sc, r, bi], i) => {
        dummy.position.set(x, y, z); dummy.rotation.set(0, r, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
        if (tint) { const t = tint(bi); im.setColorAt(i, color.set(t[Math.floor(rand() * t.length)])); }
      });
      im.castShadow = cast; scene.add(im);
    }
  };
  const leafMat = mat(0xffffff), trunkMat = mat(0x5b4030);
  for (const kind of kinds) {
    if (!crownGeo[kind] || !spots[kind].length) continue;
    inst(crownGeo[kind], leafMat, spots[kind], bi => greensOf(kind, bi), kind !== 'bush');
    if (trunkGeo[kind]) inst(trunkGeo[kind]!, trunkMat, spots[kind], null, true);
  }

  // rochers : pentes raides, crêtes et berges
  const rocks: Spot[] = [];  // [x, y, z, échelle, rotation, 0]
  for (let guard = 0; rocks.length < 900 && guard < 40000; guard++) {
    const x = (rand() - 0.5) * HALF * 1.9, z = (rand() - 0.5) * HALF * 1.9;
    if (zoneRatio(x, z) < 1.1 || trackD(x, z) < 30 || roadD(x, z) < 8 || riverD(x, z) < -1 || inLake(x, z, 0) || rural.occupied(x, z, 4) || avoid(x, z)) continue;
    const y = terrain.height(x, z), rel = (y - hmin) / (hmax - hmin || 1), s = slopeAt(x, z);
    if (rand() > sm((s - 0.18) / 0.2) * 0.7 + sm((rel - 0.72) / 0.2) * 0.4) continue;
    rocks.push([x, y - 0.4, z, 0.8 + rand() * 2.2, rand() * 6, 0]);
  }
  if (rocks.length) {
    const groups = new Map<number, Spot[]>();
    for (const sp of rocks) { const k = chunkKey(sp[0], sp[2], CELLV), l = groups.get(k); if (l) l.push(sp); else groups.set(k, [sp]); }
    const rockGeo = new THREE.DodecahedronGeometry(1.6, 0).translate(0, 0.6, 0), rockMat = mat(0xffffff);
    for (const l of groups.values()) {
      const rm = new THREE.InstancedMesh(rockGeo, rockMat, l.length);
      l.forEach(([x, y, z, sc, r], i) => {
        dummy.position.set(x, y, z); dummy.rotation.set(r * 0.3, r, r * 0.2); dummy.scale.set(sc, sc * (0.6 + (i % 3) * 0.2), sc); dummy.updateMatrix();
        rm.setMatrixAt(i, dummy.matrix); rm.setColorAt(i, color.set(i % 2 ? 0x8d8a84 : 0x9b978f));
      });
      rm.castShadow = true; scene.add(rm);
    }
  }
  dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0);

  void world;
  return { lake, half: HALF, seaLevel: sea ? sea.level : null, setTide(dy: number) { if (!sea) return; seaMeshes[0].position.y = sea.level + dy; seaMeshes[1].position.y = sea.level + dy + 0.04; }, update(t: number) { rippleMats.forEach((m, i) => { const o = m.map!.offset; o.set((t * 0.012 * (1 + i * 0.3)) % 1, (t * 0.007) % 1); }); } };
}
