import * as THREE from 'three';

export type V = [number, number, number];
type UV = [number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V): V => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Assemble des faces plates (normales, couleurs de sommets, UV) en une seule géométrie. L'orientation de chaque face est corrigée avec un vecteur « vers l'extérieur ». */
export class MeshBuilder {
  private pos: number[] = []; private nor: number[] = []; private uv: number[] = []; private col: number[] = [];

  private push(p: V, n: V, c: THREE.Color, u: UV) {
    this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(c.r, c.g, c.b); this.uv.push(u[0], u[1]);
  }
  tri(p: [V, V, V], c: THREE.Color, hint: V, uvs: UV[] = [[0, 0], [0, 0], [0, 0]]) {
    const a = p[0]; let b = p[1], d = p[2], ub = uvs[1], ud = uvs[2];
    let n = norm(cross(sub(b, a), sub(d, a)));
    if (dot(n, hint) < 0) { [b, d] = [d, b]; [ub, ud] = [ud, ub]; n = [-n[0], -n[1], -n[2]]; }
    this.push(a, n, c, uvs[0]); this.push(b, n, c, ub); this.push(d, n, c, ud);
  }
  quad(p: [V, V, V, V], c: THREE.Color, hint: V, uvs: UV[] = [[0, 0], [0, 0], [0, 0], [0, 0]]) {
    this.tri([p[0], p[1], p[2]], c, hint, [uvs[0], uvs[1], uvs[2]]);
    this.tri([p[0], p[2], p[3]], c, hint, [uvs[0], uvs[2], uvs[3]]);
  }
  /** Boîte alignée sur les axes. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, c: THREE.Color) {
    const P = (x: number, y: number, z: number): V => [x, y, z];
    this.quad([P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1)], c, [-1, 0, 0]);
    this.quad([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], c, [1, 0, 0]);
    this.quad([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)], c, [0, -1, 0]);
    this.quad([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], c, [0, 1, 0]);
    this.quad([P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)], c, [0, 0, -1]);
    this.quad([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], c, [0, 0, 1]);
  }
  get empty() { return this.pos.length === 0; }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

/** Quatre murs d'un bâtiment (rotation `rot` autour de Y), UV répétés par tuiles de fenêtres. */
export function wallBox(mb: MeshBuilder, cx: number, cz: number, y0: number, w: number, d: number, h: number, rot: number,
                        c: THREE.Color, tileU: number, tileV: number) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const corner = (lx: number, lz: number, y: number): V => [cx + lx * cs - lz * sn, y, cz + lx * sn + lz * cs];
  const L: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const y1 = y0 + h;
  for (let i = 0; i < 4; i++) {
    const a = L[i], b = L[(i + 1) % 4], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u1 = Math.max(1, Math.round(len / tileU)), v1 = Math.max(1, Math.round(h / tileV));
    const mid = corner((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, y0);
    mb.quad([corner(a[0], a[1], y0), corner(b[0], b[1], y0), corner(b[0], b[1], y1), corner(a[0], a[1], y1)],
      c, [mid[0] - cx, 0, mid[2] - cz], [[0, 0], [u1, 0], [u1, v1], [0, v1]]);
  }
}

export function flatRoof(mb: MeshBuilder, cx: number, cz: number, y: number, w: number, d: number, rot: number, c: THREE.Color) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const k = (lx: number, lz: number): V => [cx + lx * cs - lz * sn, y, cz + lx * sn + lz * cs];
  mb.quad([k(-w / 2, -d / 2), k(w / 2, -d / 2), k(w / 2, d / 2), k(-w / 2, d / 2)], c, [0, 1, 0]);
}

/** Toit à deux pans (faîtage le long du plus grand côté), avec débord. */
export function gableRoof(mb: MeshBuilder, cx: number, cz: number, y: number, w: number, d: number, rise: number, rot: number,
                          c: THREE.Color, ov = 0.5) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const k = (lx: number, lz: number, yy: number): V => [cx + lx * cs - lz * sn, yy, cz + lx * sn + lz * cs];
  const hint = (pts: V[]): V => {
    const m = pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]] as V, [0, 0, 0] as V);
    return [m[0] / pts.length - cx, m[1] / pts.length - (y - 2), m[2] / pts.length - cz];
  };
  const face = (pts: V[]) => (pts.length === 4 ? mb.quad(pts as [V, V, V, V], c, hint(pts)) : mb.tri(pts as [V, V, V], c, hint(pts)));
  const hx = w / 2, hz = d / 2;
  if (w >= d) {
    const e1 = k(-hx - ov, -hz - ov, y), e2 = k(hx + ov, -hz - ov, y), e3 = k(hx + ov, hz + ov, y), e4 = k(-hx - ov, hz + ov, y);
    const r1 = k(-hx - ov, 0, y + rise), r2 = k(hx + ov, 0, y + rise);
    face([e1, e2, r2, r1]); face([e3, e4, r1, r2]);
    face([k(hx, -hz, y), k(hx, hz, y), k(hx, 0, y + rise)]); face([k(-hx, -hz, y), k(-hx, hz, y), k(-hx, 0, y + rise)]);
  } else {
    const e1 = k(-hx - ov, -hz - ov, y), e2 = k(hx + ov, -hz - ov, y), e3 = k(hx + ov, hz + ov, y), e4 = k(-hx - ov, hz + ov, y);
    const r1 = k(0, -hz - ov, y + rise), r2 = k(0, hz + ov, y + rise);
    face([e1, r1, r2, e4]); face([e2, e3, r2, r1]);
    face([k(-hx, -hz, y), k(hx, -hz, y), k(0, -hz, y + rise)]); face([k(-hx, hz, y), k(hx, hz, y), k(0, hz, y + rise)]);
  }
}
