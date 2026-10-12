// Distance de l'extrémité aval de chaque rivière à la côte (seaS < 0 : à terre).
import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planSea, seaS } from '../src/sim/water';
import { rng } from '../src/sim/cityplan';
import layout from '../src/layout.json';
const a = +process.argv[2] || 1, b = +process.argv[3] || 6;
for (let s = a - 1; s <= b; s++) {
  const def = s === a - 1 ? (layout as never) : generateLayout(s), w = new World(def), t0 = new Terrain(w.net, def.urban);
  const sea = planSea(t0, w.net.guides, s === a - 1 ? 0 : s, 2400, rng((s === a - 1 ? 0 : s) ^ 0x5ea)); if (!sea) { console.log(s, 'pas de mer'); continue; }
  const t = new Terrain(w.net, def.urban, 26, 110, sea);
  console.log(s === a - 1 ? 'défaut' : 'graine ' + s, 'mer u=', sea.ux.toFixed(2), sea.uz.toFixed(2), 'rivières', t.rivers.length, t.rivers.map(R => { const e = R.pts[R.pts.length - 1], f = R.pts[0]; return `${R.name} amont s=${seaS(sea, f.x, f.z).toFixed(0)} aval s=${seaS(sea, e.x, e.z).toFixed(0)} (${e.x.toFixed(0)},${e.z.toFixed(0)})`; }).join(' ; '));
}
