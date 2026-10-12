export type AircraftKind = 'léger' | 'hydravion';
export type PlaneMode = 'vol' | 'roulage' | 'parqué' | 'décollage';
export interface Plane { x: number; y: number; z: number; yaw: number; bank: number; pitch: number; mode: PlaneMode }
/** Ce que fait l'avion, pour le réalisateur : approche, roulage, à l'arrêt, décollage, montée, passage bas, croisière. */
export type PlanePhase = 'approche' | 'roulage' | 'parqué' | 'décollage' | 'montée' | 'passage bas' | 'croisière';
export interface AircraftOpts {
  kind: AircraftKind; name: string;
  /** centre de la piste (ou du plan d'eau), altitude de la piste, cap de la piste (rad, convention yaw : avant = (sin, cos)) */
  cx: number; cz: number; y0: number; Y0: number;
  /** +1 : le circuit tourne à gauche de la piste, −1 : à droite */
  sgn: 1 | -1;
  /** atterrit un tour sur `landEvery` (0 : jamais), au tour numéro `lap0` modulo `landEvery` */
  landEvery: number; lap0: number;
  /** passage bas au-dessus de la piste un tour sur deux */
  lowPass?: boolean;
  /** abscisse de départ sur le circuit */
  s0: number;
  ground: (x: number, z: number) => number;
  /** durée de stationnement (s) */
  park?: number;
}

const RT = 550, H = 150, L1 = 2200, ARC = Math.PI * RT, TOT = 2 * L1 + 2 * ARC;
const SLAND = 1320, SLIFT = 1640, SCLIMB = L1 + ARC;
const sm = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

/**
 * Avion de tourisme sur un circuit en hippodrome tangent à la piste : approche, atterrissage, roulage, stationnement, décollage, montée.
 * Sert pour l'avion de l'aérodrome (piste en dur) comme pour l'hydravion (plan d'eau). Aucune dépendance à Three.js.
 */
export class Aircraft implements Plane {
  x = 0; y = 300; z = 0; yaw = 0; bank = 0; pitch = 0; mode: PlaneMode = 'vol';
  phase: PlanePhase = 'croisière';
  /** hauteur au-dessus de la piste (m) et vitesse (m/s) */
  alt = H; v = 38;
  landings = 0; takeoffs = 0;
  private s: number; private lap: number; private park = 0; private lift = 0; private climbing = false;
  constructor(readonly o: AircraftOpts) { this.s = o.s0; this.lap = o.lap0; this.step(0); }
  get kind() { return this.o.kind; }
  get name() { return this.o.name; }
  /** abscisse le long de la piste (p) du circuit, utile aux caméras */
  get p() { return this.track(this.s).p; }

  private track(s: number): { p: number; q: number; hd: number; turn: number } {
    s = ((s % TOT) + TOT) % TOT;
    if (s < L1) return { p: -1500 + s, q: 0, hd: 0, turn: 0 };
    if (s < L1 + ARC) { const a = (s - L1) / RT; return { p: 700 + Math.sin(a) * RT, q: RT - Math.cos(a) * RT, hd: a, turn: 1 }; }
    if (s < L1 + ARC + L1) return { p: 700 - (s - L1 - ARC), q: 2 * RT, hd: Math.PI, turn: 0 };
    const a = (s - L1 - ARC - L1) / RT; return { p: -1500 - Math.sin(a) * RT, q: 2 * RT - (RT - Math.cos(a) * RT), hd: Math.PI + a, turn: 1 };
  }

  step(dt: number) {
    const o = this.o, landing = o.landEvery > 0 && this.lap % o.landEvery === o.lap0 % o.landEvery;
    let alt = H;
    if (this.mode === 'vol') {
      const ahead = this.s < SLAND;
      this.v += ((landing && ahead ? 30 : 38) - this.v) * Math.min(1, dt * 0.5);
      const s0 = this.s; this.s += this.v * dt;
      if (this.s >= TOT) { this.s -= TOT; this.lap++; }
      if (landing && s0 < SLAND && this.s >= SLAND && this.s < TOT / 2) this.mode = 'roulage';
      if (this.climbing) { alt = H * Math.min(1, Math.max(0, (this.s - this.lift) / (SCLIMB - this.lift))); if (alt >= H) this.climbing = false; }
      else if (landing && this.s < SLAND) alt = H * Math.max(0, 1 - this.s / SLAND);
      else if (landing && this.s > SLAND && this.s < 1700 && s0 <= this.s) alt = 0;
      else if (o.lowPass && this.lap % 2 === 1) alt = 16 + (H - 16) * sm((Math.abs(this.s - 1500) - 120) / 650);
    }
    if (this.mode === 'roulage') {
      this.v = Math.max(0, this.v - 4 * dt); this.s += this.v * dt; alt = 0;
      if (this.v < 0.4) { this.v = 0; this.mode = 'parqué'; this.park = o.park ?? 40; this.landings++; }
      if (this.s > 1680) this.s = 1680;
    } else if (this.mode === 'parqué') {
      alt = 0; this.park -= dt; if (this.park <= 0) this.mode = 'décollage';
    } else if (this.mode === 'décollage') {
      alt = 0; this.v += 2.4 * dt; this.s += this.v * dt;
      if (this.s >= SLIFT) { this.mode = 'vol'; this.climbing = true; this.lift = this.s; this.lap++; this.takeoffs++; }
    }
    const T = this.track(this.s), c = Math.cos(o.Y0), sn = Math.sin(o.Y0), ux = sn, uz = c, nx = c * o.sgn, nz = -sn * o.sgn;
    this.x = o.cx + ux * T.p + nx * T.q; this.z = o.cz + uz * T.p + nz * T.q;
    this.yaw = o.Y0 + o.sgn * T.hd; this.bank = T.turn ? -0.38 * o.sgn : 0;
    const gnd = o.ground(this.x, this.z), nearRunway = T.q === 0 && T.p > -450 && T.p < 450;
    let y = o.y0 + Math.max(alt, 0) + (nearRunway && alt < 3 ? (o.kind === 'hydravion' ? 0.5 : 1.3) : 0);
    if (!nearRunway || o.kind === 'hydravion' && alt > 3) y = Math.max(y, gnd + (nearRunway ? 8 : 30));
    this.pitch = this.mode === 'vol' ? (this.climbing ? 0.1 : landing && this.s < SLAND && alt > 0.5 ? -0.08 : 0) : 0;
    this.y = y; this.alt = Math.max(0, y - o.y0);
    this.phase = this.mode === 'roulage' ? 'roulage' : this.mode === 'parqué' ? 'parqué' : this.mode === 'décollage' ? 'décollage'
      : this.climbing && this.alt < 110 ? 'montée' : landing && this.s < SLAND && this.alt < 90 ? 'approche' : o.lowPass && this.lap % 2 === 1 && this.alt < 60 ? 'passage bas' : 'croisière';
  }
}
