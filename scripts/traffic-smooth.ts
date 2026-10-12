// Continuité du mouvement des véhicules : saut de position et rotation de cap max par pas (npx vite-node scripts/traffic-smooth.ts)
import layout from '../src/layout.json';
import { World } from '../src/sim/world';
import { Terrain } from '../src/sim/terrain';
import { planWorld } from '../src/sim/planning';
import { buildRoads } from '../src/sim/roads';
import { Traffic } from '../src/sim/traffic';
import type { LayoutDef } from '../src/sim/network';
const def = layout as unknown as LayoutDef;
const w = new World(def), t = new Terrain(w.net, def.urban), r = buildRoads(w.net, t, planWorld(w.net, t)), tr = new Traffic(r, w);
const prev = new Map<number, { x: number; z: number; yaw: number }>();
let jumps = 0, maxM = 0, maxJump = 0, maxTurn = 0, big = 0, n = 0;
for (let i = 0; i < 60 * 300; i++) {
  w.step(1 / 60); tr.step(w, 1 / 60);
  for (const v of tr.vehicles) {
    const p = prev.get(v.id);
    if (p) { const j = Math.hypot(v.x - p.x, v.z - p.z); let d = Math.abs(v.yaw - p.yaw); if (d > Math.PI) d = 2 * Math.PI - d; if (j > 0.6) { jumps++; if (jumps < 6) { const a = v as any; console.log('saut', j.toFixed(2), 't', i, v.kind, 'v', v.v.toFixed(2), 'lane', a.lane.id, 'len', a.lane.len.toFixed(1), 's', a.s.toFixed(2), 'rearS', a.rearS.toFixed(2), 'laneAbs', a.laneAbs, 'rearAbs', a.rearAbs, 'trail', a.trail.map((l: any) => l.id + ':' + l.len.toFixed(1)).join(','), 'plan0', a.plan[0]?.id); } } maxM = Math.max(maxM, j); maxJump = Math.max(maxJump, j / (v.v * 1 / 60 + 0.02)); maxTurn = Math.max(maxTurn, d); if (d > 0.12) big++; n++; }
    prev.set(v.id, { x: v.x, z: v.z, yaw: v.yaw });
  }
}
console.log(`sauts > 0,6 m : ${jumps}, max ${maxM.toFixed(2)} m; saut max / avance attendue ${maxJump.toFixed(2)}, rotation max par pas ${(maxTurn * 57.3).toFixed(1)}°, pas > 7° : ${big}/${n}`);
