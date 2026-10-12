import { buildLike } from './_world';
// Composantes connexes du réseau routier complet (rues de ville + routes de campagne).
const a = +process.argv[2] || 0, b = +process.argv[3] || 0;
for (let s = a; s <= b; s++) {
  const { w, t, wp, roads: r } = buildLike(s); void w; void r;
  const par = r.nodes.map((_, i) => i), idx = new Map(r.nodes.map((n, i) => [n, i])), f = (i: number): number => (par[i] === i ? i : (par[i] = f(par[i])));
  for (const e of r.edges) par[f(idx.get(e.a)!)] = f(idx.get(e.b)!);
  const L = new Map<number, number>(), C = new Map<number, [number, number, number]>();
  r.edges.forEach(e => { const k = f(idx.get(e.a)!); L.set(k, (L.get(k) ?? 0) + e.poly.len); const c = C.get(k) ?? [0, 0, 0]; C.set(k, [c[0] + e.a.x, c[1] + e.a.z, c[2] + 1]); });
  const comps = [...L.entries()].sort((x, y) => y[1] - x[1]);
  const zone = (x: number, z: number) => { let b = '', bd = 1e9; for (const zn of t.zones) { const d = Math.hypot(zn.x - x, zn.z - z) / zn.r; if (d < bd) { bd = d; b = zn.name ?? zn.kind; } } return bd < 1.3 ? b : 'campagne'; };
  console.log(`${s === 0 ? 'défaut' : 'graine ' + s}: ${comps.length} composantes ; ` + comps.map(([k, l]) => { const c = C.get(k)!, x = c[0] / c[2], z = c[1] / c[2]; return `${l.toFixed(0)}m ${zone(x, z)}@${x.toFixed(0)},${z.toFixed(0)}`; }).join(' | '));
}
