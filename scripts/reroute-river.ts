// Cherche un tracé de rivière pour layout.json : loin des villes, franchissements de voie en pont, relief doux.
import { rawHeight, riverPath } from '../src/sim/terrain';
import { checkLayout } from '../src/sim/worldgen';
import layout from '../src/layout.json';
const def: any = JSON.parse(JSON.stringify(layout)), T = def.terrain, raw = rawHeight(T);
let seed = +process.argv[2] || 1; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const base: [number, number][] = JSON.parse(process.argv[3] ?? '[[-250,420],[-340,230],[-410,0],[-420,-300],[-440,-480],[-450,-590],[-420,-800],[-420,-1000],[-400,-1250],[-300,-1500]]');
const zones: { x: number; z: number; r: number; v?: boolean }[] = [];   // zones approchées : centres connus (cf. default-map.ts)
for (const u of def.urban) if (u.at) zones.push({ x: u.at[0], z: u.at[1], r: u.radius, v: true });
zones.push({ x: 877, z: -405, r: 380 }, { x: -724, z: -388, r: 200 }, { x: 133, z: 425, r: 250 }, { x: 333, z: -158, r: 200 }, { x: -822, z: 414, r: 170, v: true }, { x: 824, z: 2031, r: 160 }, { x: 33, z: 1662, r: 110 });
const segD = (x: number, z: number, a: number[], b: number[]) => { const dx = b[0] - a[0], dz = b[1] - a[1], u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u); };
const cost = (pts: [number, number][]) => {
  const path = riverPath(pts, 24); let c = 0;
  for (const f of T.features) if (f.height > 0) for (const p of path) if (segD(p.x, p.z, f.a, f.b) < f.width + 12) return Infinity;
  for (const z of zones) for (const p of path) if (Math.hypot(p.x - z.x, p.z - z.z) < z.r * (z.v ? 1 : 1.15) + 46 + 12) return Infinity;
  const h = path.map(p => raw(p.x, p.z)), w = 8;
  path.forEach((p, i) => { let a = 0, n = 0; for (let k = -w; k <= w; k++) { const j = i + k; if (j >= 0 && j < h.length) { a += h[j]; n++; } } const lv = a / n - 6;
    const side = [raw(p.x + 70, p.z), raw(p.x - 70, p.z), raw(p.x, p.z + 70), raw(p.x, p.z - 70)]; for (const s of side) c += Math.max(0, s - lv - 8) ** 2 * 0.0004; c += Math.max(0, h[i] - lv - 10) ** 2 * 0.002; });
  return c / path.length;
};
const cands: { pts: [number, number][]; c: number }[] = [];
for (let it = 0; it < 4000; it++) {
  const j = 20 + it / 30; const pts = base.map(([x, z], i) => (i === base.length - 1 ? [x + (r() - 0.5) * 100, z] : i === 0 ? [x + (r() - 0.5) * 60, z + (r() - 0.5) * 60] : [x + (r() - 0.5) * 2 * j, z + (r() - 0.5) * 2 * j]) as [number, number]);
  const c = cost(pts); if (Number.isFinite(c)) cands.push({ pts: pts.map(([x, z]) => [Math.round(x), Math.round(z)]), c });
}
cands.sort((a, b) => a.c - b.c); console.log('candidats valides (zones)', cands.length);
for (const k of cands.slice(0, 40)) {
  def.rivers[0].points = k.pts; const p = checkLayout(def).problems;
  console.log(k.c.toFixed(1), p.length ? p.join(' ; ') : 'OK', JSON.stringify(k.pts));
  if (!p.length) { console.log(JSON.stringify(k.pts)); break; }
}
