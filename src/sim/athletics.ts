// Le stade d'athlétisme : un programme d'entraînement par jour de la semaine, surtout en fin de journée (jamais la nuit),
// avec course, haies, demi-fond, sauts (longueur, perche, hauteur), lancers (poids, disque, javelot), échauffement et entraîneurs.
// Simulation pure (sans Three.js).
import { Troupe, type Act, type Runner, type Lock } from './athlete';
import { trackAt, laneR, TRACK, weekday, DAYS, type Complex } from './sport';
import { rng } from './cityplan';

export type StationId = 'sprint' | 'haies' | 'fractionne' | 'longueur' | 'perche' | 'hauteur' | 'poids' | 'disque' | 'javelot' | 'echauffement' | 'ecole';
export interface Session { name: string; start: number; end: number; stations: StationId[]; competition?: boolean; kids?: boolean }
/** Programme de la semaine (0 = lundi). Le dimanche, le stade est fermé. */
export const PROGRAM: (Session | null)[] = [
  { name: 'Séance de vitesse', start: 16.2, end: 19.4, stations: ['sprint', 'haies', 'echauffement'] },
  { name: 'Séance de sauts', start: 16.2, end: 19.4, stations: ['longueur', 'perche', 'hauteur', 'echauffement'] },
  { name: 'École d\'athlétisme', start: 15.3, end: 18.2, stations: ['ecole', 'longueur', 'sprint'], kids: true },
  { name: 'Demi-fond et javelot', start: 16.2, end: 19.4, stations: ['fractionne', 'javelot', 'echauffement'] },
  { name: 'Séance de lancers', start: 16.2, end: 19.4, stations: ['poids', 'disque', 'javelot', 'echauffement'] },
  { name: 'Compétition du club', start: 14.4, end: 18.8, stations: ['sprint', 'longueur', 'hauteur', 'echauffement'], competition: true },
  null,
];

/** Emplacements fixes des épreuves (repère local du stade). */
export const ST = {
  gate: { u: 0, v: -66 },
  sprint: { u0: -42.195 - 15.8, len: 100, lanes: [0, 1, 2, 3, 4, 5] },
  haies: { lanes: [1, 2, 3, 4], first: 13, gap: 9.14, n: 8 },
  longueur: { v: -12, start: -34, board: 6, pit: [7.5, 16.5] as [number, number], w: 2.8 },
  perche: { v: 6, start: -36, bar: 2.2, mat: [2.8, 8] as [number, number], w: 5 },
  hauteur: { bar: { u: 31.2, v: 14.8 }, along: { u: -0.52, v: 0.85 }, w: 4, mat: { u: 34.6, v: 17 }, from: [[22, 5], [25.2, 9.6], [28.6, 12.8]] as [number, number][] },
  poids: { u: -60, v: -8, hu: 1, hv: 0.1 },
  disque: { u: 62, v: 6, hu: -1, hv: -0.28 },
  javelot: { u: -36, v: -26 },
  ring: [[90, -51], [90, 51], [-90, 51], [-90, -51]] as [number, number][],
};
const CLUB = [0xd8352f, 0xf2f2f2, 0x2f64b8, 0xf0a020, 0x2f9a58], SHORTS = [0x1c2230, 0x23262e, 0xf2f2f2, 0x1d3f77];
const SKINS = [0xe8c4a0, 0xd9a577, 0xb67f55, 0x8a5a3c, 0xf0cfb0];

export class Athletics {
  readonly troupe: Troupe;
  session: Session | null = null;
  /** projecteurs allumés */
  lights = false;
  private rand: () => number;
  private refills = new Map<Runner, () => Act[]>();
  private locks: Record<string, Lock> = {};
  private lastDay = -1;

  constructor(readonly complex: Complex, seed = 1) {
    this.troupe = new Troupe(complex.f, seed);
    this.rand = rng(seed ^ 0xa7b1e7);
  }

