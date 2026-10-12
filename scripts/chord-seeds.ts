// Statistiques de génération (composition, raisons d'échec) : npx tsx scripts/chord-seeds.ts [n]
import { checkLayout, generateLayout } from '../src/sim/worldgen';
const n = Number(process.argv[2] ?? 20);
const why = new Map<string, number>(); let bad = 0; const comp = new Map<string, number>();
for (let s = 1; s <= n; s++) {
  const t0 = Date.now(), d = generateLayout(s), c = checkLayout(d);
  const nf = d.branches?.filter(b => b.origin).length ?? 0, k = `${d.chords?.length ?? 0} cordes + ${(d.branches?.length ?? 0) - nf} antennes + ${nf} navette`; comp.set(k, (comp.get(k) ?? 0) + 1);
  if (c.problems.length) { bad++; for (const p of c.problems) { const q = p.replace(/[\d.]+/g, '#'); why.set(q, (why.get(q) ?? 0) + 1); } }
  console.log(String(s).padStart(3), c.problems.length ? 'KO ' + c.problems.join('; ') : 'ok', String(Date.now() - t0).padStart(5), 'ms', k, d.branches?.map(b => `${b.id}${b.side}`).join(','));
}
console.log('invalides', bad, [...why].map(([k, v]) => `${v}× ${k}`).join(' | '));
console.log([...comp].map(([k, v]) => `${v}× ${k}`).join(' | '));
