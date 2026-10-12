import { buildLike } from './_world';
import { TramNet } from '../src/sim/tram';
const b: any = buildLike(3);
const net = new TramNet(b.wp.plans, (x: number, z: number) => b.t.height(x, z), 3, b.roads.nodes.filter((n: any) => n.edges.length >= 3), b.roads.edges);
const L = net.lines.find(l => l.loop)!; console.log(L.name, L.len, L.stops, L.trams.map(t => t.s));
for (let i = 0; i < 6000; i++) { net.step(0.1, [], 12); if (i % 300 === 0) console.log(i / 10, L.trams.map(t => `${t.s.toFixed(0)}/${t.v.toFixed(1)}/${t.state}`).join(' ')); }
