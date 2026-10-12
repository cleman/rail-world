// Astronomie légère du monde : soleil, lune (phases, éclipses), marées, comète, aurores, pluies d'étoiles.
// Tout est déterministe pour une graine et ne dépend que du jour et de l'heure du monde (aucune dépendance à Three.js).

/** Durée d'une lunaison, en jours du monde (un jour dure 20 min en temps réel par défaut : environ 5 h réelles). */
export const MONTH = 14.6;
/** Rayon angulaire (rad) du soleil et de la lune : volontairement 10 fois plus gros que la réalité, pour que les éclipses se voient. */
export const SUN_R = 0.05, MOON_R = 0.05;
/** Rayon angulaire (rad) de l'ombre de la Terre à l'endroit de la lune. */
export const SHADOW_R = 0.13;
/** Nombre de lunaisons entre deux saisons d'éclipses. */
export const SEASON = 5;

export interface Dir { x: number; y: number; z: number }
const TAU = Math.PI * 2;
const frac = (v: number) => v - Math.floor(v);
const norm = (d: Dir): Dir => { const l = Math.hypot(d.x, d.y, d.z) || 1; return { x: d.x / l, y: d.y / l, z: d.z / l }; };
const dot = (a: Dir, b: Dir) => a.x * b.x + a.y * b.y + a.z * b.z;
const hash = (n: number) => { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; x -= Math.floor(x); return x; };

/** Direction d'un astre qui suit la course du soleil du monde à l'heure `h` (même convention que `DayNight`). */
export function bodyDir(h: number): Dir {
  const az = (h / 24) * TAU, e = Math.sin(((h - 6) / 24) * TAU), el = Math.asin(Math.max(-1, Math.min(1, e))), ce = Math.cos(el);
  return { x: Math.cos(az) * ce, y: Math.sin(el), z: Math.sin(az) * ce };
}

/** Angle (rad) entre deux directions. */
export const sep = (a: Dir, b: Dir) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** Part (0..1) du disque de rayon `r1` recouverte par un disque de rayon `r2` dont les centres sont à `d`. */
export function overlap(d: number, r1: number, r2: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return r2 >= r1 ? 1 : (r2 * r2) / (r1 * r1);
  const a = Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)), b = Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const area = r1 * r1 * (a - Math.sin(2 * a) / 2) + r2 * r2 * (b - Math.sin(2 * b) / 2);
  return Math.min(1, area / (Math.PI * r1 * r1));
}

export interface MoonState {
  /** 0 = nouvelle lune, 0,5 = pleine lune */
  phase: number;
  /** fraction éclairée 0..1 */
  lit: number;
  dir: Dir; sun: Dir;
  /** part du soleil cachée par la lune (0..1) */
  solar: number;
  /** part de la lune plongée dans l'ombre de la Terre (0..1) */
  lunar: number;
  /** hauteur de la lune sur l'horizon (sinus) */
  up: number;
}

export class Sky {
  /** Lunaison de l'éclipse (point de départ du cycle de saisons d'éclipses). */
  readonly eclipseAt: number;
  private readonly phase0: number; private readonly cometAt: number; private readonly cometDir: Dir;
  constructor(readonly seed = 1) {
    this.phase0 = hash(seed * 3.1) * 0.5 + 0.25;
    this.eclipseAt = 3.5 + Math.floor(hash(seed * 5.7) * 2);   // nouvelle lune de l’éclipse solaire centrale ; la pleine lune voisine donne alors une éclipse lunaire totale
    this.cometAt = hash(seed * 9.3) * 40;
    const az = hash(seed * 2.2) * TAU; this.cometDir = norm({ x: Math.cos(az), y: 0.42, z: Math.sin(az) });
  }

  /** Date continue en jours du monde. */
  static date(day: number, hour: number) { return day + hour / 24; }

  /** Phase de la lune (0..1) à la date donnée. */
  phase(day: number, hour: number): number { return frac(Sky.date(day, hour) / MONTH + this.phase0); }

