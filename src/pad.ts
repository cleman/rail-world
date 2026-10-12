// Manette (mapping « standard » du navigateur) : sticks avec zone morte, gâchettes, boutons avec détection de front.
export interface PadSnap {
  name: string;
  /** stick gauche (x à droite, y vers le bas), stick droit */
  lx: number; ly: number; rx: number; ry: number;
  /** gâchettes 0..1 */
  lt: number; rt: number;
  held(i: number): boolean;
  /** vrai une seule fois à l'appui */
  pressed(i: number): boolean;
}
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

export class PadReader {
  private prev: boolean[] = [];
  constructor(private dead = 0.16) {}
  private dz(v: number) { const a = Math.abs(v); return a < this.dead ? 0 : Math.sign(v) * (a - this.dead) / (1 - this.dead); }
  /** Lit la première manette connectée ; `null` s'il n'y en a pas. À appeler une fois par image. */
  poll(): PadSnap | null {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let p: Gamepad | null = null; for (const q of pads) if (q && q.connected && q.axes.length >= 2) { p = q; break; }
    if (!p) { this.prev = []; return null; }
    const ax = (i: number) => this.dz(p!.axes[i] ?? 0), B = (i: number) => !!p!.buttons[i]?.pressed, now = p.buttons.map(b => !!b?.pressed), prev = this.prev; this.prev = now;
    const trig = (i: number) => p!.buttons[i]?.value ?? 0;
    return { name: p.id, lx: ax(0), ly: ax(1), rx: ax(2), ry: ax(3), lt: trig(6), rt: trig(7), held: B, pressed: i => !!now[i] && !prev[i] };
  }
}
