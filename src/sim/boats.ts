import type { Terrain } from './terrain';
import type { Lake } from './planning';
import type { Poi } from './pois';
import { portAt, portGeom } from './pois';
import { seaS } from './water';
import { rng } from './cityplan';

export type ShipKind = 'cargo' | 'ferry' | 'péniche' | 'voilier' | 'pêcheur' | 'pétrolier';
type Pt = { x: number; z: number };
type Mode = 'fwd' | 'rev' | 'pivot' | 'wait';
interface Leg { mode: Mode; pts: Pt[]; cum: number[]; len: number; v: number; stop: boolean; closed: boolean; yawTo: number; dwell: number; port: number; ys?: number[] }
export interface Ship {
  id: number; kind: ShipKind; len: number; x: number; y: number; z: number; yaw: number; v: number; ph: number;
  /** 0..1 : chargement visible des conteneurs (cargo) */
  load: number;
  /** indice du port où le navire est à quai (−1 sinon) et sa phase : 'accoste', 'quai', 'appareille' */
  port: number; phase: 'mer' | 'accoste' | 'quai' | 'appareille';
  legs: Leg[]; li: number; s: number; t: number; loop: boolean; level: number; hidden: boolean; name: string;
  /** au bout du dernier tronçon, le navire disparaît au large puis réapparaît au début après `respawn` secondes */
  vanish: boolean; respawn: number; river: boolean;
}
export interface PortState { poi: Poi; busy: number; /** temps depuis le début de la manutention */ work: number }

const mkLeg = (mode: Mode, pts: Pt[], v: number, o: Partial<Leg> = {}): Leg => {
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  if (o.closed && pts.length > 1) cum.push(cum[cum.length - 1] + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z));
  return { mode, pts, cum, len: cum[cum.length - 1], v, stop: false, closed: false, yawTo: 0, dwell: 0, port: -1, ...o };
};
const bez = (a: Pt, c1: Pt, c2: Pt, b: Pt, n = 22): Pt[] => Array.from({ length: n + 1 }, (_, i) => {
  const u = i / n, w = 1 - u, f = (k: 'x' | 'z') => w * w * w * a[k] + 3 * w * w * u * c1[k] + 3 * w * u * u * c2[k] + u * u * u * b[k];
  return { x: f('x'), z: f('z') };
});
const angDiff = (a: number, b: number) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
/** Point et tangente d'un tronçon à l'abscisse s (cyclique si fermé). */
function sample(l: Leg, s: number): { x: number; z: number; hx: number; hz: number; y: number } {
  if (l.closed) s = ((s % l.len) + l.len) % l.len; else s = Math.max(0, Math.min(l.len, s));
  const n = l.pts.length; let lo = 0, hi = l.cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (l.cum[m] <= s) lo = m; else hi = m; }
  const a = l.pts[lo], b = l.pts[(lo + 1) % n], seg = l.cum[lo + 1] - l.cum[lo] || 1, u = (s - l.cum[lo]) / seg;
  const ya = l.ys ? l.ys[lo] : 0, yb = l.ys ? l.ys[(lo + 1) % n] : 0;
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, hx: (b.x - a.x) / seg, hz: (b.z - a.z) / seg, y: ya + (yb - ya) * u };
}

const SPEC: Record<ShipKind, { len: number; v: number; names: string[] }> = {
  cargo: { len: 104, v: 7.5, names: ['Océane', 'Marie-Galante', 'Atlantis', 'Bonne Espérance'] },
  pétrolier: { len: 120, v: 6, names: ['Tankia', 'Aurore du Nord'] },
  ferry: { len: 48, v: 7, names: ['Le Passeur', 'Mouette', 'Île-de-Lumière'] },
  péniche: { len: 36, v: 2.4, names: ['La Belle Hélène', 'Espérance', 'Cormoran'] },
  voilier: { len: 10, v: 2.6, names: ['Zéphyr', 'Albatros', 'Brise'] },
  pêcheur: { len: 16, v: 3.2, names: ['Sainte-Anne', 'Le Marsouin', 'Mathilde'] },
};

/**
 * Navires : cargos qui font escale au grand port (accostage, manutention, appareillage en marche arrière puis pivot),
 * navires de passage au large, ferries et voiliers sur les lacs, bateaux de pêche, péniches sur les rivières
 * (entre les ponts). Chaque navire suit un script de tronçons (avant / arrière / pivot / attente). Aucune dépendance à Three.js.
 */
