import { describe, it, expect } from 'vitest';
import { Weather, WEATHER_KINDS } from './weather';

describe('Météo', () => {
  it('change de temps, avec des niveaux toujours dans [0, 1] et des transitions lentes', () => {
    const w = new Weather(5), seen = new Set<string>(); let maxJump = 0, prev = w.cloud + w.rain + w.fog + w.storm;
    for (let i = 0; i < 20 * 3600; i++) {
      w.step(0.1); seen.add(w.kind);
      for (const v of [w.cloud, w.rain, w.fog, w.storm, w.flash]) { expect(v).toBeGreaterThanOrEqual(-1e-9); expect(v).toBeLessThanOrEqual(1 + 1e-9); }
      const s = w.cloud + w.rain + w.fog + w.storm; maxJump = Math.max(maxJump, Math.abs(s - prev)); prev = s;
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(maxJump).toBeLessThan(0.05);
  });
  it('le désert est plus sec que le tropical ; un temps imposé est atteint ; orage = éclairs et tonnerre', () => {
    const count = (wet: number) => { const w = new Weather(9, wet); let rainy = 0; for (let i = 0; i < 30 * 3600; i++) { w.step(0.1); if (w.rain > 0.3) rainy++; } return rainy; };
    expect(count(0.1)).toBeLessThan(count(1.8));
    const w = new Weather(2); w.forced = 'orage'; let flashes = 0, thunder = 0, was = 0;
    for (let i = 0; i < 20 * 600; i++) { w.step(0.05); if (w.flash > 0.9 && was <= 0.9) flashes++; was = w.flash; }
    thunder = w.thunders;
    expect(w.storm).toBeGreaterThan(0.95); expect(flashes).toBeGreaterThan(10); expect(thunder).toBeGreaterThan(5);
    w.forced = 'clair'; for (let i = 0; i < 20 * 120; i++) w.step(0.05);
    expect(w.rain).toBeLessThan(0.05); expect(WEATHER_KINDS).toContain(w.label);
  });
});
