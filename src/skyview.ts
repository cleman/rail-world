import * as THREE from 'three';
import { Sky, bodyDir, MOON_R, SUN_R, type Dir } from './sim/sky';
import type { DayNight } from './env';

const R = 3800;                                   // rayon du dôme (les caméras voient à 5000 m ou plus)
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const V = (d: Dir) => new THREE.Vector3(d.x, d.y, d.z);

/** Début commun des shaders : direction réelle (monde) du fragment, pour masquer ce qui est sous l'horizon. */
const HEAD = /* glsl */`varying vec3 vWd;
`;
const VWD = /* glsl */`vec4 wp = modelMatrix * vec4(position, 1.0); vWd = normalize(wp.xyz - cameraPosition);`;
const HORIZON = /* glsl */`float hz = smoothstep(-0.012, 0.02, vWd.y);`;

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

/** Quad posé sur la sphère céleste en `p` (direction unitaire), long de `len` rad le long de `t`, large de `wid` rad. */
function layQuad(m: THREE.Mesh, p: THREE.Vector3, t: THREE.Vector3, len: number, wid: number) {
  const n = new THREE.Vector3().crossVectors(p, t).normalize(), tt = new THREE.Vector3().crossVectors(n, p).normalize();
  m.matrixAutoUpdate = false;
  m.matrix.makeBasis(tt.multiplyScalar(len * R), n.multiplyScalar(wid * R), p.clone().multiplyScalar(R)).setPosition(p.x * R, p.y * R, p.z * R);
  m.matrixWorldNeedsUpdate = true;
}

