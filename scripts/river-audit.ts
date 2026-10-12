// Audit des rivières : zones traversées, franchissements de la voie (pont ou non).
import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planSea, planTributary } from '../src/sim/water';
import { rng } from '../src/sim/cityplan';
import layout from '../src/layout.json';
const a = +process.argv[2] || 1, b = +process.argv[3] || 6;
for (let s = a - 1; s <= b; s++) {
  const def = s === a - 1 ? (layout as never) : generateLayout(s), w = new World(def), t0 = new Terrain(w.net, def.urban);
  const sea = planSea(t0, w.net.guides, s, 2400, rng(s ^ 0x5ea)), t = sea ? new Terrain(w.net, def.urban, 26, 110, sea) : t0, tr = planTributary(t, w.net.guides, rng(s ^ 0x7b1b)); if (tr) t.addTributary(tr.points, tr.width, 'Affluent');
  const out: string[] = [];
  for (const R of t.rivers) {
    const hits: string[] = [];
    for (const z of t.zones) { let m = 1e9; for (const p of R.pts) m = Math.min(m, Math.hypot(p.x - z.x, p.z - z.z)); if (m < z.r * 1.15 + R.width / 2 + 25) hits.push(`${z.name ?? z.kind}(${z.kind}, r=${z.r}, d=${m.toFixed(0)})`); }
    let nb = 0, nn = 0; const where: string[] = [];
    for (const g of w.net.guides) { const q = t.riverNear(g.x, g.z); if (q && q.d < q.hw + 6) { if (g.bf) nb++; else { nn++; if (where.length < 3) where.push(`${g.x.toFixed(0)},${g.z.toFixed(0)}`); } } }
    out.push(`${R.name}: zones touchées [${hits.join('; ') || '—'}] ; échantillons de voie sur l'eau : pont ${nb}, SANS pont ${nn} ${where.join(' ')}`);
  }
  console.log(`${s === a - 1 ? 'défaut' : 'graine ' + s}:\n  ${out.join('\n  ')}`);
}
