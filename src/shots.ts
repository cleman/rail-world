import * as THREE from 'three';
import type { RigKind } from './rigs';

/** Plan libre du réalisateur : caméra indépendante des trains (orbite, plan fixe, grue). Chaque plan est autonome. */
export interface FreeShot {
  label: string;
  fov: number;
  dur: number;
  /** Point regardé (suivi en direct si la cible bouge) ; sert aussi à centrer l'ombre du soleil. */
  target(): THREE.Vector3;
  /** Place la caméra à l'instant `t` (secondes depuis le début du plan). */
  place(cam: THREE.PerspectiveCamera, t: number): void;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
type Ground = (x: number, z: number) => number;

/** Orbite (éventuellement une grue : rayon et hauteur évoluent pendant le plan) autour d'une cible. */
export function orbitShot(o: { label: string; target: () => THREE.Vector3; radius: [number, number]; height: [number, number]; speed: number; fov: number; dur: number; a0?: number; ground: Ground; lookUp?: number }): FreeShot {
  const a0 = o.a0 ?? Math.random() * 6.28, tg = new THREE.Vector3(), look = new THREE.Vector3();
  return {
    label: o.label, fov: o.fov, dur: o.dur, target: () => look.copy(o.target()).add(tg.set(0, o.lookUp ?? 0, 0)),
    place(cam, t) {
      const u = Math.min(1, t / o.dur), c = o.target(), a = a0 + o.speed * t, r = lerp(o.radius[0], o.radius[1], u);
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r, y = Math.max(c.y + lerp(o.height[0], o.height[1], u), o.ground(x, z) + 4);
      cam.position.set(x, y, z); cam.lookAt(c.x, c.y + (o.lookUp ?? 0), c.z);
    },
  };
}

/** Plan fixe (caméra posée) qui suit une cible, avec une très lente dérive d'avant en arrière. */
export function fixedShot(o: { label: string; pos: THREE.Vector3; target: () => THREE.Vector3; fov: number; dur: number; drift?: number; ground: Ground }): FreeShot {
  const p0 = o.pos.clone(), look = new THREE.Vector3();
  return {
    label: o.label, fov: o.fov, dur: o.dur, target: () => look.copy(o.target()),
    place(cam, t) {
      const c = o.target(), dx = c.x - p0.x, dz = c.z - p0.z, l = Math.hypot(dx, dz) || 1, k = ((o.drift ?? 0) * t) / l;
      const x = p0.x + dx * k, z = p0.z + dz * k;
      cam.position.set(x, Math.max(p0.y, o.ground(x, z) + 1.6), z); cam.lookAt(c);
    },
  };
}

/** Plan embarqué : la caméra est attachée à un sujet mobile (navire, avion) à un décalage donné dans son repère (droite, haut, avant). */
export function followShot(o: { label: string; subject: () => { x: number; y: number; z: number; yaw: number }; offset: [number, number, number]; look: [number, number, number]; fov: number; dur: number; ground: Ground; sway?: number }): FreeShot {
  const tg = new THREE.Vector3(), cam0 = new THREE.Vector3();
  const at = (s: { x: number; y: number; z: number; yaw: number }, v: [number, number, number], out: THREE.Vector3) => {
    const c = Math.cos(s.yaw), n = Math.sin(s.yaw);       // avant = (sin yaw, cos yaw), droite = (cos yaw, -sin yaw)
    return out.set(s.x + v[0] * c + v[2] * n, s.y + v[1], s.z - v[0] * n + v[2] * c);
  };
  return {
    label: o.label, fov: o.fov, dur: o.dur, target: () => at(o.subject(), o.look, tg),
    place(cam, t) {
      const s = o.subject(); at(s, o.offset, cam0); cam0.y = Math.max(cam0.y, o.ground(cam0.x, cam0.z) + 1.2);
      const k = (o.sway ?? 0.15); cam.position.set(cam0.x + Math.sin(t * 0.7) * k, cam0.y + Math.sin(t * 0.9) * k * 0.5, cam0.z);
      at(s, o.look, tg); cam.lookAt(tg);
    },
  };
}

/** Un plan possible pour le réalisateur. */
export interface Cand {
  cat: string; key: string; score: number; dur: number;
  train?: { i: number; kind: RigKind }; free?: FreeShot;
  /** Famille pour le budget de temps d'écran (par défaut la catégorie). */
  fam?: string;
  /** Plan à durée variable : on ne coupe qu'après `min` s et quand `until()` est vrai, plus `tail` s ; `dur` sert de limite haute. */
  until?: () => boolean; min?: number; tail?: number;
  /** Accélération des navires pendant ce plan (les bateaux sont lents). */
  shipSpeed?: number;
}
