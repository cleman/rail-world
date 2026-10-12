// Points d'intérêt par monde : quels types sont placés (aérodrome, port, château...).
import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
import { planPois } from '../src/sim/pois';
const a = +process.argv[2] || 1, b = +process.argv[3] || 8;
for (let s = a; s <= b; s++) {
  const def = generateLayout(s), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), r = buildRoads(w.net, t, wp);
  const p = planPois(t, wp, r.dist, s);
  console.log(`graine ${s}: lac ${wp.lake ? 'oui' : 'non'} — ${p.map(q => q.kind).join(', ')}`);
}
