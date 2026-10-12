import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planSea, planTributary } from '../src/sim/water';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
import { planPois } from '../src/sim/pois';
import { Ships } from '../src/sim/boats';
import { rng } from '../src/sim/cityplan';
const a = +process.argv[2] || 1, b = +process.argv[3] || 3;
for (let s = a; s <= b; s++) {
  const def = generateLayout(s), w = new World(def), t0 = new Terrain(w.net, def.urban);
  const sea = planSea(t0, w.net.guides, s, 2400, rng(s ^ 0x5ea)), t = sea ? new Terrain(w.net, def.urban, 26, 110, sea) : t0, tr = planTributary(t, w.net.guides, rng(s ^ 0x7b1b)); if (tr) t.addTributary(tr.points, tr.width, 'Affluent'); const wp = planWorld(w.net, t), r = buildRoads(w.net, t, wp);
  const pois = planPois(t, wp, r.dist, s), roadPts = r.edges.flatMap(e => e.poly.pts);
  const ships = new Ships(t, wp.lakes, pois, roadPts, w.net.guides, s);
  const kinds: Record<string, number> = {}; for (const sh of ships.ships) kinds[sh.kind] = (kinds[sh.kind] ?? 0) + 1;
  const badK: Record<string, number> = {}; let bad = 0, docked = 0, worst = 0; const seen = new Set<string>();
  for (let i = 0; i < 60 * 1500; i++) {
    ships.step(1 / 60); ships.work(1 / 60);
    if (i % 60 === 0) for (const sh of ships.ships) {
      if (sh.hidden) continue;
      if (!Number.isFinite(sh.x + sh.z + sh.yaw)) bad += 1000;
      if (sh.phase === 'quai') { docked++; seen.add(sh.name); }
      const h = t.height(sh.x, sh.z), dep = sh.y - h; if (dep < 0.3 && Math.abs(sh.x) < 2300 && Math.abs(sh.z) < 2300) { bad++; badK[sh.kind + ':' + sh.phase] = (badK[sh.kind + ':' + sh.phase] ?? 0) + 1; } if (dep < 0.3 && sh.phase !== 'mer') { worst = Math.max(worst, 0.3 - dep); }
    }
  }
  console.log(`graine ${s}: ports ${ships.ports.map(p => p.poi.water).join('/') || '-'} — navires ${JSON.stringify(kinds)} — hors d'eau ${bad} ${JSON.stringify(badK)} — secondes à quai ${docked} (${[...seen].join(',')}) — pire échouage ${worst.toFixed(1)}`);
}
