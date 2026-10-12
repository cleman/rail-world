// Rendu des sportifs : un petit squelette articulé (tronc, tête, cuisses, jambes, bras, avant-bras) dessiné avec des InstancedMesh.
// Les poses viennent de sim/athlete.ts ; ici on ne fait que traduire une pose en angles d'articulations.
import * as THREE from 'three';
import { MeshBuilder } from './geom';
import type { Athlete, Prop } from './sim/athlete';

const W = new THREE.Color(1, 1, 1);
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

interface J { hipY: number; lean: number; roll: number; hL: number; hR: number; kL: number; kR: number; sL: number; sR: number; eL: number; eR: number; head: number; yaw: number; spread: number }
const J0 = (): J => ({ hipY: 0.9, lean: 0, roll: 0, hL: 0, hR: 0, kL: 0, kR: 0, sL: 0, sR: 0, eL: 0.15, eR: 0.15, head: 0, yaw: 0, spread: 0 });

/** Angles d'articulations d'un sportif (radians ; positif = vers l'avant). */
export function pose(a: Athlete, j: J = J0()): J {
  const ph = a.phase, s = Math.sin(ph), c = Math.cos(ph), v = a.v;
  Object.assign(j, J0()); j.lean = a.lean;
  switch (a.pose) {
    case 'run': case 'walk': {
      const run = a.pose === 'run', amp = run ? Math.min(1.05, 0.5 + 0.06 * v) : 0.38, k = run ? 1.25 : 0.35;
      j.hipY = 0.9 - (run ? 0.05 + 0.03 * Math.abs(s) : 0);
      j.hL = amp * s; j.hR = -amp * s; j.kL = k * Math.max(0, c) + 0.05; j.kR = k * Math.max(0, -c) + 0.05;
      const sw = run ? 0.9 * amp : 0.5 * amp; j.sL = -sw * s; j.sR = sw * s; j.eL = j.eR = run ? 1.5 : 0.25; break;
    }
    case 'stand': j.hipY = 0.9; j.sL = j.sR = 0.02; break;
    case 'crouch': {   // départ de sprint (ou position accroupie)
      j.hipY = 0.62; j.lean = 0.95 + 0.04 * Math.sin(ph); j.hL = 1.25; j.kL = 1.7; j.hR = 0.45; j.kR = 1.0; j.sL = j.sR = -j.lean + 0.05; j.eL = j.eR = 0.05; j.head = -0.6; break;
    }
    case 'stretch': {   // échauffement : fente, flexion, rotation du buste
      const q = Math.sin(ph); j.hipY = 0.78 + 0.1 * q; j.lean = 0.35 + 0.35 * Math.max(0, q); j.hL = 0.9; j.kL = 1.0; j.hR = -0.5; j.kR = 0.3; j.sL = 1.6 + 0.8 * q; j.sR = -0.3; j.eL = j.eR = 0.2; break;
    }
    case 'fly': { j.hipY = 0.9; j.hL = j.hR = 0.9 + 0.5 * sm(0.4, 0.9, ph); j.kL = j.kR = 0.4; j.sL = j.sR = 2.5 - 2.0 * sm(0.5, 1, ph); j.eL = j.eR = 0.3; break; }
    case 'hurdle': { j.hipY = 0.88; j.lean = Math.max(a.lean, 0.45); j.hL = 1.55; j.kL = 0.12; j.hR = -0.35; j.kR = 1.6; j.sL = -1.0; j.sR = 1.7; j.eL = 0.5; j.eR = 0.6; break; }
    case 'vault': { j.hipY = 0.9; j.hL = j.hR = 0.2 + 0.9 * sm(0.3, 0.7, ph); j.kL = j.kR = 0.15; j.sL = j.sR = 2.8; j.eL = j.eR = 0.1; break; }
    case 'flop': {   // saut en hauteur : dos à la barre, tête en premier
      const k = Math.max(0, Math.min(1, ph)), up = Math.sin(Math.PI * Math.min(1, k * 1.15)); j.yaw = Math.PI; j.lean = -1.35 * up; j.hipY = 0.9; j.hL = j.hR = 0.35 + 0.8 * (1 - up); j.kL = 1.5 * (1 - 0.6 * up); j.kR = 1.1 * (1 - 0.6 * up); j.sL = j.sR = 0.4 - 1.6 * up; j.head = 0.5 * up; break;
    }
    case 'throw': {
      const k = ph, rel = sm(0.45, 0.72, k);
      j.hipY = 0.86; j.hL = 0.35; j.hR = -0.4; j.kL = 0.3; j.kR = 0.2; j.lean = 0.12 + 0.3 * rel - 0.25 * (1 - sm(0, 0.35, k));
      j.sR = -1.2 + 3.9 * rel; j.sL = 1.1 - 1.5 * rel; j.eR = 0.3 + 0.9 * (1 - rel); j.eL = 0.3; break;
    }
    case 'swing': {   // geste de tennis : l'avant-bras balaye
      const k = ph, hit = sm(0.2, 0.55, k) * (1 - sm(0.6, 1, k));
      j.hipY = 0.86; j.hL = 0.3; j.hR = -0.3; j.kL = 0.3; j.kR = 0.2; j.lean = 0.2 + 0.1 * hit; j.sR = -0.8 + 2.2 * hit; j.sL = 0.8 - 0.8 * hit; j.eR = 0.4; j.eL = 0.4; break;
    }
    case 'sit': j.hipY = 0.46; j.hL = j.hR = 1.55; j.kL = j.kR = 1.5; j.sL = j.sR = 0.3; j.eL = j.eR = 0.9; break;
    case 'cycle': {
      j.hipY = 0.98; j.lean = 0.7 + a.lean * 0.4; const cs = ph; const lh = 0.95 + 0.55 * Math.sin(cs), rh = 0.95 - 0.55 * Math.sin(cs);
      j.hL = lh; j.hR = rh; j.kL = 1.15 + 0.7 * Math.cos(cs); j.kR = 1.15 - 0.7 * Math.cos(cs); j.sL = j.sR = 1.0; j.eL = j.eR = 0.4; j.head = -0.5; break;
    }
    case 'ride': { j.hipY = 1.18; j.lean = 0.12 + a.lean; j.hL = j.hR = 1.0; j.kL = j.kR = 1.2; j.sL = j.sR = 0.8; j.eL = j.eR = 0.8; j.spread = 0.18; break; }
    case 'glide': { j.hipY = 0.8; j.lean = -0.25; j.hL = j.hR = 1.1; j.kL = j.kR = 0.35; j.sL = j.sR = 2.7; j.eL = j.eR = 0.1; break; }
    case 'row': {
      const q = Math.sin(ph), pull = 0.5 - 0.5 * q;   // 1 = tiré en arrière
      j.hipY = 0.48; j.lean = 0.45 - 0.85 * pull; j.hL = j.hR = 1.55; j.kL = j.kR = 1.0 + 0.5 * (1 - pull); j.sL = j.sR = 1.2 - 0.6 * pull; j.eL = j.eR = 0.2 + 1.6 * pull; break;
    }
    case 'lie': j.hipY = 0.15; j.lean = -1.5; break;
  }
  return j;
}

