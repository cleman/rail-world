import * as THREE from 'three';
import type { World } from './sim/world';
import type { TrainViews } from './trains';

export type RigKind = 'cabine' | 'passager' | 'bord de voie' | 'aérienne' | 'poursuite' | 'drone' | 'lointain' | 'passage' | 'quai';
export const RIG_KINDS: RigKind[] = ['cabine', 'passager', 'bord de voie', 'aérienne', 'poursuite', 'drone', 'lointain', 'passage', 'quai'];

/** Distance (m) restant à parcourir jusqu'au point d'arrêt du quai où le train va s'arrêter, ou null s'il ne s'approche pas d'un quai. */
export function distToStop(t: import('./sim/world').Train): number | null {
  if (t.status === 'stored' || t.dwell > 0) return null;
  let e = t.head, dist = -t.d, i = 0;
  while (true) {
    if (e.kind === 'plat') return t.stopsAt(e.station) ? dist + e.stopOffset : null;
    dist += e.len;
    if (i >= t.reserved.length || dist > 400) return null;
    e = t.reserved[i++];
  }
}
const FOV: Record<RigKind, number> = { cabine: 70, passager: 75, 'bord de voie': 45, aérienne: 50, poursuite: 55, drone: 58, lointain: 16, passage: 82, quai: 52 };

/**
 * Une caméra attachée à un train (ou posée à côté de lui). Le même type peut exister plusieurs fois :
 * vue principale, incrustations du multi-vues, plans de la télé d'ambiance.
 */
export class CameraRig {
  /** Branché par main.ts : vrai si (x,z) est au-dessus d'un tunnel, pour garder les caméras extérieures hors de la colline. */
  static covered: (x: number, z: number) => boolean = () => false;
  readonly cam: THREE.PerspectiveCamera;
  private idx = -1;
  private placed = false;
  private ang = Math.random() * 6.28;
  private readonly want = new THREE.Vector3();
  private readonly look = new THREE.Vector3();

  constructor(public kind: RigKind, private world: World, private tv: TrainViews, aspect: number) {
    this.cam = new THREE.PerspectiveCamera(FOV[kind], aspect, 0.3, 5000);
  }

  setKind(kind: RigKind) {
    if (kind === this.kind) return;
    this.kind = kind; this.cam.fov = FOV[kind]; this.cam.updateProjectionMatrix();
    this.reset();
  }

  follow(i: number) {
    if (i !== this.idx) { this.idx = i; this.reset(); }
  }

  setAspect(a: number) {
    if (Math.abs(this.cam.aspect - a) > 1e-3) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); }
  }

  private reset() {
    this.placed = false;
    const c = this.cam;
    c.removeFromParent(); c.up.set(0, 1, 0); c.rotation.set(0, 0, 0);
    const t = this.world.trains[this.idx], cars = this.tv.views[this.idx];
    if (!t || !cars) return;
    if (this.kind === 'cabine') {                         // sur le poste de conduite de la première caisse, regard vers l'avant
      cars[0].group.add(c); c.position.set(0, 2.7, t.carLen / 2 - 1); c.rotation.y = Math.PI;
    } else if (this.kind === 'passager') {                // à une fenêtre de la deuxième caisse
      cars[Math.min(1, cars.length - 1)].group.add(c); c.position.set(-0.9, 2.1, 0); c.rotation.y = -Math.PI / 2;
    }
  }

  /** Caméra posée au bord de la voie, devant le train ; replacée quand il est passé (`passed`) ou trop loin (`far`). */
  private trackside(t: import('./sim/world').Train, head: THREE.Vector3, tg: { tx: number; tz: number }, ahead: number, side: number, up: number, far: number, passed: number) {
    const c = this.cam, dx = c.position.x - head.x, dz = c.position.z - head.z, dist = Math.hypot(dx, dz);
    if (!this.placed || dist > far || (dx * tg.tx + dz * tg.tz < 0 && dist > passed)) {
      const p = t.pointAhead(ahead);
      if (CameraRig.covered(p.x, p.z)) c.position.set(p.x, p.y + 3.2, p.z);             // sous la colline : on se place dans le tunnel, entre les voies
      else c.position.set(p.x - p.tz * side, p.y + up, p.z + p.tx * side);
      this.placed = true;
    }
    c.lookAt(head);
  }

  /** Appelé chaque image, après la mise à jour des meshes des trains. */
  update(dt: number) {
    const t = this.world.trains[this.idx], views = this.tv.views[this.idx];
    if (!t || !views) return;
    const head = views[0].group.position, c = this.cam, tg = t.pointAt(0);
    switch (this.kind) {
      case 'cabine':
        views[0].lf.visible = false;                      // les phares gêneraient la vue du conducteur
        break;
      case 'aérienne':
        c.up.set(0, 0, -1); c.position.set(head.x, head.y + 250, head.z); c.lookAt(head);
        break;
      case 'bord de voie': this.trackside(t, head, tg, 280, 7, 2.5, 350, 60); break;
      case 'lointain': this.trackside(t, head, tg, 420, 85, 24, 700, 120); break;      // téléobjectif : loin devant et en hauteur
      case 'passage': this.trackside(t, head, tg, 95, 6.5, 1.5, 200, 25); break;       // au ras du rail, grand angle : la rame fonce sur la caméra
      case 'quai': { const dd = distToStop(t); this.trackside(t, head, tg, Math.max(40, Math.min(400, (dd ?? 80) + 24)), 4.6, 1.7, 450, 30); break; }      // à la tête du quai : la rame arrive, freine et s'arrête devant la caméra
      case 'drone': {                                     // orbite lente autour de la tête du train
        this.ang += dt * 0.14;
        if (CameraRig.covered(head.x, head.z)) { const b = t.pointAt(t.length + 16); c.position.set(b.x, b.y + 3.4, b.z); c.lookAt(head); break; }
        const want = this.want.set(head.x + Math.cos(this.ang) * 62, head.y + 30, head.z + Math.sin(this.ang) * 62);
        if (!this.placed) { c.position.copy(want); this.placed = true; } else c.position.lerp(want, 1 - Math.exp(-dt * 4));
        const mid = t.pointAt(Math.min(t.length / 2, 40)); this.look.set(mid.x, mid.y + 2, mid.z); c.lookAt(this.look);
        break;
      }
      case 'poursuite': {                                 // derrière et au-dessus du train, avec un peu d'inertie
        if (CameraRig.covered(head.x, head.z) || CameraRig.covered(head.x - tg.tx * 40, head.z - tg.tz * 40)) {
          const b = t.pointAt(t.length + 16);                  // sous une colline : derrière la rame, dans le tunnel
          this.want.set(b.x, b.y + 3.4, b.z);
        }
        else this.want.set(head.x - tg.tx * 40 - tg.tz * 7, head.y + 11, head.z - tg.tz * 40 + tg.tx * 7);
        if (!this.placed) { c.position.copy(this.want); this.placed = true; }
        else c.position.lerp(this.want, 1 - Math.exp(-dt * 2.5));
        const mid = t.pointAt(Math.min(t.length / 2, 40));
        this.look.set(mid.x, mid.y + 2, mid.z); c.lookAt(this.look);
        break;
      }
      default: break;
    }
  }
}
