// Génération procédurale d'un monde complet à partir d'une graine : ligne en boucle, gares, dépôt, relief,
// rivière, villes et villages. Le résultat est un LayoutDef (même format que layout.json) : tout le reste
// du programme (réseau, terrain, rues, routes, trafic) en dérive déjà. Déterministe : même graine, même monde.
import { buildNetwork, type BranchDef, type ChordDef, type CircuitDef, type LayoutDef, type Network } from './network';
import { Terrain, type FeatureDef, type UrbanDef } from './terrain';
import { rng, type Rand } from './cityplan';
import { planWorld } from './planning';

const STATIONS = ['Nord', 'Est', 'Sud', 'Ouest', 'Centre', 'Port', 'Halles', 'Orée', 'Vallon', 'Pont-Neuf', 'Bellevue', 'Lac'];
const VILLAGES = ['Mervent', 'Saint-Aubin', 'Les Roches', 'Hautefeuille', 'Beaumont', 'Sainte-Foy', 'La Combe', 'Valmont', 'Roquebrune', 'Fontaine', 'Montclar', 'Les Aulnes', 'Pierrefitte', 'Vauclair'];
const DEPOTS = ['Dépôt Ouest', 'Dépôt Sud', 'Dépôt Nord', 'Dépôt Est', 'Dépôt Central'];

const pick = <T,>(r: Rand, a: T[], used: Set<T>): T => { let t: T; do { t = a[Math.floor(r() * a.length)]; } while (used.has(t) && used.size < a.length); used.add(t); return t; };
const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
const polyDist = (px: number, pz: number, pts: number[][]) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(px, pz, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])); return d; };

/** Plus petit rayon de courbure (m) de la ligne autour de l'échantillon i0 (±span échantillons). */
export function minRadius(net: Network, i0: number, span: number): number {
  const C = net.center, N = C.length, k = 8;
  let m = Infinity;
  for (let d = -span; d <= span; d++) {
    const a = C[(((i0 + d - k) % N) + N) % N], b = C[(((i0 + d) % N) + N) % N], c = C[(((i0 + d + k) % N) + N) % N];
    const A = Math.hypot(b.x - a.x, b.z - a.z), B = Math.hypot(c.x - b.x, c.z - b.z), Cc = Math.hypot(c.x - a.x, c.z - a.z);
    const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    m = Math.min(m, area2 < 1e-6 ? Infinity : (A * B * Cc) / (2 * area2));
  }
  return m;
}

const done = new WeakMap<LayoutDef, boolean>();     // la composition tirée a-t-elle pu être entièrement posée ?

