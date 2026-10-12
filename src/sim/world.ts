import { buildNetwork, type CircuitDef, type Edge, type LayoutDef, type Network, type Sample } from './network';

export const G = 9.81;   // la pente agit sur l'accélération et le freinage
export const VMAX = 40;  // plafond global (m/s)
const DWELL = 15;        // s d'arrêt en gare
const GAP = 1;           // m entre caisses
const MAX_LEN = 150;     // m : longueur max d'une rame (doit tenir sur un quai / une voie de garage)
const DISPATCH_GAP = 25; // s min entre deux sorties/rentrées d'un même circuit

export interface TypeSpec { vmax: number; acc: number; brake: number; carLen: number }
export const TYPES: Record<string, TypeSpec> = {
  omnibus: { vmax: 30, acc: 0.9, brake: 0.8, carLen: 18 },
  rapide: { vmax: 36, acc: 1.0, brake: 0.9, carLen: 20 },
  fret: { vmax: 22, acc: 0.4, brake: 0.6, carLen: 14 },
};

export type Aspect = 'red' | 'yellow' | 'green';
export type Status = 'stored' | 'leaving' | 'service' | 'returning';

/** Un circuit = une boucle exploitée avec un type de matériel, un parc, un nombre de rames en service et des arrêts. */
export class Circuit {
  readonly id: string; readonly name: string; readonly track: string; readonly type: string; readonly fleet: number;
  service: number; cars: number;
  stops: Record<string, boolean> = {};
  cool = 0;
  depotless = false;         // ligne libre : pas de dépôt, le parc est entièrement en service
  readonly via: string[];
  /** gares desservies par le parcours (boucle, éventuellement par une corde) */
  served: string[] = [];

  constructor(d: CircuitDef, stations: string[]) {
    if (!TYPES[d.type]) throw new Error(`Type de matériel inconnu : ${d.type}`);
    this.via = d.via ?? [];
    this.id = d.id; this.name = d.name ?? d.id; this.track = d.track; this.type = d.type; this.fleet = d.fleet;
    this.service = Math.min(d.service, d.fleet);
    this.cars = Math.min(d.cars, this.maxCars);
    for (const s of stations) this.stops[s] = d.stops?.[s] ?? true;
  }
  takes(chord: string) { return this.via.includes(chord); }
  get maxCars() { return Math.floor((MAX_LEN + GAP) / (TYPES[this.type].carLen + GAP)); }
}

export class Train {
  path: Edge[];            // cantons occupés, de l'arrière vers la tête
  reserved: Edge[] = [];   // cantons réservés devant la tête (itinéraire établi)
  d: number;               // abscisse de la tête sur path[dernier]
  v = 0; dwell = 0; blocked = false;
  lastStop: Edge | null = null;
  odo = 0; stopsDone = 0;
  stopLog: Record<string, number> = {};
  cars: number;
  readonly spec: TypeSpec;
  readonly gap = GAP;

  constructor(readonly id: string, readonly circuit: Circuit, start: Edge, d: number, public status: Status) {
    this.path = [start]; this.d = d; this.cars = circuit.cars; this.spec = TYPES[circuit.type];
    start.occupants.add(this);
    if (status === 'stored') this.lastStop = start;
  }
  get carLen() { return this.spec.carLen; }
  get length() { return this.cars * this.carLen + (this.cars - 1) * this.gap; }
  get head(): Edge { return this.path[this.path.length - 1]; }
  get state(): 'stored' | 'dwell' | 'signal' | 'run' {
    return this.status === 'stored' ? 'stored' : this.dwell > 0 ? 'dwell' : this.v < 0.1 && this.blocked ? 'signal' : 'run';
  }
  /** Le train s'arrête-t-il dans cette gare ? (jamais en retour au dépôt, jamais pour le fret) */
  stopsAt(station: string): boolean {
    return this.status !== 'returning' && this.circuit.type !== 'fret' && this.circuit.stops[station] !== false;
  }
  /** Point situé à `back` mètres derrière la tête. */
  pointAt(back: number): Sample {
    let i = this.path.length - 1, off = this.d - back;
    while (off < 0 && i > 0) { i--; off += this.path[i].len; }
    return this.path[i].at(Math.max(off, 0));
  }
  /** Point situé à `dist` mètres devant la tête (le long de l'itinéraire réservé). */
  pointAhead(dist: number): Sample {
    let e = this.head, off = this.d + dist, i = 0;
    while (off > e.len && i < this.reserved.length) { off -= e.len; e = this.reserved[i++]; }
    return e.at(off);
  }
}

