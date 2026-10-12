// Safari photo : des missions (sujet, lumière, météo) et une note pour chaque cliché (composition, lumière, rareté).
// Fonctions pures : la vue (safariview.ts) projette les sujets dans le cadre et appelle `scorePhoto`.

export type Subject =
  | 'train' | 'tram' | 'bus' | 'avion' | 'navire' | 'animal' | 'oiseaux' | 'pont' | 'tunnel' | 'passage' | 'repère'
  | 'footing' | 'vélo' | 'peloton' | 'aviron' | 'parapente' | 'planeur' | 'cavalier' | 'tennis' | 'foot' | 'basket' | 'athlétisme' | 'saut' | 'lancer'
  | 'lune' | 'soleil' | 'éclipse de soleil' | 'éclipse de lune' | 'aurore' | 'comète' | 'arc-en-ciel' | 'étoile filante' | 'ciel étoilé';

/** Sujets du ciel : ils se photographient mieux de nuit (sauf soleil, éclipse de soleil et arc-en-ciel). */
export const SKY_SUBJECTS: Subject[] = ['lune', 'soleil', 'éclipse de soleil', 'éclipse de lune', 'aurore', 'comète', 'arc-en-ciel', 'étoile filante', 'ciel étoilé'];
const DAY_SKY: Subject[] = ['soleil', 'éclipse de soleil', 'arc-en-ciel'];
export const isSky = (s: Subject) => SKY_SUBJECTS.includes(s);

/** Un sujet photographiable dans le monde, avec sa rareté de base (0..1). */
export interface Target { kind: Subject; name: string; x: number; y: number; z: number; r: number; rarity: number }
/** Un sujet tel qu'il apparaît dans le cadre : position (−1..1), taille relative à la hauteur du cadre, distance, masqué ou non. */
export interface Seen { t: Target; nx: number; ny: number; size: number; dist: number; occluded: boolean }
/** Conditions de prise de vue. */
export interface Ctx { hour: number; sunEl: number; night: number; grey: number; rain: number; fog: number; storm: number }

