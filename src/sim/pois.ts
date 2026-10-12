import type { Terrain } from './terrain';
import type { WorldPlan } from './planning';
import { rng } from './cityplan';
import { seaS } from './water';

export type PoiKind = 'château' | 'phare' | 'ruine' | 'moulin' | 'aérodrome' | 'port';
export interface Poi { kind: PoiKind; name: string; x: number; y: number; z: number; rot: number; r: number; /** port : sur la mer ou sur un lac (indice du lac dans `wp.lakes`) */ water?: 'mer' | 'lac'; lake?: number }

const NAMES: Record<PoiKind, string[]> = {
  château: ['Château de Montval', 'Château des Brumes', 'Château de Hautecombe', 'Château de Roquefeuil'],
  phare: ['Phare du Cap Bleu', 'Phare de la Pointe', 'Phare des Mouettes', 'Phare de Brisant'],
  ruine: ['Ruines de Vieux-Castel', 'Abbaye en ruine', 'Ruines de Saint-Aubin', 'Tour effondrée'],
  moulin: ['Moulin de la Plaine', 'Moulin des Vents', 'Moulin Haut', 'Moulin du Cadet'],
  aérodrome: ['Aérodrome de Val-Clair', 'Aérodrome des Hauts', 'Aérodrome de la Plaine'],
  port: ['Port de plaisance', 'Port du Lac', 'Port des Mouettes', 'Port de Haute-Mer', 'Grand Port', 'Port Neuf'],
};
const RADIUS: Record<PoiKind, number> = { château: 40, phare: 9, ruine: 20, moulin: 11, aérodrome: 60, port: 30 };
const FLAT: Record<PoiKind, number> = { château: 7, phare: 6, ruine: 4.5, moulin: 5, aérodrome: 4.5, port: 99 };
/** Piste de l'aérodrome : longueur et largeur (m), dégagement autour. */
export const RUNWAY = { len: 360, wid: 26 };

/**
 * Points d'intérêt : un château sur une hauteur, un phare près du lac (sinon sur une crête),
 * une ruine et un moulin à vent en rase campagne. Tous loin des voies, routes, villes, rivières et du lac, et assez plats.
 */