export class Ships {
  readonly ships: Ship[] = [];
  readonly ports: PortState[] = [];
  t = 0;
  private rand: () => number;
  private nextId = 1;

  constructor(private terrain: Terrain, lakes: Lake[], pois: Poi[], roadPts: Pt[], guides: { x: number; z: number; bf?: number }[], seed = 1) {
    const rand = this.rand = rng(seed ^ 0xb0a7), sea = terrain.sea, T = terrain;
    const wet = (x: number, z: number, lv: number) => T.height(x, z) < lv - 0.7;
    /** boucle elliptique (centre, demi-axes, rotation) rétrécie jusqu'à ce que tous ses points soient dans l'eau ; null si impossible */
    const loopIn = (cx: number, cz: number, R: number, ex: number, rot: number, dir: number, lv: number, n = 26): Pt[] | null => {
      for (let tr = 0; tr < 7; tr++, R *= 0.82) {
        const pts: Pt[] = [];
        for (let i = 0; i < n; i++) { const a = dir * (i / n) * Math.PI * 2, px = Math.cos(a) * R, pz = Math.sin(a) * R * ex; pts.push({ x: cx + px * Math.cos(rot) - pz * Math.sin(rot), z: cz + px * Math.sin(rot) + pz * Math.cos(rot) }); }
        if (R > 45 && pts.every((p, i) => wet(p.x, p.z, lv) && wet((p.x + pts[(i + 1) % n].x) / 2, (p.z + pts[(i + 1) % n].z) / 2, lv))) return pts;
      }
      return null;
    };
    pois.filter(p => p.kind === 'port').forEach(p => this.ports.push({ poi: p, busy: -1, work: 0 }));
    // ---- mer
    if (sea) {
      const n: Pt = { x: sea.ux, z: sea.uz }, tg: Pt = { x: -sea.uz, z: sea.ux }, sPos = (A: number, s: number): Pt => ({ x: n.x * (sea.c0 + s) + tg.x * A, z: n.z * (sea.c0 + s) + tg.z * A });
      // navires de passage au large, dans les deux sens
      [[1000, 1], [1180, -1], [1000, -1]].forEach(([s, dir], i) => {
        const kind: ShipKind = i === 2 ? 'pétrolier' : 'cargo', A0 = -dir * 2900, A1 = dir * 2900;
        const sh = this.make(kind, [mkLeg('fwd', [sPos(A0, s), sPos(A1, s)], SPEC[kind].v * (0.9 + rand() * 0.2))], sea.level);
        sh.s = rand() * 5800; sh.loop = true; sh.vanish = true;
      });
      // escales : un cargo par port maritime, un second arrive plus tard
      this.ports.forEach((ps, pi) => {
        if (ps.poi.water !== 'mer') return;
        for (let k = 0; k < 2; k++) this.makeCall(pi, k === 0 ? 'cargo' : 'ferry', k, sea.level);
      });
      // pêcheurs et voiliers qui tournent au large
      for (let k = 0; k < 5; k++) {
        const kind: ShipKind = k < 2 ? 'pêcheur' : 'voilier', A = (rand() * 2 - 1) * 1700, s = 260 + rand() * 280, R = 110 + rand() * 120;
        const c = sPos(A, s), pts = loopIn(c.x, c.z, R, 1 + rand() * 0.5, rand() * 6.28, rand() < 0.5 ? 1 : -1, sea.level); if (!pts) continue;
        const sh = this.make(kind, [mkLeg('fwd', pts, SPEC[kind].v * (0.8 + rand() * 0.4), { closed: true })], sea.level);
        sh.s = rand() * 3000; sh.loop = true;
      }
    }
    // ---- lacs : voiliers qui tournent, ferry du port de plaisance
    lakes.forEach((L, li) => {
      const ns = li === 0 ? 3 : 2;
      for (let k = 0; k < ns; k++) {
        const pts = loopIn(L.x + (rand() - 0.5) * L.r * 0.2, L.z + (rand() - 0.5) * L.r * 0.2, L.r * (0.35 + rand() * 0.25), 0.7 + rand() * 0.3, rand() * 6.28, k % 2 ? 1 : -1, L.level, 24); if (!pts) continue;
        const kind: ShipKind = k === 2 ? 'pêcheur' : 'voilier';
        const sh = this.make(kind, [mkLeg('fwd', pts, SPEC[kind].v * (0.8 + rand() * 0.4), { closed: true })], L.level);
        sh.s = rand() * 2000; sh.loop = true;
      }
      this.ports.forEach((ps, pi) => { if (ps.poi.water === 'lac' && ps.poi.lake === li) this.makeLakeFerry(pi, L); });
    });
    // ---- rivières : péniches entre les ponts
    const cross = roadPts.filter(p => Math.abs(p.x) < 2600);
    const bridgeGuides = guides.filter(g => g.bf);
    T.rivers.forEach(R => {
      // les ponts (arches, aucune pile dans le chenal) laissent passer les péniches : toute la rivière est navigable
      void cross; void bridgeGuides;
      const reach: [number, number] = [0, R.pts.length - 1];
      if ((reach[1] - reach[0]) * 12 <= 260) return;
      const i0 = reach[0] + 8, i1 = reach[1] - 8; if (i1 - i0 < 8) return;
      const nb = Math.max(1, Math.min(3, Math.floor(((i1 - i0) * 12) / 500)));
      for (let ri = 0; ri < nb; ri++) {
        const seg = R.pts.slice(i0, i1 + 1), pts = seg.map(p => ({ x: p.x, z: p.z })), ys = seg.map(p => p.level), rev0 = pts.slice().reverse(), rys = ys.slice().reverse(), v1 = SPEC.péniche.v * (0.8 + rand() * 0.4);
        // circulation à droite : chaque sens longe sa rive (décalage latéral), les péniches se croisent sans se toucher
        const lane = (a: Pt[]) => a.map((p, i) => { const p0 = a[Math.max(0, i - 1)], p1 = a[Math.min(a.length - 1, i + 1)], l = Math.hypot(p1.x - p0.x, p1.z - p0.z) || 1, o = Math.min(9, R.width * 0.2) * Math.min(1, i / 6, (a.length - 1 - i) / 6); return { x: p.x - ((p1.z - p0.z) / l) * o, z: p.z + ((p1.x - p0.x) / l) * o }; });
        const fw = lane(pts), rev = lane(rev0);
        const sh = this.make('péniche', [mkLeg('fwd', fw, v1, { stop: true, ys }), mkLeg('wait', [fw[fw.length - 1]], 0, { dwell: 4 }),
          mkLeg('pivot', [fw[fw.length - 1]], 0.2, { yawTo: Math.atan2(rev[0].x - rev[1].x, rev[0].z - rev[1].z) }),
          mkLeg('fwd', rev, v1, { stop: true, ys: rys }), mkLeg('wait', [rev[rev.length - 1]], 0, { dwell: 4 }),
          mkLeg('pivot', [rev[rev.length - 1]], 0.2, { yawTo: Math.atan2(fw[1].x - fw[0].x, fw[1].z - fw[0].z) })], R.pts[i0].level);
        sh.loop = true; sh.s = (ri / nb) * (pts.length * 12) * 2 + rand() * 60; sh.river = true;
      }
    });
    for (const sh of this.ships) this.place(sh, true);
  }

