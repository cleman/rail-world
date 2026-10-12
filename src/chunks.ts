import * as THREE from 'three';
import { MeshBuilder } from './geom';

/** Un MeshBuilder par cellule carrée du monde : chaque cellule devient un maillage distinct, donc ignoré par la caméra quand il est hors champ. */
export class Chunked {
  private cells = new Map<number, MeshBuilder>();
  constructor(readonly cell: number) {}
  at(x: number, z: number): MeshBuilder {
    const k = Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell);
    let m = this.cells.get(k);
    if (!m) { m = new MeshBuilder(); this.cells.set(k, m); }
    return m;
  }
  /** Ajoute un maillage par cellule non vide ; renvoie le nombre de maillages créés. */
  addTo(scene: THREE.Scene, material: THREE.Material, cast = true, receive = true): number {
    let n = 0;
    for (const mb of this.cells.values()) {
      if (mb.empty) continue;
      const m = new THREE.Mesh(mb.build(), material);
      m.castShadow = cast; m.receiveShadow = receive; scene.add(m); n++;
    }
    return n;
  }
}

/** Instances regroupées par cellule : une InstancedMesh par cellule (culling par cellule). */
export function chunkKey(x: number, z: number, cell: number) { return Math.floor(x / cell) * 100003 + Math.floor(z / cell); }
