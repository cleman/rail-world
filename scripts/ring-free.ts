import { World } from '../src/sim/world';
import layout from '../src/layout.json';
const w = new World(layout as never), B = w.net.ringBlocked, C = w.net.center, N = C.length; const out: string[] = [];
let i = 0; while (i < N) { const v = B[i]; let j = i; while (j < N && B[j] === v) j++; out.push(`${v ? 'BLOQUÉ' : 'libre '} i=${i}..${j - 1} (${C[i].x.toFixed(0)},${C[i].z.toFixed(0)}) → (${C[j - 1].x.toFixed(0)},${C[j - 1].z.toFixed(0)})`); i = j; }
console.log(out.join('\n'));
