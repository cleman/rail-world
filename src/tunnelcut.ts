import * as THREE from 'three';

/**
 * Découpe du terrain à l'entrée des tunnels : la maille du sol (12,5 m) ne peut pas suivre exactement le mur de tête,
 * si bien qu'un bout de talus traversait l'ouverture. Le shader du sol écarte donc les fragments situés à l'intérieur
 * de la cavité (tranches de 1 échantillon à partir du mur de tête, et un peu en avant pour la même raison), ce qui laisse voir l'intérieur du tube.
 */
export const MAX_SLICES = 192;
const A = Array.from({ length: MAX_SLICES }, () => new THREE.Vector4()), B = Array.from({ length: MAX_SLICES }, () => new THREE.Vector4());
const U = { tcN: { value: 0 }, tcA: { value: A }, tcB: { value: B } };

/** Ajoute une tranche de cavité : centre (x,z), tangente (tx,tz), altitude de l'axe, demi-longueur. */
export function addCutSlice(x: number, y: number, z: number, tx: number, tz: number, half: number, outside = false) {
  const n = U.tcN.value; if (n >= MAX_SLICES) return;
  A[n].set(x, z, tx, tz); B[n].set(y, half, outside ? 1 : 0, 0); U.tcN.value = n + 1;
}
export function clearCutSlices() { U.tcN.value = 0; }

/** Branche la découpe sur un matériau Lambert (le sol). */
export function applyTunnelCut(mat: THREE.MeshLambertMaterial) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTcW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTcW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vTcW; uniform int tcN; uniform vec4 tcA[${MAX_SLICES}]; uniform vec4 tcB[${MAX_SLICES}];`)
      .replace('void main() {', `void main() {
  for (int i = 0; i < ${MAX_SLICES}; i++) {
    if (i >= tcN) break;
    vec2 d = vTcW.xz - tcA[i].xy; float al = dot(d, tcA[i].zw), la = abs(d.x * tcA[i].w - d.y * tcA[i].z);
    if (abs(al) < tcB[i].y && la < 5.3) {
      float k = la / 5.4, top = 3.3 + 2.9 * (1.0 - k * k) - 0.05;
      if (vTcW.y < tcB[i].x + top && (tcB[i].z < 0.5 || vTcW.y > tcB[i].x - 0.1)) discard;
    }
  }`);
  };
  mat.customProgramCacheKey = () => 'tunnelcut';
}