export interface Shot {
  score: number; stars: number; comp: number; light: number; rarity: number;
  main: Seen | null; subjects: Subject[]; notes: string[];
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sm = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Élévation du soleil en degrés, à partir de son sinus. */
export const elevDeg = (sunEl: number) => (Math.asin(clamp(sunEl, -1, 1)) * 180) / Math.PI;

/** Placement (règle des tiers ou centre) : 1 pour un sujet sur un point fort, 0 pour un sujet au bord. */
export function placement(nx: number, ny: number): number {
  let d = Math.hypot(nx, ny) * 0.8;                     // le centre est acceptable, un peu moins bon que les tiers
  for (const sx of [-1 / 3, 1 / 3]) for (const sy of [-1 / 3, 1 / 3]) d = Math.min(d, Math.hypot(nx - sx, ny - sy));
  return clamp(1 - d / 0.75);
}
/** Taille : idéale entre 15 % et 60 % de la hauteur du cadre ; trop petit ou trop près fait perdre des points. */
export function sizeScore(size: number): number {
  if (size < 0.04) return 0.05 + size * 5;
  if (size < 0.15) return 0.25 + 0.75 * ((size - 0.04) / 0.11);
  if (size <= 0.6) return 1;
  return clamp(1 - (size - 0.6) / 0.8, 0.3, 1);
}

/** Qualité de la lumière pour un sujet donné. */
export function lightScore(c: Ctx, sub: Subject): { v: number; note: string } {
  const e = elevDeg(c.sunEl), sky = isSky(sub), dayOk = DAY_SKY.includes(sub);
  const clouds = 1 - 0.85 * clamp(c.grey);
  if (sky && !dayOk) {                                   // astres, aurore, comète : il faut la nuit et un ciel dégagé
    const n = sm(-4, -14, e); return { v: clamp((0.25 + 0.75 * n) * clouds), note: n > 0.7 ? 'nuit noire' : n > 0.2 ? 'crépuscule' : 'ciel encore clair' };
  }
  if (sub === 'arc-en-ciel') return { v: clamp(0.7 + 0.3 * sm(40, 15, e)), note: 'lumière rasante après la pluie' };
  let v: number, note: string;
  if (e < -8) { v = 0.32; note = 'nuit : peu de lumière'; }
  else if (e < -1) { v = 0.55 + 0.3 * sm(-8, -3, e); note = 'heure bleue'; }
  else if (e < 3) { v = 0.95; note = 'lumière dorée'; }
  else if (e < 14) { v = 1; note = 'lumière dorée'; }
  else if (e < 35) { v = 0.82; note = 'belle lumière'; }
  else { v = 0.64; note = 'soleil haut, ombres dures'; }
  v *= 1 - 0.3 * clamp(c.grey);
  if (c.storm > 0.3) { v += 0.18 * c.storm; note = 'ciel d\'orage dramatique'; }
  if (c.fog > 0.3 && e > -2) { v += 0.12; note = 'brume photogénique'; }
  if (c.rain > 0.2 && e > -2) { v += 0.05; note = 'pluie : reflets sur la chaussée'; }
  return { v: clamp(v), note };
}

/** Note d'un cliché. `seen` : les sujets visibles dans le cadre (déjà filtrés des masqués ou non, on s'en occupe ici). */
export function scorePhoto(seen: Seen[], c: Ctx): Shot {
  const vis = seen.filter(s => !s.occluded && Math.abs(s.nx) < 1.05 && Math.abs(s.ny) < 1.05 && s.size > 0.008);
  if (!vis.length) return { score: 0, stars: 0, comp: 0, light: 0, rarity: 0, main: null, subjects: [], notes: ['Rien d\'intéressant dans le cadre.'] };
  // le sujet principal : celui qui compte le plus (taille × rareté × placement)
  const w = (s: Seen) => (0.35 + placement(s.nx, s.ny)) * (0.2 + sizeScore(s.size)) * (0.35 + s.t.rarity);
  vis.sort((a, b) => w(b) - w(a));
  const main = vis[0], notes: string[] = [];
  const cut = Math.abs(main.nx) > 0.92 || Math.abs(main.ny) > 0.92;
  const kinds = [...new Set(vis.map(v => v.t.kind))];
  const pl = placement(main.nx, main.ny), sz = sizeScore(main.size);
  let comp = clamp(0.55 * pl + 0.45 * sz + (kinds.length > 1 ? 0.08 * Math.min(3, kinds.length - 1) : 0) - (cut ? 0.25 : 0));
  if (pl > 0.7) notes.push('sujet bien placé'); else if (pl < 0.3) notes.push('sujet mal cadré');
  if (sz < 0.4) notes.push(main.size < 0.04 ? 'sujet trop petit : approchez ou zoomez' : 'sujet un peu petit'); else if (sz < 0.6) notes.push('sujet trop proche');
  if (cut) notes.push('sujet coupé');
  if (kinds.length > 1) notes.push(`${kinds.length} sujets dans le cadre`);
  const L = lightScore(c, main.t.kind); notes.push(L.note);
  // rareté : celle du sujet principal, un peu relevée par les autres sujets rares
  let rarity = main.t.rarity; for (const v of vis.slice(1, 4)) rarity = Math.max(rarity, v.t.rarity * 0.85) + 0.02;
  rarity = clamp(rarity);
  if (rarity > 0.7) notes.push(`sujet rare : ${main.t.kind}`);
  comp = clamp(comp);
  const score = Math.round(100 * (0.4 * comp + 0.25 * L.v + 0.35 * rarity * (0.45 + 0.55 * comp)));
  const stars = score >= 80 ? 5 : score >= 62 ? 4 : score >= 45 ? 3 : score >= 25 ? 2 : 1;
  return { score, stars, comp, light: L.v, rarity, main, subjects: kinds, notes };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------------------------------------------------------------
export type LightReq = 'doré' | 'nuit' | 'jour' | 'bleue' | null;
export type WeatherReq = 'pluie' | 'brouillard' | 'orage' | null;
export interface Mission { id: string; title: string; subject: Subject | 'animal'; light: LightReq; weather: WeatherReq; min: number; points: number; special?: boolean }

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const LIGHT_TXT: Record<string, string> = { doré: 'à la lumière dorée', nuit: 'de nuit', jour: 'en plein jour', bleue: 'à l\'heure bleue' };
const WX_TXT: Record<string, string> = { pluie: 'sous la pluie', brouillard: 'dans le brouillard', orage: 'par temps d\'orage' };
const NOUN: Record<string, string> = { train: 'un train', tram: 'un tramway', bus: 'un bus', avion: 'un avion', navire: 'un navire', animal: 'un animal', oiseaux: 'des oiseaux', pont: 'un pont avec un train', tunnel: 'une entrée de tunnel', passage: 'un passage à niveau', repère: 'un lieu remarquable', footing: 'un joggeur', vélo: 'un cycliste', peloton: 'un peloton cycliste', aviron: 'un bateau d\'aviron', parapente: 'un parapente', planeur: 'un planeur', cavalier: 'un cavalier', tennis: 'un match de tennis', foot: 'un match de foot', basket: 'un match de basket', athlétisme: 'une séance d\'athlétisme', saut: 'un saut en athlétisme', lancer: 'un lancer en athlétisme', lune: 'la lune', soleil: 'le soleil', 'ciel étoilé': 'le ciel étoilé' };

/** Les missions d'un jour du monde : trois « ordinaires » tirées au hasard, plus une mission spéciale si le ciel offre quelque chose ce jour-là. */
export function missionsFor(day: number, seed: number, special: { aurore: boolean; comète: boolean; éclipseSoleil: boolean; éclipseLune: boolean; pleineLune: boolean }): Mission[] {
  const out: Mission[] = [];
  const subjects: (Subject | 'animal')[] = ['train', 'train', 'tram', 'tram', 'avion', 'navire', 'animal', 'oiseaux', 'pont', 'tunnel', 'passage', 'repère', 'bus', 'lune', 'ciel étoilé', 'soleil', 'footing', 'vélo', 'parapente', 'planeur', 'planeur', 'aviron', 'athlétisme', 'tennis', 'cavalier'];
  const lights: LightReq[] = [null, 'doré', 'doré', 'jour', 'bleue', 'nuit'];
  const weathers: WeatherReq[] = [null, null, null, 'pluie', 'brouillard', 'orage'];
  const used = new Set<string>();
  for (let k = 0, n = 0; out.length < 3 && k < 40; k++) {
    const sub = subjects[Math.floor(hash(day * 17.3 + seed * 3.1 + k * 5.7) * subjects.length)];
    let light = lights[Math.floor(hash(day * 7.7 + seed + k * 2.3) * lights.length)], weather = weathers[Math.floor(hash(day * 3.9 + seed * 1.7 + k * 9.1) * weathers.length)];
    if (sub === 'lune' || sub === 'ciel étoilé') { light = 'nuit'; weather = null; } else if (sub === 'soleil') { light = 'doré'; weather = null; }
    else if (light === 'nuit' && ['avion', 'navire', 'animal', 'oiseaux', 'vélo', 'parapente', 'planeur', 'aviron', 'athlétisme', 'tennis', 'cavalier'].includes(sub as string)) light = 'bleue';
    if (light && weather) weather = null;                                   // une seule contrainte supplémentaire
    const key = String(sub); if (used.has(key)) continue; used.add(key); n++;
    const extra = (light ? LIGHT_TXT[light] : '') || (weather ? WX_TXT[weather] : '');
    out.push({
      id: `${day}:${key}:${light ?? ''}${weather ?? ''}`, subject: sub, light, weather, min: 38,
      title: `Photographier ${NOUN[key] ?? key}${extra ? ' ' + extra : ''}`, points: 50 + (light ? 20 : 0) + (weather ? 30 : 0) + (['avion', 'oiseaux', 'tunnel', 'parapente', 'planeur', 'aviron'].includes(key) ? 15 : 0),
    });
  }
  const sp = (id: string, subject: Subject, title: string, points: number, light: LightReq = 'nuit') => out.push({ id: `${day}:${id}`, subject, light, weather: null, min: 30, title, points, special: true });
  if (special.éclipseSoleil) sp('eclipse-soleil', 'éclipse de soleil', 'Éclipse de soleil : photographiez la couronne !', 400, null);
  if (special.éclipseLune) sp('eclipse-lune', 'éclipse de lune', 'Éclipse de lune : la lune rousse', 350);
  if (special.aurore) sp('aurore', 'aurore', 'Une aurore boréale illumine le nord', 300);
  if (special.comète) sp('comete', 'comète', 'La comète est visible cette nuit', 300);
  if (special.pleineLune && !special.éclipseLune) sp('pleine-lune', 'lune', 'Pleine lune : cadrez-la avec un paysage', 120);
  return out;
}

/** Une mission est-elle remplie par ce cliché ? */
export function fulfils(m: Mission, shot: Shot, c: Ctx): boolean {
  if (!shot.main || shot.score < m.min) return false;
  const ok = (k: Subject) => (m.subject === 'animal' ? k === 'animal' : k === m.subject);
  const hit = shot.subjects.some(ok); if (!hit) return false;
  const e = elevDeg(c.sunEl);
  if (m.light === 'doré' && !(e > -3 && e < 15)) return false;
  if (m.light === 'jour' && !(e > 15)) return false;
  if (m.light === 'bleue' && !(e > -10 && e <= -1)) return false;
  if (m.light === 'nuit' && !(e < -8)) return false;
  if (m.weather === 'pluie' && c.rain < 0.2) return false;
  if (m.weather === 'brouillard' && c.fog < 0.3) return false;
  if (m.weather === 'orage' && c.storm < 0.3) return false;
  return true;
}

/** Titre de rang selon le total de points. */
export function rank(points: number): string {
  return points >= 3000 ? 'Grand reporter' : points >= 1500 ? 'Photographe confirmé' : points >= 600 ? 'Photographe' : points >= 150 ? 'Amateur éclairé' : 'Débutant';
}