  private make(kind: ShipKind, legs: Leg[], level: number): Ship {
    const sp = SPEC[kind], rand = this.rand;
    const sh: Ship = { id: this.nextId++, kind, len: sp.len, x: 0, y: level, z: 0, yaw: 0, v: 0, ph: rand() * 6.28, load: kind === 'cargo' ? 0.85 : 0, port: -1, phase: 'mer', legs, li: 0, s: 0, t: 0, loop: false, level, hidden: false, name: sp.names[Math.floor(rand() * sp.names.length)], vanish: false, respawn: 0, river: false };
    this.ships.push(sh); return sh;
  }
  /** Place le navire sur son premier tronçon, à l'abscisse s, avec le bon cap. */
  private place(sh: Ship, init = false) {
    const l = sh.legs[sh.li], q = sample(l, sh.s);
    sh.x = q.x; sh.z = q.z; if (l.ys) sh.y = q.y + 0.05; sh.yaw = Math.atan2(q.hx, q.hz) + (l.mode === 'rev' ? Math.PI : 0);
    sh.v = l.mode === 'fwd' && !l.stop ? l.v : 0; void init;
  }

  /** Escale d'un navire au port `pi` : approche, accostage, manutention, marche arrière, pivot, départ. */
  private makeCall(pi: number, kind: ShipKind, k: number, level: number) {
    const P = this.ports[pi].poi, G = portGeom(P), rand = this.rand, dir = rand() < 0.5 ? 1 : -1, side = k % 2 ? -1 : 1;
    const at = (p: number, q: number): Pt => { const [x, z] = portAt(P, p, q); return { x, z }; };
    const far = (G.approach + 330), lane = (q: number) => at(far, q);
    const P1 = at(G.approach, G.berthQ * side), B = at(G.berthP, G.berthQ * side), v = SPEC[kind].v * (0.9 + rand() * 0.15);
    const exitDir = rand() < 0.5 ? 1 : -1, yawSea = Math.atan2(Math.cos(P.rot), -Math.sin(P.rot) * 0 + Math.sin(P.rot)) ;
    void yawSea;
    // yaw "vers la mer" : p = (cos rot, sin rot) en (x, z) ⇒ cap = atan2(x, z)
    const toSea = Math.atan2(Math.cos(P.rot), Math.sin(P.rot));
    const legs: Leg[] = [
      mkLeg('fwd', [lane(-dir * 2800), lane(-dir * 330)], v),
      mkLeg('fwd', bez(lane(-dir * 330), lane(-dir * 160), at(far - 150, G.berthQ * side), P1), v * 0.8),
      mkLeg('fwd', [P1, B], v * 0.6, { stop: true, port: pi }),
      mkLeg('wait', [B], 0, { dwell: 55 + rand() * 40, port: pi }),
      mkLeg('rev', [B, P1], 1.5, { stop: true, port: pi }),
      mkLeg('pivot', [P1], 0.5, { yawTo: toSea }),
      mkLeg('fwd', bez(P1, at(G.approach + 170, G.berthQ * side), lane(exitDir * 150), lane(exitDir * 330)), v * 0.8),
      mkLeg('fwd', [lane(exitDir * 330), lane(exitDir * 2800)], v),
    ];
    const sh = this.make(kind, legs, level);
    sh.loop = true; sh.vanish = true; sh.s = 0; sh.li = k === 0 ? 1 : 0;   // le premier est déjà en approche, le second arrive après un moment
    if (k === 0) sh.s = legs[1].len * 0.15; else { sh.respawn = 70 + rand() * 40; sh.hidden = true; }
    sh.load = kind === 'cargo' ? 0.9 : 0;
  }