  /** Écart (rad) de la lune à l'écliptique à une date : nul au milieu d'une saison d'éclipses, jusqu'à ~8° à son opposé. */
  declination(day: number, hour: number): number {
    const t = Sky.date(day, hour) / MONTH + this.phase0 - 0.5;          // en lunaisons, 0 = pleine lune
    return 0.14 * Math.abs(Math.sin((Math.PI * (t - this.eclipseAt)) / SEASON));
  }

  moon(day: number, hour: number): MoonState {
    const ph = this.phase(day, hour), sun = bodyDir(hour);
    const m = bodyDir(hour - ph * 24), dec = this.declination(day, hour);
    const dir = norm({ x: m.x + dec, y: m.y, z: m.z });
    const lit = (1 - Math.cos(ph * TAU)) / 2;
    const solar = overlap(sep(dir, sun), SUN_R, MOON_R);
    const anti = { x: -sun.x, y: -sun.y, z: -sun.z };
    const lunar = overlap(sep(dir, anti), MOON_R, SHADOW_R);
    return { phase: ph, lit, dir, sun, solar, lunar, up: dir.y };
  }

  /** Hauteur de la marée (m) : deux marées hautes par jour lunaire, vives-eaux à la nouvelle et à la pleine lune. */
  tide(day: number, hour: number): number {
    const ph = this.phase(day, hour), moonHour = hour - ph * 24, spring = 0.55 + 0.45 * Math.abs(Math.cos(ph * TAU));
    return 0.8 * spring * Math.cos((moonHour / 24) * TAU * 2);
  }

  /** Comète visible quelques jours tous les ~23 jours : position dans le ciel (fixe parmi les étoiles) et intensité 0..1. */
  comet(day: number, hour: number): { on: number; dir: Dir } {
    const t = frac((Sky.date(day, hour) + this.cometAt) / 23);
    const on = t < 0.28 ? Math.min(1, Math.sin((t / 0.28) * Math.PI) * 2.2) : 0;
    return { on, dir: this.cometDir };
  }

  /** Aurore : intensité 0..1 pour la nuit du jour donné (environ une nuit sur quatre). */
  aurora(day: number): number { const h = hash(day * 1.7 + this.seed); return h < 0.28 ? 0.45 + 0.55 * (h / 0.28) : 0; }

  /** Nuit d'étoiles filantes (pluie de météores) : coefficient du taux d'apparition, 1 = ordinaire. */
  showers(day: number): number { return hash(day * 3.3 + this.seed * 7) < 0.14 ? 10 : 1; }

  /** Prochaine éclipse (solaire ou lunaire) à partir d'une date : { jour, heure } où elle est à son maximum. */
  nextEclipse(day: number, hour: number, kind: 'solaire' | 'lunaire'): { day: number; hour: number } {
    // pleine lune ↔ phase 0,5 ; nouvelle lune ↔ phase 0. Les deux sont alignées avec le soleil (éclipse solaire) ou avec son opposé (lunaire) au passage au méridien.
    const target = kind === 'solaire' ? 0 : 0.5;
    let best: { day: number; hour: number; v: number } | null = null;
    const d0 = Math.floor(day);
    for (let d = d0; d < d0 + MONTH * SEASON * 8; d++) {
      for (let h = 0; h < 24; h += 0.25) {
        const date = d + h / 24; if (date < Sky.date(day, hour) + 1e-6) continue;
        const ph = this.phase(d, h), dp = Math.min(Math.abs(ph - target), 1 - Math.abs(ph - target));
        if (dp > 0.02) continue;
        const ms = this.moon(d, h), v = kind === 'solaire' ? ms.solar : ms.lunar;
        if (v > 0.9 && (kind === 'solaire' ? ms.sun.y : ms.up) > 0.3 && (!best || date < best.day + best.hour / 24)) best = { day: d, hour: h, v };
      }
      if (best) break;
    }
    return best ? { day: best.day, hour: best.hour } : { day: day + MONTH * SEASON, hour };
  }
}
