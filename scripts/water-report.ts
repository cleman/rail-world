// Eau par monde : mer (distance de la côte), lacs, rivières.
import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planSea, planTributary } from '../src/sim/water';
import { planWorld } from '../src/sim/planning';
import layout from '../src/layout.json';
import { rng } from '../src/sim/cityplan';
const a = +process.argv[2] || 1, b = +process.argv[3] || 8;
for (let s = a - 1; s <= b; s++) {
  const def = s === a - 1 ? (layout as never) : generateLayout(s), w = new World(def), t0 = new Terrain(w.net, def.urban);
  const sea = planSea(t0, w.net.guides, s, 2400, rng(s ^ 0x5ea));
  const t = sea ? new Terrain(w.net, def.urban, 26, 110, sea) : t0, tr = planTributary(t, w.net.guides, rng(s ^ 0x7b1b)); if (tr) t.addTributary(tr.points, tr.width, 'Affluent'); const wp = planWorld(w.net, t);
  console.log(`${s === a - 1 ? 'original' : 'graine ' + s}: mer ${sea ? `oui c0=${sea.c0.toFixed(0)} niveau=${sea.level.toFixed(1)}` : 'non'} — lacs ${wp.lakes.map(l => l.r).join('/') || '0'} — rivières ${t.rivers.length} (${t.rivers.map(r => r.pts.length).join(',')})`);
}
