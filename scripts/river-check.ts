// Vérifie que le lit des rivières est creusé sous le niveau de l'eau sur toute la largeur.
import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planSea, planTributary } from '../src/sim/water';
import { rng } from '../src/sim/cityplan';
for (let s = +process.argv[2] || 1; s <= (+process.argv[3] || 6); s++) {
  const def = generateLayout(s), w = new World(def), t0 = new Terrain(w.net, def.urban);
  const sea = planSea(t0, w.net.guides, s, 2400, rng(s ^ 0x5ea)), t = sea ? new Terrain(w.net, def.urban, 26, 110, sea) : t0, tr = planTributary(t, w.net.guides, rng(s ^ 0x7b1b)); if (tr) t.addTributary(tr.points, tr.width, 'Affluent');
  for (const r of t.rivers) {
    let bad = 0, worst = 0, at = '', first = -1; const n = r.pts.length;
    r.pts.forEach((p, i) => {
      const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(n - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
      for (const k of [-0.9, -0.5, 0, 0.5, 0.9]) { const x = p.x + nx * k * r.width / 2, z = p.z + nz * k * r.width / 2, e = (process.env.NAT ? t.natural(x, z) : t.height(x, z)) - p.level; if (e > 0.05) { bad++; if (first < 0) first = i; if (e > worst) { worst = e; at = `${x.toFixed(0)},${z.toFixed(0)} i=${i}/${n}`; } } }
    });
    console.log(`graine ${s} ${r.name}: ${n} pts, largeur ${r.width.toFixed(0)}, échantillons au-dessus de l'eau ${bad}, pire ${worst.toFixed(1)} m à ${at}`);
  }
}
