import { buildLike } from './_world';
const b: any = buildLike(1);
const pl = b.wp.plans.find((p: any) => p.zone.name === 'Ouest'), c = pl.c;
const cand = b.roads.edges.filter((e: any) => !e.render && e.tier <= 2 && !e.oneWay && Math.hypot(e.a.x - c.x, e.a.z - c.z) > 32 && Math.hypot(e.b.x - c.x, e.b.z - c.z) > 32 && e.poly.pts.every((q: any) => Math.hypot(q.x - c.x, q.z - c.z) < pl.zone.r && q.y - b.t.height(q.x, q.z) < 2));
console.log('cand', cand.length);
const adj = new Map<any, any[]>(); for (const e of cand) for (const n of [e.a, e.b]) (adj.get(n) ?? adj.set(n, []).get(n)!).push(e);
const res: number[] = [];
for (const e0 of cand) { const dist = new Map<any, number>([[e0.a, 0]]), done = new Set<any>();
  for (;;) { let u: any = null, du = 1e9; for (const [k, d] of dist) if (!done.has(k) && d < du) { du = d; u = k; } if (!u || u === e0.b) break; done.add(u);
    for (const e of adj.get(u) ?? []) { if (e === e0) continue; const w = e.a === u ? e.b : e.a; const nd = du + e.poly.len; if (nd < (dist.get(w) ?? 1e9)) dist.set(w, nd); } }
  if (dist.has(e0.b)) res.push(Math.round(dist.get(e0.b)! + e0.poly.len)); }
console.log(res.sort((a, b) => a - b).join(','));