  private makeLakeFerry(pi: number, L: Lake) {
    const P = this.ports[pi].poi, G = portGeom(P), rand = this.rand;
    const at = (p: number, q: number): Pt => { const [x, z] = portAt(P, p, q); return { x, z }; };
    const toLake = Math.atan2(Math.cos(P.rot), Math.sin(P.rot)), side = 1;
    let cross = G.approach + 40;
    for (let d = G.approach + 40; d < Math.min(L.r * 1.7, 470); d += 20) { const [x, z] = portAt(P, d, 0); if (this.terrain.height(x, z) > L.level - 1.2) break; cross = d; }
    if (cross < G.approach + 100) { this.ports[pi].poi.lake = this.ports[pi].poi.lake; return; }
    const P1 = at(G.approach, G.berthQ * side), B = at(G.berthP, G.berthQ * side), far = at(cross, 0), v = SPEC.ferry.v * 0.75;
    const toFar = Math.atan2(at(cross, 0).x - at(G.approach, 0).x, at(cross, 0).z - at(G.approach, 0).z);
    void toFar;
    const legs: Leg[] = [
      mkLeg('fwd', [far, at(G.approach + 60, G.berthQ * side), P1], v),
      mkLeg('fwd', [P1, B], v * 0.5, { stop: true, port: pi }),
      mkLeg('wait', [B], 0, { dwell: 25 + rand() * 15, port: pi }),
      mkLeg('rev', [B, P1], 1.2, { stop: true, port: pi }),
      mkLeg('pivot', [P1], 0.4, { yawTo: toLake }),
      mkLeg('fwd', [P1, far], v, { stop: true }),
      mkLeg('wait', [far], 0, { dwell: 6 }),
      mkLeg('pivot', [far], 0.4, { yawTo: toLake + Math.PI }),
    ];
    const sh = this.make('ferry', legs, L.level); sh.len = 30; sh.loop = true; sh.li = 5; sh.s = 20;
  }

