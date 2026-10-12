import { checkLayout, _attempt } from '../src/sim/worldgen';
const why = new Map<string, number>(); let ok = 0, tot = 0;
for (let s = 1; s <= 10; s++) for (let k = 0; k < 20; k++) { tot++; const c = checkLayout(_attempt(s, k)); if (!c.problems.length) ok++; for (const p of c.problems) { const q = p.replace(/[\d.-]+/g, '#').replace(/(zones|rivière trop près de|gare|dépôt|lac sur) .*/, '$1 …'); why.set(q, (why.get(q) ?? 0) + 1); } }
console.log('valides', ok, '/', tot); for (const [k, v] of [...why].sort((a, b) => b[1] - a[1])) console.log(v, k);
