/** Biomes : thème du monde (couleurs du sol, végétation, ciel, eau). Pur, sans Three.js. */
import { vnoise } from './sim/terrain';

export type BiomeId = 'tempéré' | 'désert' | 'neige' | 'automne' | 'tropical';

export interface Biome {
  id: BiomeId;
  label: string;
  /** Couleurs du sol (hex) : herbe A/B, altitude, roche, sable des berges. */
  grassA: number; grassB: number; high: number; rock: number; sand: number;
  /** Ciel de jour, couleur du sol pour l'éclairage hémisphérique, eau. */
  sky: number; ground: number; water: number;
  /** Nuances des conifères / feuillus / buissons. */
  conifer: number[]; broad: number[]; bush: number[];
  /** Coefficients de densité des conifères, feuillus, buissons. */
  mix: { conifer: number; broad: number; bush: number };
  /** Arbres typiques : cactus (désert) ou palmiers (tropical). */
  deco: 'cactus' | 'palm' | null; decoCount: number;
  /** Teintes des champs et des haies (null = celles du thème tempéré). */
  fields: number[] | null; hedge: number[] | null;
  /** Précipitations : flocons ou feuilles mortes. */
  precip: 'neige' | 'feuilles' | null;
  /** Distance du brouillard (facteur). */
  fog: number;
}

export const BIOMES: Record<BiomeId, Biome> = {
  tempéré: {
    id: 'tempéré', label: 'Tempéré',
    grassA: 0x679853, grassB: 0x7fae5c, high: 0x9a9360, rock: 0xa8a49c, sand: 0xc9bb8a,
    sky: 0xbfd8ea, ground: 0x557744, water: 0x3d7fb5,
    conifer: [0x2f6b3a, 0x285c33, 0x356f40], broad: [0x5f9b45, 0x6aa84d, 0x4e8a3b, 0x8aa83c, 0xb0a03a], bush: [0x4f8a3a, 0x5d9444, 0x6b7f35],
    mix: { conifer: 1, broad: 1, bush: 1 }, deco: null, decoCount: 0, fields: null, hedge: null, precip: null, fog: 1,
  },
  désert: {
    id: 'désert', label: 'Désert',
    grassA: 0xc8aa6c, grassB: 0xd8bc7c, high: 0xb48a58, rock: 0xa6805c, sand: 0xe2cf98,
    sky: 0xd9d2bc, ground: 0x9a7f55, water: 0x4a9bb0,
    conifer: [0x6d7a45, 0x7b8650], broad: [0x8b8f4a, 0x9a9a52, 0x7a8244], bush: [0x8e8a52, 0x9c9358, 0x7d7a48],
    mix: { conifer: 0.1, broad: 0.18, bush: 0.7 }, deco: 'cactus', decoCount: 900,
    fields: [0xcdb26e, 0xc29a5e, 0xd8c382, 0xb58c58, 0xa5a15a], hedge: [0x8a8a4c, 0x7a7a44], precip: null, fog: 0.9,
  },
  neige: {
    id: 'neige', label: 'Neige',
    grassA: 0xe8eef2, grassB: 0xf4f7f9, high: 0xf6f8fa, rock: 0xa4a8b0, sand: 0xdde6ee,
    sky: 0xdfe6ee, ground: 0xb8c4d0, water: 0x4a7fa5,
    conifer: [0x335f4a, 0x2d5442, 0x3d6b55, 0xcfe0e0], broad: [0x8a7a6a, 0x9a8a78, 0x7a6e60], bush: [0x7a8a82, 0x8a9890],
    mix: { conifer: 1.6, broad: 0.35, bush: 0.6 }, deco: null, decoCount: 0,
    fields: [0xf0f4f6, 0xe4ebef, 0xd9e2e8, 0xeaeee8], hedge: [0x6a7a70, 0x7a8a80], precip: 'neige', fog: 0.7,
  },
  automne: {
    id: 'automne', label: 'Automne',
    grassA: 0x8a8f4a, grassB: 0xa49a4c, high: 0x9a7a4a, rock: 0xa09890, sand: 0xc9b886,
    sky: 0xc8d4dc, ground: 0x7a6a3c, water: 0x4a7a9a,
    conifer: [0x2f5a35, 0x3a6338], broad: [0xc2631f, 0xd68a22, 0xb23e1c, 0xe0b030, 0x9a4a1c, 0xc8a02c], bush: [0xa8641e, 0x8a7a2e, 0xb27a24],
    mix: { conifer: 0.6, broad: 1.4, bush: 1 }, deco: null, decoCount: 0,
    fields: [0xc8a04c, 0xb88a3c, 0xd2b45a, 0x8d6f4a, 0xa89040, 0x9a7a3a], hedge: [0x8a5a2a, 0x7a6a30], precip: 'feuilles', fog: 0.9,
  },
  tropical: {
    id: 'tropical', label: 'Tropical',
    grassA: 0x3f9a4a, grassB: 0x58b552, high: 0x5f8f4a, rock: 0x8f9488, sand: 0xe8dcaa,
    sky: 0xa8dcea, ground: 0x2f6a3a, water: 0x2fb0c0,
    conifer: [0x1f6a3a, 0x257a40], broad: [0x2f9a3f, 0x3fae4a, 0x1f8a44, 0x5fbf48], bush: [0x2f8a3a, 0x42a044, 0x6aaa3a],
    mix: { conifer: 0.35, broad: 1.5, bush: 1.3 }, deco: 'palm', decoCount: 700,
    fields: [0x7cc457, 0x62b04c, 0xb5cf5c, 0x8fbf4f, 0x4f9a46], hedge: [0x2f7a38, 0x3f8a40], precip: null, fog: 1.1,
  },
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];