/** Une tentative de monde pour (graine, essai). Peut produire un monde invalide : voir checkLayout. */
function attempt(seed: number, tryNo: number, plan = 0): LayoutDef {
  const r = rng((seed * 2654435761 + tryNo * 40503 + 17) >>> 0);
  // ---- ligne : ellipse modulée par deux harmoniques, tournée au hasard ----
  const etoile = r() < 0.3;        // « étoile » : petite boucle urbaine d'où partent des antennes vers des villes lointaines
  const N = 10 + Math.floor(r() * 4), rz = etoile ? 470 + r() * 170 : 640 + r() * 240, rx = etoile ? Math.max(650 + r() * 220, rz * 1.15) : Math.max(950 + r() * 350, rz * 1.2), rot = r() * Math.PI * 2;
  const a2 = 0.04 + r() * 0.07, a3 = 0.03 + r() * 0.06, p2 = r() * 6.3, p3 = r() * 6.3, off = r() * 6.3;
  const center: number[][] = [];
  for (let i = 0; i < N; i++) {
    const th = off + ((i + (r() - 0.5) * 0.16) / N) * Math.PI * 2, m = 1 + a2 * Math.sin(2 * th + p2) + a3 * Math.sin(3 * th + p3) + (r() - 0.5) * 0.03;
    const x = Math.cos(th) * rx * m, z = Math.sin(th) * rz * m;
    center.push([Math.round(x * Math.cos(rot) - z * Math.sin(rot)), Math.round(x * Math.sin(rot) + z * Math.cos(rot))]);
  }
  // ---- gares et dépôt : répartis sur la boucle, le dépôt dans un intervalle libre ----
  const ns = !etoile && r() < 0.4 ? 4 : 3, phase = r(), usedN = new Set<string>();
  const sAt = Array.from({ length: ns }, (_, k) => ((((phase + (k + (r() - 0.5) * 0.18) / ns) % 1) + 1) % 1)).sort((a, b) => a - b);
  const names = sAt.map(() => pick(r, STATIONS, usedN));
  const gapMid = sAt.map((s, k) => { const n = sAt[(k + 1) % ns] + (k + 1 === ns ? 1 : 0); return ((s + n) / 2) % 1; });
  const order = gapMid.map((_, k) => k).sort(() => r() - 0.5);
  const riverGaps = [order[0], order[1]], depotGap = order[2];
  const depotAt = (gapMid[depotGap] + (r() - 0.5) * 0.04 + 1) % 1;
  const big = Math.floor(r() * ns);
  const base: LayoutDef = {
    centerline: center, trackSpacing: 4.5, platformOffset: 4.5, blockLength: 350,
    stations: sAt.map((at, k) => ({ name: names[k], at: Math.round(at * 1000) / 1000 })),
    depots: [{ name: pick(r, DEPOTS, new Set()), at: Math.round(depotAt * 1000) / 1000, tracks: 6, on: ['A', 'B'] }],
    circuits: [
      { id: 'A', name: 'Ligne A (omnibus)', track: 'A', type: 'omnibus', fleet: 4, service: 3, cars: 4, stops: Object.fromEntries(names.map(n => [n, true])) },
      { id: 'B', name: 'Ligne B (omnibus)', track: 'B', type: 'omnibus', fleet: 3, service: 2, cars: 4, stops: Object.fromEntries(names.map(n => [n, true])) },
      { id: 'F', name: 'Fret B', track: 'B', type: 'fret', fleet: 2, service: 1, cars: 8 },
    ],
  };
  // géométrie plane de la ligne (le relief ne la modifie pas)
  const n0 = buildNetwork({ ...base, terrain: { seed: 1, amplitude: 0, scale: 600, maxGrade: 0.02 } });
  const C = n0.center, NN = C.length, at = (f: number) => C[Math.round((((f % 1) + 1) % 1) * NN) % NN];
  let cx = 0, cz = 0; for (const p of C) { cx += p.x / NN; cz += p.z / NN; }
  // ---- relief : amplitude, crêtes et vallées ----
  const features: FeatureDef[] = [];
  const nf = 2 + Math.floor(r() * 2);
  for (let k = 0; k < nf; k++) {
    const ang = r() * 6.28, d = 300 + r() * 1100, len = 450 + r() * 500, dir = r() * 6.28;
    const mx = cx + Math.cos(ang) * d, mz = cz + Math.sin(ang) * d;
    features.push({ a: [Math.round(mx - Math.cos(dir) * len / 2), Math.round(mz - Math.sin(dir) * len / 2)], b: [Math.round(mx + Math.cos(dir) * len / 2), Math.round(mz + Math.sin(dir) * len / 2)], width: 120 + r() * 70, height: (k === nf - 1 ? -1 : 1) * (30 + r() * 40) });
  }
  const terrain = { seed: 1 + Math.floor(r() * 9999), amplitude: 70 + r() * 50, scale: 650 + r() * 250, maxGrade: 0.02, features };
  // ---- rivière : traverse la boucle au milieu de deux intervalles entre gares (jamais dans une ville) ----
  const P = at(gapMid[riverGaps[0]]), Q = at(gapMid[riverGaps[1]]);
  const ux0 = Q.x - P.x, uz0 = Q.z - P.z, L = Math.hypot(ux0, uz0) || 1, ux = ux0 / L, uz = uz0 / L, nx = -uz, nz = ux;
  const river: [number, number][] = [];
  const wob = 60 + r() * 110, wp = r() * 6.3, wf = 1 + r() * 1.5;
  const prof: [number, number][] = [[-1500, 0], [-900, 0], [-420, 0], [-160, 0]];                 // abscisse le long de P→Q, décalage latéral
  for (let k = 1; k < 7; k++) { const t = k / 7; prof.push([t * L, Math.sin(t * Math.PI * wf + wp) * wob * Math.sin(t * Math.PI) ** 0.7]); }
  prof.push([L + 160, 0], [L + 420, 0], [L + 900, 0], [L + 1500, 0]);
  prof.sort((a, b) => a[0] - b[0]);
  for (const [s, o] of prof) river.push([Math.round(P.x + ux * s + nx * o), Math.round(P.z + uz * s + nz * o)]);
  if (r() < 0.5) river.reverse();
  // ---- villes et villages ----
  const urban: UrbanDef[] = names.map((n, k) => ({ station: n, radius: k === big ? Math.round(320 + r() * 90) : Math.round(180 + r() * 90) }));
  urban.push({ depot: base.depots![0].name, radius: 170 });
  const taken: { x: number; z: number; r: number }[] = [...sAt.map((f, k) => ({ x: at(f).x, z: at(f).z, r: urban[k].radius })), { x: at(depotAt).x, z: at(depotAt).z, r: 170 }];
  // ---- lignes secondaires : cordes (double voie à travers la boucle) et antennes (voie unique, évitements, terminus) ----
  // Tirage indépendant (`plan`) : on peut changer de composition sans changer le monde. Les candidats sont pré-filtrés sur la géométrie plane.
  const rc = rng((seed * 2246822519 + tryNo * 3266489917 + (plan + 1) * 668265263 + 7) >>> 0);
  const ringLen = NN * n0.step, usedV = new Set<string>();
  const circ = (a: number, b: number) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
  const used: { f: number; h: number }[] = [...sAt.map(f => ({ f, h: 210 })), { f: depotAt, h: 210 }];
  const normalAt = (f: number) => {      // normale unitaire vers l'intérieur et tangente (sens A) de la boucle
    const i = Math.round((((f % 1) + 1) % 1) * NN), a = C[(i - 2 + NN) % NN], b = C[(i + 2) % NN], p = C[i % NN], L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const t = { x: (b.x - a.x) / L, z: (b.z - a.z) / L }; let nx = -t.z, nz = t.x;
    if (nx * (cx - p.x) + nz * (cz - p.z) < 0) { nx = -nx; nz = -nz; }
    return { t, n: { x: nx, z: nz } };
  };
  const pickJunction = (h: number, lo = 0, hi = 1): number | null => {     // point libre de la boucle, dans [lo, hi) (modulo 1)
    for (let k = 0; k < 40; k++) {
      const f = Math.round((((lo + rc() * (hi - lo)) % 1) + 1) % 1 * 1000) / 1000;
      if (used.some(u => circ(f, u.f) * ringLen < u.h + h)) continue;
      if (minRadius(n0, Math.round(f * NN) % NN, 70) < 320) continue;
      return f;
    }
    return null;
  };
  const radius3 = (a: number[], b: number[], c: number[]) => { const A = Math.hypot(b[0] - a[0], b[1] - a[1]), B = Math.hypot(c[0] - b[0], c[1] - b[1]), Cc = Math.hypot(c[0] - a[0], c[1] - a[1]), ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])); return ar < 1e-6 ? Infinity : A * B * Cc / (2 * ar); };
  const minR = (path: number[][]) => { let m = Infinity; for (let i = 2; i < path.length - 2; i++) m = Math.min(m, radius3(path[i - 2], path[i], path[i + 2])); return m; };
  const ringPts = C.map(q => [q.x, q.z]);
  const paths: number[][][] = [];                // tracés déjà posés (cordes et antennes)
  const farFromPaths = (path: number[][], d: number, skip = 0) => path.slice(skip).every(q => paths.every(o => polyDist(q[0], q[1], o) >= d));
  const bez4 = (p0: number[], p1: number[], p2: number[], p3: number[]) => (t: number) => { const u = 1 - t; return [Math.round(u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0]), Math.round(u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1])]; };
  const spots = (pos: number[], rad: number, riverMargin: number) =>
    polyDist(pos[0], pos[1], river) >= rad * 0.6 + riverMargin && !taken.some(t => Math.hypot(t.x - pos[0], t.z - pos[1]) < (t.r + rad) * 0.95 + 60);
  const chords: ChordDef[] = [], branches: BranchDef[] = [];
  let nChPlanned = 0, nBrPlanned = 0;
  const wantFree = !etoile && rng((seed * 1103515245 + 12345) >>> 0)() < 0.16;      // décision au niveau du monde : environ un monde sur six
  const addCircuit = (c: CircuitDef) => base.circuits.push(c);
  if (plan >= 0) {
    const nCh = etoile || wantFree ? 0 : (() => { const q = rc(); return q < 0.2 ? 0 : q < 0.78 ? 1 : 2; })();
    const nBr = etoile ? 2 + (rc() < 0.5 ? 1 : 0) : nCh === 0 ? 1 + (rc() < 0.5 ? 1 : 0) : (() => { const q = rc(); return q < 0.4 ? 0 : q < 0.8 ? 1 : 2; })();
    nChPlanned = nCh; nBrPlanned = nBr;
    // -- cordes --
    for (let k = 0; k < nCh; k++) {
      for (let draw = 0; draw < 30; draw++) {
        const f1 = pickJunction(200); if (f1 === null) break;
        const f2 = pickJunction(200, f1 + 0.34, f1 + 0.66); if (f2 === null) continue;
        const [fa, fb] = f1 < f2 ? [f1, f2] : [f2, f1];
        if (fb - fa < 0.3 || fb - fa > 0.7) continue;
        const dir = (f: number, sign: number) => { const { t, n } = normalAt(f), a = (32 + rc() * 6) * Math.PI / 180; return { x: t.x * Math.cos(a) + sign * n.x * Math.sin(a), z: t.z * Math.cos(a) + sign * n.z * Math.sin(a) }; };
        const P1 = at(fa), P2 = at(fb), d1 = dir(fa, 1), d2 = dir(fb, -1), lead = 250 + rc() * 60;
        const v1 = [P1.x + d1.x * lead, P1.z + d1.z * lead], v4 = [P2.x - d2.x * lead, P2.z - d2.z * lead], span = Math.hypot(v4[0] - v1[0], v4[1] - v1[1]);
        if (span < 900) continue;
        const bez = bez4(v1, [v1[0] + d1.x * 0.36 * span, v1[1] + d1.z * 0.36 * span], [v4[0] - d2.x * 0.36 * span, v4[1] - d2.z * 0.36 * span], v4);
        const path = Array.from({ length: 41 }, (_, i) => bez(i / 40));
        if (minR(path) < 330 || !farFromPaths(path, 320)) continue;
        const cAt = 0.46 + rc() * 0.08, pos = path[Math.round(cAt * 40)], rad = Math.round(170 + rc() * 60);
        if (!spots(pos, rad, 70) || polyDist(pos[0], pos[1], ringPts) < rad + 250) continue;
        const o = STATIONS.filter(n => !usedN.has(n)), name = usedN.has('Centre') || !o.includes('Centre') ? o[Math.floor(rc() * o.length)] : 'Centre';
        usedN.add(name);
        const id = k === 0 ? 'C' : 'E';
        chords.push({ id, name: 'Corde de ' + name, from: fa, to: fb, via: [0, 1 / 3, 2 / 3, 1].map(bez), stations: [{ name, at: Math.round(cAt * 1000) / 1000 }] });
        used.push({ f: fa, h: 200 }, { f: fb, h: 200 }); paths.push(path);
        urban.push({ station: name, radius: rad }); taken.push({ x: pos[0], z: pos[1], r: rad });
        addCircuit({ id: id + '1', name: `Ligne ${id} (sens A)`, track: 'A', type: 'omnibus', fleet: 3, service: 1, cars: 3, via: [id] });
        addCircuit({ id: id + '2', name: `Ligne ${id} (sens B)`, track: 'B', type: 'omnibus', fleet: 3, service: 1, cars: 3, via: [id] });
        break;
      }
    }
    // -- antennes --
    for (let k = 0; k < nBr; k++) {
      for (let draw = 0; draw < 40; draw++) {
        const f = pickJunction(270); if (f === null) break;
        const { n } = normalAt(f), interior = !etoile && !wantFree && (chords.length > 0 ? rc() < 0.25 : rc() < 0.5), sg = interior ? 1 : -1;
        const Nn = { x: n.x * sg, z: n.z * sg }, side = interior ? 'A' : 'B';
        const rp = at(f), S0 = [rp.x + Nn.x * (210 + 2.25), rp.z + Nn.z * (210 + 2.25)];
        const ang = (rc() - 0.5) * (interior ? 0.9 : 1.3), L = (etoile ? 1500 : 1250) + rc() * 650;
        const dd = { x: Nn.x * Math.cos(ang) - Nn.z * Math.sin(ang), z: Nn.x * Math.sin(ang) + Nn.z * Math.cos(ang) };
        const T = [Math.round(S0[0] + dd.x * L), Math.round(S0[1] + dd.z * L)];
        if (Math.abs(T[0]) > 2200 || Math.abs(T[1]) > 2200) continue;
        const bez = bez4(S0, [S0[0] + Nn.x * 0.4 * L, S0[1] + Nn.z * 0.4 * L], [T[0] - dd.x * 0.35 * L, T[1] - dd.z * 0.35 * L], T);
        const path = Array.from({ length: 41 }, (_, i) => bez(i / 40));
        if (path.some(q => Math.abs(q[0]) > 2250 || Math.abs(q[1]) > 2250)) continue;
        if (minR(path) < 420 || !farFromPaths(path, 300)) continue;
        if (path.slice(8).some(q => polyDist(q[0], q[1], ringPts) < 300)) continue;
        const nLoops = L > 1750 && rc() < 0.6 ? 2 : 1, lat = nLoops === 2 ? [0.3, 0.62] : [0.34 + rc() * 0.16];
        const arc = path.map((_, i) => i / 40), sites = [...lat.map(a => ({ a, rad: Math.round(100 + rc() * 40) })), { a: 1, rad: Math.round(130 + rc() * 50) }];
        if (!sites.every(st => { const pos = path[Math.min(40, Math.round(arc[Math.round(st.a * 40)] * 40))]; return spots(pos, st.rad, 70) && polyDist(pos[0], pos[1], ringPts) >= st.rad + 200; })) continue;
        const names2 = sites.map(() => pick(rc, VILLAGES, usedV));
        const id = (['D', 'F', 'G', 'H'] as const)[branches.length];
        branches.push({
          id, name: `Antenne de ${names2[names2.length - 1]}`, from: f, side, via: [0.18, 0.4, 0.62, 0.82, 1].map(bez),
          loops: lat.map((a, i) => ({ name: names2[i], at: a })), terminus: names2[names2.length - 1],
        });
        used.push({ f, h: 270 }); paths.push(path);
        sites.forEach((st, i) => { const pos = path[Math.round(st.a * 40)]; urban.push({ station: names2[i], radius: st.rad }); taken.push({ x: pos[0], z: pos[1], r: st.rad }); });
        addCircuit({ id: id + '1', name: `Ligne ${id} (antenne)`, track: side, type: 'omnibus', fleet: nLoops === 2 ? 4 : 3, service: nLoops === 2 ? 2 : 1 + (L > 1500 ? 1 : 0), cars: 3, via: [id] });
        break;
      }
    }
    // -- ligne libre : navette aller-retour au milieu de la boucle, rare (≈ 1 monde sur 5), sans lien avec la boucle --
    if (wantFree) {
      let sxx = 0, sxz = 0, szz = 0; for (const q of C) { sxx += (q.x - cx) ** 2; sxz += (q.x - cx) * (q.z - cz); szz += (q.z - cz) ** 2; }
      const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), ux = Math.cos(th), uz = Math.sin(th), nx = -uz, nz = ux;     // axe principal de la boucle
      const proj = C.map(q => (q.x - cx) * ux + (q.z - cz) * uz), pmin = Math.min(...proj), pmax = Math.max(...proj);
      for (let draw = 0; draw < 60; draw++) {
        const ang = (rc() - 0.5) * 0.35, ca = Math.cos(ang), sa = Math.sin(ang), dx = ux * ca - uz * sa, dz = ux * sa + uz * ca;
        const off = (rc() - 0.5) * 300, m = 330 + rc() * 190, bend = (rc() < 0.5 ? 1 : -1) * (90 + rc() * 110);
        const a0 = pmin + m, a1 = pmax - m, L = a1 - a0;
        if (L < 1250) continue;
        const pt = (t: number, b: number) => [Math.round(cx + dx * (a0 + L * t) + nx * (off + b)), Math.round(cz + dz * (a0 + L * t) + nz * (off + b))];
        const P0 = pt(0, 0), P3 = pt(1, 0), c1 = pt(0.33, bend), c2 = pt(0.67, -bend);
        const bez = bez4(P0, c1, c2, P3), path = Array.from({ length: 41 }, (_, i) => bez(i / 40));
        if (minR(path) < 420) continue;
        if (!farFromPaths(path, 330)) continue;
        if (path.some(q => polyDist(q[0], q[1], ringPts) < 250)) continue;
        const nLoops = L > 2100 ? 2 : 1, lat = nLoops === 2 ? [0.34, 0.66] : [0.46 + rc() * 0.08];
        const sites = [{ a: 0, rad: Math.round(100 + rc() * 30) }, ...lat.map(a => ({ a, rad: Math.round(90 + rc() * 30) })), { a: 1, rad: Math.round(100 + rc() * 30) }];
        const okSite = (st: { a: number; rad: number }) => { const pos = path[Math.round(st.a * 40)]; if (polyDist(pos[0], pos[1], river) < st.rad * 0.6 + 45) { return false; } if (taken.some(t => Math.hypot(t.x - pos[0], t.z - pos[1]) < (t.r + st.rad) * 0.95 + 20)) { return false; } if (polyDist(pos[0], pos[1], ringPts) < st.rad + 120) { return false; } return true; };
        if (!okSite(sites[0]) || !okSite(sites[sites.length - 1])) continue;
        
        const nm = sites.map(() => pick(rc, VILLAGES, usedV)), id = (['D', 'F', 'G', 'H'] as const)[branches.length];
        branches.push({ id, name: `Navette ${nm[0]} – ${nm[nm.length - 1]}`, origin: nm[0], via: [0, 0.25, 0.5, 0.75, 1].map(bez), loops: lat.map((a, i) => ({ name: nm[i + 1], at: a })), terminus: nm[nm.length - 1] });
        paths.push(path);
        sites.forEach((st, i) => { if (i > 0 && i < sites.length - 1 && !okSite(st)) return; const pos = path[Math.round(st.a * 40)]; urban.push({ station: nm[i], radius: st.rad }); taken.push({ x: pos[0], z: pos[1], r: st.rad }); });
        addCircuit({ id: id + '1', name: `Navette ${id}`, track: id + '>', type: 'omnibus', fleet: 2, service: 2, cars: 3 });
        break;
      }
    }
    // -- exploitation : parc de chaque voie sans la saturer, dépôt assez grand --
    for (const tr of ['A', 'B'] as const) {
      const extra = base.circuits.filter(c => c.track === tr && c.via?.length).reduce((a, c) => a + c.service, 0);
      const main = base.circuits.find(c => c.id === tr)!;
      main.service = Math.max(1, Math.min(main.service, 5 - extra));
    }
    const stored = (tr: string) => base.circuits.filter(c => c.track === tr).reduce((a, c) => a + c.fleet - c.service, 0);
    base.depots![0].tracks = Math.max(6, stored('A') + 1, stored('B') + 1);
  }
  if (plan >= 0) done.set(base, chords.length === nChPlanned && branches.filter(b => !b.origin).length === nBrPlanned && (!wantFree || branches.some(b => b.origin)));
  if (chords.length) base.chords = chords;
  if (branches.length) base.branches = branches;
  const cPath = paths;
  const nv = 3 + Math.floor(r() * 3);
  for (let tries = 0, got = 0; tries < 600 && got < nv; tries++) {
    const ang = r() * 6.28, d = r() * 1900, x = Math.round(cx + Math.cos(ang) * d * 1.05), z = Math.round(cz + Math.sin(ang) * d * 0.8), rad = Math.round(100 + r() * 40);
    if (C.some(p => Math.hypot(p.x - x, p.z - z) < 240)) continue;
    if (polyDist(x, z, river) < rad + 70) continue;
    if (cPath.some(q => polyDist(x, z, q) < 240)) continue;
    if (taken.some(t => Math.hypot(t.x - x, t.z - z) < t.r + rad + 150)) continue;
    taken.push({ x, z, r: rad }); got++;
    urban.push({ at: [x, z], village: true, name: pick(r, VILLAGES, usedV), radius: rad });
  }
  return { ...base, terrain, urban, rivers: [{ name: 'La Rivière', width: 20 + Math.round(r() * 12), points: river }], seed };
}

