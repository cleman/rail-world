import { buildLike } from './_world';
for (const sd of [1,2,3,4]) { const b: any = buildLike(sd);
  for (const pl of b.wp.plans) { if (pl.village) continue;
    const L = (s: any) => { let l = 0; for (let i = 1; i < s.pts.length; i++) l += Math.hypot(s.pts[i][0]-s.pts[i-1][0], s.pts[i][1]-s.pts[i-1][1]); return l; };
    const t1 = pl.streets.filter((s: any) => s.tier === 1);
    console.log(sd, pl.zone.name, 'r', Math.round(pl.zone.r), 'tier1', t1.map((s: any) => `${s.pts.length}p/${Math.round(L(s))}m/gap${Math.round(Math.hypot(s.pts[0][0]-s.pts.at(-1)[0], s.pts[0][1]-s.pts.at(-1)[1]))}${s.oneWay?'/1w':''}${s.deck?'/deck':''}`).join(' ')); } }