const mustStopOn = (e: Edge, t: Train) =>
  t.lastStop !== e && (e.turn || (e.kind === 'plat' ? t.stopsAt(e.station) : e.kind === 'depot' && t.status === 'returning'));

export class World {
  time = 0;
  readonly net: Network;
  readonly circuits: Circuit[];
  readonly trains: Train[] = [];

  constructor(def: LayoutDef) {
    this.net = buildNetwork(def);
    this.circuits = def.circuits.map(c => new Circuit(c, this.net.stations));
    for (const c of this.circuits) { c.served = this.routeStations(c); c.depotless = !this.net.depots.some(d => d.track === c.track); }
    const slots: Record<string, Edge[]> = { A: [], B: [] };
    for (const dep of this.net.depots) slots[dep.track].push(...dep.edges);

    const pickBlock = (track: string, frac: number): Edge => {
      const ring = this.net.ring[track], total = ring.reduce((s, e) => s + e.len, 0);
      let acc = 0, idx = -1;
      ring.forEach((e, i) => { if (idx < 0 && e.kind === 'block' && acc / total >= frac && !e.occupants.size) idx = i; acc += e.len; });
      if (idx < 0) idx = ring.findIndex(e => e.kind === 'block' && !e.occupants.size);
      return ring[idx];
    };
    this.circuits.forEach((c, ci) => {
      const spec = TYPES[c.type], len = c.cars * spec.carLen + (c.cars - 1) * GAP;
      for (let i = 0; i < c.fleet; i++) {
        const id = `${c.id}${i + 1}`;
        if (i < c.service) {
          const st = this.net.starts[c.track];
          const e = st ? st[i % st.length] : pickBlock(c.track, ((i + 0.5) / c.service + ci * 0.07) % 1);
          this.trains.push(new Train(id, c, e, Math.min(e.len - 5, len + 10), 'service'));
        } else {
          const slot = slots[c.track].find(e => !e.occupants.size);
          if (!slot) throw new Error(`Pas assez de voies de garage sur la voie ${c.track} pour le parc du circuit ${c.id}`);
          this.trains.push(new Train(id, c, slot, slot.stopOffset, 'stored'));
        }
      }
    });
  }

  /** Gares du parcours d'un circuit : on suit le graphe depuis un canton de sa voie (corde prise si le circuit la dessert) jusqu'à boucler. */
  private routeStations(c: Circuit): string[] {
    const seen = new Set<Edge>(), names: string[] = [];
    let e: Edge | undefined = this.net.ring[c.track].find(x => x.kind === 'block');
    while (e && !seen.has(e)) {
      seen.add(e);
      if (e.kind === 'plat' && !names.includes(e.station)) names.push(e.station);
      const o: Edge[] = e.to.outs;
      const dv = o.find(x => x.diverge);
      e = e.turn ? e.twin! : o.length <= 1 ? o[0] : dv ? (c.takes(dv.diverge) ? dv : o.find(x => !x.diverge)) : o.find(x => x.via === 'plat') ?? o[0];
    }
    return this.net.stations.filter(n => names.includes(n));
  }

  step(dt: number): void {
    this.time += dt;
    this.dispatch(dt);
    for (const t of this.trains) this.stepTrain(t, dt);
  }

