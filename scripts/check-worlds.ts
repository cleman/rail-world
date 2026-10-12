import { generateLayout, checkLayout } from '../src/sim/worldgen';
import layout from '../src/layout.json';
const a = +process.argv[2] || 1, b = +process.argv[3] || 12;
console.log('défaut :', checkLayout(layout as never).problems.join(' ; ') || 'OK');
let bad = 0; const t0 = Date.now();
for (let s = a; s <= b; s++) { const d = generateLayout(s), c = checkLayout(d).problems; if (c.length) { bad++; console.log('graine', s, c.join(' ; ')); } }
console.log(`${b - a + 1} mondes, ${bad} avec problèmes, ${(Date.now() - t0) / 1000}s`);