  step(dt: number) {
    this.t += dt;
    for (const sh of this.ships) {
      if (sh.respawn > 0) { sh.respawn -= dt; if (sh.respawn <= 0) { sh.hidden = false; this.restart(sh); } continue; }
      const l = sh.legs[sh.li];
      if (l.mode === 'wait') { sh.v = 0; sh.t += dt; if (sh.t >= l.dwell) this.advance(sh); continue; }
      if (l.mode === 'pivot') {
        const d = angDiff(sh.yaw, l.yawTo); sh.yaw += Math.sign(d) * Math.min(Math.abs(d), 0.13 * dt); sh.v = l.v;
        if (Math.abs(d) < 0.02) this.advance(sh);
        continue;
      }
      // avant / arrière : vitesse limitée par la distance restante si on doit s'arrêter
      const rem = l.len - sh.s, acc = 0.45;
      let vt = l.v; if (l.stop) vt = Math.min(vt, Math.sqrt(2 * acc * Math.max(0, rem - 0.4)) + 0.12);
      sh.v += Math.max(-0.6 * dt, Math.min(acc * dt, vt - sh.v));
      sh.s += sh.v * dt;
      if (!l.closed && sh.s >= l.len - 0.25 && (!l.stop || sh.v < 0.35)) { sh.s = l.len; this.placeOn(sh, l, 1); this.advance(sh); continue; }
      this.placeOn(sh, l, dt);
    }
  }
  private restart(sh: Ship) { sh.li = 0; sh.s = 0; sh.t = 0; this.place(sh); sh.phase = 'mer'; sh.v = sh.legs[0].v; }
  private advance(sh: Ship) {
    sh.li++; sh.s = 0; sh.t = 0;
    if (sh.li >= sh.legs.length) {
      sh.li = sh.loop ? 0 : sh.legs.length - 1;
      if (sh.vanish) { sh.respawn = 4 + this.rand() * 60; sh.hidden = true; this.restart(sh); return; }
    }
    const nl = sh.legs[sh.li];
    sh.phase = nl.mode === 'wait' && nl.port >= 0 ? 'quai' : nl.mode === 'rev' ? 'appareille' : nl.port >= 0 && nl.mode === 'fwd' ? 'accoste' : 'mer';
    this.portHook(sh, nl);
  }
  private placeOn(sh: Ship, l: Leg, dt: number) {
    const q = sample(l, sh.s); sh.x = q.x; sh.z = q.z; if (l.ys) sh.y = q.y + 0.05;
    const want = Math.atan2(q.hx, q.hz) + (l.mode === 'rev' ? Math.PI : 0), d = angDiff(sh.yaw, want);
    sh.yaw += Math.sign(d) * Math.min(Math.abs(d), 0.8 * dt);
  }
  /** Mise à jour de l'état des ports (manutention) selon les navires à quai. */
  private portHook(sh: Ship, l: Leg) {
    if (l.port < 0) return;
    const ps = this.ports[l.port];
    if (l.mode === 'wait') { ps.busy = sh.id; ps.work = 0; sh.port = l.port; }
    else if (l.mode === 'rev') { ps.busy = -1; sh.port = -1; }
  }

  /** Manutention : appelée chaque pas ; fait varier la cargaison des cargos à quai (décharge puis charge). */
  work(dt: number) {
    for (const ps of this.ports) {
      if (ps.busy < 0) { ps.work = 0; continue; }
      ps.work += dt;
      const sh = this.ships.find(s => s.id === ps.busy); if (!sh || sh.kind !== 'cargo') continue;
      const w = ps.work, T = Math.max(20, sh.legs[sh.li].dwell);
      sh.load = w < T * 0.5 ? 0.9 - 0.75 * (w / (T * 0.5)) : 0.15 + 0.75 * Math.min(1, (w - T * 0.5) / (T * 0.5));
    }
  }
  /** Zone du navire à l'écran : y suit la houle. */
  get active() { return this.ships.filter(s => !s.hidden); }
}