  get athletes() { return this.troupe.runners.map(r => r.a).filter(a => !a.hidden); }
  /** « Séance de vitesse (mardi) » ou `null` hors séance. */
  get caption(): string | null { return this.session ? `${this.session.name} — ${DAYS[this.lastDay]}` : null; }

  /** Un tour de simulation : `hour` heure du monde, `day` jour du monde, météo, `night` 0..1. */
  step(dt: number, hour: number, day: number, rain: number, storm: number, night: number) {
    const wd = weekday(day), P = PROGRAM[wd], on = !!P && hour >= P.start && hour < P.end && rain < 0.55 && storm < 0.3 && night < 0.9;
    if (on && !this.session) { this.session = P; this.lastDay = wd; this.open(P!); }
    else if (!on && this.session) { this.session = null; this.close(); }
    this.lights = !!this.session && night > 0.2;
    for (const [r, f] of this.refills) if (r.idle && !r.a.hidden) r.q.push(...f());
    this.troupe.step(dt);
    for (let i = this.troupe.runners.length - 1; i >= 0; i--) { const r = this.troupe.runners[i]; if (r.a.hidden) { this.refills.delete(r); this.troupe.remove(r); } }
    for (const p of this.troupe.props) if (p.age > 40) p.hidden = true;
    for (let i = this.troupe.props.length - 1; i >= 0; i--) if (this.troupe.props[i].hidden) this.troupe.props.splice(i, 1);
  }

  // ----- ouverture et fermeture -----
  private lock(k: string): Lock { return (this.locks[k] ??= { busy: false }); }
  private mk(u: number, v: number, o: { kid?: boolean; shirt?: number } = {}) {
    const r = this.rand;
    return this.troupe.add(u, v, { shirt: o.shirt ?? CLUB[Math.floor(r() * CLUB.length)], shorts: SHORTS[Math.floor(r() * SHORTS.length)], skin: SKINS[Math.floor(r() * SKINS.length)], scale: o.kid ? 0.72 + r() * 0.1 : 0.96 + r() * 0.1 });
  }
  private spawn(o: { n: number; kid?: boolean; shirt?: number }, f: (r: Runner, i: number) => (() => Act[])) {
    for (let i = 0; i < o.n; i++) {
      const g = ST.gate, r = this.mk(g.u + (this.rand() - 0.5) * 6, g.v - this.rand() * 4, o), fn = f(r, i);
      // la plupart des sportifs sont déjà là (en train de s'entraîner) ; les autres arrivent au portail au fil des minutes
      if (this.rand() < 0.75) { const acts = fn(), first = acts[0], skip = first && first.t === 'go'; if (skip) { r.u = first.u + (this.rand() - 0.5) * 2; r.v = first.v; } else { r.u = (this.rand() - 0.5) * 120; r.v = (this.rand() - 0.5) * 50; } r.q.push({ t: 'wait', dur: this.rand() * 4 }, ...acts.slice(skip ? 1 : 0)); }
      else r.q.push({ t: 'wait', dur: 5 + this.rand() * 90 });
      this.refills.set(r, fn);
    }
  }
  private close() {
    this.refills.clear(); this.locks = {};
    let k = 0;
    for (const r of this.troupe.runners) { r.q.length = 0; if (r.cur && (r.cur.t === 'lock' || r.cur.t === 'unlock')) r.cur = null; r.cur = null; r.a.lift = 0; r.a.roll = 0; r.q.push({ t: 'wait', dur: (k++ % 9) * 1.3 }, { t: 'go', u: ST.gate.u + (this.rand() - 0.5) * 4, v: ST.gate.v, speed: 1.5 }, { t: 'hide' }); }
  }
  /** Le prochain départ d'un groupe : une horloge commune de période `cyc` s, pour que tout le groupe parte ensemble. */
  private nextStart(cyc: number, off: number) { const T = this.troupe.time; return off + Math.ceil((T + 5 - off) / cyc) * cyc; }