  /** Ajuste le nombre de rames en service : sort une rame du dépôt ou en rappelle une, une à la fois. */
  private dispatch(dt: number): void {
    for (const c of this.circuits) {
      c.cool -= dt;
      if (c.cool > 0 || c.depotless) continue;
      const units = this.trains.filter(t => t.circuit === c);
      const active = units.filter(t => t.status === 'leaving' || t.status === 'service').length;
      if (active < c.service) {
        const u = units.find(t => t.status === 'stored');
        if (u) { u.cars = Math.max(1, Math.min(Math.round(c.cars), c.maxCars)); u.status = 'leaving'; c.cool = DISPATCH_GAP; }
      } else if (active > c.service) {
        const u = units.find(t => t.status === 'service');
        if (u) { u.status = 'returning'; c.cool = DISPATCH_GAP; }
      }
    }
  }

  private planB(t: Train): number {
    return Math.max(0.25, 0.8 * (t.spec.brake - G * this.net.maxGrade));
  }

  /** Un canton est-il pris (occupé, réservé par un autre, ou verrouillé par une rampe voisine) ? */
  private busy(n: Edge, t?: Train): boolean {
    const taken = (x: Edge) => { for (const o of x.occupants) if (o !== t) return true; return x.reservedBy !== null && x.reservedBy !== t; };
    return taken(n) || n.lock.some(taken);
  }

  /** Aiguillage d'entrée de zone : quai si le train s'arrête ici, voie de garage libre s'il rentre au dépôt, voie directe sinon. */
  private choose(e: Edge, t: Train): Edge | null {
    const o = e.to.outs;
    if (o.length <= 1) return o[0] ?? null;
    const dv = o.find(x => x.diverge);
    if (dv) {                                   // bifurcation vers une corde : prise par les circuits qui la desservent
      const main = o.find(x => !x.diverge) ?? o[0];
      return t.circuit.takes(dv.diverge) && t.status !== 'returning' ? dv : main;
    }
    const main = o.find(x => x.via === 'main') ?? o[0];
    if (o.some(x => x.via === 'depot')) {
      if (t.status === 'returning') {
        const free = o.find(x => x.via === 'depot' && !this.busy(x.to.outs[0], t) && !x.to.outs[0].occupants.size);
        if (free) return free;
      }
      return main;
    }
    const plat = o.find(x => x.via === 'plat');
    return plat && t.stopsAt(plat.to.outs[0].station) ? plat : main;
  }

  /** Réserve les cantons devant le train tant qu'ils sont libres, sur une distance de freinage + marge. */
  private extend(t: Train): void {
    const look = (t.v * t.v) / (2 * this.planB(t)) + 150;
    let last = t.reserved.length ? t.reserved[t.reserved.length - 1] : t.head;
    let dist = t.head.len - t.d;
    for (const e of t.reserved) dist += e.len;
    t.blocked = false;
    while (dist < look) {
      if (mustStopOn(last, t)) break;
      const n = this.choose(last, t);
      if (!n) break;
      if (this.busy(n, t)) { t.blocked = true; break; }
      n.reservedBy = t; t.reserved.push(n); dist += n.len; last = n;
    }
  }

  /** Vitesse cible : limites des cantons et du matériel, arrêt au quai, arrêt avant un canton non réservé. */
  private plan(t: Train): number {
    const b = this.planB(t), vm = t.spec.vmax;
    let target = Math.min(t.head.vmax, vm);
    const stopOn = (e: Edge, s0: number) => {
      if (mustStopOn(e, t)) target = Math.min(target, Math.sqrt(2 * b * Math.max(s0 + e.stopOffset, 0)));
    };
    stopOn(t.head, -t.d);
    let dist = t.head.len - t.d;
    for (const e of t.reserved) {
      const lim = Math.min(e.vmax, vm);
      target = Math.min(target, Math.sqrt(lim * lim + 2 * b * dist));
      stopOn(e, dist);
      dist += e.len;
    }
    if (t.blocked) {
      // point de dégagement : on s'arrête plus loin d'un aiguillage / d'une convergence (voies encore trop proches)
      const end = (t.reserved.length ? t.reserved[t.reserved.length - 1] : t.head).to;
      const margin = end.ins.length > 1 || end.outs.length > 1 ? 18 : 6;
      target = Math.min(target, Math.sqrt(2 * b * Math.max(dist - margin, 0)));
    }
    return Math.min(target, vm, VMAX);
  }

