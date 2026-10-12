import * as THREE from 'three';
import type { World, Train } from './sim/world';
import { distToStop, CameraRig, type RigKind } from './rigs';
import type { Poi } from './sim/pois';
import type { Fauna } from './sim/fauna';
import type { Ships } from './sim/boats';
import type { Crossing } from './sim/roads';
import type { Zone } from './sim/terrain';
import { orbitShot, fixedShot, followShot, type FreeShot, type Cand } from './shots';
import type { Vehicle } from './sim/traffic';

export type ViewKind = RigKind | 'cinéma';

export interface DirectorHooks {
  setTrain(i: number): void;
  setView(kind: ViewKind): void;
  selected(): number;
  /** Intérêt supplémentaire d'un train (franchissement d'un pont, entrée de tunnel...), 0 par défaut. */
  interest?(t: Train): number;
}
/** Ce que le réalisateur sait du monde pour trouver des événements à filmer. */
export interface DirectorScene {
  pois: Poi[]; fauna: Fauna; ships?: Ships; crossings: Crossing[]; zones: Zone[];
  ground(x: number, z: number): number;
  hour(): number;
  night(): number;
  /** Bus en circulation (pour les plans « dans les rues »). */
  buses?(): Vehicle[];
  /** Météo : niveaux de pluie, brouillard, orage (0..1). */
  weather?(): { rain: number; fog: number; storm: number };
  /** Réseau de tram (plans aux arrêts, portraits, poursuite, cabine). */
  tram?: TramScene;
  /** Ponts et portails de tunnel (plans d'approche). */
  spots?: RailSpot[];
  /** État du ciel (éclipses, aurore, comète, arc-en-ciel, lune, étoiles filantes) pour les plans du ciel. */
  sky?(): SkyInfo;
  /** Sport : le stade (séance en cours ?) et des sujets à suivre (saut, lancer, peloton, aviron, parapente, cavalier, joggeur, match). */
  sport?(): SportInfo;
}
export interface SportThing { kind: 'saut' | 'lancer' | 'peloton' | 'aviron' | 'parapente' | 'planeur' | 'cavalier' | 'footing' | 'match'; key: string; label: string; pos(): Vec }
export interface SportInfo { stadium: { x: number; y: number; z: number; session: string; lit: boolean } | null; things: SportThing[] }
type Vec = { x: number; y: number; z: number };
export interface SkyInfo { solar: number; lunar: number; aurora: number; comet: number; rainbow: number; moonUp: number; moonLit: number; starVis: number; sunDir: Vec; moonDir: Vec; cometDir: Vec; meteorDirs: Vec[] }

/** Point remarquable de la voie (milieu d'un pont, entrée ou sortie d'un tunnel) pour les plans d'approche. */
export interface RailSpot { kind: 'bridge' | 'portal'; x: number; y: number; z: number }
export interface TramLike { x: number; y: number; z: number; yaw: number; v: number; active: boolean; state: string; name: string; dwell: number; line: { loop: boolean; hw: number } }
export interface TramScene { trams: TramLike[]; nextStop(t: never): { x: number; y: number; z: number; tx: number; tz: number; d: number } | null }

