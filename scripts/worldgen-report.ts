// Rapport de génération : npx vite-node scripts/worldgen-report.ts [graine ...]  (sans argument : layout.json puis graines 1..12)
import { readFileSync } from 'node:fs';
import { checkLayout, generateLayout } from '../src/sim/worldgen';
import type { LayoutDef } from '../src/sim/network';

const show = (name: string, def: LayoutDef) => {
  const t0 = Date.now(), c = checkLayout(def), s = c.stats;
  console.log(`${name.padEnd(10)} ${(s.length / 1000).toFixed(1)} km  ouvrages ${s.structures} (${(s.structLen / s.length * 100).toFixed(0)} %)  pente ${(s.maxGrade * 100).toFixed(2)} %  Rmin ${s.minR.toFixed(0)}  ${c.problems.length ? 'PROBLÈMES : ' + c.problems.join('; ') : 'ok'}  (${Date.now() - t0} ms)`);
};
const args = process.argv.slice(2).map(Number);
if (!args.length) show('layout', JSON.parse(readFileSync('src/layout.json', 'utf8')));
for (const sd of args.length ? args : Array.from({ length: 12 }, (_, i) => i + 1)) { const t0 = Date.now(); const d = generateLayout(sd); console.log(`  (génération ${Date.now() - t0} ms)`); show('seed ' + sd, d); }
