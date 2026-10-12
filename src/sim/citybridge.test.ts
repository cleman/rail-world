import { describe, it, expect } from 'vitest';
import { generateLayout } from './worldgen';
import { World } from './world';
import { Terrain } from './terrain';
import { planWorld } from './planning';
import { buildRoads } from './roads';
import { deckProfile, DECK_GRADE } from './cityplan';

describe('Villes traversées par la voie', () => {
  it('les rues franchissent la voie par des ponts-routes : gabarit, pente, aucune rue qui coupe une voie à niveau sans protection', () => {
    let decks = 0, inGraph = 0;
    for (const s of [1, 3, 7, 12]) {
      const def = generateLayout(s), w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), r = buildRoads(w.net, t, wp);
      for (const p of wp.plans) for (const st of p.streets) if (st.deck) {
        decks++;
        const prof = deckProfile(st, (x, z) => t.height(x, z));
        for (let i = 1; i < prof.length; i++) {
          const d = Math.hypot(st.pts[i][0] - st.pts[i - 1][0], st.pts[i][1] - st.pts[i - 1][1]);
          expect(Math.abs(prof[i] - prof[i - 1]) / d, `graine ${s} pente`).toBeLessThan(0.2);
        }
        for (let i = st.deck.c0; i <= st.deck.c1; i++) expect(prof[i] - t.height(st.pts[i][0], st.pts[i][1]), `graine ${s} gabarit`).toBeGreaterThan(6.4);
        // le tablier est bien dans le graphe routier, à la bonne altitude
        const ys = r.edges.filter(e => !e.render).flatMap(e => e.poly.pts).filter(q => Math.hypot(q.x - st.pts[st.deck!.c0][0], q.z - st.pts[st.deck!.c0][1]) < 1);
        if (ys.length) { inGraph++; expect(ys[0].y).toBeGreaterThan(t.height(ys[0].x, ys[0].z) + 4); }
      }
      // aucune rue de ville ne coupe un axe de voie au sol sans passage à niveau
      for (const e of r.edges) if (!e.render) for (let i = 1; i < e.poly.pts.length; i++) {
        const a = e.poly.pts[i - 1], b = e.poly.pts[i];
        for (const l of w.net.lines) for (let k = 0; k < (l.closed ? l.center.length : l.center.length - 1); k++) {
          const c = l.center[k], d = l.center[(k + 1) % l.center.length], r1 = b.x - a.x, r2 = b.z - a.z, s1 = d.x - c.x, s2 = d.z - c.z, den = r1 * s2 - r2 * s1;
          if (Math.abs(den) < 1e-9) continue;
          const tt = ((c.x - a.x) * s2 - (c.z - a.z) * s1) / den, uu = ((c.x - a.x) * r2 - (c.z - a.z) * r1) / den;
          if (tt < 0 || tt > 1 || uu < 0 || uu > 1) continue;
          const hx = a.x + r1 * tt, hz = a.z + r2 * tt, y = a.y + (b.y - a.y) * tt;
          if (y - t.height(hx, hz) > 4) continue;
          expect(r.crossings.some(q => Math.hypot(q.x - hx, q.z - hz) < 12), `graine ${s} : rue au sol coupant la voie en ${hx.toFixed(0)},${hz.toFixed(0)}`).toBe(true);
        }
      }
    }
    expect(decks).toBeGreaterThanOrEqual(8);
    expect(inGraph / decks, 'ponts reliés au réseau routier').toBeGreaterThan(0.75);
  }, 200000);
});
