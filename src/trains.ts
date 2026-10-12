import * as THREE from 'three';
import type { Train, World } from './sim/world';
import type { DayNight } from './env';
import { MeshBuilder, type V } from './geom';

const col = (h: string | number) => new THREE.Color(h);
const DARK = col(0x1d2733), METAL = col(0x2b2e33), ROOF = col(0xa7adb3);

export const CIRCUIT_COLORS = ['#2c5aa0', '#2f8f5b', '#b03a2e', '#7d3c98', '#c27c0e'];
const LOCO_COLOR = '#d4691e';

export interface CarView {
  group: THREE.Group;
  front?: THREE.Mesh; rear?: THREE.Mesh;   // nez de tête / de queue
  lf: THREE.Mesh; lr: THREE.Mesh;          // phares avant / feux rouges arrière
}

const cache = new Map<string, THREE.BufferGeometry>();
const cached = (key: string, make: () => THREE.BufferGeometry) => {
  let g = cache.get(key);
  if (!g) { g = make(); cache.set(key, g); }
  return g;
};

/** Châssis commun : cache-bogie, deux bogies, roues. */
function underframe(mb: MeshBuilder, L: number) {
  mb.box(-1.15, 1.15, 0.45, 0.8, -L / 2 + 0.5, L / 2 - 0.5, METAL);
  for (const z of [-L * 0.3, L * 0.3]) {
    mb.box(-0.95, 0.95, 0.25, 0.7, z - 1.5, z + 1.5, METAL);
    for (const x of [-0.72, 0.72]) mb.box(x - 0.09, x + 0.09, 0.0, 0.9, z - 1.3, z + 1.3, col(0x15171a));
  }
}

function sideQuads(mb: MeshBuilder, z0: number, z1: number, y0: number, y1: number, c: THREE.Color, x = 1.405) {
  mb.quad([[x, y0, z0], [x, y0, z1], [x, y1, z1], [x, y1, z0]], c, [1, 0, 0]);
  mb.quad([[-x, y0, z0], [-x, y0, z1], [-x, y1, z1], [-x, y1, z0]], c, [-1, 0, 0]);
}

/** Voiture voyageurs : caisse bicolore, toit, fenêtres, portes, éventuel pantographe. */
function coachGeom(L: number, main: string, pant: boolean) {
  return cached(`coach|${L}|${main}|${pant}`, () => {
    const mb = new MeshBuilder(), body = col(main), band = col(main).multiplyScalar(0.65);
    underframe(mb, L);
    mb.box(-1.4, 1.4, 0.8, 1.25, -L / 2 + 0.1, L / 2 - 0.1, band);
    mb.box(-1.4, 1.4, 1.25, 3.45, -L / 2 + 0.1, L / 2 - 0.1, body);
    mb.box(-1.2, 1.2, 3.45, 3.7, -L / 2 + 0.3, L / 2 - 0.3, ROOF);
    const nW = Math.max(2, Math.floor((L - 5) / 3));
    for (let i = 0; i < nW; i++) {
      const zc = -L / 2 + 3 + (i * (L - 6)) / (nW - 1);
      sideQuads(mb, zc - 0.9, zc + 0.9, 2.1, 3.05, DARK);
    }
    for (const sg of [-1, 1]) sideQuads(mb, sg * (L / 2 - 1.3) - 0.55, sg * (L / 2 - 1.3) + 0.55, 0.9, 3.0, col(main).multiplyScalar(0.45), 1.41);
    if (pant) {
      const pz = -L / 4;
      mb.box(-0.5, 0.5, 3.7, 3.85, pz - 0.5, pz + 0.5, METAL);
      mb.box(-0.05, 0.05, 3.85, 4.9, pz - 0.5, pz - 0.4, METAL);
      mb.box(-0.05, 0.05, 3.85, 4.9, pz + 0.4, pz + 0.5, METAL);
      mb.box(-0.95, 0.95, 4.9, 5.0, pz - 0.5, pz + 0.5, METAL);
    }
    return mb.build();
  });
}

/** Nez profilé (sens +z ou -z) : tronc de pyramide, pare-brise sombre. */
function noseGeom(L: number, main: string, dir: 1 | -1, half = L / 2) {
  return cached(`nose|${L}|${main}|${dir}|${half}`, () => {
    const mb = new MeshBuilder(), body = col(main), s = dir;
    const z0 = s * (half - 0.1), z1 = s * (half + 2.4), P = (x: number, y: number, z: number): V => [x, y, z];
    const hz = s;
    mb.quad([P(-1.4, 3.7, z0), P(1.4, 3.7, z0), P(0.9, 3.1, z1), P(-0.9, 3.1, z1)], ROOF, [0, 1, 0]);
    mb.quad([P(-1.4, 0.8, z0), P(1.4, 0.8, z0), P(0.9, 1.0, z1), P(-0.9, 1.0, z1)], METAL, [0, -1, 0]);
    mb.quad([P(1.4, 0.8, z0), P(1.4, 3.7, z0), P(0.9, 3.1, z1), P(0.9, 1.0, z1)], body, [1, 0, 0]);
    mb.quad([P(-1.4, 0.8, z0), P(-1.4, 3.7, z0), P(-0.9, 3.1, z1), P(-0.9, 1.0, z1)], body, [-1, 0, 0]);
    mb.quad([P(-0.9, 1.0, z1), P(0.9, 1.0, z1), P(0.9, 1.9, z1), P(-0.9, 1.9, z1)], body, [0, 0, hz]);
    mb.quad([P(-0.9, 1.9, z1), P(0.9, 1.9, z1), P(0.9, 3.1, z1), P(-0.9, 3.1, z1)], DARK, [0, 0, hz]);
    return mb.build();
  });
}

