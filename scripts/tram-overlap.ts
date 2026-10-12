import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
import { Traffic } from '../src/sim/traffic';
import { TramNet, TRAM_LEN } from '../src/sim/tram';
const seed = 1, def = generateLayout(seed), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp), traffic = new Traffic(roads, w, 6);
const net = new TramNet(wp.plans, (x, z) => t.height(x, z), 3, roads.nodes.filter(n => n.edges.length >= 3)); const rows: string[] = [];
for (let i = 0; i < 6000; i++) {
  traffic.step(w, 0.1, false); net.step(0.1, traffic.vehicles, 12);
  net.trams.forEach((x, k) => { for (const v of traffic.vehicles) { const dx = v.x - x.x, dz = v.z - x.z; if (dx * dx + dz * dz > 40) continue; const hx = Math.sin(x.yaw), hz = Math.cos(x.yaw), ah = dx * hx + dz * hz, lat = -dx * hz + dz * hx; if (Math.abs(ah) < TRAM_LEN / 2 && Math.abs(lat) < 0.9) { const cd = Math.hypot(x.x - x.line.hub.x, x.z - x.line.hub.z); rows.push(`t${i} tram${k} ${x.state} v=${x.v.toFixed(1)} s=${x.s.toFixed(0)}/${x.line.len.toFixed(0)} hubd=${cd.toFixed(0)} | veh ${v.kind} v=${v.v.toFixed(1)} ahead=${ah.toFixed(1)} lat=${lat.toFixed(2)} dyaw=${(((v.yaw - x.yaw) % 6.283) + 6.283) % 6.283 < 3.14 ? (((v.yaw - x.yaw) % 6.283) + 6.283) % 6.283 : ((v.yaw - x.yaw) % 6.283) + 6.283 - 6.283}`); } } });
}
console.log(rows.length); console.log(rows.filter((_, i) => i % 6 === 0).slice(0, 30).join('\n'));