function part(b: (m: MeshBuilder) => void) { const m = new MeshBuilder(); b(m); return m.build(); }
const SH = new THREE.Color(0.2, 0.2, 0.22), HAIR = new THREE.Color(0.28, 0.22, 0.2), SK = W;

export function buildAthleteView(scene: THREE.Scene, cap = 320) {
  const lambert = (emis = 0) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color(emis, emis, emis) });
  const G = {
    torso: part(m => { m.box(-0.2, 0.2, 0, 0.58, -0.1, 0.1, W); m.box(-0.2, 0.2, 0.5, 0.58, -0.1, 0.1, SK); }),
    head: part(m => { m.box(-0.09, 0.09, 0, 0.22, -0.1, 0.1, SK); m.box(-0.095, 0.095, 0.15, 0.235, -0.105, 0.105, HAIR); }),
    thigh: part(m => m.box(-0.075, 0.075, -0.45, 0.02, -0.075, 0.075, W)),
    shin: part(m => { m.box(-0.06, 0.06, -0.45, 0.02, -0.06, 0.06, SK); m.box(-0.065, 0.065, -0.5, -0.4, -0.06, 0.15, SH); }),
    arm: part(m => m.box(-0.05, 0.05, -0.3, 0.04, -0.05, 0.05, W)),
    fore: part(m => m.box(-0.045, 0.045, -0.3, 0.02, -0.045, 0.045, SK)),
  };
  type K = keyof typeof G;
  const KEYS = Object.keys(G) as K[], COUNT: Record<K, number> = { torso: 1, head: 1, thigh: 2, shin: 2, arm: 2, fore: 2 };
  // deux jeux : normal (0) et « éclairé » (1, sous les projecteurs : émissif)
  const banks = [0, 0.36].map(e => {
    const mat = lambert(e), meshes = {} as Record<K, THREE.InstancedMesh>;
    for (const k of KEYS) { const im = new THREE.InstancedMesh(G[k], mat, cap * COUNT[k]); im.frustumCulled = false; im.count = 0; im.castShadow = false; im.receiveShadow = false; im.setColorAt(0, W); scene.add(im); meshes[k] = im; }
    return { meshes, n: { torso: 0, head: 0, thigh: 0, shin: 0, arm: 0, fore: 0 } as Record<K, number>, mat };
  });
  // frontale : petit bloc lumineux + faisceau (cône additif)
  const lampM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0xfffbe8 }), 120); lampM.frustumCulled = false; lampM.count = 0; scene.add(lampM);
  const cone = new THREE.ConeGeometry(1.5, 12, 12, 1, true); cone.rotateX(-Math.PI / 2); cone.translate(0, 0, 6.2);   // pointe en 0, s'ouvre vers +z
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff4cc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beamM = new THREE.InstancedMesh(cone, beamMat, 120); beamM.frustumCulled = false; beamM.count = 0; scene.add(beamM);
  // accessoires
  const mk = (g: THREE.BufferGeometry, color: number) => { const m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color, flatShading: true }), 48); m.frustumCulled = false; m.count = 0; scene.add(m); return m; };
  const jav = new THREE.CylinderGeometry(0.015, 0.015, 2.6, 5); jav.rotateX(Math.PI / 2);
  const disc = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 10);
  const pole = new THREE.CylinderGeometry(0.02, 0.02, 4.6, 5); pole.rotateX(Math.PI / 2);
  const P: Record<string, THREE.InstancedMesh> = {
    javelot: mk(jav, 0xe9e9e0), disque: mk(disc, 0xeeeeee), poids: mk(new THREE.SphereGeometry(0.06, 8, 6), 0x44464c), perche: mk(pole, 0xd8c25a),
    tennis: mk(new THREE.SphereGeometry(0.035, 6, 5), 0xd7e84b), foot: mk(new THREE.SphereGeometry(0.11, 8, 6), 0xf3f3f3), basket: mk(new THREE.SphereGeometry(0.12, 8, 6), 0xd9742b),
  };
  const pn: Record<string, number> = {};

  const o = new THREE.Object3D(), root = new THREE.Matrix4(), body = new THREE.Matrix4(), t1 = new THREE.Matrix4(), t2 = new THREE.Matrix4(), t3 = new THREE.Matrix4();
  const T = (x: number, y: number, z: number, m = new THREE.Matrix4()) => m.makeTranslation(x, y, z);
  const RX = (a: number, m = new THREE.Matrix4()) => m.makeRotationX(a);
  const col = new THREE.Color(), J = J0();
  let nl = 0, nb = 0, camP = new THREE.Vector3(), range = 400;

  const put = (bank: number, k: K, m: THREE.Matrix4, color: number) => {
    const b = banks[bank], i = b.n[k]++; b.meshes[k].setMatrixAt(i, m); b.meshes[k].setColorAt(i, col.setHex(color));
  };
  const limb = (bank: number, k: K, parent: THREE.Matrix4, x: number, y: number, ang: number, color: number, out: THREE.Matrix4) => {
    out.copy(parent).multiply(T(x, y, 0, t1)).multiply(RX(-ang, t2)); put(bank, k, out, color); return out;
  };
  const M = { thL: new THREE.Matrix4(), thR: new THREE.Matrix4(), ar: new THREE.Matrix4(), tmp: new THREE.Matrix4(), tmp2: new THREE.Matrix4() };

  const api = {
    begin(cam: THREE.Vector3, r = 400) {
      camP = cam; range = r; nl = 0; nb = 0;
      for (const b of banks) for (const k of KEYS) b.n[k] = 0;
      for (const k in P) pn[k] = 0;
    },
    /** `lit` : sous les projecteurs (le sportif reste visible la nuit). */
    add(a: Athlete, lit = false, far = range) {
      if (a.hidden) return;
      const dx = a.x - camP.x, dz = a.z - camP.z; if (dx * dx + dz * dz > far * far) return;
      const bank = lit ? 1 : 0, b = banks[bank]; if (b.n.thigh + 2 > cap * 2 || b.n.torso + 1 > cap) return;
      const j = pose(a, J), sc = a.scale;
      const back = a.pose === 'cycle' ? 0.27 * sc : 0;   // le bassin se pose sur la selle (en arrière du centre du vélo)
      root.makeRotationY(a.yaw + j.yaw); root.setPosition(a.x - Math.sin(a.yaw) * back, a.y, a.z - Math.cos(a.yaw) * back); root.multiply(t3.makeScale(sc, sc, sc));
      body.copy(root).multiply(T(0, j.hipY + (a.mount ? 0 : 0), 0, t1));
      if (j.roll || a.roll) body.multiply(t2.makeRotationZ(j.roll + a.roll));
      body.multiply(RX(j.lean, t2));
      put(bank, 'torso', body, a.shirt);
      put(bank, 'head', M.tmp.copy(body).multiply(T(0, 0.6, 0.0, t1)).multiply(RX(j.head - j.lean * 0.3, t2)), a.skin);
      const sp = j.spread;
      for (const side of [-1, 1] as const) {
        const hip = side < 0 ? j.hL : j.hR, kn = side < 0 ? j.kL : j.kR, sh = side < 0 ? j.sL : j.sR, el = side < 0 ? j.eL : j.eR;
        // les jambes partent du bassin, sans tenir compte de l'inclinaison du buste : on les attache à `body` redressé
        const hipM = M.tmp.copy(root).multiply(T(0, j.hipY, 0, t1));
        if (j.roll || a.roll) hipM.multiply(t2.makeRotationZ(j.roll + a.roll));
        hipM.multiply(RX(j.lean * 0.35, t2));
        const th = (side < 0 ? M.thL : M.thR);
        limb(bank, 'thigh', hipM, side * (0.1 + sp), 0, hip, a.shorts, th);
        limb(bank, 'shin', th, 0, -0.45, -kn, a.skin, M.tmp2);
        const arm = limb(bank, 'arm', body, side * 0.25, 0.52, sh, a.shirt, M.ar);
        limb(bank, 'fore', arm, 0, -0.3, el, a.skin, M.tmp2);
      }
      if (a.lamp && nl < 120) {
        o.matrix.copy(body).multiply(T(0, 0.74, 0.1, t1)); lampM.setMatrixAt(nl, o.matrix);
        o.matrix.copy(body).multiply(T(0, 0.72, 0.12, t1)).multiply(RX(0.12 - j.lean * 0.1, t2)); beamM.setMatrixAt(nl, o.matrix); nl++;
      }
    },
    prop(p: Prop) {
      const im = P[p.kind]; if (!im || p.hidden) return; const i = pn[p.kind]++; if (i >= 48) return;
      o.position.set(p.x, p.y, p.z); o.rotation.set(-p.pitch, p.yaw, 0, 'YXZ'); o.scale.setScalar(1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    },
    end(night: number) {
      for (const b of banks) for (const k of KEYS) { const im = b.meshes[k]; im.count = b.n[k]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
      lampM.count = nl; lampM.instanceMatrix.needsUpdate = true; beamM.count = nl; beamM.instanceMatrix.needsUpdate = true; beamMat.opacity = 0.07 * Math.min(1, night * 1.4);
      for (const k in P) { P[k].count = Math.min(48, pn[k]); P[k].instanceMatrix.needsUpdate = true; }
      void nb;
    },
  };
  return api;
}
export type AthleteView = ReturnType<typeof buildAthleteView>;
