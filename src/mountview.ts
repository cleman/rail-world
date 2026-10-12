// Montures et matériel des sportifs : vélos, chevaux, bateaux d'aviron (avec leurs avirons) et ailes de parapente.
// Vélos, chevaux et bateaux sont instanciés ; les ailes (quelques-unes à la fois) sont de vrais objets, avec leurs suspentes.
import * as THREE from 'three';
import { MeshBuilder } from './geom';
import type { Mount } from './sim/outdoor';

const W = new THREE.Color(1, 1, 1), DK = new THREE.Color(0.13, 0.13, 0.15), MID = new THREE.Color(0.45, 0.45, 0.48);
const geo = (f: (m: MeshBuilder) => void) => { const m = new MeshBuilder(); f(m); return m.build(); };

export function buildMountView(scene: THREE.Scene, capBike = 80, capHorse = 40, capBoat = 16) {
  const mat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const inst = (g: THREE.BufferGeometry, cap: number) => { const m = new THREE.InstancedMesh(g, mat(), cap); m.frustumCulled = false; m.count = 0; m.castShadow = false; m.receiveShadow = false; m.setColorAt(0, W); scene.add(m); return m; };
  // --- vélo (avant en +z, roues de 0,34 m)
  const bikeG = geo(m => {
    m.box(-0.02, 0.02, 0.62, 0.7, -0.35, 0.4, W); m.box(-0.02, 0.02, 0.34, 0.66, -0.3, -0.27, W); m.box(-0.02, 0.02, 0.4, 0.78, 0.4, 0.43, W); m.box(-0.02, 0.02, 0.3, 0.7, -0.5, -0.4, W);
    m.box(-0.02, 0.02, 0.1, 0.4, 0.41, 0.46, W); m.box(-0.2, 0.2, 0.82, 0.86, 0.38, 0.42, DK); m.box(-0.06, 0.06, 0.84, 0.88, -0.38, -0.12, DK); m.box(-0.02, 0.02, 0.3, 0.66, 0.0, 0.03, W);
  });
  const wheelG = geo(m => {
    const N = 24, R = 0.33;
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, c = Math.cos(a) * R, s = Math.sin(a) * R; m.box(-0.02, 0.02, s - 0.04, s + 0.04, c - 0.06, c + 0.06, DK); }
    m.box(-0.012, 0.012, -R * 0.95, R * 0.95, -0.012, 0.012, MID); m.box(-0.012, 0.012, -0.012, 0.012, -R * 0.95, R * 0.95, MID); m.box(-0.012, 0.012, -R * 0.6, R * 0.6, -0.012, 0.012, MID); m.box(-0.012, 0.012, -0.012, 0.012, -R * 0.6, R * 0.6, MID);
  });
  const bikes = inst(bikeG, capBike), wheels = inst(wheelG, capBike * 2);
  // --- cheval (avant en +z)
  const horseBody = geo(m => { m.box(-0.27, 0.27, 0.8, 1.32, -0.55, 0.5, W); m.box(-0.25, 0.25, 0.85, 1.28, 0.3, 0.7, W); m.box(-0.12, 0.12, 0.9, 1.28, -0.7, -0.55, W); });
  const neckG = geo(m => { m.box(-0.1, 0.1, 0, 0.62, -0.1, 0.12, W); m.box(-0.04, 0.04, 0.0, 0.64, -0.16, -0.1, DK); });
  const headG = geo(m => { m.box(-0.11, 0.11, -0.2, 0.22, -0.12, 0.13, W); m.box(-0.085, 0.085, -0.58, -0.14, 0.0, 0.16, W); m.box(-0.09, 0.09, -0.62, -0.5, 0.04, 0.2, DK); m.box(-0.09, 0.09, 0.2, 0.34, -0.1, -0.02, W); });
  const legG = geo(m => { m.box(-0.06, 0.06, -0.8, 0, -0.06, 0.06, W); m.box(-0.065, 0.065, -0.82, -0.7, -0.065, 0.065, DK); });
  const tailG = geo(m => m.box(-0.04, 0.04, -0.6, 0, -0.04, 0.04, DK));
  const hBody = inst(horseBody, capHorse), hNeck = inst(neckG, capHorse), hHead = inst(headG, capHorse), hLeg = inst(legG, capHorse * 4), hTail = inst(tailG, capHorse);
  // --- bateau (avant en +z)
  const hullG = (len: number) => geo(m => { const h = len / 2; m.box(-0.22, 0.22, 0.0, 0.17, -h + 1.2, h - 1.2, W); m.box(-0.14, 0.14, 0.03, 0.15, h - 1.2, h, W); m.box(-0.14, 0.14, 0.03, 0.15, -h, -h + 1.2, W); m.box(-0.5, 0.5, 0.2, 0.24, -0.15, 0.15, MID); });
  const hulls = [8.2, 8.8, 12.5].map(l => inst(hullG(l), capBoat));
  const oarG = geo(m => { m.box(-0.6, 2.15, -0.015, 0.015, -0.015, 0.015, MID); m.box(-0.6, -0.3, -0.03, 0.03, -0.03, 0.03, DK); m.box(2.15, 2.9, -0.03, 0.0, -0.09, 0.09, W); });
  const oars = inst(oarG, capBoat * 8);
  // --- planeur et avion remorqueur (avant en +z, dessus en +y ; l'origine est au centre du fuselage)
  const AC = new THREE.Color(0.85, 0.22, 0.2);
  const sailG = geo(m => {
    m.box(-0.3, 0.3, -0.28, 0.42, 0.0, 1.5, W); m.box(-0.3, 0.3, -0.3, 0.45, -1.8, 0.0, W); m.box(-0.2, 0.2, -0.2, 0.4, -3.2, -1.8, W); m.box(-0.12, 0.12, -0.12, 0.26, -5.2, -3.2, W);
    m.box(-0.22, 0.22, 0.4, 0.64, -0.5, 0.9, DK);                                     // verrière
    m.box(-0.03, 0.03, 0.25, 1.55, -5.4, -4.5, W); m.box(-1.5, 1.5, 1.5, 1.57, -5.4, -4.9, W);   // dérive et empennage en T
    m.box(0, 4.2, 0.12, 0.2, -0.55, 0.45, W); m.box(-4.2, 0, 0.12, 0.2, -0.55, 0.45, W); m.box(4.2, 7.5, 0.18, 0.25, -0.35, 0.2, AC); m.box(-7.5, -4.2, 0.18, 0.25, -0.35, 0.2, AC);   // ailes : 15 m d'envergure
    m.box(-0.04, 0.04, -0.52, -0.3, 0.2, 0.5, DK);                                    // roue
  });
  const tugG = geo(m => {
    m.box(-0.5, 0.5, -0.45, 0.65, -0.8, 2.2, W); m.box(-0.35, 0.35, -0.3, 0.55, -3.8, -0.8, W); m.box(-0.14, 0.14, -0.15, 0.3, -5.2, -3.8, W);
    m.box(-0.38, 0.38, 0.15, 0.7, 0.2, 1.3, DK);                                      // verrière
    m.box(-0.04, 0.04, 0.3, 1.5, -5.3, -4.4, W); m.box(-1.6, 1.6, 0.35, 0.42, -5.2, -4.5, W);
    m.box(-5.3, 5.3, 0.78, 0.9, -0.2, 1.4, W); m.box(-0.06, 0.06, -0.3, 0.0, 2.2, 2.35, DK);   // aile haute, nez
    m.box(-0.05, 0.05, -0.55, -0.45, 0.4, 0.9, DK);
  });
  const propG = geo(m => { m.box(-1.0, 1.0, -0.06, 0.06, -0.02, 0.02, DK); m.box(-0.06, 0.06, -1.0, 1.0, -0.02, 0.02, DK); });
  const sails = inst(sailG, 8), tugs = inst(tugG, 6), props = inst(propG, 6);
  const ropeGeo = new THREE.BufferGeometry(); ropeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 6), 3));
  const ropeLines = new THREE.LineSegments(ropeGeo, new THREE.LineBasicMaterial({ color: 0x20201e })); ropeLines.frustumCulled = false; ropeLines.visible = false; scene.add(ropeLines);
  const nb = { bike: 0, wheel: 0, horse: 0, leg: 0, hull: [0, 0, 0], oar: 0, sail: 0, tug: 0, rope: 0 };

  // --- parapente : voile en arc (lignes de suspentes)
  const wingGeo = (() => {
    const N = 12, R = 6.2, chord = 2.7, pos: number[] = [], idx: number[] = [], col: number[] = [];
    for (let i = 0; i <= N; i++) {
      const th = ((i - N / 2) / (N / 2)) * 0.95, x = R * Math.sin(th), y = -R * (1 - Math.cos(th)) * 0.9, c = chord * (1 - 0.35 * Math.abs(th) / 0.95);
      pos.push(x, y, c * 0.55, x, y - 0.09, -c * 0.45); const t = (i % 2) ? 1 : 0.86; col.push(t, t, t, 0.8 * t, 0.8 * t, 0.8 * t);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  })();
  const linesGeo = (() => {
    const pts: number[] = [], H = 6.7;
    for (const s of [-1, 1]) for (const k of [0, 1, 2]) { const x = s * (0.9 + k * 1.5), th = Math.asin(x / 6.2), y = -6.2 * (1 - Math.cos(th)) * 0.9; for (const z of [0.7, -0.5]) pts.push(x, y, z * 0.7, s * 0.2, -H + 1.0, -0.08); }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  })();
  interface Wing { g: THREE.Group; wing: THREE.Mesh; lines: THREE.LineSegments; mat: THREE.MeshLambertMaterial; top: Float32Array }
  const wings: Wing[] = [];
  const mkWing = (): Wing => {
    const mm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
    const g = new THREE.Group(), wing = new THREE.Mesh(wingGeo, mm), lines = new THREE.LineSegments(linesGeo.clone(), new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55 }));
    wing.frustumCulled = false; lines.frustumCulled = false; g.add(wing); g.add(lines); g.visible = false; scene.add(g); return { g, wing, lines, mat: mm, top: new Float32Array((linesGeo.attributes.position as THREE.BufferAttribute).array) };
  };
  let nw = 0;

  const o = new THREE.Object3D(), M = new THREE.Matrix4(), T = new THREE.Matrix4(), R = new THREE.Matrix4(), root = new THREE.Matrix4(), col = new THREE.Color();
  let cam = new THREE.Vector3(), range = 500;
  const sw = (a: number) => Math.sin(a);

  return {
    begin(c: THREE.Vector3, r = 500) { cam = c; range = r; nb.bike = nb.wheel = nb.horse = nb.leg = nb.oar = 0; nb.sail = nb.tug = nb.rope = 0; nb.hull = [0, 0, 0]; nw = 0; for (const w of wings) w.g.visible = false; },
    add(m: Mount) {
      if (m.hidden) return; const dx = m.x - cam.x, dz = m.z - cam.z, far = m.kind === 'glider' || m.kind === 'sailplane' || m.kind === 'tug' ? 5000 : range; if (dx * dx + dz * dz > far * far) return;
      root.makeRotationY(m.yaw); root.setPosition(m.x, m.y, m.z);
      const ins = (im: THREE.InstancedMesh, i: number, mm: THREE.Matrix4, c: number) => { im.setMatrixAt(i, mm); im.setColorAt(i, col.setHex(c)); };
      switch (m.kind) {
        case 'bike': {
          if (nb.bike >= capBike) return; ins(bikes, nb.bike++, root, m.color);
          for (const z of [0.52, -0.52]) { if (nb.wheel >= capBike * 2) break; M.copy(root).multiply(T.makeTranslation(0, 0.34, z)).multiply(R.makeRotationX(m.phase)); ins(wheels, nb.wheel++, M, 0xffffff); }
          break;
        }
        case 'horse': {
          if (nb.horse >= capHorse) return; const i = nb.horse++, ph = m.phase, sp = m.v, amp = sp < 2.4 ? 0.38 : sp < 4.6 ? 0.55 : sp < 7 ? 0.7 : 0.95, bob = sp > 7 ? 0.08 * Math.abs(sw(ph)) : sp > 2.4 ? 0.035 * Math.abs(sw(ph)) : 0.015 * sw(ph * 2);
          M.copy(root).multiply(T.makeTranslation(0, bob, 0)); ins(hBody, i, M, m.color);
          const base = M.clone();
          ins(hNeck, i, new THREE.Matrix4().copy(base).multiply(T.makeTranslation(0, 1.18, 0.55)).multiply(R.makeRotationX(0.75 + 0.06 * sw(ph))), m.color);
          ins(hHead, i, new THREE.Matrix4().copy(base).multiply(T.makeTranslation(0, 1.64, 0.98)).multiply(R.makeRotationX(-0.6 + 0.05 * sw(ph))), m.color);
          ins(hTail, i, new THREE.Matrix4().copy(base).multiply(T.makeTranslation(0, 1.28, -0.68)).multiply(R.makeRotationX(0.35 + 0.15 * sw(ph))), 0x1a1612);
          // quatre jambes : diagonales ensemble au trot, pas en phase ailleurs
          const lp = [[0.18, 0.5, 0], [-0.18, 0.5, Math.PI], [0.18, -0.5, Math.PI], [-0.18, -0.5, 0]];
          for (const [x, z, o2] of lp) { if (nb.leg >= capHorse * 4) break; const s = sw(ph + o2 + (sp > 7 ? (z > 0 ? 0.9 : 0.1) : sp > 4.6 ? (z > 0 ? 0.6 : 0) : 0)); ins(hLeg, nb.leg++, new THREE.Matrix4().copy(base).multiply(T.makeTranslation(x, 0.82, z)).multiply(R.makeRotationX(-amp * s)), m.color); }
          break;
        }
        case 'boat': {
          const k = m.n === 4 ? 2 : m.n === 2 ? 1 : 0; if (nb.hull[k] >= capBoat) return; M.copy(root).multiply(R.makeRotationZ(m.roll)); ins(hulls[k], nb.hull[k]++, M, m.color);
          // un couple d'avirons par rameur ; pale dans l'eau à la passe
          const n = m.n, q = Math.sin(m.phase), sweep = 0.5 * q;
          for (let r = 0; r < n; r++) {
            const z = ((n - 1) / 2 - r) * 1.1;
            for (const s of [-1, 1]) { if (nb.oar >= capBoat * 8) break; const dip = q > -0.1 ? -0.27 : -0.1;
              // l'aviron part en +x local : on le retourne pour le côté négatif ; le manche (vers l'intérieur) pointe vers la poupe, là où sont les mains du rameur
              const flip = s < 0 ? new THREE.Matrix4().makeRotationY(Math.PI) : new THREE.Matrix4();
              M.copy(root).multiply(T.makeTranslation(s * 0.5, 0.6, z)).multiply(R.makeRotationY(-s * (0.4 + sweep))).multiply(flip).multiply(R.makeRotationZ(dip)); ins(oars, nb.oar++, M, 0xe8e4d8); }
          }
          break;
        }
        case 'sailplane': case 'tug': {
          const pl = m.kind === 'sailplane'; if ((pl ? nb.sail : nb.tug) >= (pl ? 8 : 6)) return;
          o.position.set(m.x, m.y, m.z); o.rotation.set(-m.pitch, m.yaw, m.roll, 'YXZ'); o.scale.setScalar(1); o.updateMatrix();
          if (pl) ins(sails, nb.sail++, o.matrix, m.color); else { const i = nb.tug++; ins(tugs, i, o.matrix, m.color); M.copy(o.matrix).multiply(T.makeTranslation(0, 0, 2.3)).multiply(R.makeRotationZ(m.phase)); ins(props, i, M, 0xffffff); }
          break;
        }
        case 'glider': {
          while (wings.length <= nw) wings.push(mkWing());
          const w = wings[nw++], k = m.phase;
          // le roulis se fait autour du centre de la voile, et le pilote reste suspendu dessous (il ne suit le roulis qu'à moitié) : voile et pilote restent centrés dans les suspentes
          w.g.visible = true; w.g.position.set(m.x, m.y, m.z); w.g.rotation.set(0, 0, 0); w.g.rotation.order = 'YXZ'; w.g.rotation.y = m.yaw; w.g.rotation.x = -m.pitch; w.g.rotation.z = 0;
          const h = 0.5 + 6.6 * k, r = m.roll;
          w.wing.position.set(-h * Math.sin(0.45 * r), h * Math.cos(0.45 * r), -(1 - k) * 5.5); w.wing.rotation.set(-(1 - k) * 1.25, 0, r); w.wing.updateMatrix();
          w.lines.position.set(0, 0, 0); w.lines.rotation.set(0, 0, 0); w.lines.visible = k > 0.85;
          if (w.lines.visible) {
            const P = (w.lines.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
            for (let i = 0; i < P.count; i += 2) {
              v.set(w.top[i * 3], w.top[i * 3 + 1], w.top[i * 3 + 2]).applyMatrix4(w.wing.matrix); P.setXYZ(i, v.x, v.y, v.z);
              P.setXYZ(i + 1, Math.sign(w.top[i * 3] || 1) * 0.2, 1.3, -0.08);        // attache aux épaules du pilote
            }
            P.needsUpdate = true;
          }
          // la couleur de la voile
          const c = col.setHex(m.color); w.mat.color.copy(c);
          // suspentes : depuis la voile jusqu'au pilote (la géométrie est tracée vers le point (0, −H) ; on la place à la bonne échelle)
          break;
        }
      }
      void o;
    },
    /** câble de remorquage entre l'avion et le planeur */
    rope(a: Mount, b: Mount) {
      if (nb.rope >= 6) return; const p = ropeGeo.attributes.position as THREE.BufferAttribute, i = nb.rope++ * 2;
      p.setXYZ(i, a.x - Math.sin(a.yaw) * 5.0, a.y + 0.1, a.z - Math.cos(a.yaw) * 5.0); p.setXYZ(i + 1, b.x + Math.sin(b.yaw) * 1.6, b.y - 0.1, b.z + Math.cos(b.yaw) * 1.6);
    },
    end() {
      ropeLines.visible = nb.rope > 0; ropeGeo.setDrawRange(0, nb.rope * 2); (ropeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true; ropeGeo.computeBoundingSphere();
      for (const [im, n] of [[bikes, nb.bike], [wheels, nb.wheel], [hBody, nb.horse], [hNeck, nb.horse], [hHead, nb.horse], [hTail, nb.horse], [hLeg, nb.leg], [oars, nb.oar], [sails, nb.sail], [tugs, nb.tug], [props, nb.tug]] as [THREE.InstancedMesh, number][]) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
      hulls.forEach((h, i) => { h.count = nb.hull[i]; h.instanceMatrix.needsUpdate = true; if (h.instanceColor) h.instanceColor.needsUpdate = true; });
      for (let i = nw; i < wings.length; i++) wings[i].g.visible = false;
    },
  };
}
export type MountView = ReturnType<typeof buildMountView>;
