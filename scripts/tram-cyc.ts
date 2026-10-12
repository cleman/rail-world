import { buildLike } from './_world';
const b: any = buildLike(1);
for (const pl of b.wp.plans.filter((p: any) => !p.village && p.zone.r >= 230)) {
  const c = pl.c; const E = b.roads.edges;
  const all = E.filter((e: any) => !e.render), t01 = all.filter((e: any) => e.tier <= 1), cc = t01.filter((e: any) => Math.hypot(e.a.x - c.x, e.a.z - c.z) > 32 && Math.hypot(e.b.x - c.x, e.b.z - c.z) > 32);
  const near = cc.filter((e: any) => e.poly.pts.every((q: any) => Math.hypot(q.x - c.x, q.z - c.z) < pl.zone.r * .92));
  const flat = near.filter((e: any) => e.poly.pts.every((q: any) => q.y - b.t.height(q.x, q.z) < 2));
  console.log(pl.zone.name, 'edges', E.length, 'norender', all.length, 'tier<=1', t01.length, 'hors centre', cc.length, 'dans zone', near.length, 'plat', flat.length);
}
for (const pl of b.wp.plans.filter((p: any) => !p.village && p.zone.r >= 230)) {
  const c = pl.c, cand = b.roads.edges.filter((e: any) => !e.render && e.tier <= 1 && !e.oneWay && Math.hypot(e.a.x - c.x, e.a.z - c.z) > 32 && Math.hypot(e.b.x - c.x, e.b.z - c.z) > 32 && e.poly.pts.every((q: any) => Math.hypot(q.x - c.x, q.z - c.z) < pl.zone.r * .92 && q.y - b.t.height(q.x, q.z) < 2));
  const deg = new Map<any, number>(); for (const e of cand) for (const n of [e.a, e.b]) deg.set(n, (deg.get(n) ?? 0) + 1);
  console.log(pl.zone.name, 'noeuds', deg.size, 'deg>=2', [...deg.values()].filter(d => d >= 2).length, 'composantes?', 'longueurs', cand.map((e: any) => Math.round(e.poly.len)).join(','));
}
