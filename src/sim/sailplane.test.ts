import { describe, it, expect } from 'vitest';
import { SailplaneOps } from './sailplane';

describe('Planeur', () => {
  it('remorqué, monte en ascendance, plane puis se pose sur le terrain', () => {
    const F = { x: 100, y: 30, z: -50, rot: 0.8 }, S = new SailplaneOps(F, () => 30, 5);
    let maxAlt = 0, parked = false, bad = false, tows = 0, thermals = 0, maxD = 0; const seen = new Set<string>();
    let hour = 11;
    for (let i = 0; i < 60000 && !parked; i++) {
      if (i % 10 === 0) hour = 11 + i * 0.1 / 3600;
      S.step(0.1, { hour: Math.min(hour, 16.5), rain: 0, storm: 0 });
      for (const p of S.planes) {
        const m = p.m; if (![m.x, m.y, m.z, m.yaw, m.pitch, m.roll].every(Number.isFinite)) bad = true;
        maxAlt = Math.max(maxAlt, m.y - 30); maxD = Math.max(maxD, Math.hypot(m.x - F.x, m.z - F.z)); seen.add(p.state);
        if (p.state === 'tow') tows++; if (p.state === 'thermal') thermals++;
        if (p.state === 'parked') parked = true;
        if (p.state !== 'grid' && p.state !== 'tow' && m.y < 30.3 - 1e-6 && p.state !== 'rollout' && p.state !== 'parked') bad = true;
      }
    }
    expect(bad).toBe(false); expect(tows).toBeGreaterThan(100); expect(thermals).toBeGreaterThan(500);
    expect(maxAlt).toBeGreaterThan(700); expect(maxD).toBeGreaterThan(500);
    for (const k of ['grid', 'tow', 'glide', 'thermal', 'return', 'spiral', 'approach', 'final', 'rollout']) expect(seen.has(k), k).toBe(true);
    expect(parked).toBe(true);
  });
  it('treuillage et ascendances partagées', () => {
    const S = new SailplaneOps({ x: 0, y: 0, z: 0, rot: 0.3 }, () => 0, 11);
    let winch = 0, maxWinchAlt = 0, shared = 0, same = true; const turns = new Map<number, number>();
    for (let i = 0; i < 60000; i++) {
      S.step(0.1, { hour: 11 + (i * 0.1) / 3600, rain: 0, storm: 0 });
      const per = new Map<number, number[]>();
      for (const p of S.planes) {
        if (p.state === 'winch') { winch++; maxWinchAlt = Math.max(maxWinchAlt, p.m.y); }
        if (p.state === 'thermal') { const l = per.get(p.thermal) ?? []; l.push(p.turn); per.set(p.thermal, l); }
      }
      for (const [, l] of per) if (l.length >= 2) { shared++; if (l.some(t => t !== l[0])) same = false; }
      void turns;
    }
    expect(winch).toBeGreaterThan(50); expect(maxWinchAlt).toBeGreaterThan(250); expect(shared).toBeGreaterThan(200);
  });
  it('pas de vol sous la pluie ni la nuit', () => {
    const S = new SailplaneOps({ x: 0, y: 0, z: 0, rot: 0 }, () => 0, 1);
    for (let i = 0; i < 2000; i++) S.step(0.1, { hour: 12, rain: 0.8, storm: 0 }); for (let i = 0; i < 2000; i++) S.step(0.1, { hour: 22, rain: 0, storm: 0 });
    expect(S.planes.length).toBe(0);
  });
});
