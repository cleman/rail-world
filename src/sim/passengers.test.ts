import { describe, it, expect } from 'vitest';
import layout from '../layout.json';
import { World } from './world';
import { Platforms } from './passengers';
import type { LayoutDef } from './network';

describe('Voyageurs sur les quais', () => {
  it('attendent, descendent et montent : peu à 4 h, plus à 18 h, jamais hors du quai ni en nombre démesuré', () => {
    const peak = (hour: number) => {
      const w = new World(layout as unknown as LayoutDef), pf = new Platforms(w, 3);
      let mx = 0, seenBoard = false, seenLeave = false;
      for (let i = 0; i < 60 * 900; i++) {
        w.step(1 / 60);
        if (i % 6) continue;
        pf.step(0.1, hour);
        mx = Math.max(mx, pf.list.length);
        for (const p of pf.list) {
          if (p.mode === 'board') seenBoard = true; if (p.mode === 'leave') seenLeave = true;
          expect(p.lat).toBeGreaterThan(1.5); expect(p.lat).toBeLessThan(13); expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
        }
      }
      return { mx, seenBoard, seenLeave };
    };
    const night = peak(4), eve = peak(17.8);
    expect(eve.mx).toBeGreaterThan(night.mx);
    expect(eve.seenBoard && eve.seenLeave).toBe(true);
    expect(eve.mx).toBeLessThan(600);
  });
});
