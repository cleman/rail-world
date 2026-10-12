import { buildLike } from './_world';
import { TramNet } from '../src/sim/tram';
import { Traffic } from '../src/sim/traffic';
const seed = Number(process.argv[2] ?? 1);
const b: any = buildLike(seed);
const net = new TramNet(b.wp.plans, (x: number, z: number) => b.t.height(x, z), seed + 77, b.roads.nodes.filter((n: any) => n.edges.length >= 3), b.roads.edges);
net.bindRoads(b.roads.nodes); const tr = new Traffic(b.roads, b.w, seed + 5); if (!process.env.NOPRIO) tr.tramPrio = net;
console.log('lignes', net.lines.map(l => `${l.name}${l.loop ? '(boucle)' : ''} ${Math.round(l.len)}m stops${l.stops.length} trams${l.trams.length}`).join(' | '));
const G: any = {}, P: any = {}; let stuck = 0, tot = 0, ovl = 0; const DT = 0.1;
for (let i = 0; i < 6000; i++) { tr.step(b.w, DT, false); net.step(DT, tr.vehicles, 12);
  for (const t of net.trams) { tot++; if (t.state === 'roule' && t.v < 0.1) { stuck++; (P as any)[t.line.name + ' #' + t.id] = ((P as any)[t.line.name + ' #' + t.id] ?? 0) + 1; }
    for (const v of tr.vehicles) { const dx = v.x - t.x, dz = v.z - t.z; if (dx * dx + dz * dz > 40) continue; const hx = Math.sin(t.yaw), hz = Math.cos(t.yaw); if (Math.abs(dx * hx + dz * hz) < 5.8 && Math.abs(-dx * hz + dz * hx) < 0.9) { ovl++; const k = `${t.state} tv${t.v < 0.3 ? 0 : 1} car${v.v < 0.3 ? 0 : 1} ${v.kind} lane${v.lane.edge.tier} jn${Math.round(Math.min(...net.lines.flatMap(()=>[0]), 0))} cosyaw${Math.cos(v.yaw - t.yaw) > 0.7 ? 'same' : Math.cos(v.yaw - t.yaw) < -0.7 ? 'opp' : 'cross'}`; (G as any)[k] = ((G as any)[k] ?? 0) + 1; } } } }
console.log('immobile en ligne', (100 * stuck / tot).toFixed(1) + '%', 'chevauchements', ovl);
for (const t of net.trams) if (t.stuck > 20) { const near = tr.vehicles.filter((v: any) => Math.hypot(v.x - t.x, v.z - t.z) < 25).map((v: any) => `${v.kind}@${Math.round(Math.hypot(v.x - t.x, v.z - t.z))}m v${v.v.toFixed(1)}`); const oth = net.trams.filter(o => o !== t && Math.hypot(o.x - t.x, o.z - t.z) < 30).map(o => `${o.name}@${Math.round(Math.hypot(o.x - t.x, o.z - t.z))}`); console.log(t.line.name, t.id, 's', Math.round(t.s), 'stuck', Math.round(t.stuck), 'veh', near.join(','), 'trams', oth.join(',')); }
{ const t = net.trams.find(t => t.stuck > 20); if (t) { console.log('--- détail', t.line.name, 'pos', Math.round(t.x), Math.round(t.z), 'yaw', t.yaw.toFixed(2));
  for (const v of tr.vehicles) { if (Math.hypot(v.x - t.x, v.z - t.z) < 22) { const dx = v.x - t.x, dz = v.z - t.z, hx = Math.sin(t.yaw), hz = Math.cos(t.yaw); console.log(v.kind, 'ahead', (dx * hx + dz * hz).toFixed(1), 'lat', (-dx * hz + dz * hx).toFixed(1), 'v', v.v.toFixed(1), 'acc', v.acc?.toFixed(1), 'yawdiff', Math.cos(v.yaw - t.yaw).toFixed(2), 'lane', v.lane.len.toFixed(0), 's', v.s.toFixed(0), 'holds', v.holds.length); } } } }
{ const t = net.trams.find(t => t.stuck > 20); if (t) { const v: any = tr.vehicles.find((v: any) => { const dx = v.x - t.x, dz = v.z - t.z, hx = Math.sin(t.yaw), hz = Math.cos(t.yaw); const a = dx * hx + dz * hz; return a > 0 && a < 8 && Math.abs(-dx * hz + dz * hx) < 2; });
  if (v) { const node = v.lane.to; console.log('=== voiture bloquée: lane', v.lane.len.toFixed(0), 's', v.s.toFixed(1), 'blocked(lane)', net.laneBlocked(v.lane), 'plan0 blocked', v.plan[0] && net.laneBlocked(v.plan[0]), 'node holders', node.holders.size, 'has self', node.holders.has(v), 'inLane==lane', node.inLane === v.lane, 'lights', !!node.lights, 'ld', v.lane.veh.indexOf(v), v.lane.veh.length, 'plan0 veh', v.plan[0]?.veh.length, 'vhold', v.holds.map((h: any) => h.node === node)); 
    for (const h of node.holders) { const o: any = h; console.log(' holder', o.kind, 'v', o.v.toFixed(1), 'dist', Math.round(Math.hypot(o.x - t.x, o.z - t.z)), 'lane s', o.s.toFixed(0), 'len', o.lane.len.toFixed(0)); } } } }

console.log(G);

console.log('immobile par tram', Object.entries(P).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${((v as number) / 60).toFixed(0)}s`).join(' '));
