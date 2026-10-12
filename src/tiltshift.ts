import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLUR = `
uniform sampler2D tex; uniform vec2 dir; uniform float focus, band, strength, aspectH;
varying vec2 vUv;
void main(){
  float d = max(0.0, abs(vUv.y - focus) - band);
  float r = strength * smoothstep(0.0, 0.45, d);       // rayon en pixels
  vec4 c = texture2D(tex, vUv) * 0.2270270270;
  vec2 st = dir * r;
  c += texture2D(tex, vUv + st * 1.3846153846) * 0.3162162162 + texture2D(tex, vUv - st * 1.3846153846) * 0.3162162162;
  c += texture2D(tex, vUv + st * 3.2307692308) * 0.0702702703 + texture2D(tex, vUv - st * 3.2307692308) * 0.0702702703;
  gl_FragColor = c;
}`;
const FINAL = `
uniform sampler2D tex; uniform vec2 dir; uniform float focus, band, strength, sat, contrast;
varying vec2 vUv;
void main(){
  float d = max(0.0, abs(vUv.y - focus) - band);
  float r = strength * smoothstep(0.0, 0.45, d);
  vec4 c = texture2D(tex, vUv) * 0.2270270270;
  vec2 st = dir * r;
  c += texture2D(tex, vUv + st * 1.3846153846) * 0.3162162162 + texture2D(tex, vUv - st * 1.3846153846) * 0.3162162162;
  c += texture2D(tex, vUv + st * 3.2307692308) * 0.0702702703 + texture2D(tex, vUv - st * 3.2307692308) * 0.0702702703;
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 col = mix(vec3(l), c.rgb, sat);                  // couleurs saturées : effet jouet
  col = (col - 0.5) * contrast + 0.5;
  float v = smoothstep(1.15, 0.35, length((vUv - 0.5) * vec2(1.25, 1.0)));
  col *= mix(0.82, 1.0, v);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Mode maquette : rendu de la scène dans une texture, puis flou en deux passes (de plus en plus fort loin de la bande nette) + couleurs saturées. */
export class TiltShift {
  enabled = false;
  focus = 0.5;      // hauteur de la bande nette (0 = bas, 1 = haut de l'image)
  band = 0.12;      // demi-hauteur de la bande nette
  strength = 3.2;   // flou maximal (en pixels, à 720 p ; proportionnel à la hauteur de l'image)
  sat = 1.25;
  contrast = 1.08;
  private rtA: THREE.WebGLRenderTarget; private rtB: THREE.WebGLRenderTarget;
  private mBlur: THREE.ShaderMaterial; private mFinal: THREE.ShaderMaterial;
  private quad: THREE.Mesh; private cam = new THREE.Camera(); private sc = new THREE.Scene();

  constructor(private renderer: THREE.WebGLRenderer) {
    const mk = () => new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType, depthBuffer: true });
    this.rtA = mk(); this.rtB = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    const u = () => ({ tex: { value: null as THREE.Texture | null }, dir: { value: new THREE.Vector2() }, focus: { value: 0.5 }, band: { value: 0.1 }, strength: { value: 3 }, sat: { value: 1.3 }, contrast: { value: 1.1 }, aspectH: { value: 1 } });
    this.mBlur = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BLUR, uniforms: u(), depthTest: false, depthWrite: false });
    this.mFinal = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FINAL, uniforms: u(), depthTest: false, depthWrite: false });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(g, this.mBlur); this.quad.frustumCulled = false; this.sc.add(this.quad);
  }

  /** Dessine `scene` vue par `camera` sur l'écran (taille w × h en pixels CSS) en appliquant l'effet. */
  render(scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
    const r = this.renderer, pr = r.getPixelRatio(), pw = Math.round(w * pr), ph = Math.round(h * pr);
    if (this.rtA.width !== pw || this.rtA.height !== ph) { this.rtA.setSize(pw, ph); this.rtB.setSize(pw, ph); }
    r.setRenderTarget(this.rtA); r.setScissorTest(false); r.clear(); r.render(scene, camera);
    const k = (ph / 720) * this.strength;
    const set = (m: THREE.ShaderMaterial, tex: THREE.Texture, dx: number, dy: number) => {
      m.uniforms.tex.value = tex; m.uniforms.dir.value.set(dx, dy);
      m.uniforms.focus.value = this.focus; m.uniforms.band.value = this.band; m.uniforms.strength.value = k;
      m.uniforms.sat.value = this.sat; m.uniforms.contrast.value = this.contrast;
    };
    this.quad.material = this.mBlur; set(this.mBlur, this.rtA.texture, 1 / pw, 0);
    r.setRenderTarget(this.rtB); r.render(this.sc, this.cam);
    this.quad.material = this.mFinal; set(this.mFinal, this.rtB.texture, 0, 1 / ph);
    r.setRenderTarget(null); r.setViewport(0, 0, w, h); r.render(this.sc, this.cam);
  }
}
