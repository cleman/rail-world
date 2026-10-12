// Monde construit comme main.ts (mer, affluent, villes, routes), pour les audits.
import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planSea, planTributary } from '../src/sim/water';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
import { rng } from '../src/sim/cityplan';
import layout from '../src/layout.json';
export function buildLike(s: number) {
  const seed = s === 0 ? null : s, def = seed === null ? (layout as never as ReturnType<typeof generateLayout>) : generateLayout(seed), w = new World(def), net = w.net;
  const t0 = new Terrain(net, def.urban), sea = planSea(t0, net.guides, seed ?? 0, 2400, rng((seed ?? 0) ^ 0x5ea)), t = sea ? new Terrain(net, def.urban, 26, 110, sea) : t0;
  const trib = planTributary(t, net.guides, rng((seed ?? 0) ^ 0x7b1b)); if (trib) t.addTributary(trib.points, trib.width, 'Affluent');
  const wp = planWorld(net, t), roads = buildRoads(net, t, wp);
  return { def, w, net, t, sea, wp, roads };
}
