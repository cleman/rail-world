import { describe, it, expect } from 'vitest';
import { pickBiomeMap, BIOME_IDS } from './biome';

describe('Biomes', () => {
  it('le monde d\'origine est tempéré ; l\'option ?biome= impose un ou deux biomes ; la graine est déterministe', () => {
    expect(pickBiomeMap(null).a.id).toBe('tempéré');
    expect(pickBiomeMap(null).b).toBeNull();
    const m = pickBiomeMap(3, 'désert+neige');
    expect(m.a.id).toBe('désert'); expect(m.b?.id).toBe('neige');
    expect(pickBiomeMap(7, 'neige').b).toBeNull();
    expect(pickBiomeMap(12).a.id).toBe(pickBiomeMap(12).a.id);
  });
  it('la frontière sépare bien les deux biomes, de façon continue', () => {
    const m = pickBiomeMap(5, 'désert+tropical');
    let lo = 0, hi = 0, prev = m.mix(-2400, 0), maxStep = 0;
    for (let x = -2400; x <= 2400; x += 10) { const v = m.mix(x, 100); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); if (v < 0.05) lo++; if (v > 0.95) hi++; maxStep = Math.max(maxStep, Math.abs(v - prev)); prev = v; }
    // une direction quelconque de la frontière peut être presque parallèle à cette coupe : on teste sur l'ensemble du plan
    let a = 0, b = 0; for (let x = -2200; x <= 2200; x += 200) for (let z = -2200; z <= 2200; z += 200) { const v = m.mix(x, z); if (v < 0.05) a++; if (v > 0.95) b++; }
    expect(a).toBeGreaterThan(20); expect(b).toBeGreaterThan(20);
    expect(maxStep).toBeLessThan(0.35);
    void lo; void hi;
  });
  it('un monde sur deux environ mélange deux biomes', () => {
    let two = 0; const kinds = new Set<string>();
    for (let s = 1; s <= 60; s++) { const m = pickBiomeMap(s); if (m.b) { two++; expect(m.b.id).not.toBe(m.a.id); } kinds.add(m.a.id); }
    expect(two).toBeGreaterThan(15); expect(two).toBeLessThan(45);
    expect(kinds.size).toBeGreaterThanOrEqual(4); expect(BIOME_IDS.length).toBe(5);
  });
});