function lightsGeom(zEnd: number, dir: 1 | -1) {
  return cached(`lights|${zEnd}|${dir}`, () => {
    const mb = new MeshBuilder(), z = dir * zEnd, e = dir * 0.1;
    for (const x of [-0.65, 0.65]) mb.box(x - 0.2, x + 0.2, 1.15, 1.5, Math.min(z, z + e), Math.max(z, z + e), col(0xffffff));
    return mb.build();
  });
}

/** Locomotive de fret : capot, cabine, persiennes. */
function locoGeom(L: number) {
  return cached(`loco|${L}`, () => {
    const mb = new MeshBuilder(), body = col(LOCO_COLOR);
    underframe(mb, L);
    mb.box(-1.45, 1.45, 0.8, 3.5, -L / 2 + 0.1, L / 2 - 0.1, body);
    mb.box(-1.45, 1.45, 0.8, 1.2, -L / 2 + 0.1, L / 2 - 0.1, col(0x333333));
    mb.box(-1.0, 1.0, 3.5, 3.85, -3, 3, METAL);
    mb.box(-1.2, 1.2, 3.5, 3.65, L / 2 - 2.8, L / 2 - 0.3, ROOF);
    for (const sg of [-1, 1]) sideQuads(mb, sg * (L / 2 - 1.8) - 0.9, sg * (L / 2 - 1.8) + 0.9, 2.2, 3.1, DARK, 1.46);
    return mb.build();
  });
}

const WAGON_COLORS = [['#b03a2e', '#2e6da4'], ['#d9a21b', '#3d8b5a'], ['#7a7f86', '#c9602b']];
/** Wagon de fret : plateau + 2 conteneurs, ou wagon couvert. */
function wagonGeom(L: number, variant: number) {
  return cached(`wagon|${L}|${variant}`, () => {
    const mb = new MeshBuilder();
    underframe(mb, L);
    if (variant === 1) {
      mb.box(-1.4, 1.4, 0.85, 3.4, -L / 2 + 0.1, L / 2 - 0.1, col(0x8b4a2f));
      mb.box(-1.2, 1.2, 3.4, 3.6, -L / 2 + 0.3, L / 2 - 0.3, col(0x5b5f66));
      sideQuads(mb, -1.6, 1.6, 1.0, 3.2, col(0x5c3320), 1.41);
    } else {
      mb.box(-1.35, 1.35, 0.85, 1.1, -L / 2 + 0.1, L / 2 - 0.1, METAL);
      const [c1, c2] = WAGON_COLORS[variant === 0 ? 0 : 2];
      mb.box(-1.25, 1.25, 1.1, 3.6, -L / 2 + 0.4, -0.15, col(c1));
      mb.box(-1.25, 1.25, 1.1, 3.6, 0.15, L / 2 - 0.4, col(c2));
    }
    return mb.build();
  });
}

/** Meshes 3D de tous les trains (même ceux au dépôt) ; la simulation décide ce qui roule. */
export class TrainViews {
  readonly views: CarView[][] = [];
  readonly colors: string[] = [];
  private readonly mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  constructor(scene: THREE.Scene, private world: World, env: DayNight) {
    const circuitIdx = new Map(world.circuits.map((c, i) => [c, i]));
    for (const t of world.trains) {
      const fret = t.circuit.type === 'fret', color = fret ? LOCO_COLOR : CIRCUIT_COLORS[(circuitIdx.get(t.circuit) ?? 0) % CIRCUIT_COLORS.length];
      this.colors.push(color);
      const L = t.carLen, max = t.circuit.maxCars, cars: CarView[] = [];
      for (let i = 0; i < max; i++) {
        const isLoco = fret && i === 0;
        const group = new THREE.Group();
        const body = fret ? (isLoco ? locoGeom(L) : wagonGeom(L, (i - 1) % 3)) : coachGeom(L, color, i === 1 || max === 1);
        const mk = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
          const mesh = new THREE.Mesh(g, m); mesh.castShadow = shadow; mesh.receiveShadow = true; group.add(mesh); return mesh;
        };
        mk(body, this.mat);
        const hasNose = !fret || isLoco;
        const front = hasNose ? mk(noseGeom(L, color, 1), this.mat) : undefined;
        const rear = hasNose ? mk(noseGeom(L, color, -1), this.mat) : undefined;
        const lf = mk(lightsGeom(L / 2 + 2.4, 1), env.headlight, false);
        const lr = mk(lightsGeom(hasNose ? L / 2 + 2.4 : L / 2, -1), env.tailLight, false);
        scene.add(group);
        cars.push({ group, front, rear, lf, lr });
      }
      this.views.push(cars);
    }
  }

  update() {
    this.world.trains.forEach((t: Train, ti) => {
      const gap = t.carLen + t.gap;
      this.views[ti].forEach((cv, i) => {
        const show = i < t.cars;
        cv.group.visible = show;
        if (!show) return;
        const pf = t.pointAt(i * gap), pr = t.pointAt(i * gap + t.carLen);
        cv.group.position.set((pf.x + pr.x) / 2, (pf.y + pr.y) / 2 + 0.2, (pf.z + pr.z) / 2);
        cv.group.lookAt(pf.x, pf.y + 0.2, pf.z);
        const head = i === 0, tail = i === t.cars - 1;
        if (cv.front) cv.front.visible = head;
        if (cv.rear) cv.rear.visible = tail;
        cv.lf.visible = head && t.status !== 'stored';
        cv.lr.visible = tail;
      });
    });
  }
}