  private open(S: Session) {
    const rand = this.rand, T = this.troupe;
    const pick = <A>(l: A[]) => l[Math.floor(rand() * l.length)];
    for (const id of S.stations) {
      switch (id) {
        case 'sprint': {
          const lanes = S.competition ? [0, 1, 2, 3, 4, 5, 6, 7] : ST.sprint.lanes, cyc = S.competition ? 120 : 100;
          this.spawn({ n: S.kids ? 4 : lanes.length, kid: S.kids }, (_r, i) => () => {
            const l = lanes[i], v = -laneR(l), u0 = ST.sprint.u0 + (S.competition ? 0 : 0), at = this.nextStart(cyc, 7), sp = 8.6 + rand() * 1.4 - (S.kids ? 3 : 0);
            return [{ t: 'go', u: u0, v, speed: 1.8 }, { t: 'until', at: at - 9 - rand() * 6, pose: rand() < 0.5 ? 'stretch' : 'stand', face: [1, 0] }, { t: 'until', at: at - 2.5, pose: 'crouch', face: [1, 0] }, { t: 'until', at, pose: 'stand', face: [1, 0], lean: 0.5 },
              { t: 'line', u: u0, v, hu: 1, hv: 0, dist: ST.sprint.len, v0: 1.2, v1: sp }, { t: 'line', u: u0 + ST.sprint.len, v, hu: 1, hv: 0, dist: 16, v0: sp, v1: 2.2 },
              { t: 'go', u: u0 + ST.sprint.len + 8, v: v - 3, speed: 1.4 }, { t: 'go', u: u0, v: v - 3, speed: 1.55 }];
          });
          break;
        }
        case 'haies': {
          const h = ST.haies, cyc = 105;
          const hurdles = Array.from({ length: h.n }, (_, k) => h.first + k * h.gap);
          this.spawn({ n: h.lanes.length }, (_r, i) => () => {
            const l = h.lanes[i], v = laneR(l), at = this.nextStart(cyc, 11);
            const hu = TRACK.straight / 2;
            return [{ t: 'go', u: hu, v, speed: 1.8 }, { t: 'until', at: at - 9 - rand() * 6, pose: 'stretch', face: [-1, 0] }, { t: 'until', at: at - 2.5, pose: 'crouch', face: [-1, 0] }, { t: 'until', at, pose: 'stand', face: [-1, 0], lean: 0.5 },
              { t: 'line', u: hu, v, hu: -1, hv: 0, dist: 83, v0: 1.2, v1: 7.4 + rand() * 0.8, hurdles }, { t: 'go', u: -hu - 12, v: v + 3, speed: 1.4 }, { t: 'go', u: hu, v: v + 3, speed: 1.5 }];
          });
          break;
        }
        case 'fractionne': {
          const cyc = 420;
          this.spawn({ n: 6 }, (_r, i) => () => {
            const lane = i % 2, s0 = -(i >> 1) * 1.2, v = 5.0 + rand() * 0.7, at = this.nextStart(cyc, 9), P = trackAt(lane, s0);
            return [{ t: 'go', u: P.u, v: P.v, speed: 2.2 }, { t: 'until', at, pose: 'stand', face: [P.hu, P.hv], lean: 0.2 }, { t: 'track', lane, s0, dist: 1200, v0: v, v1: v }, { t: 'track', lane: lane + 2, s0: s0 + 1200, dist: 400, v0: 2.6, v1: 2.4 },
              { t: 'go', u: P.u, v: P.v - 3, speed: 1.6 }];
          });
          break;
        }
        case 'longueur': {
          const L = ST.longueur, lock = this.lock('longueur');
          this.spawn({ n: S.kids ? 4 : 3, kid: S.kids }, (_r, _i) => () => {
            const sp = (8.2 + rand() * 0.7) * (S.kids ? 0.7 : 1);
            return [{ t: 'wait', dur: 3 + rand() * 8, pose: 'stretch' }, { t: 'lock', lock }, { t: 'go', u: L.start, v: L.v, speed: 1.8 }, { t: 'wait', dur: 1.6, pose: 'stand', face: [1, 0] },
              { t: 'line', u: L.start, v: L.v, hu: 1, hv: 0, dist: L.board - L.start, v0: 1.5, v1: sp }, { t: 'jump', u0: L.board, v0: L.v, u1: L.board + (S.kids ? 3.2 : 6.1 + rand() * 1.3), v1: L.v, dur: S.kids ? 0.7 : 0.95, apex: 1.0, style: 'long' },
              { t: 'wait', dur: 1.6, pose: 'stand' }, { t: 'unlock', lock }, { t: 'go', u: L.pit[1] + 2, v: L.v - 4.5, speed: 1.3 }, { t: 'go', u: L.start - 4, v: L.v - 5, speed: 1.5 }];
          });
          break;
        }
        case 'perche': {
          const P = ST.perche, lock = this.lock('perche');
          this.spawn({ n: 2 }, () => () => {
            const sp = 8.2 + rand() * 0.8;
            return [{ t: 'wait', dur: 5 + rand() * 12, pose: 'stretch' }, { t: 'lock', lock }, { t: 'go', u: P.start, v: P.v, speed: 1.8 }, { t: 'wait', dur: 2, pose: 'stand', face: [1, 0] },
              { t: 'line', u: P.start, v: P.v, hu: 1, hv: 0, dist: -P.start - 0.4, v0: 1.8, v1: sp }, { t: 'jump', u0: -0.4, v0: P.v, u1: P.mat[0] + 2.6, v1: P.v, dur: 1.6, apex: 4.4 + rand() * 0.5, style: 'pole' },
              { t: 'wait', dur: 2, pose: 'lie' }, { t: 'unlock', lock }, { t: 'go', u: P.mat[1] + 2, v: P.v + 6, speed: 1.3 }, { t: 'go', u: P.start - 3, v: P.v + 4, speed: 1.5 }];
          });
          break;
        }
        case 'hauteur': {
          const H = ST.hauteur, lock = this.lock('hauteur');
          this.spawn({ n: 3 }, () => () => {
            const a = H.from;
            return [{ t: 'wait', dur: 3 + rand() * 10, pose: 'stretch' }, { t: 'lock', lock }, { t: 'go', u: a[0][0], v: a[0][1], speed: 2 }, { t: 'wait', dur: 2.2, pose: 'stand', face: [0.8, 0.5] },
              { t: 'go', u: a[1][0], v: a[1][1], speed: 4.2 }, { t: 'go', u: a[2][0], v: a[2][1], speed: 4.6 },
              { t: 'jump', u0: a[2][0], v0: a[2][1], u1: H.mat.u, v1: H.mat.v - 0.4, dur: 1.05, apex: 1.55 + rand() * 0.35, style: 'flop' }, { t: 'wait', dur: 2.4, pose: 'lie' }, { t: 'unlock', lock },
              { t: 'go', u: H.mat.u + 4, v: H.mat.v + 3, speed: 1.3 }, { t: 'go', u: a[0][0] - 3, v: a[0][1] - 3, speed: 1.5 }];
          });
          break;
        }
        case 'poids': case 'disque': {
          const C = ST[id], lock = this.lock(id), disc = id === 'disque';
          this.spawn({ n: 3 }, () => () => [{ t: 'wait', dur: 2 + rand() * 9, pose: 'stretch' }, { t: 'lock', lock }, { t: 'go', u: C.u, v: C.v, speed: 1.6 }, { t: 'wait', dur: 1.8, pose: 'stand', face: [C.hu, C.hv] },
            { t: 'throw', kind: id, hu: C.hu, hv: C.hv, wind: 1, spin: disc ? 1.5 : 0, speed: disc ? 17 + rand() * 3 : 10.5 + rand() * 2, angle: disc ? 35 : 38 }, { t: 'wait', dur: 2.2, pose: 'stand', face: [C.hu, C.hv] }, { t: 'unlock', lock },
            { t: 'go', u: C.u - C.hu * 5, v: C.v - C.hv * 5 + 4, speed: 1.3 }, { t: 'wait', dur: 3 + rand() * 6, pose: 'stand', face: [C.hu, C.hv] }]);
          break;
        }
        case 'javelot': {
          const J = ST.javelot, lock = this.lock('javelot');
          this.spawn({ n: 3 }, () => () => [{ t: 'wait', dur: 3 + rand() * 10, pose: 'stretch' }, { t: 'lock', lock }, { t: 'go', u: J.u, v: J.v, speed: 1.8 }, { t: 'wait', dur: 1.6, pose: 'stand', face: [1, 0] },
            { t: 'line', u: J.u, v: J.v, hu: 1, hv: 0, dist: 11, v0: 2.5, v1: 5.4 }, { t: 'throw', kind: 'javelot', hu: 1, hv: 0.02, wind: 1, spin: 0, speed: 22 + rand() * 4, angle: 34 }, { t: 'wait', dur: 2.5, pose: 'stand', face: [1, 0] }, { t: 'unlock', lock },
            { t: 'go', u: J.u + 10, v: J.v - 4, speed: 1.4 }, { t: 'go', u: J.u - 3, v: J.v - 3, speed: 1.5 }]);
          break;
        }
        case 'echauffement': {
          const ring = ST.ring;
          this.spawn({ n: 5 }, (_r, i) => () => {
            const out: Act[] = [], k = (i * 2) % ring.length;
            for (let j = 0; j < ring.length; j++) { const p = ring[(k + j) % ring.length]; out.push({ t: 'go', u: p[0], v: p[1], speed: 2.5 + rand() * 0.5 }); if (j === 1) out.push({ t: 'wait', dur: 8 + rand() * 6, pose: 'stretch' }); }
            return out;
          });
          break;
        }
        case 'ecole': {
          this.spawn({ n: 10, kid: true }, (_r, i) => () => {
            const v = -3 + (i % 5) * 1.8, at = this.nextStart(70, 5 + (i >> 2) * 3);
            return [{ t: 'go', u: -30, v, speed: 1.8 }, { t: 'until', at, pose: 'stand', face: [1, 0], lean: 0.3 }, { t: 'line', u: -30, v, hu: 1, hv: 0, dist: 60, v0: 1.5, v1: 4.6 + rand() * 0.8 }, { t: 'go', u: 33, v: v + 3, speed: 1.6 }, { t: 'go', u: -30, v: v + 3, speed: 2.2 }];
          });
          break;
        }
      }
    }
    // entraîneurs (gilet orange) : ils passent d'une épreuve à l'autre
    const spots: [number, number][] = [[-2, -48], [10, -4], [-20, 2], [40, 20], [-52, -14], [0, 40]];
    this.spawn({ n: S.kids ? 3 : 2, shirt: 0xf26a1d }, (_r, i) => () => { const p = pick(spots), q = pick(spots); return [{ t: 'go', u: p[0], v: p[1] + i * 3, speed: 1.3 }, { t: 'wait', dur: 14 + rand() * 20, pose: 'stand', face: [q[0] - p[0], q[1] - p[1]] }]; });
    // public : en compétition, des spectateurs assis dans les tribunes
    if (S.competition) {
      const st = this.complex.stands;
      for (let i = 0; i < 24; i++) {
        const row = Math.floor(rand() * st.rows), u = st.u0 + 6 + rand() * (st.u1 - st.u0 - 12), a = this.mk(u, st.v0 + 1.3 + row * 1.0);
        a.a.pose = 'sit'; a.a.lift = 0.4 + row * 0.5; a.hu = 0; a.hv = -1; a.a.tag = 'public';
      }
    }
    void T;
  }
}