/** Rendu du ciel : étoiles et Voie lactée, soleil, lune (phases, éclipses), planètes, comète, aurores, étoiles filantes, arc-en-ciel. */
export function buildSkyView(scene: THREE.Scene, sky: Sky, env: DayNight) {
  const dome = new THREE.Group(); dome.frustumCulled = false; scene.add(dome);
  const rnd = rng(sky.seed * 977 + 13);
  const uni = { uT: { value: 0 }, uVis: { value: 0 }, uPx: { value: Math.min(2, window.devicePixelRatio || 1) } };

  // ----- étoiles + Voie lactée + planètes fixes : un seul nuage de points qui tourne avec la sphère céleste -----
  const stars = new THREE.Group(); dome.add(stars);
  {
    const N = 2300, M = 2600, P = 2, tot = N + M + P, pos = new Float32Array(tot * 3), col = new Float32Array(tot * 3), size = new Float32Array(tot), ph = new Float32Array(tot);
    const put = (i: number, d: THREE.Vector3, c: THREE.Color, s: number) => { pos.set([d.x * R, d.y * R, d.z * R], i * 3); col.set([c.r, c.g, c.b], i * 3); size[i] = s; ph[i] = rnd() * 6.28; };
    const c = new THREE.Color(), d = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      d.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); if (d.lengthSq() > 1 || d.lengthSq() < 0.05) { i--; continue; } d.normalize();
      const m = Math.pow(rnd(), 3.2), temp = rnd();
      c.setRGB(0.75 + 0.25 * (1 - temp), 0.85 + 0.1 * (1 - Math.abs(temp - 0.5)), 0.78 + 0.22 * temp).multiplyScalar(0.35 + 0.65 * m); put(i, d, c, 1.1 + 2.6 * m);
    }
    // Voie lactée : grand cercle incliné, épaisseur gaussienne, plus dense vers le « centre galactique »
    const gax = new THREE.Vector3(0.35, 0.8, -0.5).normalize(), ga = new THREE.Vector3().crossVectors(gax, new THREE.Vector3(0, 1, 0)).normalize(), gb = new THREE.Vector3().crossVectors(gax, ga);
    for (let i = 0; i < M; i++) {
      const a = rnd() * 6.283, g = (rnd() + rnd() + rnd() - 1.5) * 0.22, core = 0.5 + 0.5 * Math.cos(a - 1.2);
      d.copy(ga).multiplyScalar(Math.cos(a)).addScaledVector(gb, Math.sin(a)).addScaledVector(gax, g).normalize();
      c.setRGB(0.55, 0.62, 0.85).lerp(new THREE.Color(0.95, 0.85, 0.7), core * 0.5).multiplyScalar(0.12 + 0.2 * core * rnd()); put(N + i, d, c, 5 + 7 * rnd());
    }
    put(N + M, new THREE.Vector3(Math.cos(sky.seed * 1.3), 0.6, Math.sin(sky.seed * 1.3)).normalize(), new THREE.Color(1, 0.93, 0.78), 6.2);   // Jupiter
    put(N + M + 1, new THREE.Vector3(Math.cos(sky.seed * 2.9 + 2), 0.45, Math.sin(sky.seed * 2.9 + 2)).normalize(), new THREE.Color(1, 0.55, 0.38), 4.4);   // Mars
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: HEAD + /* glsl */`attribute vec3 color; attribute float size, phase; varying vec3 vC; varying float vA; uniform float uT, uPx;
        void main(){ ${VWD} vC = color; vA = 0.78 + 0.22 * sin(uT * (2.0 + phase * 0.3) + phase * 9.0); gl_PointSize = size * uPx; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: HEAD + /* glsl */`varying vec3 vC; varying float vA; uniform float uVis;
        void main(){ ${HORIZON} vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0; float a = smoothstep(1.0, 0.0, r); a *= a; gl_FragColor = vec4(vC * vA * a * uVis * hz, 1.0); }`,
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = -6; stars.add(pts);
    stars.rotation.order = 'XYZ';
  }
  const starAxis = new THREE.Vector3(0.28, 0.9, 0.18).normalize();

  // ----- soleil visible : disque, halo, couronne en éclipse totale -----
  const sunU = { uInt: { value: 1 }, uCover: { value: 0 }, uCol: { value: new THREE.Color(1, 0.95, 0.8) }, uSeed: { value: sky.seed } };
  const sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0), new THREE.ShaderMaterial({
    uniforms: { ...sunU, ...uni }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: HEAD + `varying vec2 vU; void main(){ vU = uv; ${VWD} gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: HEAD + /* glsl */`varying vec2 vU; uniform float uInt, uCover, uSeed; uniform vec3 uCol;
      void main(){ ${HORIZON}
        vec2 q = (vU - vec2(0.5, 0.5)) * 2.0; q.x = (vU.x * 2.0 - 1.0) ; float r = length(q) * 8.0;   // r en rayons solaires
        float disc = smoothstep(1.04, 0.97, r), glow = 0.5 / (1.0 + r * r * 0.9) + 0.18 * exp(-r * 0.35);
        float ang = atan(q.y, q.x), rays = 0.6 + 0.4 * sin(ang * 11.0 + uSeed) * sin(ang * 5.0 - uSeed * 2.0);
        float corona = pow(clamp(uCover, 0.0, 1.0), 6.0) * rays * exp(-(r - 1.0) * 0.9) * step(1.0, r);
        float dim = 1.0 - 0.9 * smoothstep(0.55, 1.0, uCover);
        vec3 c = uCol * (disc * 3.0 + glow * dim) + vec3(0.85, 0.9, 1.0) * corona * 1.3;
        gl_FragColor = vec4(c * uInt * hz, 1.0); }`,
  }));
  sunMesh.frustumCulled = false; sunMesh.renderOrder = -5; dome.add(sunMesh);

  // ----- lune : sphère éclairée par le soleil (phases), mers, lumière cendrée, éclipse totale rougeâtre -----
  const moonU = { uSun: { value: new THREE.Vector3(1, 0, 0) }, uLunar: { value: 0 }, uDark: { value: 0 }, uNight: { value: 0 }, uGrey: { value: 0 } };
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.ShaderMaterial({
    uniforms: moonU, transparent: true, depthWrite: true, fog: false,
    vertexShader: `varying vec3 vN; varying vec3 vO; varying vec3 vWd; void main(){ vO = normal; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vWd = normalize(wp.xyz - cameraPosition); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`varying vec3 vN; varying vec3 vO; varying vec3 vWd; uniform vec3 uSun; uniform float uLunar, uDark, uNight, uGrey;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y), mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){ ${HORIZON}
        vec3 n = normalize(vN); float l = dot(n, normalize(uSun)), lit = smoothstep(-0.03, 0.12, l);
        float m = vn(vO * 3.0) * 0.6 + vn(vO * 7.0) * 0.3 + vn(vO * 16.0) * 0.1;
        float maria = smoothstep(0.4, 0.75, m), crater = smoothstep(0.82, 0.95, vn(vO * 22.0));
        vec3 base = mix(vec3(0.93, 0.92, 0.86), vec3(0.7, 0.71, 0.74), maria * 0.5) + crater * 0.04;
        vec3 c = base * (0.18 + 0.82 * clamp(l, 0.0, 1.0)) * lit + base * vec3(0.55, 0.65, 0.9) * 0.06 * (1.0 - lit);
        c = mix(c, base * vec3(0.55, 0.16, 0.07) * 0.5, uLunar * 0.92);
        float limb = pow(max(0.0, 1.0 - abs(dot(n, -vWd))), 3.0); c *= 1.0 - 0.3 * limb;
        float a = max(lit, max(uDark, 0.22 * uNight * (1.0 - uGrey)));
        a = mix(a, 1.0, uLunar);
        gl_FragColor = vec4(c * 0.8, a * hz * smoothstep(0.0, 0.06, vWd.y + 0.02)); }`,
  }));
  moon.frustumCulled = false; moon.renderOrder = -4; dome.add(moon);
  const moonGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0), new THREE.ShaderMaterial({
    uniforms: { uInt: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: HEAD + `varying vec2 vU; void main(){ vU = uv; ${VWD} gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: HEAD + `varying vec2 vU; uniform float uInt; void main(){ ${HORIZON} vec2 q = vec2(vU.x * 2.0 - 1.0, vU.y * 2.0 - 1.0); float r = length(q); float g = pow(max(0.0, 1.0 - r), 2.6); gl_FragColor = vec4(vec3(0.7, 0.8, 1.0) * g * uInt * hz, 1.0); }`,
  }));
  moonGlow.frustumCulled = false; moonGlow.renderOrder = -5; dome.add(moonGlow);

  // ----- Vénus (étoile du berger, près du soleil) -----
  const venus = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0), new THREE.ShaderMaterial({
    uniforms: { uVis: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: HEAD + `varying vec2 vU; void main(){ vU = uv; ${VWD} gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: HEAD + `varying vec2 vU; uniform float uVis; void main(){ ${HORIZON} float r = length(vU * 2.0 - 1.0); float g = pow(max(0.0, 1.0 - r), 2.2); gl_FragColor = vec4(vec3(1.0, 0.97, 0.88) * g * uVis * hz * 1.4, 1.0); }`,
  }));
  venus.frustumCulled = false; venus.renderOrder = -5; dome.add(venus);

  // ----- comète : tête brillante + queue opposée au soleil -----
  const cometU = { uInt: { value: 0 } };
  const comet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0), new THREE.ShaderMaterial({
    uniforms: cometU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: HEAD + `varying vec2 vU; void main(){ vU = uv; ${VWD} gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: HEAD + /* glsl */`varying vec2 vU; uniform float uInt; void main(){ ${HORIZON}
      float x = vU.x, y = (vU.y - 0.5) * 2.0, w = 0.05 + 0.5 * x; float tail = exp(-x * 3.4) * smoothstep(w, 0.0, abs(y)) * 0.8;
      float head = exp(-(x * x * 1400.0 + y * y * 34.0)) * 2.2; vec3 c = vec3(0.7, 0.9, 1.0) * tail + vec3(1.0, 0.98, 0.9) * head;
      gl_FragColor = vec4(c * uInt * hz, 1.0); }`,
  }));
  comet.frustumCulled = false; comet.renderOrder = -5; dome.add(comet);

  // ----- aurore boréale : rideau vertical vers le nord (+x) -----
  const auU = { uInt: { value: 0 }, uT: uni.uT };
  const auGeo = new THREE.CylinderGeometry(3000, 3000, 1500, 96, 1, true, -0.95 + Math.PI / 2, 1.9).translate(0, 650, 0);
  const aurora = new THREE.Mesh(auGeo, new THREE.ShaderMaterial({
    uniforms: auU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vU; varying vec3 vP; void main(){ vU = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`varying vec2 vU; varying vec3 vP; uniform float uInt, uT;
      float h(float n){ return fract(sin(n * 127.1) * 43758.5); }
      float vn(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h(i), h(i + 1.0), f); }
      void main(){ float a = vU.x * 40.0, v = vU.y;
        float rays = 0.35 + 0.65 * vn(a * 1.7 + uT * 0.35) * vn(a * 0.6 - uT * 0.2 + 7.0);
        float sway = vn(vU.x * 6.0 + uT * 0.15) ;
        float env = smoothstep(0.0, 0.18, v) * smoothstep(1.0, 0.45 + 0.2 * sway, v) * smoothstep(0.0, 0.12, vU.x) * smoothstep(1.0, 0.88, vU.x);
        vec3 c = mix(vec3(0.15, 1.0, 0.45), vec3(0.65, 0.25, 0.95), smoothstep(0.35, 1.0, v)); c = mix(c, vec3(0.9, 0.2, 0.4), smoothstep(0.85, 1.0, v) * 0.5);
        gl_FragColor = vec4(c * rays * env * uInt * 0.9, 1.0); }`,
  }));
  aurora.frustumCulled = false; aurora.renderOrder = -5; dome.add(aurora);

  // ----- étoiles filantes -----
  const mkMeteor = () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(-1, 0, 0), new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: HEAD + `varying vec2 vU; void main(){ vU = uv; ${VWD} gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: HEAD + `varying vec2 vU; uniform float uA; void main(){ ${HORIZON} float x = vU.x, y = abs(vU.y - 0.5) * 2.0; float g = x * x * smoothstep(1.0, 0.0, y); gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * g * uA * hz * 1.6, 1.0); }`,
  }));
  const meteors = Array.from({ length: 5 }, () => { const m = mkMeteor(); m.frustumCulled = false; m.renderOrder = -5; m.visible = false; dome.add(m); return { m, t: -1, cur: new THREE.Vector3(), p: new THREE.Vector3(), d: new THREE.Vector3(), life: 1 }; });
  let meteorClock = 0;

  // ----- arc-en-ciel : anneau de 42° autour du point opposé au soleil -----
  const rbU = { uInt: { value: 0 } };
  const RB0 = Math.sin(0.70) * R * 0.97, RB1 = Math.sin(0.76) * R * 0.97;
  const rainbow = new THREE.Mesh(new THREE.RingGeometry(RB0, RB1, 160, 1), new THREE.ShaderMaterial({
    uniforms: rbU, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    vertexShader: HEAD + `varying float vR; void main(){ vR = length(position.xy); ${VWD} gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: HEAD + /* glsl */`varying float vR; uniform float uInt;
      vec3 hsv(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main(){ ${HORIZON} float t = (vR - ${RB0.toFixed(1)}) / ${(RB1 - RB0).toFixed(1)}; vec3 c = hsv((1.0 - t) * 0.78);
        gl_FragColor = vec4(c, sin(3.14159 * clamp(t, 0.0, 1.0)) * 0.34 * uInt * hz); }`,
  }));
  rainbow.frustumCulled = false; rainbow.renderOrder = -3; dome.add(rainbow);
  let wet = 0;

  const q = new THREE.Quaternion(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

  return {
    sky,
    /** Dernier état affiché (pour le HUD, les missions photo et le réalisateur). */
    state: { starVis: 0, moonUp: 0, moonLit: 0, solar: 0, lunar: 0, aurora: 0, comet: 0, rainbow: 0, meteors: 0, moonDir: new THREE.Vector3(), sunDir: new THREE.Vector3(), cometDir: new THREE.Vector3(), meteorDirs: [] as THREE.Vector3[] },
    update(cam: THREE.Vector3, t: number, dt: number, rain: number, cloud: number, indoors: boolean) {
      dome.position.copy(cam); dome.visible = !indoors; if (indoors) return;
      const date = env.day + env.hour / 24, ms = sky.moon(env.day, env.hour), sunD = V(ms.sun), moonD = V(ms.dir);
      uni.uT.value = t;
      // étoiles : visibles de nuit, masquées par les nuages ; l'éclipse totale les révèle
      const vis = sm(0.45, 0.8, env.night) * (1 - 0.92 * env.grey) * (1 - 0.35 * Math.max(0, ms.lit) * Math.max(0, ms.up) * (1 - ms.solar));
      uni.uVis.value = vis;
      q.setFromAxisAngle(starAxis, date * Math.PI * 2 * (1 + 1 / 60)); stars.quaternion.copy(q);
      // soleil
      const sy = sunD.y, warm = 1 - sm(0, 0.4, sy);
      sunMesh.visible = sy > -0.12; layQuad(sunMesh, sunD, tmp.set(0, 1, 0).cross(sunD).normalize(), SUN_R * 16, SUN_R * 16);
      // le quad est centré en x∈[0,1] ; on le décale d'un demi-côté vers l'arrière pour le centrer
      sunMesh.matrix.multiply(new THREE.Matrix4().makeTranslation(-0.5, 0, 0));
      (sunMesh.material as THREE.ShaderMaterial).uniforms.uCol.value.setRGB(1, 0.95 - 0.38 * warm, 0.8 - 0.55 * warm);
      (sunMesh.material as THREE.ShaderMaterial).uniforms.uInt.value = (1 - 0.88 * env.grey) * (1 - 0.6 * rain);
      (sunMesh.material as THREE.ShaderMaterial).uniforms.uCover.value = ms.solar;
      // lune
      const mr = R * MOON_R * 0.72;
      moon.position.copy(moonD).multiplyScalar(R * 0.98); moon.scale.setScalar(mr); moon.visible = ms.up > -0.12;
      moonU.uSun.value.copy(sunD); moonU.uLunar.value = ms.lunar; moonU.uNight.value = env.night; moonU.uGrey.value = env.grey;
      const near = Math.acos(Math.max(-1, Math.min(1, moonD.dot(sunD))));
      moonU.uDark.value = sm(0.16, 0.06, near);                       // face sombre visible en silhouette devant le soleil
      moon.updateMatrix();
      moonGlow.visible = moon.visible; layQuad(moonGlow, moonD, tmp.set(0, 1, 0).cross(moonD).normalize(), MOON_R * 18, MOON_R * 18); moonGlow.matrix.multiply(new THREE.Matrix4().makeTranslation(-0.5, 0, 0));
      (moonGlow.material as THREE.ShaderMaterial).uniforms.uInt.value = ms.lit * 0.55 * env.night * (1 - env.grey) * (1 - ms.lunar * 0.9);
      // Vénus : près du soleil, à l'ouest le matin / à l'est le soir
      const vd = V(bodyDir(env.hour + 3.2 * Math.sin((date / 19) * Math.PI * 2)));
      venus.visible = vd.y > -0.02; layQuad(venus, vd, tmp.set(0, 1, 0).cross(vd).normalize(), 0.06, 0.06); venus.matrix.multiply(new THREE.Matrix4().makeTranslation(-0.5, 0, 0));
      (venus.material as THREE.ShaderMaterial).uniforms.uVis.value = sm(0.15, 0.55, env.night) * (1 - 0.9 * env.grey) * 0.9;
      // comète
      const cm = sky.comet(env.day, env.hour), cd = V(cm.dir).applyQuaternion(q);
      comet.visible = cm.on > 0.02 && cd.y > 0; cometU.uInt.value = cm.on * sm(0.5, 0.85, env.night) * (1 - env.grey);
      if (comet.visible) { tmp.copy(cd).addScaledVector(sunD, -cd.dot(sunD)); if (tmp.lengthSq() < 1e-4) tmp.set(0, 1, 0); tmp.normalize(); tmp.addScaledVector(cd, -tmp.dot(cd)).normalize(); layQuad(comet, cd, tmp, 0.4, 0.07); }
      // aurore
      const au = sky.aurora(env.day) * sm(0.6, 0.9, env.night) * (1 - env.grey) * (1 - rain);
      aurora.visible = au > 0.02; auU.uInt.value = au * (0.8 + 0.2 * Math.sin(t * 0.7));
      // étoiles filantes
      meteorClock -= dt;
      if (vis > 0.4 && meteorClock <= 0) {
        const m = meteors.find(x => x.t < 0);
        if (m) { m.p.set(rnd() - 0.5, 0.35 + rnd() * 0.6, rnd() - 0.5).normalize(); m.d.set(rnd() - 0.5, -0.2 - rnd() * 0.3, rnd() - 0.5).normalize(); m.d.addScaledVector(m.p, -m.d.dot(m.p)).normalize(); m.t = 0; m.life = 0.6 + rnd() * 0.7; }
        meteorClock = (6 + rnd() * 14) / sky.showers(env.day);
      }
      for (const m of meteors) {
        if (m.t < 0) { m.m.visible = false; continue; }
        m.t += dt; if (m.t > m.life) { m.t = -1; m.m.visible = false; continue; }
        const k = m.t / m.life; m.m.visible = true;
        tmp.copy(m.p).addScaledVector(m.d, 0.5 * k).normalize(); m.cur.copy(tmp); tmp2.copy(m.d).addScaledVector(tmp, -m.d.dot(tmp)).normalize();
        layQuad(m.m, tmp, tmp2, 0.05 + 0.08 * Math.sin(Math.PI * k), 0.0035);
        (m.m.material as THREE.ShaderMaterial).uniforms.uA.value = Math.sin(Math.PI * k) * vis;
      }
      // arc-en-ciel : après la pluie, soleil bas sur l'horizon (8°–40°) et ciel dégagé
      wet = Math.max(wet - dt * 0.012, rain);
      const sunLow = sm(0.1, 0.16, sy) * sm(0.7, 0.55, sy), rb = sm(0.12, 0.4, wet) * (1 - sm(0.05, 0.25, rain)) * sunLow * (1 - sm(0.5, 0.9, cloud)) * (1 - ms.solar);
      rainbow.visible = rb > 0.01; rbU.uInt.value = rb;
      if (rainbow.visible) { const a = sunD.clone().negate(); rainbow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), a); rainbow.position.copy(a).multiplyScalar(R * 0.97 * Math.cos(0.73)); rainbow.updateMatrix(); }
      const s = this.state; s.starVis = vis; s.moonUp = ms.up; s.moonLit = ms.lit; s.solar = ms.solar; s.lunar = ms.lunar; s.aurora = au; s.comet = comet.visible ? cm.on : 0; s.rainbow = rb;
      s.meteors = meteors.filter(m => m.t >= 0).length; s.meteorDirs = meteors.filter(m => m.t >= 0).map(m => m.cur); s.cometDir.copy(cd); s.moonDir.copy(moonD); s.sunDir.copy(sunD);
    },
  };
}
