import { buildLike } from './_world';
import { TramNet } from '../src/sim/tram';
import { Traffic } from '../src/sim/traffic';
const seed = Number(process.argv[2] ?? 3); const b: any = buildLike(seed);
const net = new TramNet(b.wp.plans, (x: number, z: number) => b.t.height(x, z), seed + 77, b.roads.nodes.filter((n: any) => n.edges.length >= 3), b.roads.edges);
net.bindRoads(b.roads.nodes); const tr = new Traffic(b.roads, b.w, seed + 5); tr.tramPrio = net;
for (let i = 0; i < 6000; i++) { tr.step(b.w, 0.1, false); net.step(0.1, tr.vehicles, 12); }
for (const t of net.trams) if (t.stuck > 20) console.log(t.id, t.line.name, 's', t.s.toFixed(0), 'pos', t.x.toFixed(0), t.z.toFixed(0), 'yaw', t.yaw.toFixed(2), 'state', t.state, 'stuck', t.stuck.toFixed(0));
const crs = (net as any).crosses; console.log('crosses', crs.length, crs.filter((c: any) => c.holder).map((c: any) => `${c.x.toFixed(0)},${c.z.toFixed(0)} holder ${c.holder.id}`).join(' | '));
for (const t of net.trams) if (t.stuck > 20) { console.log('--- tram', t.id);
  const hx = Math.sin(t.yaw), hz = Math.cos(t.yaw);
  for (const v of tr.vehicles) { const dx = v.x - t.x, dz = v.z - t.z; if (dx*dx+dz*dz > 900) continue; console.log(' veh', v.kind, 'ahead', (dx*hx+dz*hz).toFixed(1), 'lat', (-dx*hz+dz*hx).toFixed(1), 'v', v.v.toFixed(1)); }
  for (const o of net.trams) if (o !== t) { const dx = o.x - t.x, dz = o.z - t.z; if (dx*dx+dz*dz < 900) console.log(' tram', o.id, 'ahead', (dx*hx+dz*hz).toFixed(1), 'lat', (-dx*hz+dz*hx).toFixed(1), 'yawdiff', Math.cos(o.yaw - t.yaw).toFixed(2)); } }
{ const t = net.trams.find(t => t.id === 6)!; const L = t.line; console.log('L len', L.len, 'stops', L.stops, 't.s', t.s, 'v', t.v, 'dwell', t.dwell, 'state', t.state, 'atStop', t.atStop, 'loop', L.loop, 'trams', L.trams.map(x => x.s.toFixed(0)+'/'+x.v.toFixed(1)).join(' '));
 for (let k = 0; k < 5; k++) { const before = t.s; net.step(0.1, [], 12); console.log('step', t.s.toFixed(2), t.v.toFixed(2), t.stuck.toFixed(1)); } }
{ const t = net.trams.find(t => t.id === 6)!; const n: any = net; const pts: any[] = []; for (const o of net.trams) if (o !== t) for (const k of [-4.5,0,4.5]) pts.push({ x: o.x + Math.sin(o.yaw)*k, z: o.z + Math.cos(o.yaw)*k });
 console.log('free', n.freeAhead(t, pts)); for (const o of net.trams) if (o !== t) console.log(o.id, o.x.toFixed(1), o.z.toFixed(1), 'me', t.x.toFixed(1), t.z.toFixed(1)); }
