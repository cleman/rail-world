import { describe, it, expect } from 'vitest';
import { activity } from './pedestrians';
describe('piétons', () => {
  it('activité : calme la nuit, forte aux heures de pointe', () => {
    expect(activity(3)).toBeLessThan(0.15);
    expect(activity(8)).toBeGreaterThan(0.6);
    expect(activity(18)).toBeGreaterThan(0.6);
    for (let h = 0; h < 24; h += 0.25) { const a = activity(h); expect(a).toBeGreaterThan(0); expect(a).toBeLessThanOrEqual(1); }
  });
});
