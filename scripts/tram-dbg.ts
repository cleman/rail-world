import { buildLike } from './_world';
import { TramNet } from '../src/sim/tram';
for (const s of [0, 1, 2]) {
  const { wp, t } = buildLike(s);
  console.log('monde', s, 'villes', wp.plans.length);
  for (const pl of wp.plans) { const av = pl.streets.filter(x => x.tier === 0); console.log(' ', pl.zone.name, pl.zone.kind, pl.zone.r, 'avenues', av.map(a => `${a.hw}/${a.pts.length * 12 | 0}`).join(' ')); }
  const n = new TramNet(wp.plans, (x, z) => t.height(x, z)); console.log('  lignes', n.lines.map(l => `${l.name} ${l.len.toFixed(0)}m arrêts ${l.stops.length}`).join('; '));
}
