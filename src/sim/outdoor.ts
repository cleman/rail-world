// Sport en plein air : joggeurs (rues, sentiers, parcs), cyclistes (pistes cyclables des villes, pelotons sur les routes, VTT), cavaliers, rameurs.
// Chaque « mobile » suit un parcours (rues du réseau routier, ou chemins du plan sport) et entraîne éventuellement un groupe qui le suit à la trace.
// Simulation pure (sans Three.js). Les apparitions se font de préférence près de la caméra et jamais sous ses yeux.
import type { RoadEdge } from './roads';
import type { Athlete } from './athlete';
import { densify, jogLevel, bikeLevel, isWeekend, type Pt, type Trail, type RowCourse } from './sport';
import { rng } from './cityplan';

export type MountKind = 'bike' | 'horse' | 'boat' | 'glider' | 'sailplane' | 'tug';
export interface Mount { id: number; kind: MountKind; x: number; y: number; z: number; yaw: number; pitch: number; roll: number; phase: number; v: number; color: number; /** boat : nombre de rameurs ; glider : 1 */ n: number; len: number; hidden: boolean }

export type Kind = 'footing' | 'vélo' | 'peloton' | 'vtt' | 'cavalier' | 'aviron';
export interface Ctx { hour: number; day: number; rain: number; storm: number; night: number; fog?: number; cam: { x: number; z: number } }

interface Place { x: number; y: number; z: number; hx: number; hz: number }
interface Follower { place(lat: number): Place; advance(ds: number): void; len: number }

const TAU = Math.PI * 2;
const SHIRTS = [0xe8453c, 0x2f6fd0, 0xf2c230, 0x39a86b, 0xf2f2f2, 0xee7d2c, 0x8e5bd0, 0x20b8c8];
const NEON = [0xd7ff2e, 0xff8a1f, 0xff4aa0, 0x35e0ff];
const SHORTS = [0x1c2230, 0x23262e, 0x4a4f5c, 0x1d3f77];
const SKINS = [0xe8c4a0, 0xd9a577, 0xb67f55, 0x8a5a3c, 0xf0cfb0];

// ---------------------------------------------------------------------------------------------------------------------------------
// Parcours
// ---------------------------------------------------------------------------------------------------------------------------------
/** Suit le réseau routier : à chaque carrefour, une rue au hasard (de préférence tout droit). `off` : distance au milieu de la chaussée, à droite. */
export class GraphFollower implements Follower {
  e: RoadEdge; s: number; dir: 1 | -1;
  constructor(e: RoadEdge, s: number, dir: 1 | -1, private ok: (e: RoadEdge) => boolean, private off: (e: RoadEdge) => number, private rand: () => number) { this.e = e; this.s = s; this.dir = dir; }
  get len() { return this.e.poly.len; }
  place(lat: number): Place {
    const p = this.e.poly.at(this.s), d = this.dir, o = this.off(this.e) + lat;
    return { x: p.x - p.tz * d * o, y: p.y, z: p.z + p.tx * d * o, hx: p.tx * d, hz: p.tz * d };
  }
  advance(ds: number) {
    let guard = 0;
    this.s += this.dir * ds;
    while (guard++ < 6 && (this.s > this.e.poly.len || this.s < 0)) {
      const over = this.dir > 0 ? this.s - this.e.poly.len : -this.s, node = this.dir > 0 ? this.e.b : this.e.a;
      const p = this.e.poly.at(this.dir > 0 ? this.e.poly.len : 0), hx = p.tx * this.dir, hz = p.tz * this.dir;
      const cand = node.edges.filter(x => x !== this.e && this.ok(x) && x.poly.len > 6);
      if (!cand.length) { this.dir = (this.dir > 0 ? -1 : 1); this.s = this.dir > 0 ? over : this.e.poly.len - over; continue; }
      // préférence pour la direction la moins déviée
      let best = cand[0], bs = -9;
      for (const c of cand) {
        const d: 1 | -1 = c.a === node ? 1 : -1, q = c.poly.at(d > 0 ? 0 : c.poly.len), sc = q.tx * d * hx + q.tz * d * hz + this.rand() * 0.9;
        if (sc > bs) { bs = sc; best = c; }
      }
      this.e = best; this.dir = best.a === node ? 1 : -1; this.s = this.dir > 0 ? over : best.poly.len - over;
    }
  }
}

