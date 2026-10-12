import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
for (let s = 1; s <= 8; s++) {
  const def = generateLayout(s), w = new World(def), t = new Terrain(w.net, def.urban); const cause: Record<string, number> = {}; let worst = 0;
  for (const r of t.rivers) { const n = r.pts.length; r.pts.forEach((p, i) => {
    const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(n - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
    for (const k of [-0.9, 0, 0.9]) { const x = p.x + nx * k * r.width / 2, z = p.z + nz * k * r.width / 2, e = t.height(x, z) - p.level; if (e > 0.3) { const q = t.nearest(x, z); const key = q.tf > 0.3 ? 'tunnel' : q.bf > 0.3 ? 'pont' : q.d < 30 ? 'voie<30' : q.d < 110 ? 'voie<110' : 'autre'; cause[key] = (cause[key] ?? 0) + 1; worst = Math.max(worst, e); } }
  }); }
  console.log(`graine ${s}: ${JSON.stringify(cause)} pire ${worst.toFixed(1)}`);
}