/**
 * Carte des biomes d'un monde : un biome principal et, parfois, un second de l'autre côté d'une frontière floue
 * (droite orientée au hasard, déformée par du bruit). `mix` vaut 0 dans le premier, 1 dans le second.
 */
export class BiomeMap {
  private cx: number; private cz: number; private seed: number;
  constructor(readonly a: Biome, readonly b: Biome | null, seed = 0, private half = 2400) {
    const ang = ((Math.imul(seed | 0, 2246822519) >>> 0) % 6283) / 1000;
    this.cx = Math.cos(ang); this.cz = Math.sin(ang); this.seed = seed;
  }
  mix(x: number, z: number): number {
    if (!this.b) return 0;
    const u = (x * this.cx + z * this.cz) / this.half + (vnoise(x / 700 + 11, z / 700 + 5, this.seed + 91) - 0.5) * 0.7;
    const t = Math.max(0, Math.min(1, (u + 0.16) / 0.32));
    return t * t * (3 - 2 * t);
  }
  /** Biome dominant en (x, z). */
  at(x: number, z: number): Biome { return this.b && this.mix(x, z) > 0.5 ? this.b : this.a; }
  get biomes(): Biome[] { return this.b ? [this.a, this.b] : [this.a]; }
}

/** Carte des biomes d'un monde : `?biome=neige` ou `?biome=neige+désert` (deux biomes) imposent le thème ; sinon la graine décide (un monde sur deux a deux biomes). */
export function pickBiomeMap(seed: number | null, override?: string | null): BiomeMap {
  const o = override?.split(/[+ ,]/).map(x => x.trim()).filter(Boolean) ?? [];
  if (o.length) {
    const a = pickBiome(seed, o[0]), b = o[1] ? pickBiome(seed, o[1]) : null;
    return new BiomeMap(a, b && b.id !== a.id ? b : null, seed ?? 0);
  }
  if (seed === null) return new BiomeMap(BIOMES.tempéré, null, 0);
  const a = pickBiome(seed);
  let h = (Math.imul(seed | 0, 1597334677) ^ 0x2545f491) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
  const others = BIOME_IDS.filter(k => k !== a.id);
  return new BiomeMap(a, h % 2 ? BIOMES[others[(h >>> 4) % others.length]] : null, seed);
}

/** Biome d'un monde : le monde d'origine reste tempéré ; sinon tiré de la graine (tempéré une fois sur trois). `override` (paramètre ?biome=) l'emporte. */
export function pickBiome(seed: number | null, override?: string | null): Biome {
  const o = override?.trim().toLowerCase();
  if (o) {
    const hit = BIOME_IDS.find(k => k === o || k.normalize('NFD').replace(/[̀-ͯ]/g, '') === o.normalize('NFD').replace(/[̀-ͯ]/g, ''));
    if (hit) return BIOMES[hit];
  }
  if (seed === null) return BIOMES.tempéré;
  let h = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h ^= h >>> 13;
  const r = (h % 9);
  return BIOMES[r < 3 ? 'tempéré' : (['désert', 'neige', 'automne', 'tropical', 'tempéré', 'désert'] as BiomeId[])[r - 3]];
}