export function planPois(terrain: Terrain, wp: WorldPlan, roadD: (x: number, z: number) => number, seed: number, half = 2250): Poi[] {
  const rand = rng(seed ^ 0x51ed), out: Poi[] = [];
  const kinds: PoiKind[] = ['aérodrome', 'château', 'phare', 'port', 'port', 'ruine', 'moulin', 'ruine', 'moulin'];
  let portNo = 0;
  const ring = (x: number, z: number, r: number) => {
    let lo = 1e9, hi = -1e9, sum = terrain.height(x, z); lo = hi = sum;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, h = terrain.height(x + Math.cos(a) * r, z + Math.sin(a) * r); lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; }
    return { lo, hi, mean: sum / 9 };
  };
  for (const kind of kinds) {
    const r = RADIUS[kind];
    if (kind === 'port') {            // 1er : sur la mer (grand port) ; ensuite sur un lac (port de plaisance), côté libre : un quai qui avance dans l'eau
      const no = portNo++, sea = terrain.sea, nearCity = (x: number, z: number) => Math.min(1e9, ...terrain.zones.filter(q => q.kind === 'city').map(q => Math.hypot(x - q.x, z - q.z)));
      let bp: Poi | null = null, bs = -1e9;
      if (sea && no === 0) {
        const ang = Math.atan2(sea.uz, sea.ux);
        for (let k = 0; k < 160; k++) {
          const A = (rand() * 2 - 1) * 1700;
          let x = 0, z = 0, ok = false;
          for (let d = sea.c0 - 90; d < sea.c0 + 90; d += 4) { x = sea.ux * d - sea.uz * A; z = sea.uz * d + sea.ux * A; if (terrain.height(x, z) <= sea.level + 1.6) { ok = true; break; } }
          if (!ok || Math.abs(x) > half - 150 || Math.abs(z) > half - 150 || wp.zoneRatio(x, z) < 1.3 || wp.trackD(x, z) < 130 || roadD(x, z) < 45 || wp.riverD(x, z) < 90 || out.some(p => Math.hypot(p.x - x, p.z - z) < 300)) continue;
          const dep = (p: number, q: number) => sea.level - terrain.height(x + sea.ux * p - sea.uz * q, z + sea.uz * p + sea.ux * q);
          if (dep(70, 24) < 2.2 || dep(70, -24) < 2.2 || dep(120, 0) < 3) continue;
          const score = -nearCity(x, z) * 0.002 + rand();
          if (score > bs) { bs = score; bp = { kind, name: '', x, y: sea.level, z, rot: ang, r: 70, water: 'mer' }; }
        }
      } else {
        wp.lakes.forEach((L, li) => {
          for (let k = 0; k < 120; k++) {
            const a = rand() * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
            let x = 0, z = 0, ok = false;
            for (let d = L.r + 50; d > L.r - 20; d -= 4) { x = L.x + ca * d; z = L.z + sa * d; if (terrain.height(x, z) <= L.level + 1.6) { ok = true; break; } }      // rivage : première cote basse en venant de la terre
            if (!ok || wp.zoneRatio(x, z) < 1.3 || wp.trackD(x, z) < 125 || roadD(x, z) < 45 || wp.riverD(x, z) < 40 || out.some(p => Math.hypot(p.x - x, p.z - z) < 300)) continue;
            if (terrain.height(x - ca * 44, z - sa * 44) > L.level - 0.2) continue;                  // de l'eau 44 m plus loin
            let deep = true;
            for (const [p, q] of [[32, 12.5], [32, -12.5], [70, 0], [110, 0]]) { const px = x - ca * p + sa * q, pz = z - sa * p - ca * q; if (terrain.height(px, pz) > L.level - 0.9) deep = false; }
            if (!deep) continue;
            const score = -Math.abs(terrain.height(x, z) - L.level) + rand() - nearCity(x, z) * 0.001;
            if (score > bs) { bs = score; bp = { kind, name: '', x, y: L.level, z, rot: a + Math.PI, r: 30, water: 'lac', lake: li }; }     // rot : direction vers l'eau
          }
        });
      }
      if (bp) { bp.name = NAMES.port[Math.floor(rand() * 3) + (bp.water === 'mer' ? 3 : 0)]; out.push(bp); }
      continue;
    }
    if (kind === 'aérodrome') {
      let best: Poi | null = null, bestS = 1e9;
      for (let g = 0; g < 3000; g++) {
        const x = (rand() * 2 - 1) * half * 0.8, z = (rand() * 2 - 1) * half * 0.8, rot = rand() * Math.PI, ux = Math.sin(rot), uz = Math.cos(rot);
        let lo = 1e9, hi = -1e9, bad = false, sum = 0, n = 0;
        for (let p = -240; p <= 240 && !bad; p += 40) for (const q of [-30, 0, 30]) {
          const px = x + ux * p + uz * q, pz = z + uz * p - ux * q;
          if (wp.zoneRatio(px, pz) < 1.3 || wp.trackD(px, pz) < 90 || roadD(px, pz) < 45 || wp.riverD(px, pz) < 40 || wp.inLake(px, pz, 30)) { bad = true; break; }
          const h = terrain.height(px, pz); lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
        }
        if (bad || hi - lo > 6) continue;
        if (hi - lo < bestS) { bestS = hi - lo; best = { kind, name: '', x, y: sum / n, z, rot, r }; }
        if (bestS < 2.5) break;
      }
      if (best) { best.name = NAMES.aérodrome[Math.floor(rand() * NAMES.aérodrome.length)]; out.push(best); }
      continue;
    }
    let best: Poi | null = null, bestScore = -1e9, found = 0;
    for (let g = 0; g < 2500 && found < 40; g++) {
      const x = (rand() * 2 - 1) * half, z = (rand() * 2 - 1) * half;
      if (wp.zoneRatio(x, z) < 1.35 || wp.trackD(x, z) < r + 90 || roadD(x, z) < r + 35 || wp.riverD(x, z) < r + 25 || wp.inLake(x, z, r + 18)) continue;
      if (out.some(p => Math.hypot(p.x - x, p.z - z) < 350)) continue;
      const s = ring(x, z, r);
      if (s.hi - s.lo > FLAT[kind]) continue;
      found++;
      let score = rand();
      if (kind === 'château') score += s.mean * 0.05;
      else if (kind === 'phare') {
        if (terrain.sea) score -= Math.abs(seaS(terrain.sea, x, z) + 30) * 0.03;
        else if (wp.lake) { const d = Math.hypot(x - wp.lake.x, z - wp.lake.z) - wp.lake.r; score -= Math.abs(d - 22) * 0.05; } else score += s.mean * 0.04;
      }
      if (score > bestScore) { bestScore = score; best = { kind, name: '', x, y: s.mean, z, rot: rand() * Math.PI * 2, r }; }
    }
    if (best) { const n = NAMES[kind]; best.name = n[Math.floor(rand() * n.length)]; if (out.some(p => p.name === best!.name)) best.name += ' II'; out.push(best); }
  }
  return out;
}

/** Géométrie d'un port dans son repère local : p vers l'eau, q vers la gauche. Quai (jetée) de 0 à `pier`, demi-largeur `half`. */
export interface PortGeom { pier: number; half: number; berthP: number; berthQ: number; craneP: number[]; approach: number }
export function portGeom(P: Poi): PortGeom {
  return P.water === 'mer'
    ? { pier: 132, half: 13, berthP: 76, berthQ: 23, craneP: [52, 96], approach: 250 }
    : { pier: 58, half: 8, berthP: 32, berthQ: 12.5, craneP: [8, 40], approach: 120 };
}
/** Point (p, q) du repère local d'un port, en coordonnées monde. */
export function portAt(P: Poi, p: number, q: number): [number, number] {
  const dx = Math.cos(P.rot), dz = Math.sin(P.rot);
  return [P.x + dx * p - dz * q, P.z + dz * p + dx * q];
}
