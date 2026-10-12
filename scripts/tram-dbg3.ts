import { buildLike } from './_world';
import { TramNet } from '../src/sim/tram';
import { Traffic } from '../src/sim/traffic';
const seed = Number(process.argv[2] ?? 2); const b: any = buildLike(seed);
const net = new TramNet(b.wp.plans, (x: number, z: number) => b.t.height(x, z), seed + 77, b.roads.nodes.filter((n: any) => n.edges.length >= 3), b.roads.edges);
net.bindRoads(b.roads.nodes); const tr = new Traffic(b.roads, b.w, seed + 5); tr.tramPrio = net;
const ev = new Map<string, number>();
for (let i = 0; i < 6000; i++) { tr.step(b.w, 0.1, false); net.step(0.1, tr.vehicles, 12); if (net.trams.some(t => t.line.loop && t.stuck > 14)) break;
  for (const t of net.trams) if (t.state === 'roule' && t.v < 0.1 && t.stuck > 4 && t.line.loop) {
    const hx = Math.sin(t.yaw), hz = Math.cos(t.yaw); let what = 'rien';
    for (const v of tr.vehicles) { const dx = v.x - t.x, dz = v.z - t.z, a = dx*hx+dz*hz, l = Math.abs(-dx*hz+dz*hx); if (a > 0 && a < 22 && l < 1.3) what = `${v.kind} v${v.v.toFixed(1)} a${a.toFixed(0)} lanes${v.lane.edge.tier}`; }
    for (const o of net.trams) if (o !== t) { const dx = o.x - t.x, dz = o.z - t.z, a = dx*hx+dz*hz, l = Math.abs(-dx*hz+dz*hx); if (a > 0 && a < 22 && l < 1.3) what = 'tram ' + o.id + (o.state); }
    const k = what.split(' ')[0] + '@' + Math.round(t.x / 30) + ',' + Math.round(t.z / 30); ev.set(k, (ev.get(k) ?? 0) + 1); } }
console.log([...ev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
for (const t of net.trams) if (t.line.loop && t.stuck > 8) console.log(t.id, 's', t.s.toFixed(0), 'pos', t.x.toFixed(0), t.z.toFixed(0), 'yaw', t.yaw.toFixed(2), 'v', t.v.toFixed(1), t.state, 'stuck', t.stuck.toFixed(0));
const L = net.lines.find(l => l.loop)!; let near: string[] = []; for (let i = 0; i < L.x.length; i++) for (let j = i + 20; j < L.x.length - 1; j++) if (Math.hypot(L.x[i] - L.x[j], L.z[i] - L.z[j]) < 6 && !(i < 3 && j > L.x.length - 4)) { near.push(`${i * 3}~${j * 3}@${L.x[i].toFixed(0)},${L.z[i].toFixed(0)}`); break; }
console.log('auto-proximité', near.length, near.slice(0, 8));
{ const t = net.trams.find(t => t.stuck > 8)!; const hx = Math.sin(t.yaw), hz = Math.cos(t.yaw);
 for (const v of tr.vehicles) { const dx = v.x - t.x, dz = v.z - t.z, a = dx*hx+dz*hz, l = -dx*hz+dz*hx; if (Math.hypot(dx, dz) < 30) { const n = v.lane.to; console.log(v.kind, 'a', a.toFixed(1), 'lat', l.toFixed(1), 'v', v.v.toFixed(1), 'lane', v.lane.len.toFixed(0), 's', v.s.toFixed(0), 'holds', v.holds.length, 'nodeHolders', n.holders.size, 'light', n.lights ? 'oui' : 'non', 'blocked', net.laneBlocked(v.lane), 'tier', v.lane.edge.tier, 'hw', v.lane.edge.hw); } }
 console.log('line hw', t.line.hw); }