/** Part visée du temps d'écran par famille de plans : trains et trams d'abord, le reste en proportion. */
const TARGET: Record<string, number> = { train: 0.26, rail: 0.15, tram: 0.16, ville: 0.07, sport: 0.07, eau: 0.06, lieu: 0.06, faune: 0.06, ciel: 0.07, bus: 0.03, météo: 0.03 };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Réalisateur de la « télé d'ambiance ». À chaque coupe il dresse la liste des plans possibles :
 *  - un plan par train (caméra choisie selon ce que fait le train : sortie du dépôt, arrêt en gare, vitesse...),
 *  - des plans d'événements (passage à niveau fermé, croisement de deux trains, vol d'avion...),
 *  - des plans de lieux (villes, points d'intérêt, troupeaux, bateaux, ciel),
 * leur donne une note (heure du jour, nouveauté, hasard) et garde le meilleur. Les plans se succèdent avec un fondu,
 * un événement important peut couper un plan ordinaire, et les répétitions (même type, même sujet) sont pénalisées.
 */
export class Director {
  enabled = false;
  fade = 0;                                    // 0 = image visible, 1 = noir
  /** Caméra des plans libres. */
  readonly cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 5000);
  /** Point regardé par le plan libre en cours (centre de l'ombre du soleil). */
  readonly focus = new THREE.Vector3();
  free: FreeShot | null = null;
  private doneAt = 0; private shown: Record<string, number> = {};
  /** Les bateaux sont lents : pendant un plan sur l'eau on accélère leur simulation (1 = normal). */
  get shipSpeed() { return this.cur?.shipSpeed ?? 1; }
  private start = 0; private dur = 12; private lastNow = 0; private lastScan = 0;
  private lastTrain = -1; private cur: Cand | null = null; private lastEvent = -1e9;
  private cutNo = 0; private lastCutOf = new Map<string, number>();
  private recentCats: string[] = []; private recentKeys: string[] = []; private recentKinds: RigKind[] = [];
  caption = '';
  /** Rythme : 1 = normal, 2 = plans deux fois plus courts, 0,5 = deux fois plus longs. */
  pace = 1;
  /** Dernier plan choisi, pour les tests et l'affichage. */
  /** Famille du plan en cours (budget de temps d'écran). */
  get fam() { return this.cur ? (this.cur.fam ?? this.cur.cat) : ''; }
  get shot() { return this.cur ? `${this.cur.cat}:${this.cur.key}` : ''; }

  constructor(private world: World, private hooks: DirectorHooks, private scene?: DirectorScene) {}

  setAspect(a: number) { if (Math.abs(this.cam.aspect - a) > 1e-3) { this.cam.aspect = a; this.cam.updateProjectionMatrix(); } }

  enable(on: boolean, now: number) {
    this.enabled = on; this.fade = 0; this.lastNow = now;
    if (on) this.cut(now); else { this.free = null; this.cur = null; }
  }

  /** Secondes écoulées depuis le début du plan. */
  since(now: number) { return now - this.start; }

  update(now: number) {
    if (!this.enabled) return;
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow)); this.lastNow = now; void dt;
    const left = this.start + this.dur - now, since = now - this.start;
    const t = this.world.trains[this.hooks.selected()];
    if (left <= 0 || (!this.free && (!t || t.status === 'stored'))) { this.cut(now); return; }
    // plan à durée variable : on laisse l'action se terminer (train arrêté, passage à niveau rouvert...) puis un court temps de respiration
    const cu = this.cur;
    if (cu?.until) {
      if (!this.doneAt && since >= (cu.min ?? 6) && cu.until()) this.doneAt = now;
      if (this.doneAt && now >= this.doneAt + (cu.tail ?? 3)) { this.cut(now); return; }
    }
    // un événement important peut interrompre un plan ordinaire
    if (since > 5 && now - this.lastScan > 1) {
      this.lastScan = now;
      const ev = now - this.lastEvent > 30 ? this.events().map(e => ({ ...e, score: e.score + this.budget(e) })).sort((a, b) => b.score - a.score)[0] : undefined;
      if (ev && ev.score >= (this.cur?.until && !this.doneAt ? 8.5 : 5) && ev.key !== this.cur?.key) { this.apply(ev, now); return; }
    }
    this.fade = Math.max(0, 1 - since / 0.5, 1 - left / 0.5);
    if (this.free) { this.free.place(this.cam, since); this.focus.copy(this.free.target()); }
  }

  // ---------- candidats ----------
  private sunset() { const h = this.scene?.hour() ?? 12; return (h > 17 && h < 20.8) || (h > 5.2 && h < 8) ? 1 : 0; }

  private trainScore(t: Train, i: number): number {
    let s = 3.2 + Math.random() * 1.5;
    if (t.status === 'leaving' || t.status === 'returning') s += 2.5;
    if (t.state === 'dwell') s += 2;
    if (t.v > 20) s += 1;
    if (t.state === 'signal') s -= 0.5;
    if (i === this.lastTrain) s -= 2;
    const dd = distToStop(t); if (dd !== null && dd > 60 && dd < 420 && t.v > 2) s += 2.2; if (t.state === 'dwell' && t.dwell < 7) s += 1.2;
    s += this.hooks.interest?.(t) ?? 0;
    return s;
  }

  private pickKind(t: Train): RigKind {
    const night = this.scene?.night() ?? 0, sun = this.sunset(), wx = this.scene?.weather?.() ?? { rain: 0, fog: 0, storm: 0 };
    const dd0 = distToStop(t);
    if (dd0 !== null && dd0 > 60 && dd0 < 420 && t.v > 2 && Math.random() < 0.8 && this.recentKinds[0] !== 'quai') return 'quai';                // arrivée en gare, vue du quai
    if (t.state === 'dwell' && t.dwell < 7 && Math.random() < 0.55 && this.recentKinds[0] !== 'quai') return 'quai';                          // départ de gare
    const W: Partial<Record<RigKind, number>> = (t.status === 'leaving' || t.status === 'returning')
      ? { drone: 0.35, aérienne: 0.25, lointain: 0.2, poursuite: 0.2 }
      : t.state === 'dwell' ? { 'bord de voie': 0.28, passager: 0.18, poursuite: 0.2, drone: 0.34 }
      : { cabine: 0.17, 'bord de voie': 0.14, poursuite: 0.2, passage: 0.2, lointain: 0.17, drone: 0.12, aérienne: 0.05 };
    if (sun) { if (W.lointain) W.lointain *= 1.8; if (W.drone) W.drone *= 1.4; }
    if (night > 0.5) { if (W.lointain) W.lointain *= 0.3; if (W.passage) W.passage *= 1.4; if (W.cabine) W.cabine *= 1.5; }
    if (wx.fog > 0.5) { if (W.lointain) W.lointain *= 0.15; if (W.drone) W.drone *= 0.4; if (W.cabine) W.cabine *= 1.6; }
    if (wx.rain > 0.5 && W.passage) W.passage *= 1.4;
    let tot = 0; const e = Object.entries(W) as [RigKind, number][];
    const w = e.map(([k, v]) => { const x = v * (k === this.recentKinds[0] ? 0.15 : this.recentKinds.includes(k) ? 0.5 : 1); tot += x; return x; });
    let r = Math.random() * tot;
    for (let i = 0; i < e.length; i++) { r -= w[i]; if (r <= 0) return e[i][0]; }
    return e[0][0];
  }

  /** Plans d'événements : ils ne dépendent que de ce qui se passe maintenant. */
  private events(): Cand[] {
    const S = this.scene, out: Cand[] = []; if (!S) return out;
    const live = this.world.trains.map((t, i) => ({ t, i })).filter(x => x.t.status !== 'stored');
    // passage à niveau fermé : le train arrive
    for (const c of S.crossings) {
      if (!c.closed || c.closedT < 2 || c.closedT > 25) continue;
      const side = c.id % 2 ? 1 : -1, bx = c.x + c.rx * 26 * side - c.rz * 9, bz = c.z + c.rz * 26 * side + c.rx * 9;
      out.push({ cat: 'événement', fam: 'rail', key: `pn${c.id}`, score: 5.5 + Math.random(), dur: 50, min: 10, tail: 3, until: () => !c.closed, free: fixedShot({ label: 'Passage à niveau', pos: V(bx, S.ground(bx, bz) + 4.5, bz), target: () => V(c.x, c.y + 2, c.z), fov: 48, dur: 50, ground: S.ground }) });
    }
    // deux trains qui se croisent
    for (const a of live) for (const b of live) {
      if (a.i >= b.i) continue;
      const pa = a.t.pointAt(0), pb = b.t.pointAt(0), d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
      if (d > 140 || a.t.v < 4 || b.t.v < 4 || pa.tx * pb.tx + pa.tz * pb.tz > -0.3) continue;
      const ta = a.t, tb = b.t;
      out.push({ cat: 'événement', fam: 'rail', key: `cx${a.i}-${b.i}`, score: 5 + Math.random(), dur: 10, free: orbitShot({ label: 'Croisement de deux trains', target: () => { const x = ta.pointAt(0), y = tb.pointAt(0); return V((x.x + y.x) / 2, (x.y + y.y) / 2, (x.z + y.z) / 2); }, radius: [48, 60], height: [22, 30], speed: 0.16, fov: 55, dur: 10, ground: S.ground }) });
    }
    // faune qui réagit : troupeau qui fuit le train, oiseaux qui s'envolent
    const fleeing = new Set<number>(); for (const a of S.fauna.animals) if (a.fear > 0) fleeing.add(a.herd);
    for (const hi of fleeing) {
      const h = S.fauna.herds[hi], mine = S.fauna.animals.filter(a => a.herd === hi), ang = Math.random() * 6.28, px = h.x + Math.cos(ang) * (h.r + 30), pz = h.z + Math.sin(ang) * (h.r + 30);
      out.push({ cat: 'événement', fam: 'faune', key: `fuite${hi}`, score: 4.6 + Math.random(), dur: 9, free: fixedShot({ label: h.kind === 'vache' ? 'Les vaches fuient le train' : 'Les moutons fuient le train', pos: V(px, S.ground(px, pz) + 2.4, pz), target: () => { let x = 0, z = 0; for (const a of mine) { x += a.x; z += a.z; } return V(x / mine.length, S.ground(h.x, h.z) + 1, z / mine.length); }, fov: 40, dur: 9, drift: 0.5, ground: S.ground }) });
    }
    const flying = S.fauna.perched.find(b => b.state === 'vol' && b.t < 4);
    if (flying) { const g = flying.group, fl = S.fauna.perched.filter(b => b.group === g); out.push({ cat: 'événement', fam: 'faune', key: `envol${g}`, score: 4.4 + Math.random(), dur: 8, free: orbitShot({ label: "Envol d'oiseaux", target: () => { let x = 0, y = 0, z = 0; for (const b of fl) { x += b.x; y += b.y; z += b.z; } return V(x / fl.length, y / fl.length + 3, z / fl.length); }, radius: [22, 30], height: [3, 8], speed: 0.1, fov: 45, dur: 8, ground: S.ground }) }); }
    // avions : approche, atterrissage, décollage, passage bas ; l'hydravion sur l'eau
    for (const a of S.fauna.aircraft) {
      if (a.phase === 'croisière' || a.phase === 'parqué' || a.phase === 'montée') continue;
      const nm = a.kind === 'hydravion' ? 'Hydravion' : a.name === 'Biplan' ? 'Biplan' : 'Avion', gy = a.o.y0, c = Math.cos(a.o.Y0), sn = Math.sin(a.o.Y0);
      const at = (p: number, q: number, h: number) => { const x = a.o.cx + sn * p + c * q * a.o.sgn, z = a.o.cz + c * p - sn * q * a.o.sgn; return V(x, Math.max(gy + h, S.ground(x, z) + 1.8), z); };
      const label = a.phase === 'approche' ? `${nm} : approche` : a.phase === 'roulage' ? `${nm} : atterrissage` : a.phase === 'décollage' ? `${nm} : décollage` : `${nm} : passage bas`;
      const base = 4.3 + Math.random() * 0.9 + (a.kind === 'hydravion' ? 0.5 : 0);
      const pos = a.phase === 'approche' ? at(-330, 26, 3.5) : a.phase === 'décollage' ? at(380, -30, 2.5) : a.phase === 'passage bas' ? at(0, 45, 2.5) : at(60, 36, 2.5);
      const plan = Math.random(), landing = a.phase === 'approche' || a.phase === 'roulage', dyn = landing ? { dur: 55, min: 14, tail: 3, until: () => a.mode === 'parqué' } : a.phase === 'décollage' ? { dur: 45, min: 12, tail: 3, until: () => a.phase === 'montée' || a.alt > 45 } : { dur: 11, min: undefined, tail: undefined, until: undefined };
      const evc = (o: Partial<Cand>, score: number, free: FreeShot) => out.push({ cat: 'événement', fam: 'ciel', key: `av-${a.name}-${a.phase}`, score, dur: dyn.dur, min: dyn.min, tail: dyn.tail, until: dyn.until, free, ...o });
      if (plan < 0.4) evc({}, base, fixedShot({ label, pos, target: () => V(a.x, a.y + 1.2, a.z), fov: a.phase === 'approche' ? 30 : 38, dur: dyn.dur, drift: 0.2, ground: S.ground }));
      else if (plan < 0.7) evc({}, base, followShot({ label: `${label} (en poursuite)`, subject: () => a, offset: [6, 3.2, -19], look: [0, 0.5, 30], fov: 55, dur: dyn.dur, ground: S.ground, sway: 0.25 }));
      else evc({}, base - 0.2, followShot({ label: `${label} (cockpit)`, subject: () => a, offset: [0, 1.5, 2.8], look: [0, 0.4, 90], fov: 72, dur: dyn.dur, ground: S.ground, sway: 0.12 }));
    }
    if (S.spots) out.push(...this.spotShots(S));
    if (S.tram) out.push(...this.tramEvents(S));
    if (S.sky) out.push(...this.skyShots(S, true));
    // orage : éclairs sur la ville
    const wx = S.weather?.();
    if (wx && wx.storm > 0.7) { const z = S.zones.find(q => q.kind === 'city'); if (z) out.push({ cat: 'événement', fam: 'météo', key: 'orage', score: 4.2 + Math.random(), dur: 11, free: orbitShot({ label: `Orage sur ${z.name ?? 'la ville'}`, target: () => V(z.x, z.y + 20, z.z), radius: [z.r * 0.9, z.r * 0.8], height: [60, 90], speed: 0.03, fov: 58, dur: 11, ground: S.ground }) }); }
    return out;
  }

  /** Plans de lieux et de décor. */
  private places(): Cand[] {
    const S = this.scene, out: Cand[] = []; if (!S) return out;
    const night = S.night(), sun = this.sunset(), wx = S.weather?.() ?? { rain: 0, fog: 0, storm: 0 }, drama = wx.storm * 0.9 + wx.fog * 0.3;
    // villes vues du ciel
    for (const z of S.zones) if (z.kind === 'city') {
      out.push({ cat: 'ville', key: z.name ?? 'ville', score: 1.7 + night * 1.1 + drama + Math.random() * 0.8, dur: 12, free: orbitShot({ label: `Survol de ${z.name ?? 'la ville'}`, target: () => V(z.x, z.y, z.z), radius: [z.r * 0.6, z.r * 0.45], height: [150, 95], speed: 0.05, fov: 55, dur: 12, ground: S.ground }) });
    }
    // dépôt vu du ciel (plus beau quand une rame en sort)
    const leaving = this.world.trains.some(t => t.status === 'leaving' || t.status === 'returning');
    for (const z of S.zones) if (z.kind === 'depot') out.push({ cat: 'ville', key: 'dépôt', score: 1.4 + (leaving ? 1.8 : 0) + Math.random() * 0.8, dur: 11, free: orbitShot({ label: 'Survol du dépôt', target: () => V(z.x, z.y, z.z), radius: [Math.max(70, z.r * 0.5), Math.max(55, z.r * 0.38)], height: [75, 45], speed: 0.08, fov: 55, dur: 11, ground: S.ground }) });
    // dans les rues, avec un bus
    const buses = S.buses?.() ?? [];
    if (buses.length) { const b = buses[Math.floor(Math.random() * buses.length)]; out.push({ cat: 'bus', key: `bus${b.id}`, score: 1.1 + Math.random() * 0.7 + night * 0.4, dur: 10, free: orbitShot({ label: 'Dans les rues', target: () => V(b.x, b.y + 1.6, b.z), radius: [16, 22], height: [6, 9], speed: 0.16, fov: 55, dur: 10, ground: S.ground }) }); }
    // points d'intérêt
    for (const p of S.pois) {
      const bonus = p.kind === 'phare' ? night * 2.2 : p.kind === 'château' ? sun * 1.2 + 0.4 : p.kind === 'moulin' ? (1 - night) * 0.6 : 0.2;
      const o = p.kind === 'château' ? { r: [150, 100] as [number, number], h: [28, 75] as [number, number], s: 0.06 } : p.kind === 'phare' ? { r: [62, 50] as [number, number], h: [30, 16] as [number, number], s: 0.09 }
        : p.kind === 'ruine' ? { r: [75, 55] as [number, number], h: [26, 16] as [number, number], s: 0.07 }
        : p.kind === 'aérodrome' ? { r: [210, 150] as [number, number], h: [70, 40] as [number, number], s: 0.04 } : p.kind === 'port' ? { r: [90, 65] as [number, number], h: [40, 22] as [number, number], s: 0.06 } : { r: [44, 34] as [number, number], h: [14, 10] as [number, number], s: 0.1 };
      out.push({ cat: 'lieu', key: p.name, score: 1.5 + bonus + drama + Math.random() * 0.8, dur: 11, free: orbitShot({ label: p.name, target: () => V(p.x, p.y + (p.kind === 'phare' ? 20 : p.kind === 'château' ? 12 : 6), p.z), radius: o.r, height: o.h, speed: o.s, fov: 52, dur: 11, ground: S.ground }) });
    }
    // faune : troupeaux (mieux s'il y a un train à côté), bateau, voilier, nuée, avion, montgolfière
    const heads = this.world.trains.filter(t => t.status !== 'stored').map(t => t.pointAt(0));
    for (const [hi, h] of S.fauna.herds.entries()) {
      const near = heads.some(p => Math.hypot(p.x - h.x, p.z - h.z) < 380), mine = S.fauna.animals.filter(a => a.herd === hi);
      if (!mine.length) continue;
      const ang = Math.random() * 6.28, px = h.x + Math.cos(ang) * (h.r + 24), pz = h.z + Math.sin(ang) * (h.r + 24);
      out.push({ cat: 'faune', key: `herd${hi}`, score: 1.2 + (near ? 2.3 : 0) + Math.random() * 0.8, dur: 10, free: fixedShot({ label: h.kind === 'vache' ? 'Vaches au pré' : 'Moutons au pré', pos: V(px, S.ground(px, pz) + 2.2, pz), target: () => { let x = 0, z = 0; for (const a of mine) { x += a.x; z += a.z; } return V(x / mine.length, S.ground(h.x, h.z) + 1, z / mine.length); }, fov: 42, dur: 10, drift: 0.6, ground: S.ground }) });
    }
    out.push(...this.waterShots(S, night, sun));
    out.push(...this.tramShots(S, night, sun));
    out.push(...this.sportShots(S, night));
    const f0 = S.fauna.flocks[Math.floor(Math.random() * S.fauna.flocks.length)];
    if (f0) { const o = { x: 0, y: 0, z: 0, yaw: 0, flap: 0 }; out.push({ cat: 'ciel', key: 'oiseaux', score: 1.1 + (1 - night) * 0.4 + Math.random() * 0.8, dur: 9, free: orbitShot({ label: "Vol d'oiseaux", target: () => { S.fauna.bird(f0, 0, o); return V(o.x, o.y, o.z); }, radius: [34, 26], height: [4, 8], speed: 0.1, fov: 45, dur: 9, ground: S.ground }) }); }
    const B = S.fauna.balloon;
    const af = S.pois.find(p => p.kind === 'aérodrome');
    for (const a of S.fauna.aircraft) {
      if (!af || Math.hypot(a.x - af.x, a.z - af.z) > 1100) continue;   // les avions en croisière ne se voient qu'en l'air : on ne les filme qu'autour de la piste
      const nm = a.kind === 'hydravion' ? 'Hydravion' : a.name === 'Biplan' ? 'Biplan' : 'Avion de tourisme';
      out.push({ cat: 'ciel', key: `ciel-${a.name}`, score: 1.2 + night * 0.6 + Math.random() * 0.9 + (a.kind === 'hydravion' ? 0.3 : 0), dur: 10, free: orbitShot({ label: nm, target: () => V(a.x, a.y, a.z), radius: [70, 90], height: [10, 22], speed: 0.11, fov: 38, dur: 10, ground: S.ground }) });
      out.push({ cat: 'ciel', key: `bord-${a.name}`, score: 1.0 + Math.random() * 0.9, dur: 10, free: followShot({ label: `À bord : ${nm.toLowerCase()}`, subject: () => a, offset: [-1.6, 1.3, 1.5], look: [-80, -22, 40], fov: 68, dur: 10, ground: S.ground, sway: 0.2 }) });
    }
    if (false as boolean) { const P = S.fauna.plane; out.push({ cat: 'ciel', key: 'avion', score: 1.2 + night * 1.2 + Math.random() * 0.8, dur: 10, free: orbitShot({ label: 'Avion de tourisme', target: () => V(P.x, P.y, P.z), radius: [70, 90], height: [10, 22], speed: 0.11, fov: 38, dur: 10, ground: S.ground }) }); }
    const LN = S.fauna.liner;
    if (LN.active && night < 0.8) out.push({ cat: 'ciel', key: 'ligne', score: 2.2 + (1 - night) * 0.8 + Math.random() * 0.8, dur: 12, free: orbitShot({ label: 'Avion de ligne et sa traînée', target: () => V(LN.x, LN.y, LN.z), radius: [1100, 800], height: [-360, -300], speed: 0.01, fov: 26, dur: 12, ground: S.ground }) });
    if (S.sky) out.push(...this.skyShots(S, false));
    if (night < 0.5) out.push({ cat: 'ciel', key: 'ballon', score: 1.5 + sun * 0.8 + Math.random() * 0.8, dur: 11, free: orbitShot({ label: 'Montgolfière', target: () => V(B.x, B.y + 6, B.z), radius: [55, 70], height: [-6, 14], speed: 0.07, fov: 50, dur: 11, ground: S.ground }) });
    return out;
  }

  /** Plans du ciel : éclipses, aurore, comète, arc-en-ciel, étoiles filantes (événements) ; pleine lune, lever et coucher de soleil, ciel étoilé (plans d'ambiance). La caméra est posée près du train suivi, un peu de paysage au bas du cadre. */
  /** Plans sportifs : le stade pendant une séance (surtout sous les projecteurs), un saut ou un lancer, un peloton, un bateau d'aviron, un parapente, des cavaliers, un joggeur à la frontale, un match. */
  private sportShots(S: DirectorScene, night: number): Cand[] {
    const out: Cand[] = [], sp = S.sport?.(); if (!sp) return out;
    if (sp.stadium) {
      const st = sp.stadium;
      out.push({ cat: 'sport', key: 'stade', score: 2.0 + (st.lit ? 1.4 : 0) + Math.random() * 0.8, dur: 12, free: orbitShot({ label: `Stade — ${st.session}`, target: () => V(st.x, st.y + 2, st.z), radius: [110, 85], height: [55, 36], speed: 0.05, fov: 52, dur: 12, ground: S.ground }) });
      out.push({ cat: 'sport', key: 'piste', score: 1.7 + (st.lit ? 1.2 : 0) + Math.random() * 0.8, dur: 10, free: orbitShot({ label: 'Entraînement sur la piste', target: () => V(st.x, st.y + 1.2, st.z), radius: [46, 34], height: [9, 7], speed: 0.07, fov: 50, dur: 10, ground: S.ground }) });
    }
    const pick = <K extends SportThing['kind']>(k: K) => sp.things.filter(t => t.kind === k);
    const add = (t: SportThing, score: number, radius: [number, number], height: [number, number], fov: number, dur: number) => out.push({ cat: 'sport', key: t.key, score: score + Math.random() * 0.8, dur, free: orbitShot({ label: t.label, target: () => { const p = t.pos(); return V(p.x, p.y, p.z); }, radius, height, speed: 0.1, fov, dur, ground: S.ground }) });
    for (const t of pick('saut').slice(0, 2)) add(t, 2.6, [12, 9], [2.2, 2.4], 40, 8);
    for (const t of pick('lancer').slice(0, 2)) add(t, 2.4, [13, 10], [2.2, 2.6], 40, 8);
    for (const t of pick('parapente').slice(0, 2)) add(t, 2.7, [48, 62], [6, 14], 44, 11);
    for (const t of pick('planeur').slice(0, 2)) add(t, 2.8, [70, 90], [8, 18], 44, 12);
    for (const t of pick('peloton').slice(0, 1)) add(t, 2.2, [24, 17], [4, 6], 46, 10);
    for (const t of pick('aviron').slice(0, 1)) add(t, 1.7 + (night < 0.5 ? 0.3 : 0), [28, 20], [5, 8], 46, 10);
    for (const t of pick('cavalier').slice(0, 1)) add(t, 1.7, [15, 12], [2.4, 3.2], 46, 10);
    for (const t of pick('footing').slice(0, 1)) add(t, 1.4 + night * 1.5, [9, 7], [1.6, 2.2], 46, 8);
    for (const t of pick('match').slice(0, 1)) add(t, 1.6, [34, 27], [15, 11], 48, 10);
    return out;
  }

  private skyShots(S: DirectorScene, events: boolean): Cand[] {
    const K = S.sky!(), out: Cand[] = [], tr = this.world.trains[this.hooks.selected()];
    let base: THREE.Vector3 | null = null;
    if (tr && tr.status !== 'stored') { const p = tr.pointAt(0); base = V(p.x - p.tz * 40, p.y + 3, p.z + p.tx * 40); }
    else { const z = S.zones.find(q => q.kind === 'city'); if (z) base = V(z.x + 80, z.y + 4, z.z); }
    if (!base) return out;
    const pos = base, G = S.ground, night = S.night(), D = 3000;
    const toward = (d: Vec, lift = 0) => () => V(pos.x + d.x * D, pos.y + d.y * D - lift, pos.z + d.z * D);
    const shot = (label: string, d: () => Vec, fov: number, dur: number, lift = 0) => fixedShot({ label, pos, target: () => { const v = d(); return V(pos.x + v.x * D, pos.y + v.y * D - lift, pos.z + v.z * D); }, fov, dur, ground: G });
    void toward;
    if (events) {
      const ev = (key: string, score: number, label: string, d: () => Vec, fov: number, until: () => boolean, lift = 0) =>
        out.push({ cat: 'événement', fam: 'ciel', key, score, dur: 40, min: 12, tail: 4, until, free: shot(label, d, fov, 40, lift) });
      if (K.solar > 0.25 && K.sunDir.y > 0.05) ev('eclipse-soleil', 7.5 + K.solar, 'Éclipse de soleil', () => S.sky!().sunDir, 20, () => S.sky!().solar < 0.12);
      if (K.lunar > 0.25 && K.moonUp > 0.05) ev('eclipse-lune', 7 + K.lunar, 'Éclipse de lune', () => S.sky!().moonDir, 24, () => S.sky!().lunar < 0.1);
      if (K.aurora > 0.3) ev('aurore', 5.4 + K.aurora, 'Aurore boréale', () => ({ x: 1, y: 0.28, z: 0 }), 62, () => S.sky!().aurora < 0.2, 300);
      if (K.comet > 0.3 && night > 0.8) ev('comete', 5 + K.comet, 'La comète', () => S.sky!().cometDir, 38, () => S.sky!().comet < 0.15 || S.night() < 0.6);
      if (K.rainbow > 0.25) ev('arc-en-ciel', 4.8 + K.rainbow, 'Arc-en-ciel', () => { const s = S.sky!().sunDir; return { x: -s.x, y: 0.33, z: -s.z }; }, 62, () => S.sky!().rainbow < 0.12);
      if (K.meteorDirs.length && night > 0.8) { const m = K.meteorDirs[0]; out.push({ cat: 'événement', fam: 'ciel', key: 'filante', score: 4.6, dur: 14, min: 7, free: shot('Étoiles filantes', () => ({ x: m.x, y: Math.max(0.3, m.y - 0.1), z: m.z }), 55, 14, 200) }); }
      return out;
    }
    // ambiances
    if (K.moonUp > 0.12 && K.moonLit > 0.75 && night > 0.7) out.push({ cat: 'ciel', key: 'pleine-lune', fam: 'ciel', score: 2.4 + K.moonLit + Math.random() * 0.8, dur: 11, free: shot('La pleine lune', () => S.sky!().moonDir, 32, 11) });
    if (K.starVis > 0.7 && night > 0.8) out.push({ cat: 'ciel', key: 'etoiles', fam: 'ciel', score: 2 + Math.random() * 0.8, dur: 11, free: shot('Le ciel étoilé', () => ({ x: Math.cos(1.1), y: 0.75, z: Math.sin(1.1) }), 70, 11, 0) });
    if (K.sunDir.y > -0.02 && K.sunDir.y < 0.22) out.push({ cat: 'ciel', key: 'soleil-bas', fam: 'ciel', score: 2.6 + Math.random() * 0.8, dur: 12, free: shot(K.sunDir.x * 0 + (S.hour() < 12 ? 'Lever du soleil' : 'Coucher du soleil'), () => { const s = S.sky!().sunDir; return { x: s.x, y: Math.max(0.02, s.y), z: s.z }; }, 40, 12) });
    return out;
  }

  /** Événements de tram : arrivée à l'arrêt, attente, redémarrage, en un seul plan depuis le trottoir juste avant le quai. */
  private tramEvents(S: DirectorScene): Cand[] {
    const out: Cand[] = [], T = S.tram; if (!T) return out;
    T.trams.filter(t => t.active && t.state !== 'arrêt').forEach((t, i) => {
      const ns = T.nextStop(t as never);
      if (!ns || ns.d < 40 || ns.d > 260 || t.v < 1.5) return;
      const rx = -ns.tz, rz = ns.tx, off = t.line.hw + 1.5, px = ns.x - ns.tx * 15 + rx * off, pz = ns.z - ns.tz * 15 + rz * off;
      let stopped = false;
      out.push({ cat: 'événement', fam: 'tram', key: `tram${i}-arret`, score: 5.0 + Math.random() * 0.8, dur: 40, min: 10, tail: 3,
        until: () => { if (t.state === 'arrêt') stopped = true; return stopped && t.state === 'roule' && t.v > 2.5; },
        free: fixedShot({ label: `${t.name} : arrêt`, pos: V(px, ns.y + 3.0, pz), target: () => V(t.x, t.y + 1.6, t.z), fov: 50, dur: 40, ground: S.ground }) });
    });
    return out;
  }

  /** Plans de tramway : arrivée, arrêt et départ vus du quai ; portrait, poursuite, cabine. */
  private tramShots(S: DirectorScene, night: number, sun: number): Cand[] {
    const out: Cand[] = [], T = S.tram; if (!T) return out;
    T.trams.filter(t => t.active).forEach((t, i) => {
      const stop = t.state === 'arrêt', base = 2.4 + (stop ? 0.9 : 0) + (t.line.loop ? 0.2 : 0) + night * 0.4 + sun * 0.3 + Math.random() * 0.8;
      out.push({ cat: 'tram', key: `tram${i}-portrait`, score: base, dur: 10, free: orbitShot({ label: `${t.name}${stop ? " à l'arrêt" : ''}`, target: () => V(t.x, t.y + 1.8, t.z), radius: [26, 19], height: [7, 5], speed: 0.1, fov: 48, dur: 10, ground: S.ground }) });
      if (!stop) out.push({ cat: 'tram', key: `tram${i}-suivi`, score: base - 0.2, dur: 10, free: followShot({ label: `${t.name} (en poursuite)`, subject: () => t, offset: [3.2, 3.6, -15], look: [0, 1.8, 10], fov: 55, dur: 10, ground: S.ground, sway: 0.2 }) });
      out.push({ cat: 'tram', key: `tram${i}-cabine`, score: base - 0.5, dur: 9, free: followShot({ label: `${t.name} (en cabine)`, subject: () => t, offset: [0, 1.9, 6.3], look: [0, 1.7, 60], fov: 68, dur: 9, ground: S.ground, sway: 0.08 }) });
    });
    return out;
  }

  /** Approche d'un pont ou d'un tunnel : la caméra attend sur le côté, le train arrive, passe, et on ne coupe qu'une fois la rame passée. */
  private spotShots(S: DirectorScene): Cand[] {
    const out: Cand[] = [], spots = S.spots; if (!spots) return out;
    this.world.trains.forEach((t, i) => {
      if (t.status === 'stored' || t.v < 4) return;
      const h = t.pointAt(0), inside = CameraRig.covered(h.x, h.z);
      spots.forEach((sp, k) => {
        const dx = sp.x - h.x, dz = sp.z - h.z, along = dx * h.tx + dz * h.tz, side = dx * h.tz - dz * h.tx;
        if (Math.abs(side) > 18 || along < 60 || along > (sp.kind === 'bridge' ? 200 : 240)) return;
        const nx = -h.tz, nz = h.tx, tx = h.tx, tz = h.tz;
        const behind = () => { const q = t.pointAt(t.length); return (q.x - sp.x) * tx + (q.z - sp.z) * tz; };
        if (sp.kind === 'bridge') {
          const px = sp.x - tx * 12 + nx * 38, pz = sp.z - tz * 12 + nz * 38;
          out.push({ cat: 'événement', fam: 'rail', key: `pont${k}-${i}`, score: 4.3 + Math.random() * 0.9, dur: 40, min: 9, tail: 2, until: () => behind() > 30,
            free: fixedShot({ label: 'Le train franchit le pont', pos: V(px, sp.y + 7, pz), target: () => { const q = t.pointAt(0); return V(q.x, q.y + 2, q.z); }, fov: 46, dur: 40, ground: S.ground }) });
        } else if (!inside && along > 90) {
          const px = sp.x - tx * 40 + nx * 14, pz = sp.z - tz * 40 + nz * 14;
          out.push({ cat: 'événement', fam: 'rail', key: `tun${k}-in${i}`, score: 4.4 + Math.random() * 0.9, dur: 35, min: 8, tail: 1.5, until: () => behind() > 8,
            free: fixedShot({ label: 'Le train entre dans le tunnel', pos: V(px, sp.y + 10, pz), target: () => { const q = t.pointAt(0); const a = (q.x - sp.x) * tx + (q.z - sp.z) * tz; return a > 0 ? V(sp.x, sp.y + 3, sp.z) : V(q.x, q.y + 2, q.z); }, fov: 48, dur: 35, ground: S.ground }) });
        } else if (inside) {
          const px = sp.x + tx * 55 + nx * 10, pz = sp.z + tz * 55 + nz * 10;
          out.push({ cat: 'événement', fam: 'rail', key: `tun${k}-out${i}`, score: 4.4 + Math.random() * 0.9, dur: 35, min: 8, tail: 2, until: () => behind() > 45,
            free: fixedShot({ label: 'Le train sort du tunnel', pos: V(px, sp.y + 3.4, pz), target: () => { const q = t.pointAt(0); const a = (sp.x - q.x) * tx + (sp.z - q.z) * tz; return a > 25 ? V(sp.x, sp.y + 3, sp.z) : V(q.x, q.y + 2, q.z); }, fov: 52, dur: 35, ground: S.ground }) });
        }
      });
    });
    return out;
  }

  /** Plans sur l'eau : portraits de navires, accostage, appareillage, portiques au travail. */
  private waterShots(S: DirectorScene, night: number, sun: number): Cand[] {
    const out: Cand[] = [], ships = S.ships; if (!ships) return out;
    const live = ships.ships.filter(x => !x.hidden);
    for (const sh of live) {
      const big = sh.len > 60, label = ({ cargo: 'Cargo', pétrolier: 'Pétrolier', ferry: 'Ferry', péniche: 'Péniche', voilier: 'Voilier', pêcheur: 'Bateau de pêche' } as const)[sh.kind] + ` « ${sh.name} »`;
      const dock = sh.phase === 'accoste' && sh.v > 0.2, leave = sh.phase === 'appareille';
      const lbl = dock ? `Accostage : ${label}` : leave ? `Appareillage : ${label}` : sh.phase === 'quai' ? `À quai : ${label}` : label;
      const base = 0.7 + (big ? 0.4 : 0) + sun * 0.4 + Math.random() * 0.7 + (dock || leave ? 1.8 : 0) + (sh.phase === 'quai' ? 0.2 : 0), SPD = dock || leave ? 3 : 4;   // les bateaux sont lents : plans courts, simulation accélérée
      out.push({ cat: 'eau', key: `ship${sh.id}`, shipSpeed: SPD, score: base, dur: big ? 8 : 7, free: orbitShot({ label: lbl, target: () => V(sh.x, sh.y + sh.len * 0.06 + 1.5, sh.z), radius: big ? [sh.len * 1.1, sh.len * 0.8] : [sh.len * 2.2 + 12, sh.len * 1.8 + 10], height: big ? [sh.len * 0.22, sh.len * 0.12] : [6, 9], speed: dock || leave ? 0.05 : 0.09, fov: 50, dur: big ? 12 : 10, ground: S.ground }) });
      if (big || sh.kind === 'ferry') out.push({ cat: 'eau', key: `pont${sh.id}`, shipSpeed: SPD, score: base - 0.6 + night * 0.2, dur: 7, free: followShot({ label: `Sur le pont du ${sh.name}`, subject: () => sh, offset: [3, sh.len * 0.16 + 4, sh.len * 0.38], look: [0, sh.len * 0.05 + 1, sh.len * 3], fov: 62, dur: 10, ground: S.ground }) });
      if (sh.kind === 'voilier' || sh.kind === 'pêcheur') out.push({ cat: 'eau', key: `ras${sh.id}`, shipSpeed: SPD, score: base - 0.2, dur: 7, free: followShot({ label: label, subject: () => sh, offset: [sh.len * 1.7, 2.4, -sh.len * 0.4], look: [0, 3, sh.len * 0.3], fov: 48, dur: 9, ground: S.ground }) });
    }
    // les portiques au travail
    ships.ports.forEach((ps, pi) => {
      const sh = ps.busy >= 0 ? ships.ships.find(x => x.id === ps.busy) : undefined; if (!sh || ps.poi.water !== 'mer') return;
      const dx = Math.cos(ps.poi.rot), dz = Math.sin(ps.poi.rot), px = ps.poi.x + dx * 40 + dz * 36, pz = ps.poi.z + dz * 40 - dx * 36;
      out.push({ cat: 'eau', key: `grue${pi}`, shipSpeed: 4, score: 3.1 + Math.random() * 0.8, dur: 9, free: orbitShot({ label: `Les portiques déchargent le ${sh.name}`, target: () => V(ps.poi.x + dx * 76, ps.poi.y + 14, ps.poi.z + dz * 76), radius: [70, 52], height: [18, 30], speed: 0.07, fov: 52, dur: 12, ground: S.ground }) });
      void px; void pz;
    });
    return out;
  }

  private cands(): Cand[] {
    const out: Cand[] = [];
    this.world.trains.forEach((t, i) => {
      if (t.status === 'stored') return;
      const kind = this.pickKind(t), dd = distToStop(t);
      const c: Cand = { cat: 'train', key: `${t.id}`, score: this.trainScore(t, i), dur: kind === 'cabine' ? rnd(14, 20) : kind === 'passager' ? rnd(8, 11) : kind === 'passage' ? rnd(7, 9) : kind === 'lointain' ? rnd(12, 16) : kind === 'drone' ? rnd(11, 15) : rnd(10, 17), train: { i, kind } };
      if (kind === 'quai' && dd !== null) { c.dur = 55; c.min = 10; c.tail = 6; c.until = () => t.dwell > 0 || t.status === 'stored'; }            // arrivée : on reste jusqu'après l'arrêt
      else if (kind === 'quai') { const o0 = t.odo; c.dur = 40; c.min = 8; c.tail = 2; c.until = () => t.odo - o0 > 150 || t.status === 'stored'; }        // départ : on suit jusqu'à ce que la rame ait quitté le quai
      out.push(c);
    });
    out.push(...this.places(), ...(this.lastEvent > this.lastNow - 30 ? [] : this.events()));
    return out;
  }

  private apply(c: Cand, now: number) {
    if (this.cur) { const f = this.cur.fam ?? this.cur.cat; for (const k in this.shown) this.shown[k] *= 0.92; this.shown[f] = (this.shown[f] ?? 0) + Math.max(0, now - this.start); }   // temps d'écran réellement pris par le plan qui finit
    if (c.cat === 'événement') this.lastEvent = now;
    this.cur = c; this.start = now; this.dur = c.dur / this.pace; this.fade = 1; this.doneAt = 0;

    this.lastCutOf.set(c.cat, ++this.cutNo);
    this.recentCats.unshift(c.cat); this.recentCats.length = Math.min(this.recentCats.length, 4);
    this.recentKeys.unshift(c.key); this.recentKeys.length = Math.min(this.recentKeys.length, 7);
    if (c.train) {
      this.free = null; this.lastTrain = c.train.i;
      this.recentKinds.unshift(c.train.kind); this.recentKinds.length = Math.min(this.recentKinds.length, 3);
      this.hooks.setTrain(c.train.i); this.hooks.setView(c.train.kind);
      this.caption = '';
    } else if (c.free) {
      this.free = c.free; this.cam.fov = c.free.fov; this.cam.updateProjectionMatrix();
      this.dur = c.free.dur / this.pace; this.caption = c.free.label;
      this.cam.up.set(0, 1, 0); c.free.place(this.cam, 0); this.focus.copy(c.free.target());
      this.hooks.setView('cinéma');
    }
  }

  private cut(now: number) {
    const cs = this.cands();
    if (!cs.length) { this.start = now; this.dur = 5; return; }
    for (const c of cs) {
      const train = c.cat === 'train';
      if (!train && c.cat !== 'événement') c.score += Math.min(2.2, 0.4 * (this.cutNo - (this.lastCutOf.get(c.cat) ?? 0)));   // une catégorie délaissée finit par passer
      if (c.cat === this.recentCats[0]) c.score -= train ? 0.8 : 2.4; else if (this.recentCats.includes(c.cat)) c.score -= train ? 0.2 : 0.9;
      if (this.recentKeys.includes(c.key)) c.score -= 2.2;
      c.score += this.budget(c);   // budget de temps d'écran
    }
    cs.sort((a, b) => b.score - a.score);
    this.apply(cs[0], now);
  }

  /** Correction de note selon la part de temps d'écran déjà prise par la famille du plan : on pénalise fort ce qui dépasse sa part visée. */
  private budget(c: Cand): number {
    if (/^(eclipse|aurore|comete)/.test(c.key)) return 3;                      // phénomènes rares : jamais freinés par le budget
    const fam = c.fam ?? c.cat, tot = Object.values(this.shown).reduce((a, b) => a + b, 0) || 1, delta = (TARGET[fam] ?? 0.05) - (this.shown[fam] ?? 0) / tot;
    return delta > 0 ? Math.min(3, delta * 16) : Math.max(-9, delta * 34);
  }

  /** Légende du plan en cours (affichée quelques secondes après chaque coupe). */
  captionFor(t: Train): string {
    if (this.free) return this.caption;
    const where = t.status === 'leaving' ? 'sort du dépôt' : t.status === 'returning' ? 'rentre au dépôt'
      : t.state === 'dwell' ? `à quai, gare ${t.head.station}` : t.state === 'signal' ? 'arrêt au signal' : 'en ligne';
    return `${t.circuit.name} · ${t.id} · ${where}`;
  }
}
