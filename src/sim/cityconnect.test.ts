import { describe, it, expect } from 'vitest';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { generateLayout } from './worldgen';
import { streetsTouch, connectStreets, type Street } from './cityplan';

const comps = (S: Street[]) => { const par = S.map((_, i) => i), f = (i: number): number => (par[i] === i ? i : (par[i] = f(par[i]))); for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) if (streetsTouch(S[i], S[j])) par[f(i)] = f(j); return new Set(S.map((_, i) => f(i))).size; };

describe('Villes d\'un seul tenant', () => {
  it('connectStreets relie un groupe voisin par une rue courte et supprime un groupe inaccessible', () => {
    const A: Street = { pts: [[0, 0], [100, 0], [200, 0]], hw: 4, tier: 0 }, B: Street = { pts: [[100, 40], [100, 90]], hw: 3, tier: 2 }, C: Street = { pts: [[0, 500], [60, 500]], hw: 3, tier: 2 };
    const S = [A, B, C]; connectStreets(S, () => true, () => false, 120);
    expect(S.length).toBe(3);            // A, B + liaison ; C trop loin : supprimé
    expect(comps(S)).toBe(1);
  });
  it('chaque ville des mondes 1 à 3 a un réseau de rues connexe', () => {
    for (const seed of [1, 2, 3]) {
      const def = generateLayout(seed), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t);
      for (const pl of wp.plans) expect(comps(pl.streets)).toBe(1);
    }
  });
});