/** Suit une polyligne (sentier, allée de parc, bassin d'aviron) : en boucle si elle est fermée, sinon en aller-retour. */
export class PathFollower implements Follower {
  private cum: number[] = [0]; private pts: Pt[]; s = 0; dir: 1 | -1 = 1; readonly len: number;
  constructor(pts: Pt[], private closed: boolean, private h: (x: number, z: number) => number, s0 = 0) {
    this.pts = densify(pts, closed, 6); const n = this.pts.length;
    for (let i = 1; i <= (closed ? n : n - 1); i++) { const a = this.pts[i - 1], b = this.pts[i % n]; this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z)); }
    this.len = this.cum[this.cum.length - 1]; this.s = ((s0 % this.len) + this.len) % this.len;
  }
  private at(s: number): Place {
    const n = this.pts.length, m = this.cum.length - 1; let lo = 0, hi = m;
    while (hi - lo > 1) { const k = (lo + hi) >> 1; if (this.cum[k] <= s) lo = k; else hi = k; }
    const a = this.pts[lo % n], b = this.pts[(lo + 1) % n], seg = this.cum[lo + 1] - this.cum[lo] || 1, u = Math.max(0, Math.min(1, (s - this.cum[lo]) / seg));
    return { x: a.x + (b.x - a.x) * u, y: 0, z: a.z + (b.z - a.z) * u, hx: (b.x - a.x) / seg, hz: (b.z - a.z) / seg };
  }
  place(lat: number): Place {
    const p = this.at(this.s), d = this.dir; p.hx *= d; p.hz *= d;
    p.x += -p.hz * lat; p.z += p.hx * lat; p.y = this.h(p.x, p.z); return p;
  }
  advance(ds: number) {
    this.s += this.dir * ds;
    if (this.closed) this.s = ((this.s % this.len) + this.len) % this.len;
    else if (this.s > this.len) { this.s = this.len - (this.s - this.len); this.dir = -1; } else if (this.s < 0) { this.s = -this.s; this.dir = 1; }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Mobiles
// ---------------------------------------------------------------------------------------------------------------------------------
interface Trace { x: number; y: number; z: number; hx: number; hz: number }
export interface Mover {
  id: number; kind: Kind; a: Athlete; m: Mount | null; f: Follower | null; v: number; vt: number; age: number; life: number; lat: number;
  /** membre d'un groupe : meneur, et distance derrière lui (m) */
  lead: Mover | null; gap: number; trace: Trace[]; moved: number; extra: Athlete[]; label: string; dead: boolean;
}

export interface OutdoorDeps {
  edges: RoadEdge[]; trails: Trail[]; rows: RowCourse[]; ground: (x: number, z: number) => number; seed: number;
}

export class Outdoors {
  readonly movers: Mover[] = [];
  private nid = 1; private rand: () => number; private t = 0; private acc = 0;
  private city: RoadEdge[]; private rural: RoadEdge[]; private mid = new Map<RoadEdge, Pt>();
  private jogTrails: Trail[]; private rideTrails: Trail[];
  /** cadences visées, mises à jour toutes les 2 s (consultable par les tests et l'interface) */
  want: Record<Kind, number> = { footing: 0, vélo: 0, peloton: 0, vtt: 0, cavalier: 0, aviron: 0 };
  caption = '';

  constructor(readonly d: OutdoorDeps) {
    this.rand = rng(d.seed ^ 0x0d00a);
    this.city = d.edges.filter(e => !e.render && e.poly.len > 30);
    this.rural = d.edges.filter(e => e.render && e.tier >= 1 && e.poly.len > 60);
    for (const e of d.edges) { const p = e.poly.at(e.poly.len / 2); this.mid.set(e, { x: p.x, z: p.z }); }
    this.jogTrails = d.trails.filter(t => t.kind !== 'accès' || true);
    this.rideTrails = d.trails.filter(t => t.kind === 'sentier' || t.kind === 'parc');
  }
  get athletes(): Athlete[] { const o: Athlete[] = []; for (const m of this.movers) { o.push(m.a); for (const x of m.extra) o.push(x); } return o; }
  get mounts(): Mount[] { const o: Mount[] = []; for (const m of this.movers) if (m.m) o.push(m.m); return o; }
  count(k: Kind) { let n = 0; for (const m of this.movers) if (m.kind === k && !m.lead) n++; return n; }

  private mkAthlete(over: Partial<Athlete> = {}): Athlete {
    const r = this.rand;
    return { id: 9000000 + this.nid++, x: 0, y: 0, z: 0, yaw: 0, pose: 'run', phase: r() * TAU, v: 0, lean: 0, roll: 0, lift: 0, scale: 0.95 + r() * 0.1, shirt: SHIRTS[Math.floor(r() * SHIRTS.length)], shorts: SHORTS[Math.floor(r() * SHORTS.length)], skin: SKINS[Math.floor(r() * SKINS.length)], lamp: false, mount: null, hidden: false, tag: '', ...over };
  }
  private near(p: Pt, cam: { x: number; z: number }) { return Math.hypot(p.x - cam.x, p.z - cam.z); }

  private pickEdge(list: RoadEdge[], cam: { x: number; z: number }, bias = 0.75): RoadEdge | null {
    if (!list.length) return null;
    if (this.rand() < bias) { const nearby = list.filter(e => { const m = this.mid.get(e)!; const d = this.near(m, cam); return d > 70 && d < 700; }); if (nearby.length) return nearby[Math.floor(this.rand() * nearby.length)]; }
    return list[Math.floor(this.rand() * list.length)];
  }
  private pickTrail(list: Trail[], cam: { x: number; z: number }, bias = 0.75): Trail | null {
    if (!list.length) return null;
    if (this.rand() < bias) { const nearby = list.filter(t => { const p = t.pts[Math.floor(t.pts.length / 2)]; const d = this.near(p, cam); return d > 60 && d < 800; }); if (nearby.length) return nearby[Math.floor(this.rand() * nearby.length)]; }
    return list[Math.floor(this.rand() * list.length)];
  }

  // ----- fabrication -----
  private base(kind: Kind, f: Follower | null, a: Athlete, m: Mount | null, vt: number, life: number): Mover {
    const mv: Mover = { id: this.nid++, kind, a, m, f, v: vt, vt, age: 0, life, lat: 0, lead: null, gap: 0, trace: [], moved: 0, extra: [], label: kind, dead: false };
    this.movers.push(mv); return mv;
  }
  private follow(leader: Mover, n: number, gap: number, mk: (i: number) => { a: Athlete; m: Mount | null }, lat: (i: number) => number) {
    // on fait avancer le meneur d'abord pour que les suiveurs aient une trace derrière lui
    const f = leader.f!; for (let d = 0; d < gap * n + 4; d += 0.5) { f.advance(0.5); this.record(leader); }
    for (let i = 1; i <= n; i++) {
      const { a, m } = mk(i); const mv = this.base(leader.kind, null, a, m, leader.vt, leader.life); mv.lead = leader; mv.gap = gap * i; mv.lat = lat(i); mv.label = leader.label;
    }
  }
  private record(mv: Mover) {
    const p = mv.f!.place(mv.lat); const last = mv.trace[mv.trace.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= 0.5) { mv.trace.push({ x: p.x, y: p.y, z: p.z, hx: p.hx, hz: p.hz }); if (mv.trace.length > 160) mv.trace.shift(); }
  }

  spawnJogger(cam: { x: number; z: number }, night: number) {
    const r = this.rand, trail = r() < 0.4 && this.jogTrails.length ? this.pickTrail(this.jogTrails, cam) : null;
    let f: Follower | null = null;
    if (trail) f = new PathFollower(trail.pts, trail.closed, this.d.ground, r() * 2000);
    else { const e = this.pickEdge(this.city, cam); if (!e) return; const dir: 1 | -1 = r() < 0.5 ? 1 : -1; f = new GraphFollower(e, r() * e.poly.len, dir, x => !x.render, x => x.hw + 0.95, r); }
    const dark = night > 0.32, neon = dark || r() < 0.3, shirt = neon ? NEON[Math.floor(r() * NEON.length)] : SHIRTS[Math.floor(r() * SHIRTS.length)];
    const a = this.mkAthlete({ shirt, lamp: dark, tag: 'footing' }), v = 2.5 + r() * 1.2;
    const mv = this.base('footing', f, a, null, v, 120 + r() * 240); mv.label = 'Footing';
    const group = r() < 0.3 ? 1 + (r() < 0.4 ? 1 : 0) : 0;
    if (group) this.follow(mv, group, 1.6, () => ({ a: this.mkAthlete({ shirt: neon ? NEON[Math.floor(r() * NEON.length)] : SHIRTS[Math.floor(r() * SHIRTS.length)], lamp: dark, tag: 'footing' }), m: null }), i => (i % 2 ? 0.9 : -0.9));
  }

  private bikeMount(color: number): Mount { return { id: this.nid++, kind: 'bike', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, phase: 0, v: 0, color, n: 1, len: 1.75, hidden: false }; }
  spawnCyclist(cam: { x: number; z: number }, night: number) {
    const r = this.rand, e = this.pickEdge(this.city, cam); if (!e) return;
    const f = new GraphFollower(e, r() * e.poly.len, r() < 0.5 ? 1 : -1, x => !x.render, x => Math.max(1.4, x.hw - 1.1), r);
    const a = this.mkAthlete({ pose: 'cycle', tag: 'vélo', lamp: false }), mv = this.base('vélo', f, a, this.bikeMount(SHIRTS[Math.floor(r() * SHIRTS.length)]), 4.2 + r() * 2.2, 140 + r() * 260); mv.label = 'Cycliste'; void night;
  }
  spawnPeloton(cam: { x: number; z: number }) {
    const r = this.rand, e = this.pickEdge(this.rural, cam, 0.6); if (!e) return;
    const f = new GraphFollower(e, r() * e.poly.len, r() < 0.5 ? 1 : -1, x => x.render || x.tier >= 1, x => Math.max(1.2, x.hw - 0.9), r);
    const kit = SHIRTS[Math.floor(r() * SHIRTS.length)], v = 7.6 + r() * 2.2, n = 3 + Math.floor(r() * 6);
    const mk = () => ({ a: this.mkAthlete({ pose: 'cycle', shirt: kit, shorts: 0x15171c, tag: 'peloton' }), m: this.bikeMount(0x24262c) });
    const lead = mk(), mv = this.base('peloton', f, lead.a, lead.m, v, 200 + r() * 200); mv.label = 'Peloton';
    this.follow(mv, n - 1, 2.0, mk, i => (i % 2 ? 0.55 : -0.05));
  }
  spawnVtt(cam: { x: number; z: number }) {
    const r = this.rand, t = this.pickTrail(this.rideTrails, cam); if (!t) return;
    const f = new PathFollower(t.pts, t.closed, this.d.ground, r() * 3000), a = this.mkAthlete({ pose: 'cycle', tag: 'vtt', shirt: SHIRTS[Math.floor(r() * SHIRTS.length)] });
    const mv = this.base('vtt', f, a, this.bikeMount(0x2d3a2a), 3.6 + r() * 1.4, 150 + r() * 200); mv.label = 'VTT';
  }
  private horseMount(): Mount { const r = this.rand; return { id: this.nid++, kind: 'horse', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, phase: 0, v: 0, color: [0x6b4528, 0x3b2a1d, 0xa87a4a, 0x2a2a2c, 0x9a9a98][Math.floor(r() * 5)], n: 1, len: 2.4, hidden: false }; }
  spawnRiders(cam: { x: number; z: number }) {
    const r = this.rand, t = this.pickTrail(this.rideTrails, cam); if (!t) return;
    const f = new PathFollower(t.pts, t.closed, this.d.ground, r() * 3000), mk = () => ({ a: this.mkAthlete({ pose: 'ride', tag: 'cavalier', shirt: [0x1d3f77, 0xd8352f, 0x2a2a2c, 0x3f7a4a][Math.floor(r() * 4)], shorts: 0xe8dcc0, lift: 0.05 }), m: this.horseMount() });
    const g = r(), gait = g < 0.3 ? 1.3 + r() * 0.5 : g < 0.65 ? 3.2 + r() * 1.0 : g < 0.85 ? 5.2 + r() * 1.2 : 8 + r() * 2;   // 30 % au pas, 35 % au trot, 20 % au petit galop, 15 % au galop
    const n = 1 + Math.floor(r() * 3), lead = mk(), mv = this.base('cavalier', f, lead.a, lead.m, gait, 200 + r() * 200); mv.label = gait < 2.4 ? 'Cavaliers au pas' : gait < 4.6 ? 'Cavaliers au trot' : gait < 7 ? 'Cavaliers au petit galop' : 'Cavaliers au galop';
    if (n > 1) this.follow(mv, n - 1, 3.4, mk, i => (i % 2 ? 0.5 : -0.2));
  }
  private boatMount(n: number): Mount { return { id: this.nid++, kind: 'boat', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, phase: 0, v: 0, color: [0xf2f2ee, 0xe0b020, 0xd8352f, 0x2f6fd0][Math.floor(this.rand() * 4)], n, len: n === 4 ? 12.5 : n === 2 ? 8.8 : 8.2, hidden: false }; }
  spawnRower(cam: { x: number; z: number }) {
    const r = this.rand, rows = this.d.rows; if (!rows.length) return;
    const near = rows.filter(c => { const d = this.near(c.pts[0], cam); return d < 1400; }), pool = near.length && r() < 0.8 ? near : rows, c = pool[Math.floor(r() * pool.length)];
    const f = new PathFollower(c.pts, c.closed, (x, z) => c.levelAt(x, z), r() * 3000), n = r() < 0.5 ? 1 : r() < 0.5 ? 2 : 4;
    const a = this.mkAthlete({ pose: 'row', tag: 'aviron', shirt: SHIRTS[Math.floor(r() * SHIRTS.length)], shorts: 0x15171c }), m = this.boatMount(n);
    const mv = this.base('aviron', f, a, m, 3.3 + r() * 1.3, 240 + r() * 200); mv.label = n === 4 ? 'Quatre de pointe' : n === 2 ? 'Deux de couple' : 'Skiff';
    for (let i = 1; i < n; i++) { const b = this.mkAthlete({ pose: 'row', tag: 'aviron', shirt: a.shirt, shorts: 0x15171c }); mv.extra.push(b); }
  }

  /** Fait apparaître un sujet de ce genre près de `cam` (boutons « aller voir »). */
  summon(kind: Kind, cam: { x: number; z: number }) {
    const n = this.movers.length;
    if (kind === 'footing') this.spawnJogger(cam, 0); else if (kind === 'vélo') this.spawnCyclist(cam, 0); else if (kind === 'peloton') this.spawnPeloton(cam); else if (kind === 'vtt') this.spawnVtt(cam); else if (kind === 'cavalier') this.spawnRiders(cam); else this.spawnRower(cam);
    return this.movers.length > n ? this.movers[n] : null;
  }
  private kill(mv: Mover) { mv.dead = true; }

  // ----- pas de temps -----
  step(dt: number, c: Ctx) {
    this.t += dt; this.acc += dt;
    const wet = Math.max(c.rain, c.storm), wk = isWeekend(c.day), h = c.hour;
    if (this.acc >= 2) {
      this.acc = 0;
      const jl = jogLevel(h) * (1 - 0.75 * wet) * (c.storm > 0.3 ? 0.2 : 1), bl = bikeLevel(h, wk) * (1 - 0.8 * wet);
      const day = h >= 6.5 && h <= 19.5 && wet < 0.3 ? 1 : 0;
      const rowL = wet > 0.4 || (c.fog ?? 0) > 0.5 ? 0 : Math.max(Math.exp(-((h - 7.2) ** 2) / 1.5), 0.8 * Math.exp(-((h - 18.2) ** 2) / 1.6), wk ? 0.9 * Math.exp(-((h - 10) ** 2) / 4) : 0);
      const ride = day && h >= 8 && h < 19.5 ? (h < 12.5 || h > 14.5 ? 1 : 0.6) : 0, rowAll = wet > 0.4 || (c.fog ?? 0) > 0.5 || h < 6.5 || h > 19.5 ? 0 : Math.max(rowL, wk ? 0.7 : 0.4);
      this.want = { footing: Math.round(14 * jl), vélo: Math.max(day ? 2 : 0, Math.round(16 * bl)), peloton: bl > 0.25 || (day && wk) ? Math.max(1, Math.round((wk ? 3 : 1.6) * bl)) : 0, vtt: Math.max(day ? 1 : 0, Math.round(4 * bl * day)), cavalier: Math.round((wk ? 4 : 2.5) * ride), aviron: this.d.rows.length ? Math.round(Math.min(4, 4 * rowAll)) : 0 };
      const k: Kind[] = ['footing', 'vélo', 'peloton', 'vtt', 'cavalier', 'aviron'];
      for (const kind of k) {
        const have = this.count(kind), w = this.want[kind];
        if (have < w) { for (let i = 0; i < Math.min(3, w - have); i++) { if (kind === 'footing') this.spawnJogger(c.cam, c.night); else if (kind === 'vélo') this.spawnCyclist(c.cam, c.night); else if (kind === 'peloton') this.spawnPeloton(c.cam); else if (kind === 'vtt') this.spawnVtt(c.cam); else if (kind === 'cavalier') this.spawnRiders(c.cam); else this.spawnRower(c.cam); } }
        else if (have > w) { for (const mv of this.movers) if (mv.kind === kind && !mv.lead && mv.age > 30 && this.near(mv.a, c.cam) > 120 && have - this.movers.filter(x => x.dead && x.kind === kind && !x.lead).length > w) { this.kill(mv); break; } }
      }
      // éloignés de la caméra, les plus âgés s'effacent pour réapparaître près d'elle
      for (const mv of this.movers) if (!mv.lead && !mv.dead && mv.age > mv.life && this.near(mv.a, c.cam) > 160) this.kill(mv);
    }
    for (const mv of this.movers) { if (mv.lead) continue; this.stepLeader(mv, dt, c); }
    for (const mv of this.movers) { if (!mv.lead) continue; this.stepMember(mv, dt); }
    for (const mv of this.movers) if (mv.lead?.dead) mv.dead = true;
    for (let i = this.movers.length - 1; i >= 0; i--) if (this.movers[i].dead) this.movers.splice(i, 1);
  }

  private stepLeader(mv: Mover, dt: number, c: Ctx) {
    mv.age += dt; const f = mv.f!;
    // vitesse : on ralentit un peu à la montée, on se laisse aller à la descente (via l'écart de hauteur sur la prochaine foulée)
    const p0 = f.place(mv.lat); f.advance(mv.v * dt); const p = f.place(mv.lat);
    const slope = (p.y - p0.y) / Math.max(0.05, mv.v * dt), k = mv.kind === 'peloton' || mv.kind === 'vélo' || mv.kind === 'vtt' ? 1.2 : 0.5;
    mv.v += (mv.vt * Math.max(0.55, Math.min(1.35, 1 - slope * k)) - mv.v) * Math.min(1, dt * 0.8);
    this.place(mv, mv.a, mv.m, p, dt, 0);
    mv.extra.forEach((b, i) => this.placeExtra(mv, b, i + 1));
    if (mv.kind === 'aviron') this.placeExtra(mv, mv.a, 0);
    this.record(mv);
    if (mv.kind === 'footing') mv.a.lamp = c.night > 0.32 || (c.fog ?? 0) > 0.6;
  }
  private stepMember(mv: Mover, dt: number) {
    const L = mv.lead!, T = L.trace; if (!T.length) return;
    // position continue (interpolée) à `gap` mètres derrière le meneur le long de sa trace : pas de saccades
    const cur = L.f!.place(L.lat); let rest = mv.gap, bx = cur.x, by = cur.y, bz = cur.z, bhx = cur.hx, bhz = cur.hz;
    let q = { x: T[T.length - 1].x, y: T[T.length - 1].y, z: T[T.length - 1].z, hx: T[T.length - 1].hx, hz: T[T.length - 1].hz }; let ax = bx, ay = by, az = bz, ahx = bhx, ahz = bhz;
    let seg = Math.hypot(bx - q.x, bz - q.z), u = 0, found = false;
    // segment courant : de la dernière trace jusqu'au meneur
    if (rest <= seg) { u = 1 - rest / (seg || 1); ax = q.x; ay = q.y; az = q.z; ahx = q.hx; ahz = q.hz; found = true; }
    else rest -= seg;
    let i = T.length - 1;
    while (!found && i > 0) {
      const A = T[i - 1], B = T[i]; seg = Math.hypot(B.x - A.x, B.z - A.z) || 1e-6;
      if (rest <= seg) { u = 1 - rest / seg; q = A as typeof q; bx = B.x; by = B.y; bz = B.z; bhx = B.hx; bhz = B.hz; ax = A.x; ay = A.y; az = A.z; ahx = A.hx; ahz = A.hz; found = true; break; }
      rest -= seg; i--;
    }
    if (!found) { const O = T[0]; ax = bx = O.x; ay = by = O.y; az = bz = O.z; ahx = bhx = O.hx; ahz = bhz = O.hz; u = 0; }
    let hx = ahx + (bhx - ahx) * u, hz = ahz + (bhz - ahz) * u; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const x = ax + (bx - ax) * u, z = az + (bz - az) * u;
    const p: Place = { x: x - hz * mv.lat, y: ay + (by - ay) * u, z: z + hx * mv.lat, hx, hz };
    mv.v = L.v; mv.vt = L.vt; mv.a.lamp = L.a.lamp;
    this.place(mv, mv.a, mv.m, p, dt, mv.gap);
  }
  private placeExtra(mv: Mover, b: Athlete, i: number) {
    const m = mv.m!, cs = Math.cos(m.yaw), sn = Math.sin(m.yaw), n = m.n, off = ((n - 1) / 2 - i) * 1.1;
    b.z = m.z + cs * off; b.x = m.x + sn * off; b.lift = 0.02; b.y = m.y + b.lift; b.yaw = m.yaw + Math.PI; b.phase = mv.a.phase; b.v = mv.a.v; b.pose = 'row'; b.lift = 0.02; b.lean = mv.a.lean;
  }

  /** Place le sportif (et sa monture) sur le point `p` du parcours et règle sa pose selon la vitesse. */
  private place(mv: Mover, a: Athlete, m: Mount | null, p: Place, dt: number, gap: number) {
    const yaw = Math.atan2(p.hx, p.hz), v = mv.v; void gap;
    a.x = p.x; a.z = p.z; a.y = p.y; a.v = v;
    // lacet lissé
    let d = yaw - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); a.yaw += d * Math.min(1, Math.max(dt, 0.016) * 10); if (!Number.isFinite(a.yaw)) a.yaw = yaw;
    switch (mv.kind) {
      case 'footing': a.pose = 'run'; a.phase += Math.max(dt, 0.016) * TAU * (1.3 + 0.19 * v); a.lean = Math.min(0.2, 0.04 + 0.025 * v); break;
      case 'vélo': case 'peloton': case 'vtt': {
        a.pose = 'cycle'; a.phase += Math.max(dt, 0.016) * (1.3 + 0.55 * v); a.lean = mv.kind === 'peloton' ? 0.25 : 0; a.lift = 0;
        if (m) { m.x = p.x; m.y = p.y; m.z = p.z; m.yaw = a.yaw; m.phase += Math.max(dt, 0.016) * v / 0.34; m.v = v; m.roll = 0; }
        break;
      }
      case 'cavalier': {
        a.pose = 'ride'; const rate = v < 2.4 ? 0.9 + 0.9 * v : v < 4.6 ? 3 + 0.6 * v : v < 7 ? 4.5 + 0.35 * v : 5 + 0.3 * v; a.phase += Math.max(dt, 0.016) * rate; a.lean = 0.0;
        if (m) { m.x = p.x; m.y = p.y; m.z = p.z; m.yaw = a.yaw; m.phase += Math.max(dt, 0.016) * rate; m.v = v; }
        a.lift = 0.16 + (v > 4.6 ? (v > 7 ? 0.12 : 0.07) * Math.abs(Math.sin(a.phase)) : 0.03 * Math.abs(Math.sin(a.phase * 0.5)));
        break;
      }
      case 'aviron': {
        a.pose = 'row'; a.lift = 0.02; const rate = 2.8 + 0.1 * v; a.phase += Math.max(dt, 0.016) * rate; a.lean = 0.0;
        if (m) { m.x = p.x; m.y = p.y; m.z = p.z; m.yaw = yaw; m.phase = a.phase; m.v = v; m.roll = 0.02 * Math.sin(a.phase); } a.yaw = yaw + Math.PI;
        break;
      }
    }
    a.y = p.y + a.lift;
  }
}
