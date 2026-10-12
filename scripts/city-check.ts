// Objets sur la chaussée : npx vite-node scripts/city-check.ts [graine ...]  (sans argument : monde d'origine)
import { readFileSync } from 'node:fs';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
import { generateLayout } from '../src/sim/worldgen';
import { buildCity, rng, type CityBuilders, type Rect } from '../src/city';
import { Chunked } from '../src/chunks';
import type { LayoutDef } from '../src/sim/network';

const seeds = process.argv.slice(2).map(Number);
for (const sd of seeds.length ? seeds : [NaN]) {
  const def = Number.isNaN(sd) ? JSON.parse(readFileSync('src/layout.json', 'utf8')) as LayoutDef : generateLayout(sd);
  const w = new World(def), t = new Terrain(w.net, def.urban), wp = planWorld(w.net, t), roads = buildRoads(w.net, t, wp);
  const B: CityBuilders = { towers: new Chunked(300), houses: new Chunked(300), roofs: new Chunked(300), roads: new Chunked(300), marks: new Chunked(300), walks: new Chunked(300), lamps: [], trees: [], towerTile: [1, 1], houseTile: [1, 1], placed: [] };
  const rand = rng(Number.isNaN(sd) ? 42 : sd * 7919 + 42);
  for (const p of wp.plans) buildCity(p, t, wp.env, B, rand, roads.dist);
  const segs = wp.plans.flatMap(p => p.segs);
  const dist = (x: number, z: number) => { let d = 1e9; for (const g of segs) { const dx = g.bx - g.ax, dz = g.bz - g.az, l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / l2)); d = Math.min(d, Math.hypot(x - g.ax - dx * u, z - g.az - dz * u) - g.hw); } return d; };
  let bad = 0, badRural = 0;
  for (const r of B.placed as Rect[]) {
    let hit = 0, hitR = 0;
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
      const lx = (i / 6 - 0.5) * r.w, lz = (j / 6 - 0.5) * r.d, x = r.x + lx * r.c - lz * r.s, z = r.z + lx * r.s + lz * r.c;
      if (dist(x, z) < 0.3) hit = 1;
      if (roads.dist(x, z) < 4.5) hitR = 1;
    }
    bad += hit; badRural += hitR;
  }
  let badTree = 0; for (const [x, , z] of B.trees) if (dist(x, z) < 0.5) badTree++;
  let badTreeR = 0; for (const [x, , z] of B.trees) if (roads.dist(x, z) < 4.5) badTreeR++;
  console.log(`${Number.isNaN(sd) ? 'origine' : 'graine ' + sd}: ${B.placed!.length} bâtiments, sur rue ${bad}, sur route ${badRural}; arbres ${B.trees.length}, sur rue ${badTree}, sur route ${badTreeR}`);
}