  private stepTrain(t: Train, dt: number): void {
    if (t.status === 'stored') return;
    if (t.dwell > 0) { t.dwell = Math.max(0, t.dwell - dt); return; }
    if (t.head.turn && t.lastStop === t.head) this.reverse(t);
    this.extend(t);
    const gr = t.head.grade(t.d);
    const acc = Math.max(0.15, t.spec.acc - G * gr), brk = Math.max(0.3, t.spec.brake + G * gr);
    const dv = Math.max(-brk * dt, Math.min(acc * dt, this.plan(t) - t.v));
    t.v = Math.max(0, t.v + dv);
    t.d += t.v * dt; t.odo += t.v * dt;

    while (t.d >= t.head.len) {
      if (!t.reserved.length) { t.d = t.head.len; t.v = 0; break; }
      t.d -= t.head.len;
      const n = t.reserved.shift()!;
      n.reservedBy = null; n.occupants.add(t); t.path.push(n);
    }
    // libère les cantons que la queue a quittés
    let behind = t.d, i = t.path.length - 1;
    while (behind < t.length && i > 0) { i--; behind += t.path[i].len; }
    for (let k = 0; k < i; k++) t.path[k].occupants.delete(t);
    t.path.splice(0, i);
    if (t.lastStop && !t.path.includes(t.lastStop)) t.lastStop = null;

    const e = t.head;
    if (t.status === 'leaving' && e.kind === 'block') t.status = 'service';
    if (mustStopOn(e, t) && t.d >= e.stopOffset - 1.5 && t.v < 0.5) {
      t.v = 0; t.lastStop = e;
      if (e.kind === 'depot') { t.status = 'stored'; t.blocked = false; }
      else { t.dwell = DWELL; t.stopsDone++; t.stopLog[e.station] = (t.stopLog[e.station] ?? 0) + 1; }
    }
  }

  /** Terminus : la rame repart en sens inverse, sa queue devient sa tête (canton jumeau de même géométrie). */
  private reverse(t: Train): void {
    const P = t.path, k = P.length - 1, starts: number[] = [];
    let acc = 0; for (const e of P) { starts.push(acc); acc += e.len; }
    const uTail = Math.max(0, starts[k] + t.d - t.length);
    let m = 0; while (m < k && starts[m + 1] <= uTail) m++;
    const np: Edge[] = [];
    for (let i = k; i >= m; i--) { const w = P[i].twin; if (!w) throw new Error(`Rebroussement impossible sur ${P[i].id}`); np.push(w); }
    for (const e of P) e.occupants.delete(t);
    for (const e of t.reserved) e.reservedBy = null;
    t.reserved = [];
    t.path = np; for (const e of np) e.occupants.add(t);
    t.d = P[m].len - (uTail - starts[m]); t.v = 0; t.lastStop = null; t.blocked = false;
  }

  /** Aspect du signal placé en fin de canton `e`. */
  aspect(e: Edge): Aspect {
    const outs = e.to.outs;
    if (!outs.length) return 'green';
    for (const t of e.occupants) if (outs.some(o => t.reserved.includes(o) || t.path.includes(o))) return 'green';
    if (e.occupants.size) return 'red';
    const n = outs[0];
    if (this.busy(n)) return 'red';
    const m = n.to.outs[0];
    return m && this.busy(m) ? 'yellow' : 'green';
  }
}
