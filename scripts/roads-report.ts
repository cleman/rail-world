import layout from '../src/layout.json';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
import type { LayoutDef } from '../src/sim/network';

const def = layout as unknown as LayoutDef;
const w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t);
const t0 = Date.now();
const r = buildRoads(w.net, t, wp);
console.log(r.report.join('\n'), `\n${Date.now() - t0} ms`);
for (const c of r.crossings) console.log('passage', c.x.toFixed(0), c.z.toFixed(0), c.rail.map(a => a.edgeId).join(' '));
