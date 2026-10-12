import { describe, it, expect } from 'vitest';
import { World } from './world';
import { Terrain } from './terrain';
import { planSea, seaS } from './water';
import { rng } from './cityplan';
import layout from '../layout.json';

describe('Rivière du monde par défaut', () => {
  const def = layout as never as ConstructorParameters<typeof World>[0] & { urban: never };
  const w = new World(def), t = new Terrain(w.net, def.urban);
  it('ne touche aucune ville, et la voie la franchit toujours sur un pont', () => {
    expect(t.rivers.length).toBeGreaterThan(0);
    for (const R of t.rivers) for (const z of t.zones) { let m = 1e9; for (const p of R.pts) m = Math.min(m, Math.hypot(p.x - z.x, p.z - z.z)); expect(m).toBeGreaterThan(z.r + R.width / 2); }
    let bare = 0, bridged = 0;
    for (const g of w.net.guides) { const q = t.riverNear(g.x, g.z); if (q && q.d < q.hw + 6) { if (g.bf) bridged++; else bare++; } }
    expect(bridged).toBeGreaterThan(0); expect(bare).toBe(0);
  });
  it('les péniches passent sous la voie : au moins 5 m entre l\'eau et le dessous du tablier', () => {
    for (const g of w.net.guides) { const q = t.riverNear(g.x, g.z); if (q && q.d < q.hw) expect(g.y - 2.1 - q.level).toBeGreaterThan(5.5); }
  });
  it('la rivière rejoint la mer', () => {
    const sea = planSea(t, w.net.guides, 0, 2400, rng(0 ^ 0x5ea))!, ts = new Terrain(w.net, def.urban, 26, 110, sea), R = ts.rivers[0];
    expect(Math.max(seaS(sea, R.pts[0].x, R.pts[0].z), seaS(sea, R.pts[R.pts.length - 1].x, R.pts[R.pts.length - 1].z))).toBeGreaterThan(0);
  });
});