export interface CheckResult { problems: string[]; stats: { length: number; structures: number; structLen: number; maxGrade: number; minR: number } }

/** Contrôle de validité d'un monde : courbes, gares droites, ouvrages d'art raisonnables, zones disjointes, villes loin de l'eau. */
export function checkLayout(def: LayoutDef): CheckResult {
  const problems: string[] = [];
  let net: Network;
  try { net = buildNetwork(def); } catch (e) { return { problems: [String((e as Error).message)], stats: { length: 0, structures: 0, structLen: 0, maxGrade: 0, minR: 0 } }; }
  const N = net.center.length, length = N * net.step;
  if (!Number.isFinite(net.maxGrade) || net.center.some(p => !Number.isFinite(p.y))) return { problems: ['profil en long invalide'], stats: { length, structures: 0, structLen: 0, maxGrade: NaN, minR: 0 } };
  const minR = minRadius(net, 0, Math.floor(N / 2));
  if (minR < 180) problems.push(`courbe trop serrée (${minR.toFixed(0)} m)`);
  for (const s of def.stations) { const rr = minRadius(net, Math.round(s.at * N) % N, 60); if (rr < 240) problems.push(`gare ${s.name} en courbe (${rr.toFixed(0)} m)`); }
  for (const d of def.depots ?? []) { const rr = minRadius(net, Math.round(d.at * N) % N, 60); if (rr < 250) problems.push(`dépôt en courbe (${rr.toFixed(0)} m)`); }
  for (const l of net.lines.slice(1)) {           // cordes : rayon, ouvrages d'art
    let mr = Infinity; const K = 8;
    for (let i = 30; i < l.center.length - 30 - K; i++) { const a = l.center[i], b = l.center[i + K / 2], c = l.center[i + K]; const A = Math.hypot(b.x - a.x, b.z - a.z), B = Math.hypot(c.x - b.x, c.z - b.z), Cc = Math.hypot(c.x - a.x, c.z - a.z), ar = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)); if (ar > 1e-6) mr = Math.min(mr, A * B * Cc / (2 * ar)); }
    const branch = (def.branches ?? []).some(b => b.id === l.id);
    if (mr < (branch ? 300 : 200)) problems.push(`${branch ? 'antenne' : 'corde'} ${l.id} trop courbe (${mr.toFixed(0)} m)`);
    const sl = l.structures.reduce((a, q) => a + q.len, 0);
    if (l.structures.length > 4 || sl > l.center.length * l.step * 0.4) problems.push(`corde ${l.id} : trop d'ouvrages d'art`);
  }
  const structLen = net.structures.reduce((a, s) => a + s.len, 0);
  if (net.structures.length > 8) problems.push(`trop d'ouvrages d'art (${net.structures.length})`);
  if (structLen > length * 0.36) problems.push(`ouvrages d'art trop longs (${(structLen / length * 100).toFixed(0)} %)`);
  if (net.maxGrade > 0.0215) problems.push(`pente ${(net.maxGrade * 100).toFixed(2)} %`);
  const t = new Terrain(net, def.urban);
  let clear = Infinity;      // la voie doit passer nettement au-dessus de l'eau (sinon le train roule dans la rivière)
  for (const l of net.lines) for (const p of l.center) { const q = t.riverNear(p.x, p.z); if (q && q.d < q.hw + 4) clear = Math.min(clear, p.y - q.level); }
  if (clear < 3.2) problems.push(`voie trop près de l'eau à un franchissement (${clear.toFixed(1)} m)`);
  const R0 = t.rivers[0];
  if (R0) {   // la rivière ne coupe ni ville, ni village, ni dépôt ; chaque franchissement de voie est un pont (jamais dans un tunnel ni sur une zone bloquée)
    for (const z of t.zones) { let m = Infinity; for (const p of R0.pts) m = Math.min(m, Math.hypot(p.x - z.x, p.z - z.z)); if (m < z.r * (z.kind === 'city' ? 1.15 : 1) + R0.width / 2 + 25) problems.push(`rivière trop près de ${z.name ?? z.kind}`); }
    let bare = 0;
    for (const l of net.lines) for (const p of l.center) { const q = t.riverNear(p.x, p.z); if (q && q.d < q.hw + 6 && (!p.bf || p.tf)) bare++; }
    if (bare) problems.push(`franchissement de rivière sans pont (${bare} points de voie)`);
  }
  for (let i = 0; i < t.zones.length; i++) {
    const z = t.zones[i];
    for (let j = i + 1; j < t.zones.length; j++) { const o = t.zones[j]; if (Math.hypot(z.x - o.x, z.z - o.z) < (z.r + o.r) * 0.95) problems.push(`zones ${z.name ?? z.kind}/${o.name ?? o.kind} se chevauchent`); }
  }
  try {   // le lac (déduit du relief) ne doit pas recouvrir une zone urbaine
    const wp = planWorld(net, t);
    for (const lk of wp.lakes) for (const z of t.zones) if (Math.hypot(z.x - lk.x, z.z - lk.z) < lk.r + z.r * 0.8) problems.push(`lac sur ${z.name ?? z.kind}`);
  } catch (e) { problems.push('plan du monde : ' + (e as Error).message); }
  if (t.zones.filter(z => z.kind === 'village').length < 3) problems.push('moins de 3 villages');
  return { problems, stats: { length, structures: net.structures.length, structLen, maxGrade: net.maxGrade, minR } };
}

/** Monde pour une graine : jusqu'à 60 mondes × 8 compositions de lignes secondaires, tous déterministes. On garde le premier monde valide
 * dont la composition tirée est complète ; sinon le premier valide avec au moins une ligne secondaire ; sinon la boucle seule. */
export function generateLayout(seed: number): LayoutDef {
  let ring: LayoutDef | null = null, partial: LayoutDef | null = null, last: LayoutDef | null = null;
  for (let k = 0; k < 60; k++) {
    last = attempt(seed, k, -1);
    if (checkLayout(last).problems.length) continue;
    ring ??= last;
    for (let c = 0; c < 6; c++) {
      const d = attempt(seed, k, c);
      if (!(d.chords || d.branches) || checkLayout(d).problems.length) continue;
      if (done.get(d)) return d;
      partial ??= d;
    }
    if (partial) break;
  }
  return partial ?? ring ?? last!;
}
export const _attempt = attempt;   // pour les scripts de diagnostic
