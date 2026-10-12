import { generateLayout } from '../src/sim/worldgen';
const out: number[] = [];
for (let s = 1; s <= 120; s++) { const d = generateLayout(s); if (d.branches?.some(b => b.origin)) out.push(s); }
console.log(out.join(' '));
