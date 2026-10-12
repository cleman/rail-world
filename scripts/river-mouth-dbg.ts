import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planSea, seaS } from '../src/sim/water';
import { rng } from '../src/sim/cityplan';
import layout from '../src/layout.json';
const def = layout as never, w = new World(def), t0 = new Terrain(w.net, (def as any).urban), sea = planSea(t0, w.net.guides, 0, 2400, rng(0 ^ 0x5ea))!;
const e = { x: -263, z: -1500 };
console.log('sea c0', sea.c0.toFixed(0), 'seaS end', seaS(sea, e.x, e.z).toFixed(0));
for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
  const ta = Math.atan2(sea.uz, sea.ux) + off, tx = Math.cos(ta), tz = Math.sin(ta); let x = e.x, z = e.z, dx = 0.3, dz = -0.95, mg = 1e9, mz = 1e9, i = 0;
  for (; i < 220; i++) { dx = dx * 0.93 + tx * 0.07; dz = dz * 0.93 + tz * 0.07; const l = Math.hypot(dx, dz); dx /= l; dz /= l; x += dx * 12; z += dz * 12; for (const g of w.net.guides) mg = Math.min(mg, Math.hypot(g.x - x, g.z - z)); for (const zn of t0.zones) mz = Math.min(mz, Math.hypot(zn.x - x, zn.z - z) - zn.r * 1.15); if (seaS(sea, x, z) > 30 || Math.abs(x) > 2300 || Math.abs(z) > 2300) break; }
  console.log(off, 'steps', i, 'end', x.toFixed(0), z.toFixed(0), 'minTrack', mg.toFixed(0), 'minZoneMargin', mz.toFixed(0));
}
