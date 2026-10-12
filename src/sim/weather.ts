import { rng } from './cityplan';

export type WeatherKind = 'clair' | 'nuageux' | 'pluie' | 'brouillard' | 'orage';
export const WEATHER_KINDS: WeatherKind[] = ['clair', 'nuageux', 'pluie', 'brouillard', 'orage'];

/** Niveaux cibles (0..1) de chaque type de temps : nuages, pluie, brouillard, orage. */
const TARGET: Record<WeatherKind, { cloud: number; rain: number; fog: number; storm: number }> = {
  clair: { cloud: 0.15, rain: 0, fog: 0, storm: 0 },
  nuageux: { cloud: 0.7, rain: 0, fog: 0.08, storm: 0 },
  pluie: { cloud: 0.9, rain: 0.75, fog: 0.15, storm: 0 },
  brouillard: { cloud: 0.5, rain: 0, fog: 0.85, storm: 0 },
  orage: { cloud: 1, rain: 1, fog: 0.1, storm: 1 },
};
/** Probabilités de passage d'un temps au suivant (avant pondération par le climat). */
const NEXT: Record<WeatherKind, [WeatherKind, number][]> = {
  clair: [['clair', 0.35], ['nuageux', 0.5], ['brouillard', 0.15]],
  nuageux: [['clair', 0.3], ['nuageux', 0.15], ['pluie', 0.35], ['brouillard', 0.08], ['orage', 0.12]],
  pluie: [['nuageux', 0.45], ['pluie', 0.2], ['orage', 0.2], ['clair', 0.15]],
  brouillard: [['clair', 0.5], ['nuageux', 0.5]],
  orage: [['pluie', 0.6], ['nuageux', 0.4]],
};

/**
 * Météo : machine d'états qui change de temps toutes les 1,5 à 4 minutes (temps réel) et lisse les niveaux
 * (nuages, pluie, brouillard, orage) pour que les transitions soient progressives. Pure, déterministe pour une graine.
 * `wet` pondère les temps humides selon le climat du monde (désert sec, tropical humide).
 */
export class Weather {
  kind: WeatherKind = 'clair';
  /** Temps imposé par l'utilisateur ; null = automatique. */
  forced: WeatherKind | null = null;
  cloud = 0.15; rain = 0; fog = 0; storm = 0;
  /** Éclair en cours (0..1, décroît vite) et orage lointain : nombre de coups de tonnerre à jouer. */
  flash = 0; thunders = 0;
  /** Vent (m/s) qui fait dériver les nuages. */
  wind = 6;
  private rand: () => number;
  private next = 120; private flashT = 8; private pending: number[] = []; private strike: number[] = [];

  constructor(seed = 1, private wet = 1) {
    this.rand = rng(seed ^ 0x7e47);
    this.kind = this.rand() < 0.5 ? 'clair' : 'nuageux';
    Object.assign(this, TARGET[this.kind]);
    this.next = 30 + this.rand() * 40;
  }

  /** Temps affiché : le temps visé tant que les niveaux n'ont pas rejoint la cible. */
  get label(): WeatherKind { return this.forced ?? this.kind; }

  private choose(): WeatherKind {
    const l = NEXT[this.kind].map(([k, p]) => [k, p * (k === 'pluie' || k === 'orage' ? this.wet : k === 'brouillard' ? Math.sqrt(this.wet) : 1)] as [WeatherKind, number]);
    let tot = 0; for (const [, p] of l) tot += p;
    let r = this.rand() * tot;
    for (const [k, p] of l) { r -= p; if (r <= 0) return k; }
    return l[0][0];
  }

  step(dt: number) {
    const target = this.forced ?? this.kind;
    if (!this.forced) { this.next -= dt; if (this.next <= 0) { this.kind = this.choose(); this.next = 70 + this.rand() * 110; } }
    else this.kind = this.forced;
    const T = TARGET[target], k = 1 - Math.exp(-dt / (this.forced ? 2.5 : 12));
    this.cloud += (T.cloud - this.cloud) * k; this.rain += (T.rain - this.rain) * k; this.fog += (T.fog - this.fog) * k; this.storm += (T.storm - this.storm) * k;
    this.wind = 5 + this.cloud * 6 + this.storm * 8;
    // éclairs : en cas d'orage établi, un éclair (parfois double) toutes les 5 à 18 s ; le tonnerre arrive 1 à 5 s plus tard
    this.flash *= Math.exp(-dt / 0.12);
    for (let i = this.strike.length - 1; i >= 0; i--) { this.strike[i] -= dt; if (this.strike[i] <= 0) { this.flash = 1; this.strike.splice(i, 1); } }
    for (let i = this.pending.length - 1; i >= 0; i--) { this.pending[i] -= dt; if (this.pending[i] <= 0) { this.thunders++; this.pending.splice(i, 1); } }
    if (this.storm > 0.6) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flashT = 5 + this.rand() * 13;
        this.strike.push(0); if (this.rand() < 0.4) this.strike.push(0.18);
        this.pending.push(1 + this.rand() * 4);
      }
    }
  }
}
