import { readFileSync } from 'node:fs';
import { buildNetwork, type LayoutDef } from '../src/sim/network';
const def = JSON.parse(readFileSync('src/layout.json', 'utf8')) as LayoutDef;
const net = buildNetwork(def);
for (const l of net.lines) { let m = 0, at = 0; for (let i = 0; i + 1 < l.center.length; i++) { const g = Math.abs(l.center[i + 1].y - l.center[i].y) / l.step; if (g > m) { m = g; at = i; } } console.log(l.id, (m * 100).toFixed(2), '% à', at, l.center.length); }
for (const e of net.edges) { let m = 0; for (let i = 0; i + 1 < e.pts.length; i++) m = Math.max(m, Math.abs(e.pts[i + 1].y - e.pts[i].y) / Math.max(1, Math.hypot(e.pts[i + 1].x - e.pts[i].x, e.pts[i + 1].z - e.pts[i].z))); if (m > 0.025) console.log(e.id, (m * 100).toFixed(1), e.len.toFixed(0)); }
const D = net.lines.find(l => l.id === 'D')!; console.log(D.center.slice(0, 8).map(p => p.y.toFixed(2)).join(' '), '...', D.center.slice(-4).map(p => p.y.toFixed(1)).join(' '));
const ringY = net.center; console.log('ring ys', ringY.length);
const e1 = net.edges.find(e => e.id === 'D-c1')!, e3 = net.edges.find(e => e.id === 'D-c3')!; console.log('c1', e1.pts[0].y.toFixed(1), e1.pts[e1.pts.length - 1].y.toFixed(1), 'c3', e3.pts[0].y.toFixed(1), e3.pts[e3.pts.length - 1].y.toFixed(1));
const Cc = net.lines.find(l => l.id === 'C')!; console.log(Cc.center.slice(170, 190).map(p => p.y.toFixed(1)).join(' '));
