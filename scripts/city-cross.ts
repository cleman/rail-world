// Passages à niveau des rues de ville : combien par monde, et aucune rue ne coupe une voie sans passage.
import { generateLayout } from '../src/sim/worldgen';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
const a = +process.argv[2] || 1, b = +process.argv[3] || 10;
for (let s = a; s <= b; s++) {
  const def = generateLayout(s), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), r = buildRoads(w.net, t, wp);
  const cityX = r.crossings.filter(c => c.node.edges.every(e => !e.render)).length;
  // rues non protégées : un tronçon non rendu dont un segment coupe une voie (axe) sans qu'il y ait de passage à moins de 12 m
  let bad = 0;
  const axes: { a: any; b: any }[] = [];
  for (const l of w.net.lines) { const n = l.center.length; for (let i = 0; i < (l.closed ? n : n - 1); i++) axes.push({ a: l.center[i], b: l.center[(i + 1) % n] }); }
  for (const e of r.edges) if (!e.render) for (let i = 1; i < e.poly.pts.length; i++) {
    const p = e.poly.pts[i - 1], q = e.poly.pts[i];
    for (const x of axes) {
      const r1 = q.x - p.x, r2 = q.z - p.z, s1 = x.b.x - x.a.x, s2 = x.b.z - x.a.z, den = r1 * s2 - r2 * s1;
      if (Math.abs(den) < 1e-9) continue;
      const tt = ((x.a.x - p.x) * s2 - (x.a.z - p.z) * s1) / den, uu = ((x.a.x - p.x) * r2 - (x.a.z - p.z) * r1) / den;
      if (tt < 0 || tt > 1 || uu < 0 || uu > 1) continue;
      const hx = p.x + r1 * tt, hz = p.z + r2 * tt;
      if (p.y + (q.y - p.y) * tt - t.height(hx, hz) > 4) continue;     // pont-route
      if (!r.crossings.some(c => Math.hypot(c.x - hx, c.z - hz) < 12)) bad++;
    }
  }
  const decks = wp.plans.flatMap(p => p.streets.filter(x => x.deck)).length;
  console.log(`graine ${s}: villes ${wp.plans.length}, ponts-routes ${decks}, passages à niveau de ville ${cityX}, rues non protégées ${bad}, composantes ok`);
}
