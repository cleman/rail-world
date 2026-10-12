import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';
import layout from './layout.json';
import type { LayoutDef } from './sim/network';
import { World } from './sim/world';
import { Terrain } from './sim/terrain';
import { DayNight } from './env';
import { buildScenery } from './scenery';
import { Sky } from './sim/sky';
import { Habitant, Routine, Walkways, collectStops, collectVehicles, type HabWorld } from './sim/habitant';
import { buildHabitantCtl } from './habitantctl';
import { buildSafari } from './safariview';
import type { Target } from './sim/safari';
import { buildSkyView } from './skyview';
import { buildInfra } from './infra';
import { buildStructures } from './structures';
import { TrainViews } from './trains';
import { CameraRig, RIG_KINDS, type RigKind } from './rigs';
import { Director, type ViewKind, type SportInfo, type SportThing } from './director';
import { Sound } from './audio';
import { planWorld } from './sim/planning';
import { buildRoads } from './sim/roads';
import { Traffic, type Vehicle } from './sim/traffic';
import { Pedestrians, activity } from './sim/pedestrians';
import { buildPeople } from './people';
import { buildBusStops } from './busstops';
import { Platforms } from './sim/passengers';
import { buildRoadView } from './roadview';
import { TramNet, TRAM_LEN } from './sim/tram';
import { buildTramView } from './tramview';
import { generateLayout } from './sim/worldgen';
import { pickBiomeMap } from './biome';
import { buildPrecip } from './precip';
import { TiltShift } from './tiltshift';
import { Weather, WEATHER_KINDS } from './sim/weather';
import { buildWeatherView } from './weatherview';
import { planPois, type Poi } from './sim/pois';
import { planSea, planTributary } from './sim/water';
import { rng } from './sim/cityplan';
import { buildPois } from './poi';
import { planComplex, planTrails, toWorld as toWorldC } from './sim/sport';
import { Athletics } from './sim/athletics';
import { buildAthleteView } from './athleteview';
import { buildComplex } from './complexview';
import { buildTrails } from './trailview';
import { planGliderSite, planRowing } from './sim/sport';
import { Outdoors, type Mover } from './sim/outdoor';
import { Games } from './sim/games';
import { GliderOps, type Glider } from './sim/glider';
import { SailplaneOps, type Sail } from './sim/sailplane';
import { buildThermView } from './thermview';
import { buildPlayCtl, type PlayCtl } from './playctl';
import { PLAY_LABEL, type PlayKind, type PlayWorld } from './sim/play';
import { buildMountView } from './mountview';
import { StreetLife, type Figure } from './sim/streetlife';
import { DailyLife, planCrossings } from './sim/daily';
import { buildDailyView } from './dailyview';
import { Fauna, type Threat } from './sim/fauna';
import { buildFauna } from './faunaview';
import { Ships } from './sim/boats';
import { buildBoats } from './boatsview';
import { buildNightWater } from './nightwater';
import { Fpv, PRESETS as FPV_PRESETS } from './sim/fpv';
import { FpvControls, saveConfig, DEFAULT_PAD } from './fpvinput';
import { buildFpvView } from './fpvview';

// Monde : `?seed=N` génère un monde complet à partir de la graine ; sans paramètre, le monde d'origine (layout.json).
const seedParam = new URLSearchParams(location.search).get('seed');
const worldSeed = seedParam !== null && seedParam.trim() !== '' && Number.isFinite(Number(seedParam)) ? Math.floor(Number(seedParam)) : null;
const def = worldSeed === null ? (layout as unknown as LayoutDef) : generateLayout(worldSeed);
document.title = worldSeed === null ? 'Rail World' : `Rail World — monde ${worldSeed}`;
const world = new World(def);
const net = world.net;

// ---------- Scène, lumières, ombres ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;           // mis à jour une seule fois par image (les incrustations réutilisent la même ombre)
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const fog = new THREE.Fog(0xbfd8ea, 250, 2300);
scene.fog = fog;
const hemi = new THREE.HemisphereLight(0xffffff, 0x557744, 1.4);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 10, far: 800 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.5;
scene.add(hemi, sun, sun.target);
const env = new DayNight(scene, sun, hemi, fog);

const biomes = pickBiomeMap(worldSeed, new URLSearchParams(location.search).get('biome')), biome = biomes.a;
{ const k = biomes.b ? 0.4 : 0, mixHex = (p: number, q: number) => new THREE.Color(p).lerp(new THREE.Color(q), k).getHex(); const b2 = biomes.b ?? biome; env.setTheme(mixHex(biome.sky, b2.sky), mixHex(biome.ground, b2.ground)); }
fog.far = 2300 * biome.fog;
const seaOff = new URLSearchParams(location.search).get('mer') === '0';
const t0 = new Terrain(net, def.urban);
const sea = seaOff ? null : planSea(t0, net.guides, worldSeed ?? 0, 2400, rng((worldSeed ?? 0) ^ 0x5ea));
const terrain = sea ? new Terrain(net, def.urban, 26, 110, sea) : t0;
const trib = new URLSearchParams(location.search).get('affluent') === '0' ? null : planTributary(terrain, net.guides, rng((worldSeed ?? 0) ^ 0x7b1b));
if (trib) terrain.addTributary(trib.points, trib.width, 'Affluent');
const wp = planWorld(net, terrain);
const roads = buildRoads(net, terrain, wp);
const traffic = new Traffic(roads, world, worldSeed === null ? 5 : worldSeed + 5);
const pois = planPois(terrain, wp, roads.dist, worldSeed ?? 0);
for (const p of pois) if (p.kind === 'aérodrome') terrain.addFlat({ x: p.x, z: p.z, ux: Math.sin(p.rot), uz: Math.cos(p.rot), hl: 196, hw: 24, y: p.y - 0.15, fade: 38 });
const complex = planComplex(terrain, wp, roads.dist, pois.map(p => ({ x: p.x, z: p.z, r: p.r })), worldSeed ?? 0);
if (complex) terrain.addFlat({ ...complex.flat, y: complex.f.y, fade: 40 });
const trails = planTrails(terrain, wp, roads.dist, complex, worldSeed ?? 0);
const scenery = buildScenery(scene, world, terrain, env, wp, roads, worldSeed === null ? 42 : worldSeed * 7919 + 42, biomes, complex ? [...pois, { kind: 'moulin', name: 'Complexe', x: complex.flat.x, y: complex.f.y, z: complex.flat.z, rot: 0, r: 135 } as Poi] : pois);
const athletics = complex ? new Athletics(complex, worldSeed ?? 0) : null;
const complexView = complex ? buildComplex(scene, complex, env) : null;
const trailView = buildTrails(scene, trails, (x, z) => terrain.height(x, z));
const athleteView = buildAthleteView(scene), mountView = buildMountView(scene);
const gliderSite = planGliderSite(terrain, wp, roads.dist, worldSeed ?? 0), rowCourses = planRowing(terrain, wp, worldSeed ?? 0);
const outdoors = new Outdoors({ edges: roads.edges, trails, rows: rowCourses, ground: (x, z) => terrain.height(x, z), seed: worldSeed ?? 0 });
const games = complex ? new Games(complex, worldSeed ?? 0) : null;
const aerodrome = pois.find(p => p.kind === 'aérodrome'), sailField = aerodrome ? { x: aerodrome.x, y: aerodrome.y, z: aerodrome.z, rot: aerodrome.rot } : gliderSite ? { x: gliderSite.land.x, y: gliderSite.land.y, z: gliderSite.land.z, rot: Math.PI / 2 - gliderSite.down } : null;
const sailplanes = sailField ? new SailplaneOps(sailField, (x, z) => terrain.height(x, z), worldSeed ?? 0) : null;
const gliders = gliderSite ? new GliderOps(gliderSite, (x, z) => terrain.height(x, z), worldSeed ?? 0) : null;
const poiViews = buildPois(scene, pois, env, worldSeed ?? 0, wp.lake?.level ?? 0);
const fauna = new Fauna(terrain, wp, roads.dist, worldSeed ?? 0, 2200, { airfield: pois.find(p => p.kind === 'aérodrome'), guides: net.guides, sea });
const faunaViews = buildFauna(scene, fauna, env);
const ships = new Ships(terrain, wp.lakes, pois, roads.edges.flatMap(e => e.poly.pts), net.guides, worldSeed ?? 0);
const boatViews = buildBoats(scene, ships);
const sky = new Sky(worldSeed ?? 0), skyView = buildSkyView(scene, sky, env);
boatViews.seaLevel = scenery.seaLevel;
const nightWater = buildNightWater(scene, ships, env);
// drone FPV : la surface sous le drone (sol, ou eau qui le détruit)
const fpvSurface = (x: number, z: number, y?: number): { y: number; wet: boolean; ceil?: number } => {
  const h = terrain.height(x, z);
  if (y !== undefined) { const tn = structures.tunnelAt(x, y, z); if (tn && h > tn.ceil + 0.5) return { y: tn.floor, wet: false, ceil: tn.ceil }; }   // dans un tunnel : on vole entre la voie et la voûte
  if (sea && terrain.inSea(x, z) && h < sea.level) return { y: sea.level, wet: true };
  for (const lk of wp.lakes) if (Math.hypot(x - lk.x, z - lk.z) < lk.r && h < lk.level) return { y: lk.level, wet: true };
  const rv = terrain.riverNear(x, z); if (rv && rv.d < rv.hw && h < rv.level + 0.2) return { y: rv.level, wet: true };
  return { y: h, wet: false };
};
const fpv = new Fpv(fpvSurface), fpvCtl = new FpvControls();
const fpvOpt = { chase: false };
const structures = buildStructures(scene, world, terrain, biome.water);
CameraRig.covered = structures.overTunnel;
const infra = buildInfra(scene, world, env);
const roadView = buildRoadView(scene, roads, terrain, traffic, env);
buildBusStops(scene, traffic);
const pedestrians = new Pedestrians(roads, worldSeed === null ? 11 : worldSeed + 11);
const platforms = new Platforms(world, worldSeed === null ? 23 : worldSeed + 23);
const life = new StreetLife(traffic, net, worldSeed === null ? 31 : worldSeed + 31);
const cross = planCrossings(roads, 140, worldSeed === null ? 5 : worldSeed + 5);
const daily = new DailyLife(wp.plans, (x, z) => terrain.height(x, z), worldSeed === null ? 77 : worldSeed + 77, cross.crossings);
const trams = new TramNet(wp.plans, (x, z) => terrain.height(x, z), worldSeed === null ? 77 : worldSeed + 77, roads.nodes.filter(n => n.edges.length >= 3), roads.edges);
trams.bindRoads(roads.nodes); traffic.tramPrio = trams;
const tramView = buildTramView(scene, trams, env);
const dailyView = buildDailyView(scene, daily, env, cross.crossings, cross.hw);
const extras: Figure[] = [];
const people = buildPeople(scene, pedestrians, () => { extras.length = 0; { const f = habCtl.figure(); if (f) extras.push(f); } for (const p of platforms.list) extras.push(p); for (const p of life.list) extras.push(p); for (const p of daily.list) extras.push(p); return extras; });
traffic.target.bus = 10;
const baseTraffic = { ...traffic.target };
let autoTraffic = true;
const threats: Threat[] = [];
const tv = new TrainViews(scene, world, env);
const tilt = new TiltShift(renderer);
const WET = { tempéré: 1, désert: 0.12, neige: 1, automne: 1.3, tropical: 1.8 };
const weather = new Weather(worldSeed ?? 0, biomes.biomes.reduce((a, b) => a + WET[b.id], 0) / biomes.biomes.length);
const wview = buildWeatherView(scene, weather, env, biomes);
const precip = buildPrecip(scene, biomes);

// ---------- Caméras ----------
type View = 'orbite' | RigKind | 'voiture' | 'navire' | 'avion' | 'tram' | 'sport' | 'jouer' | 'fpv' | 'cinéma' | 'habitant';
const VIEWS: View[] = ['orbite', 'cabine', 'passager', 'bord de voie', 'aérienne', 'poursuite', 'voiture', 'drone', 'lointain', 'passage', 'quai', 'navire', 'avion', 'tram', 'fpv'];
const aspect = () => innerWidth / innerHeight;
const orbitCam = new THREE.PerspectiveCamera(55, aspect(), 0.3, 5000);
orbitCam.position.set(80, 60, 80);
const controls = new OrbitControls(orbitCam, renderer.domElement);
controls.enableDamping = true;
const rigs = Object.fromEntries(RIG_KINDS.map(k => [k, new CameraRig(k, world, tv, aspect())])) as Record<RigKind, CameraRig>;
const carCam = new THREE.PerspectiveCamera(65, aspect(), 0.2, 5000);
let carSel: Vehicle | null = null;

const movable = () => world.trains.map((_, i) => i).filter(i => world.trains[i].status !== 'stored');
let sel = movable()[0] ?? 0;
const state = {
  view: 'orbite' as View, train: world.trains[sel].id, vitesse: 1, pause: false, suivre: true,
  tele: false, son: false, multi: false, poste: 'poursuite' as 'poursuite' | 'conducteur', posteS: 'poursuite' as 'poursuite' | 'embarqué',
};
const refresh = () => gui.controllersRecursive().forEach(c => c.updateDisplay());
const subjCam = new THREE.PerspectiveCamera(60, aspect(), 0.3, 6000);
const fpvCam = new THREE.PerspectiveCamera(100, aspect(), 0.05, 6000);
const playCam = new THREE.PerspectiveCamera(62, aspect(), 0.1, 6000);
let playCtl: PlayCtl | null = null;
const isSubjView = (v: View): v is SubjKind => v === 'navire' || v === 'avion' || v === 'tram' || v === 'sport';
const isRig = (v: View): v is RigKind => v !== 'orbite' && v !== 'voiture' && v !== 'navire' && v !== 'avion' && v !== 'tram' && v !== 'sport' && v !== 'jouer' && v !== 'fpv' && v !== 'cinéma' && v !== 'habitant';
const activeCam = (): THREE.PerspectiveCamera => (state.view === 'orbite' ? orbitCam : state.view === 'voiture' ? carCam : isSubjView(state.view) ? subjCam : state.view === 'fpv' ? fpvCam : state.view === 'jouer' ? playCam : state.view === 'cinéma' ? director.cam : state.view === 'habitant' ? habCam : rigs[state.view].cam);

// ---------- Habitant : à pied dans les rues, les quais et les véhicules publics ----------
const habCam = new THREE.PerspectiveCamera(72, aspect(), 0.05, 6000);
const vehCache = new WeakMap<object, never>();
const platPts: { x: number; z: number; y: number }[] = [];
for (const e of net.edges) if (e.kind === 'plat' && !e.mirror) for (let d = 0; d <= e.len; d += 3) { const q = e.at(d); platPts.push({ x: q.x - q.tz * 4.2, z: q.z + q.tx * 4.2, y: q.y + 0.9 }); }
const habStops = collectStops(trams, traffic, world);
const habWorld: HabWorld = {
  surface: (x, z) => { const f = fpvSurface(x, z); return { y: f.y, wet: f.wet }; },
  support: (x, z) => { let bd = 4.4 * 4.4, y: number | null = null; for (const q of platPts) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < bd) { bd = d; y = q.y; } } return y; },
  blocked: (x, z) => {
    for (const zn of terrain.zones) {
      if (zn.kind === 'depot') continue;
      if (Math.hypot(zn.x - x, zn.z - z) > zn.r * 1.05) continue;
      if (roads.dist(x, z) <= 13) return false;
      for (const pl of wp.plans) {                                               // rues de la ville : chaussée, trottoirs et abords
        if (pl.zone !== zn && Math.hypot(pl.zone.x - x, pl.zone.z - z) > pl.zone.r * 1.1) continue;
        const nr = pl.near(x, z); if (nr && nr.d < 7) return false;   // d : distance au bord de la chaussée
        for (const pk of pl.parks) if ((pk.x - x) ** 2 + (pk.z - z) ** 2 < pk.r * pk.r) return false;
      }
      for (let i = 0; i < platPts.length; i += 4) if ((platPts[i].x - x) ** 2 + (platPts[i].z - z) ** 2 < 150) return false;
      for (const st of habStops) if ((st.x - x) ** 2 + (st.z - z) ** 2 < 100) return false;
      return true;
    }
    return false;
  },
  vehicles: () => collectVehicles(trams, traffic, world, vehCache as never), stops: habStops, roads,
};
const hab = new Habitant(habWorld), ways = new Walkways(roads), routine = new Routine(hab, ways, (worldSeed ?? 0) + 1);
let jumpFade = 0;
const habCtl = buildHabitantCtl({ canvas: renderer.domElement, cam: habCam, hab, routine, ways, hour: () => env.hour, onJump: h => { env.hour = h; jumpFade = 1; } });
void jumpFade;

function setTrain(i: number) {
  sel = i; state.train = world.trains[i].id;
  if (isRig(state.view)) rigs[state.view].follow(i);
  refresh();
}
function setView(v: View) {
  if (v !== 'jouer' && playCtl?.on) playCtl.stop();
  state.view = v; controls.enabled = v === 'orbite'; habCtl.setView(v === 'habitant');
  if (v === 'habitant' && !habCtl.on) { const c = head; if (!habCtl.startFree(c.x, c.z)) setView('orbite'); }
  if (v === 'voiture') { if (!carSel || !traffic.vehicles.includes(carSel)) pickVehicle(0); }
  else if (isSubjView(v)) { if (!subjValid(v)) pickSubject(v, 0); }
  else if (v === 'fpv') { if (fpv.home.x === 0 && fpv.home.z === 0 && !fpvLaunched) launchDrone(); }
  else if (isRig(v)) rigs[v].follow(sel);
  refresh();
}
/** Choisit le véhicule suivi : dir = 0 le plus proche de la caméra, ±1 le suivant / précédent dans la liste. */
let carKind: 'bus' | null = null;
function pickVehicle(dir: number, kind: 'bus' | null = carKind) {
  carKind = kind;
  const V = traffic.vehicles.filter(v => !kind || v.kind === kind); if (!V.length) return;
  if (dir === 0) {
    const c = activeCam().position; let best = V[0], bd = 1e18;
    for (const v of V) { const d = (v.x - c.x) ** 2 + (v.z - c.z) ** 2; if (d < bd) { bd = d; best = v; } }
    carSel = best;
  } else {
    const i = carSel ? V.indexOf(carSel) : -1;
    carSel = V[(i + dir + V.length * 2) % V.length];
  }
}
// ---------- Drone FPV ----------
let fpvLaunched = false;
const fpvView = buildFpvView(scene, fpv, fpvCam, () => fpvCtl.padName ? `Manette : ${fpvCtl.padName.slice(0, 48)} — A : armer · B : repartir · X : drone · Y : acro/stabilisé · ⬆⬇ croix : inclinaison caméra · START : poursuite` : "Pas de manette détectée (appuie sur un bouton) — clavier : flèches = tangage/roulis, W/S = gaz, A/D = lacet, ESPACE = armer, R = repartir, X = mode, C = poursuite, Q/E = inclinaison caméra");
/** Pose le drone au sol là où l'on regarde (cible de la caméra d'orbite), cap dans le sens de la caméra ; sur l'eau, repli près du train suivi. */
function launchDrone() {
  const cam = activeCam(), c = state.view === 'orbite' ? controls.target : cam.position;
  const d = new THREE.Vector3(); cam.getWorldDirection(d); let yaw = Math.atan2(d.x, d.z), x = c.x, z = c.z;
  if (fpvSurface(x, z).wet || Math.abs(x) > 2300 || Math.abs(z) > 2300) { const p = world.trains[sel].pointAt(0); x = p.x + 14; z = p.z + 14; yaw = Math.atan2(-14, -14); }
  fpv.reset(x, z, yaw); fpvLaunched = true;
}
function fpvEvents(events: string[]) {
  for (const e of events) {
    if (e === 'armer') { if (fpv.state === 'écrasé') continue; fpv.arm(!fpv.armed); }
    else if (e === 'reset') { fpv.reset(fpv.home.x, fpv.home.z, fpv.home.yaw); }
    else if (e === 'preset') { fpv.setPreset(FPV_PRESETS.indexOf(fpv.preset) + 1); fpvGui.preset = fpv.preset.name; fpv.tiltOverride = null; refresh(); }
    else if (e === 'mode') { fpv.mode = fpv.mode === 'acro' ? 'stabilisé' : 'acro'; refresh(); }
    else if (e === 'inclinaison+') { fpv.tiltOverride = Math.min(60, fpv.tilt + 5); refresh(); }
    else if (e === 'inclinaison-') { fpv.tiltOverride = Math.max(0, fpv.tilt - 5); refresh(); }
    else if (e === 'vue') { fpvOpt.chase = !fpvOpt.chase; }
  }
}
function updateFpv(real: number) {
  const { input, events } = fpvCtl.poll(real); fpvEvents(events);
  let left = Math.min(real, 0.05); while (left > 1e-6) { const h = Math.min(left, 1 / 240); fpv.step(h, input); left -= h; }
}

// ---------- Suivi d'un navire ou d'un avion ----------
type SubjKind = 'navire' | 'avion' | 'tram' | 'sport';
interface Subj { o: { x: number; y: number; z: number; yaw: number; pitch?: number; bank?: number }; name: string; len: number; kind: SubjKind; alive: () => boolean; /** recul / hauteur de la caméra de poursuite, poste « embarqué » (avant, haut) et hauteur du point visé */ dist?: number; h?: number; eye?: [number, number]; look?: number }
let subj: Subj | null = null;
const SHIP_NAME = { cargo: 'Cargo', pétrolier: 'Pétrolier', ferry: 'Ferry', péniche: 'Péniche', voilier: 'Voilier', pêcheur: 'Bateau de pêche' } as const;
/** Sport : filtre courant (null = tous) et liste des sportifs suivables. */
let sportFilter: string | null = null;
const SPORT_CAM: Record<string, { dist: number; h: number; eye: [number, number]; look: number; nom: string }> = {
  footing: { dist: 5.5, h: 2.1, eye: [0.2, 1.65], look: 1.1, nom: 'Joggeur' }, vélo: { dist: 6.5, h: 2.3, eye: [0.3, 1.5], look: 1.1, nom: 'Cycliste' },
  peloton: { dist: 8, h: 2.8, eye: [0.3, 1.5], look: 1.1, nom: 'Peloton' }, vtt: { dist: 6.5, h: 2.3, eye: [0.3, 1.5], look: 1.1, nom: 'VTT' },
  cavalier: { dist: 8, h: 3.0, eye: [0.3, 2.3], look: 1.6, nom: 'Cavalier' }, aviron: { dist: 15, h: 5, eye: [0, 2.0], look: 0.8, nom: 'Aviron' },
};
function sportSubj(mv: Mover): Subj {
  const c = SPORT_CAM[mv.kind] ?? SPORT_CAM.footing;
  return { o: mv.m ?? mv.a, name: c.nom, len: 2, kind: 'sport', alive: () => !mv.dead && outdoors.movers.includes(mv), dist: c.dist, h: c.h, eye: c.eye, look: c.look };
}
function glideSubj(g: Glider): Subj {
  const o = { get x() { return g.m.x; }, get y() { return g.m.y; }, get z() { return g.m.z; }, get yaw() { return g.m.yaw; } };
  const para = g.state === 'prep' || g.state === 'run';
  return { o, name: 'Parapente', len: 8, kind: 'sport', alive: () => !!gliders && gliders.gliders.includes(g) && !g.hidden, dist: para ? 8 : 26, h: para ? 2.6 : 5, eye: para ? [0.4, 1.7] : [0, 0.3], look: 0 };
}
function sailSubj(g: Sail): Subj {
  const o = { get x() { return g.m.x; }, get y() { return g.m.y; }, get z() { return g.m.z; }, get yaw() { return g.m.yaw; }, get pitch() { return g.m.pitch; } };
  const ground = g.state === 'grid' || g.state === 'rollout' || g.state === 'parked';
  return { o, name: 'Planeur', len: 15, kind: 'sport', alive: () => !!sailplanes && sailplanes.planes.includes(g) && !g.hidden, dist: ground ? 24 : 42, h: ground ? 6 : 9, eye: [1.1, 0.7], look: 0 };
}
function sportList(): Subj[] {
  const out: Subj[] = [];
  if (!sportFilter || sportFilter === 'planeur') if (sailplanes) for (const g of sailplanes.planes) if (!g.hidden) out.push(sailSubj(g));
  for (const mv of outdoors.movers) if (!mv.dead && !mv.a.hidden && (!sportFilter || mv.kind === sportFilter)) out.push(sportSubj(mv));
  if (!sportFilter || sportFilter === 'parapente') if (gliders) for (const g of gliders.gliders) if (!g.hidden) out.push(glideSubj(g));
  return out;
}
function followSport(s: Subj) { subj = s; setView('sport'); state.suivre = false; refresh(); }
function subjects(k: SubjKind): Subj[] {
  if (k === 'sport') return sportList();
  if (k === 'tram') return trams.trams.filter(t => t.active).map(t => ({ o: t, name: `${t.name}${t.line.loop ? ' (boucle)' : ''}`, len: TRAM_LEN, kind: k, alive: () => t.active }));
  if (k === 'navire') return ships.ships.filter(x => !x.hidden).map(x => ({ o: x, name: `${SHIP_NAME[x.kind]} « ${x.name} »`, len: x.len, kind: k, alive: () => !x.hidden }));
  const out: Subj[] = fauna.aircraft.map(a => ({ o: a, name: a.name, len: a.kind === 'hydravion' ? 11 : 8, kind: k, alive: () => true }));
  if (fauna.liner.active) out.push({ o: fauna.liner, name: 'Avion de ligne', len: 40, kind: k, alive: () => fauna.liner.active });
  return out;
}
const subjValid = (k: SubjKind) => !!subj && subj.kind === k && subj.alive();
/** dir = 0 : le plus proche de la caméra ; ±1 : suivant / précédent dans la liste. */
function pickSubject(k: SubjKind, dir: number) {
  const L = subjects(k); if (!L.length) return;
  if (dir === 0 || !subj || subj.kind !== k) {
    const c = activeCam().position; let best = L[0], bd = 1e18;
    for (const q of L) { const d = (q.o.x - c.x) ** 2 + (q.o.z - c.z) ** 2; if (d < bd) { bd = d; best = q; } }
    subj = best;
  } else { const i = L.findIndex(q => q.o === subj!.o); subj = L[(i + dir + L.length * 2) % L.length]; }
}
function followSubject(k: SubjKind, dir = 0) { pickSubject(k, dir); if (subj) setView(k); }
const sp = new THREE.Vector3(), sl = new THREE.Vector3();
function updateSubjCam(dt: number) {
  if (!subj || !subj.alive()) { if (isSubjView(state.view)) pickSubject(state.view, 0); if (!subj) return; }
  const S = subj, o = S.o, sport = S.kind === 'sport', c = Math.cos(o.yaw), n = Math.sin(o.yaw), pitch = o.pitch ?? 0, ship = S.kind === 'navire', tram = S.kind === 'tram';
  const fx = n * Math.cos(pitch), fy = (ship ? -1 : 1) * Math.sin(pitch), fz = c * Math.cos(pitch);
  subjCam.fov = state.posteS === 'embarqué' ? (sport ? 75 : ship ? 62 : tram ? 68 : 72) : 55; subjCam.updateProjectionMatrix();
  if (state.posteS === 'embarqué') {
    const fwd = sport ? S.eye![0] : tram ? 6.3 : ship ? S.len * 0.38 : S.kind === 'avion' && S.len > 20 ? 18 : 2.6, up = sport ? S.eye![1] : tram ? 1.9 : ship ? S.len * 0.16 + 4 : S.len > 20 ? 4 : 2.4, side = ship ? 2.5 : tram ? 0 : -0.4;
    sp.set(o.x + n * fwd + c * side, o.y + up, o.z + c * fwd - n * side);
    subjCam.position.copy(sp); sl.set(sp.x + fx * 60, sp.y + fy * 60, sp.z + fz * 60);
  } else {
    const back = sport ? S.dist! : tram ? 17 : (ship ? S.len * 1.5 + 16 : 20 + S.len * 1.2), up = sport ? S.h! : tram ? 6.5 : ship ? S.len * 0.45 + 7 : 6 + S.len * 0.3;
    sp.set(o.x - n * back, o.y + up, o.z - c * back);
    subjCam.position.lerp(sp, Math.min(1, dt * 3.5)); sl.set(o.x, o.y + (ship ? S.len * 0.08 : sport ? S.look! : 0), o.z);
  }
  const g = terrain.height(subjCam.position.x, subjCam.position.z) + 1.5; if (subjCam.position.y < g) subjCam.position.y = g;
  subjCam.lookAt(sl);
}
function cycle(dir: number) {
  const list = movable(); if (!list.length) return;
  setTrain(list[(list.indexOf(sel) + dir + list.length * 2) % list.length]);
}

// ---------- Multi-vues (incrustations) ----------
interface Slot { on: boolean; kind: RigKind; train: string; rig: CameraRig; label: HTMLDivElement }
const slotDefs: [RigKind, string][] = [['cabine', 'suivi'], ['aérienne', 'suivi'], ['bord de voie', 'suivi']];
const slots: Slot[] = slotDefs.map(([kind, train]) => {
  const label = document.createElement('div'); label.className = 'pip-label'; document.body.appendChild(label);
  return { on: true, kind, train, rig: new CameraRig(kind, world, tv, 16 / 9), label };
});
const slotTrain = (s: Slot) => (s.train === 'suivi' ? sel : Math.max(0, world.trains.findIndex(t => t.id === s.train)));

// ---------- Télé d'ambiance, son ----------
const fadeEl = document.getElementById('fade')!, captionEl = document.getElementById('caption')!;
// points d'intérêt : entrée de chaque tunnel et milieu de chaque pont (le réalisateur aime les filmer)
const poi = net.lines.flatMap(l => l.structures.map(st => l.center[(st.i0 + (st.kind === 'bridge' ? Math.floor(st.n / 2) : 0)) % l.center.length]));
const railSpots: import('./director').RailSpot[] = net.lines.flatMap(l => l.structures.flatMap((st): import('./director').RailSpot[] => {
  const C = l.center, n = C.length, at = (i: number) => l.closed ? C[((i % n) + n) % n] : C[Math.max(0, Math.min(n - 1, i))];
  if (st.kind === 'bridge') { const m = at(st.i0 + Math.floor(st.n / 2)); return [{ kind: 'bridge' as const, x: m.x, y: m.y, z: m.z }]; }
  const a = at(st.i0), b = at(st.i0 + st.n); return [{ kind: 'portal' as const, x: a.x, y: a.y, z: a.z }, { kind: 'portal' as const, x: b.x, y: b.y, z: b.z }];
}));
const sportInfo = (): SportInfo => {
  const things: SportThing[] = [];
  const stadium = complex && athletics && athletics.session ? (() => { const c = toWorldC(complex.f, 0, 10); return { x: c.x, y: complex.f.y, z: c.z, session: athletics.session!.name, lit: athletics.lights }; })() : null;
  if (athletics) for (const a of athletics.athletes) { if (a.pose === 'fly' || a.pose === 'vault' || a.pose === 'flop') things.push({ kind: 'saut', key: `saut${a.id}`, label: a.pose === 'vault' ? 'Saut à la perche' : a.pose === 'flop' ? 'Saut en hauteur' : 'Saut en longueur', pos: () => ({ x: a.x, y: a.y + 1.2, z: a.z }) }); else if (a.pose === 'throw') things.push({ kind: 'lancer', key: `lancer${a.id}`, label: 'Lancer', pos: () => ({ x: a.x, y: a.y + 1.3, z: a.z }) }); }
  for (const mv of outdoors.movers) if (!mv.lead) {
    const a = mv.a, m = mv.kind;
    if (m === 'peloton') things.push({ kind: 'peloton', key: `pel${mv.id}`, label: 'Peloton cycliste', pos: () => ({ x: a.x, y: a.y + 1.1, z: a.z }) });
    else if (m === 'aviron') things.push({ kind: 'aviron', key: `avi${mv.id}`, label: mv.label, pos: () => ({ x: a.x, y: a.y + 0.8, z: a.z }) });
    else if (m === 'cavalier') things.push({ kind: 'cavalier', key: `cav${mv.id}`, label: 'Cavaliers', pos: () => ({ x: a.x, y: a.y + 1.8, z: a.z }) });
    else if (m === 'footing' && a.lamp) things.push({ kind: 'footing', key: `jog${mv.id}`, label: 'Joggeur à la frontale', pos: () => ({ x: a.x, y: a.y + 1.2, z: a.z }) });
  }
  if (sailplanes) for (const g of sailplanes.planes) if (g.state !== 'grid' && g.state !== 'parked') things.push({ kind: 'planeur', key: `plan${g.id}`, label: 'Planeur', pos: () => ({ x: g.m.x, y: g.m.y + 1, z: g.m.z }) });
  if (gliders) for (const g of gliders.gliders) if (g.state !== 'prep' && g.state !== 'landed') things.push({ kind: 'parapente', key: `para${g.id}`, label: 'Parapente', pos: () => ({ x: g.pilot.x, y: g.pilot.y + 5, z: g.pilot.z }) });
  if (games && complex) for (const c of complex.courts) if (games.activeKinds.includes(c.kind)) { const w = toWorldC(complex.f, c.u, c.v); things.push({ kind: 'match', key: `match${c.kind}${c.u}`, label: c.kind === 'tennis' ? 'Tennis' : c.kind === 'foot' ? 'Foot à 5' : 'Basket 3x3', pos: () => ({ x: w.x, y: complex.f.y + 1, z: w.z }) }); }
  return { stadium, things };
};
const director = new Director(world, {
  setTrain, setView: (k: ViewKind) => setView(k), selected: () => sel,
  interest: t => { const p = t.pointAt(0); return poi.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 260) ? 2.5 : 0; },
}, { pois, fauna, ships, crossings: roads.crossings, zones: terrain.zones, ground: (x, z) => terrain.height(x, z), hour: () => env.hour, night: () => env.night, buses: () => traffic.vehicles.filter(v => v.kind === 'bus'), weather: () => weather, tram: trams, spots: railSpots, sport: sportInfo, sky: () => ({ solar: skyView.state.solar, lunar: skyView.state.lunar, aurora: skyView.state.aurora, comet: skyView.state.comet, rainbow: skyView.state.rainbow, moonUp: skyView.state.moonUp, moonLit: skyView.state.moonLit, starVis: skyView.state.starVis, sunDir: skyView.state.sunDir, moonDir: skyView.state.moonDir, cometDir: skyView.state.cometDir, meteorDirs: skyView.state.meteorDirs }) });
director.setAspect(aspect());
const sound = new Sound();
const clock = () => performance.now() / 1000;

// ---------- Interface ----------
const hud = document.getElementById('hud')!, mm = document.getElementById('minimap') as HTMLCanvasElement;
const gui = new GUI({ title: 'Rail World' });
let uiHidden = false;
function setUiHidden(h: boolean) {
  uiHidden = h;
  for (const el of [gui.domElement, mm, hud]) el.style.display = h ? 'none' : '';
}
function setTele(on: boolean) {
  state.tele = on; director.enable(on, clock()); setUiHidden(on);
  if (on) { env.auto = true; state.multi = false; } else { fadeEl.style.opacity = '0'; captionEl.style.opacity = '0'; if (state.view === 'cinéma') setView('orbite'); }
  refresh();
}
gui.add(state, 'view', VIEWS).name('Caméra (1-0)').onChange((v: View) => setView(v));
gui.add(state, 'train', world.trains.map(t => t.id)).name('Train suivi ([ ])').onChange((id: string) => setTrain(world.trains.findIndex(t => t.id === id)));
gui.add(state, 'vitesse', [1, 2, 5, 10, 20]).name('Vitesse du temps');
gui.add(state, 'pause').name('Pause');
gui.add(state, 'suivre').name('Orbite : suivre le train');
const im = gui.addFolder('Immersion');
im.add(state, 'tele').name("Télé d'ambiance (T)").onChange((v: boolean) => setTele(v));
im.add(state, 'multi').name('Multi-vues (M)');
im.add(director, 'pace', 0.5, 2, 0.05).name('Rythme des plans (télé)');
const meteo = { temps: 'auto' as 'auto' | (typeof WEATHER_KINDS)[number] };
im.add(meteo, 'temps', ['auto', ...WEATHER_KINDS]).name('Météo').onChange((v: string) => { weather.forced = v === 'auto' ? null : (v as (typeof WEATHER_KINDS)[number]); });
const mq = im.addFolder('Mode maquette (P)');
mq.add(tilt, 'enabled').name('Activer');
mq.add(tilt, 'focus', 0.1, 0.9, 0.01).name('Hauteur de la netteté');
mq.add(tilt, 'band', 0.02, 0.4, 0.01).name('Largeur de la bande nette');
mq.add(tilt, 'strength', 0, 8, 0.1).name('Flou');
mq.add(tilt, 'sat', 0.6, 2, 0.05).name('Saturation');
mq.add(tilt, 'contrast', 0.8, 1.5, 0.01).name('Contraste');
im.add(state, 'son').name('Son (roulement, klaxon)').onChange((v: boolean) => sound.setEnabled(v));
slots.forEach((s, i) => {
  const f = im.addFolder(`Incrustation ${i + 1}`);
  f.add(s, 'on').name('Afficher');
  f.add(s, 'kind', RIG_KINDS).name('Vue').onChange((k: RigKind) => s.rig.setKind(k));
  f.add(s, 'train', ['suivi', ...world.trains.map(t => t.id)]).name('Train');
  f.close();
});
im.close();
const lieux: Record<string, () => void> = {};
{
  const jump = (tx: number, ty: number, tz: number, cx: number, cy: number, cz: number) => {
    state.suivre = false; setView('orbite');
    orbitCam.position.set(cx, cy, cz); controls.target.set(tx, ty, tz); controls.update();
  };
  const allStructs = net.lines.flatMap(l => l.structures.map(st => ({ st, l })));
  allStructs.forEach(({ st, l }, k) => {
    const C = l.center, at = (i: number) => (l.closed ? C[((i % C.length) + C.length) % C.length] : C[Math.max(0, Math.min(C.length - 1, i))]);
    const n = allStructs.filter((q, j) => q.st.kind === st.kind && j <= k).length;
    if (st.kind === 'tunnel') {
      const p = at(st.i0), q = at(st.i0 - 3), len = Math.hypot(p.x - q.x, p.z - q.z) || 1, ux = (p.x - q.x) / len, uz = (p.z - q.z) / len;
      lieux[`Tunnel ${n} (${st.len.toFixed(0)} m)`] = () => jump(p.x, p.y + 4, p.z, p.x - ux * 85 - uz * 28, p.y + 16, p.z - uz * 85 + ux * 28);
    } else {
      const p = at(st.i0 + Math.floor(st.n / 2));
      lieux[`Pont / viaduc ${n} (${st.len.toFixed(0)} m)`] = () => jump(p.x, p.y - 8, p.z, p.x + 120, p.y + 35, p.z + 150);
    }
  });
  for (const z of terrain.zones) {
    const name = z.kind === 'depot' ? 'Dépôt' : z.kind === 'village' ? `Village ${z.name ?? ''}` : `Ville ${z.name ?? ''}`;
    lieux[name.trim()] = () => jump(z.x, z.y, z.z, z.x + z.r * 0.1, z.y + z.r * 0.8 + 60, z.z + z.r * 1.0 + 60);
  }
  for (const q of pois) lieux[q.name] = () => jump(q.x, q.y + q.r * 0.5, q.z, q.x + q.r * 3.2, q.y + q.r * 1.7 + 14, q.z + q.r * 3.2);
  for (const r of terrain.rivers) { const p = r.pts[Math.floor(r.pts.length / 2)]; lieux[`Rivière ${r.name}`] = () => jump(p.x, p.level, p.z, p.x + 150, p.level + 80, p.z + 150); }
}
const place = { lieu: '—' };
gui.add(place, 'lieu', ['—', ...Object.keys(lieux)]).name('Aller à (orbite)').onChange((k: string) => { lieux[k]?.(); place.lieu = '—'; refresh(); });
const mondeUI = { graine: worldSeed ?? 0 };
const go = (seed: number | null) => { const u = new URL(location.href); if (seed === null) u.searchParams.delete('seed'); else u.searchParams.set('seed', String(seed)); location.href = u.toString(); };
const wf = gui.addFolder('Monde (graine)');
wf.add(mondeUI, 'graine').name('Graine').step(1);
wf.add({ f: () => go(Math.floor(mondeUI.graine)) }, 'f').name('Générer ce monde (recharge)');
wf.add({ f: () => go(1 + Math.floor(Math.random() * 999999)) }, 'f').name('Monde aléatoire');
wf.add({ f: () => go(null) }, 'f').name("Monde d'origine (layout.json)");
wf.close();
const rt = gui.addFolder('Routier');
rt.add({ get auto() { return autoTraffic; }, set auto(v: boolean) { autoTraffic = v; if (!v) { Object.assign(traffic.target, baseTraffic); pedestrians.active = 1; } } }, 'auto').name('Densité selon l\'heure');
rt.add(traffic.target, 'car', 0, 400, 5).name('Voitures').listen();
rt.add(traffic.target, 'bus', 0, 60, 1).name('Bus');
rt.add(traffic.target, 'truck', 0, 100, 1).name('Camions');
const rinfo = { circulent: 0, arretes: 0, passagesFermes: 0 };
rt.add(rinfo, 'circulent').name('Véhicules').listen().disable();
rt.add(rinfo, 'arretes').name('À l\'arrêt').listen().disable();
rt.add(rinfo, 'passagesFermes').name(`Passages à niveau fermés (/${roads.crossings.length})`).listen().disable();
rt.add(state, 'poste', ['poursuite', 'conducteur']).name('Vue voiture (7)');
rt.add({ f: () => { pickVehicle(0, null); setView('voiture'); } }, 'f').name('Suivre le véhicule le plus proche');
rt.add({ f: () => { pickVehicle(1); } }, 'f').name('Véhicule suivant (touche .)');
rt.close();
const fg = gui.addFolder('Drone FPV');
const fpvGui = { preset: FPV_PRESETS[0].name, lancer: () => { launchDrone(); setView('fpv'); }, rate: 1, tilt: FPV_PRESETS[0].tilt, axeRoll: fpvCtl.cfg.roll, axePitch: fpvCtl.cfg.pitch, axeYaw: fpvCtl.cfg.yaw, axeThr: fpvCtl.cfg.thr, roll: 0, pitch: 0, yaw: 0, thr: 0, reset: () => { Object.assign(fpvCtl.cfg, DEFAULT_PAD); saveConfig(fpvCtl.cfg); Object.assign(fpvGui, { axeRoll: DEFAULT_PAD.roll, axePitch: DEFAULT_PAD.pitch, axeYaw: DEFAULT_PAD.yaw, axeThr: DEFAULT_PAD.thr }); refresh(); } };
fg.add({ f: () => fpvGui.lancer() }, 'f').name('🚁 Lancer le drone ici (touche F)');
fg.add(fpvGui, 'preset', FPV_PRESETS.map(p => p.name)).name('Drone (X)').onChange((n: string) => { fpv.setPreset(FPV_PRESETS.findIndex(p => p.name === n)); fpv.tiltOverride = null; refresh(); });
fg.add(fpv, 'mode', ['acro', 'stabilisé']).name('Mode (Y)').listen();
fg.add(fpv, 'throttleMode', ['centré', 'direct']).name('Gaz : centré = stationnaire / direct');
fg.add(fpv, 'rateScale', 0.4, 1.6, 0.05).name('Taux de rotation ×');
fg.add({ get v() { return fpv.tilt; }, set v(x: number) { fpv.tiltOverride = x; } }, 'v', 0, 60, 1).name('Inclinaison caméra (°)').listen();
fg.add(fpvOpt, 'chase').name('Vue poursuite (START / C)');
const fm = fg.addFolder('Manette : axes');
for (const [k, n] of [['roll', 'Roulis'], ['pitch', 'Tangage'], ['yaw', 'Lacet'], ['thr', 'Gaz']] as const) {
  fm.add(fpvCtl.cfg, k, 0, 7, 1).name(`Axe ${n}`).onChange(() => saveConfig(fpvCtl.cfg));
  fm.add(fpvCtl.cfg, ('inv' + k[0].toUpperCase() + k.slice(1)) as 'invRoll', ).name(`Inverser ${n}`).onChange(() => saveConfig(fpvCtl.cfg));
  fm.add(fpvCtl.raw, k, -1, 1, 0.01).name(`· ${n} (lecture)`).listen().disable();
}
fm.add(fpvCtl.cfg, 'dead', 0, 0.3, 0.01).name('Zone morte').onChange(() => saveConfig(fpvCtl.cfg));
fm.add({ f: fpvGui.reset }, 'f').name('Réglages par défaut');
fm.close(); fg.close();
const sc2 = gui.addFolder('Mer et ciel');
sc2.add(state, 'posteS', ['poursuite', 'embarqué']).name('Vue navire / avion');
sc2.add({ f: () => followSubject('navire') }, 'f').name('⚓ Suivre un navire (touche N)');
sc2.add({ f: () => followSubject('avion') }, 'f').name('✈ Suivre un avion (touche V)');
sc2.add({ f: () => followSubject('tram') }, 'f').name('🚋 Suivre un tram (touche Y)');
sc2.add({ f: () => { if (isSubjView(state.view)) followSubject(state.view, 1); } }, 'f').name('Suivant (touche .)');
function followBus() { if (!traffic.target.bus) traffic.target.bus = 6; pickVehicle(0, 'bus'); if (carSel) setView('voiture'); }
gui.add({ f: followBus }, 'f').name('🚌 Suivre un bus (touche B)');
function startDay() {
  if (!habCtl.startDay()) { hud.textContent = 'Aucun arrêt utilisable pour une journée d\'habitant dans ce monde.'; return; }
  setView('habitant'); habCtl.state.mode = 'journée';
}
const habGui = gui.addFolder('Habitant (à pied)');
habGui.add({ f: () => { habCtl.stop(); setView('habitant'); } }, 'f').name('🚶 Marcher dans la ville (touche J)');
habGui.add({ f: startDay }, 'f').name('📅 Suivre un habitant pendant une journée (touche K)');
habGui.add({ f: () => { habCtl.state.shoulder = !habCtl.state.shoulder; } }, 'f').name('🎥 Caméra yeux / épaule (touche C)');
// ---------- Safari photo ----------
function safariTargets(cam: THREE.PerspectiveCamera): Target[] {
  const out: Target[] = [], c = cam.position, near = (x: number, z: number, r: number) => (x - c.x) ** 2 + (z - c.z) ** 2 < r * r;
  for (const t of world.trains) if (t.status !== 'stored') { const m = t.pointAt(t.length / 2); if (near(m.x, m.z, 2600)) out.push({ kind: 'train', name: `Train ${t.id}`, x: m.x, y: m.y + 2, z: m.z, r: Math.max(12, t.length / 2), rarity: t.circuit.type === 'rapide' ? 0.42 : t.circuit.type === 'fret' ? 0.3 : 0.3 }); }
  for (const t of trams.trams) if (t.active && near(t.x, t.z, 1800)) out.push({ kind: 'tram', name: t.name, x: t.x, y: t.y + 1.6, z: t.z, r: 6, rarity: 0.3 });
  for (const v of traffic.vehicles) if (v.kind === 'bus' && near(v.x, v.z, 900)) out.push({ kind: 'bus', name: `Bus n°${v.id}`, x: v.x, y: v.y + 1.8, z: v.z, r: 6, rarity: 0.08 });
  for (const a of fauna.aircraft) if (near(a.x, a.z, 3000)) out.push({ kind: 'avion', name: a.name, x: a.x, y: a.y, z: a.z, r: 9, rarity: a.phase === 'croisière' ? 0.42 : 0.52 });
  if (fauna.liner.active && near(fauna.liner.x, fauna.liner.z, 5000)) out.push({ kind: 'avion', name: 'Avion de ligne', x: fauna.liner.x, y: fauna.liner.y, z: fauna.liner.z, r: 30, rarity: 0.5 });
  for (const s of ships.ships) if (!s.hidden && near(s.x, s.z, 3000)) out.push({ kind: 'navire', name: s.name, x: s.x, y: s.y + 4, z: s.z, r: s.len / 2, rarity: s.kind === 'voilier' ? 0.4 : 0.32 });
  for (const f of fauna.flocks) if (near(f.cx, f.cz, 1200)) out.push({ kind: 'oiseaux', name: 'Vol d\'oiseaux', x: f.cx, y: f.alt, z: f.cz, r: Math.max(10, f.rad), rarity: 0.36 });
  for (const b of fauna.perched) if (b.state === 'posé' && near(b.x, b.z, 260)) out.push({ kind: 'oiseaux', name: 'Oiseau posé', x: b.x, y: b.y + 0.3, z: b.z, r: 0.5, rarity: 0.45 });
  for (const an of fauna.animals) if (near(an.x, an.z, 700)) out.push({ kind: 'animal', name: an.kind === 'vache' ? 'Vache' : 'Mouton', x: an.x, y: an.y + 0.8, z: an.z, r: 1.3, rarity: an.kind === 'vache' ? 0.16 : 0.2 });
  if (near(fauna.balloon.x, fauna.balloon.z, 4000)) out.push({ kind: 'repère', name: 'Montgolfière', x: fauna.balloon.x, y: fauna.balloon.y, z: fauna.balloon.z, r: 14, rarity: 0.62 });
  for (const p of pois) if (near(p.x, p.z, 1800)) out.push({ kind: 'repère', name: p.name || p.kind, x: p.x, y: p.y + 8, z: p.z, r: Math.min(60, Math.max(14, p.r * 0.5)), rarity: 0.3 });
  for (const sp of railSpots) if (near(sp.x, sp.z, 1800)) out.push({ kind: sp.kind === 'bridge' ? 'pont' : 'tunnel', name: sp.kind === 'bridge' ? 'Pont ferroviaire' : 'Entrée de tunnel', x: sp.x, y: sp.y + 4, z: sp.z, r: sp.kind === 'bridge' ? 30 : 12, rarity: 0.36 });
  for (const cr of roads.crossings) if (near(cr.x, cr.z, 900)) out.push({ kind: 'passage', name: cr.closed ? 'Passage à niveau fermé' : 'Passage à niveau', x: cr.x, y: terrain.height(cr.x, cr.z) + 2, z: cr.z, r: 9, rarity: cr.closed ? 0.5 : 0.3 });
  // sport : joggeurs, cyclistes, cavaliers, rameurs, parapentes, matchs et séances d'athlétisme
  for (const mv of outdoors.movers) if (!mv.lead && near(mv.a.x, mv.a.z, 700) && !mv.a.hidden) {
    const kd = mv.kind === 'vtt' ? 'vélo' : mv.kind, n = 1 + outdoors.movers.filter(q => q.lead === mv).length;
    out.push({ kind: kd, name: mv.kind === 'footing' && mv.a.lamp ? 'Joggeur à la frontale' : mv.label, x: mv.a.x, y: mv.a.y + (mv.kind === 'cavalier' ? 1.9 : mv.kind === 'aviron' ? 0.9 : 1.1), z: mv.a.z, r: mv.kind === 'peloton' ? 3 + n * 1.4 : mv.kind === 'aviron' ? (mv.m?.len ?? 8) / 2 : mv.kind === 'cavalier' ? 1.6 + n : 1.0 + 0.5 * n, rarity: ({ footing: 0.12 + (mv.a.lamp ? 0.2 : 0), vélo: 0.1, peloton: 0.3, vtt: 0.22, cavalier: 0.4, aviron: 0.35 } as Record<string, number>)[mv.kind] });
  }
  if (sailplanes) for (const g of sailplanes.planes) if (!g.hidden && near(g.m.x, g.m.z, 3000) && g.state !== 'grid') out.push({ kind: 'planeur', name: 'Planeur', x: g.m.x, y: g.m.y + 0.5, z: g.m.z, r: 8, rarity: 0.6 });
  if (gliders) for (const g of gliders.gliders) if (!g.hidden && near(g.pilot.x, g.pilot.z, 2500) && g.state !== 'prep') out.push({ kind: 'parapente', name: 'Parapente', x: g.pilot.x, y: g.pilot.y + 5.5, z: g.pilot.z, r: 6, rarity: 0.5 });
  if (games && complex) for (const c of complex.courts) if (games.activeKinds.includes(c.kind)) { const w = toWorldC(complex.f, c.u, c.v); if (near(w.x, w.z, 900)) out.push({ kind: c.kind, name: c.kind === 'tennis' ? 'Match de tennis' : c.kind === 'foot' ? 'Match de foot' : 'Match de basket', x: w.x, y: complex.f.y + 1.2, z: w.z, r: c.kind === 'foot' ? 16 : c.kind === 'basket' ? 9 : 8, rarity: 0.25 }); }
  if (athletics && complex && athletics.session) {
    const c = toWorldC(complex.f, 0, 10); if (near(c.x, c.z, 1000)) out.push({ kind: 'athlétisme', name: athletics.session.name, x: c.x, y: complex.f.y + 2, z: c.z, r: 70, rarity: 0.35 });
    for (const a of athletics.athletes) if (near(a.x, a.z, 500)) { if (a.pose === 'fly' || a.pose === 'vault' || a.pose === 'flop') out.push({ kind: 'saut', name: a.pose === 'vault' ? 'Saut à la perche' : a.pose === 'flop' ? 'Saut en hauteur' : 'Saut en longueur', x: a.x, y: a.y + 1, z: a.z, r: 1.6, rarity: 0.55 }); else if (a.pose === 'throw') out.push({ kind: 'lancer', name: 'Lancer', x: a.x, y: a.y + 1.3, z: a.z, r: 1.4, rarity: 0.48 }); else if (a.pose === 'run' && a.v > 6) out.push({ kind: 'athlétisme', name: 'Sprinteur', x: a.x, y: a.y + 1, z: a.z, r: 1.4, rarity: 0.32 }); }
  }
  // ciel : tout est à 3000 m dans la bonne direction
  const sv = skyView.state, D = 3000, sk = (kind: Target['kind'], name: string, d: THREE.Vector3, ang: number, rarity: number) => out.push({ kind, name, x: c.x + d.x * D, y: c.y + d.y * D, z: c.z + d.z * D, r: Math.tan(ang) * D, rarity });
  if (sv.moonUp > 0) sk(sv.lunar > 0.3 ? 'éclipse de lune' : 'lune', sv.lunar > 0.3 ? 'Éclipse de lune' : sv.moonLit > 0.9 ? 'Pleine lune' : 'Lune', sv.moonDir, 0.05, sv.lunar > 0.3 ? 0.97 : 0.2 + 0.2 * sv.moonLit);
  if (sv.sunDir.y > 0) sk(sv.solar > 0.25 ? 'éclipse de soleil' : 'soleil', sv.solar > 0.25 ? 'Éclipse de soleil' : 'Soleil', sv.sunDir, 0.05, sv.solar > 0.25 ? 0.6 + 0.4 * sv.solar : 0.12);
  if (sv.comet > 0.15) sk('comète', 'Comète', sv.cometDir, 0.16, 0.85);
  if (sv.aurora > 0.1) sk('aurore', 'Aurore boréale', new THREE.Vector3(1, 0.22, 0).normalize(), 0.55, 0.7 + 0.25 * sv.aurora);
  if (sv.rainbow > 0.1) sk('arc-en-ciel', 'Arc-en-ciel', new THREE.Vector3(-sv.sunDir.x, 0.3, -sv.sunDir.z).normalize(), 0.7, 0.62);
  for (const d of sv.meteorDirs) sk('étoile filante', 'Étoile filante', d, 0.05, 0.78);
  if (sv.starVis > 0.5) { const f = new THREE.Vector3(); cam.getWorldDirection(f); if (f.y > 0.15) sk('ciel étoilé', 'Ciel étoilé', f, 0.6, 0.3 + 0.2 * (sv.moonLit < 0.3 ? 1 : 0)); }
  return out;
}
const safari = buildSafari({
  canvas: renderer.domElement, cam: () => activeCam(), seed: worldSeed ?? 0, sky, gather: safariTargets, day: () => env.day, ground: (x, z) => terrain.height(x, z),
  ctx: () => ({ hour: env.hour, sunEl: Math.sin(((env.hour - 6) / 24) * Math.PI * 2), night: env.night, grey: env.grey, rain: weather.rain, fog: weather.fog, storm: weather.storm }),
  canZoom: () => ['orbite', 'habitant', 'voiture', 'navire', 'avion', 'tram', 'sport', 'jouer', 'fpv'].includes(state.view),
});
const phGui = gui.addFolder('Safari photo');
phGui.add({ f: () => safari.toggle() }, 'f').name('📷 Mode photo (touche G) — X : photographier');
phGui.add({ f: () => safari.toggleAlbum() }, 'f').name('🖼 Album (touche L)');
const sportGui = gui.addFolder('Sport (aller voir)');
const lookAtSport = (x: number, y: number, z: number, yaw: number, d: number, h: number) => { setView('orbite'); state.suivre = false; refresh(); orbitCam.position.set(x + Math.sin(yaw + 0.9) * d, y + h, z + Math.cos(yaw + 0.9) * d); controls.target.set(x, y + 1, z); controls.update(); };
const goKind = (kind: 'footing' | 'vélo' | 'peloton' | 'vtt' | 'cavalier' | 'aviron', d: number, h: number) => {
  const c = activeCam().position; let mv = outdoors.movers.filter(m => m.kind === kind && !m.lead).sort((a, b) => Math.hypot(a.a.x - c.x, a.a.z - c.z) - Math.hypot(b.a.x - c.x, b.a.z - c.z))[0];
  if (!mv) mv = outdoors.summon(kind, c) ?? undefined as never; if (!mv) return; outdoors.step(0.1, { hour: env.hour, day: env.day, rain: weather.rain, storm: weather.storm, night: env.night, fog: weather.fog, cam: c });
  void d; void h; sportFilter = kind; followSport(sportSubj(mv));
};
for (const [label, kind, d, h] of [['🏃 Joggeur', 'footing', 7, 1.6], ['🚲 Cycliste', 'vélo', 8, 1.8], ['🚴 Peloton', 'peloton', 12, 2.4], ['🚵 VTT', 'vtt', 8, 1.8], ['🏇 Cavaliers', 'cavalier', 9, 2.2], ['🚣 Aviron', 'aviron', 16, 3.5]] as const) sportGui.add({ f: () => goKind(kind, d, h) }, 'f').name(label);
sportGui.add({ f: () => { if (!complex) return; const g = toWorldC(complex.f, 0, -100); lookAtSport(g.x, complex.f.y, g.z, complex.f.rot, 40, 22); } }, 'f').name('🏟 Stade');
sportGui.add({ f: () => { if (!complex) return; const c = complex.courts.find(q => q.kind === 'foot')!, w = toWorldC(complex.f, c.u, c.v); lookAtSport(w.x, complex.f.y, w.z, complex.f.rot + 1.2, 24, 12); } }, 'f').name('⚽ Terrains (foot, tennis, basket)');
sportGui.add({ f: () => { if (!sailplanes) return; const g = sailplanes.planes.find(q => q.state === 'thermal') ?? sailplanes.planes.find(q => q.state === 'tow') ?? sailplanes.planes.find(q => q.state !== 'grid' && q.state !== 'parked') ?? sailplanes.summon(); if (g) { sportFilter = 'planeur'; followSport(sailSubj(g)); } else lookAtSport(sailplanes.field.x, sailplanes.field.y, sailplanes.field.z, sailplanes.field.rot, 70, 25); } }, 'f').name('🛩 Planeur (10 h – 17 h 30)');
sportGui.add({ f: () => { const g = gliders?.gliders.find(q => q.state !== 'prep' && q.state !== 'landed') ?? gliders?.gliders[0]; if (g) { sportFilter = 'parapente'; followSport(glideSubj(g)); } else if (gliderSite) lookAtSport(gliderSite.launch.x, gliderSite.launch.y, gliderSite.launch.z, Math.PI / 2 - gliderSite.down, 40, 12); } }, 'f').name('🪂 Parapente (10 h – 17 h 30)');
// ---------- Jouer : course, vélo, équitation, aviron, planeur, avion, parapente ----------
const playWorld: PlayWorld = {
  ground: (x, z) => terrain.height(x, z), surface: (x, z) => { const f = fpvSurface(x, z); return { y: f.y, wet: f.wet }; }, blocked: (x, z) => habWorld.blocked(x, z),
  thermals: sailplanes?.thermals, field: sailField ?? undefined,
  launch: gliderSite ? { x: gliderSite.launch.x, y: gliderSite.launch.y, z: gliderSite.launch.z, hdg: Math.PI / 2 - gliderSite.down } : undefined,
};
const thermView = buildThermView(scene, () => sailplanes?.thermals, (x, z) => terrain.height(x, z));
playCtl = buildPlayCtl({ cam: playCam, world: () => playWorld, onQuit: () => setView('orbite'), onThermals: () => { thermView.show = !thermView.show; refresh(); } });
function startPlay(kind: PlayKind) {
  const cam = activeCam(), dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const c = state.view === 'orbite' ? controls.target : state.view === 'jouer' && playCtl!.player ? new THREE.Vector3(playCtl!.player.x, 0, playCtl!.player.z) : cam.position;
  let at = { x: c.x, z: c.z, yaw: Math.atan2(dir.x, dir.z) };
  const fail = (m: string) => { document.title = m; alert(m); };
  if (kind === 'aviron') {
    let best: { x: number; z: number; yaw: number } | null = null, bd = 1e18;
    for (const rc of rowCourses) for (let i = 0; i < rc.pts.length - 1; i++) { const d = (rc.pts[i].x - c.x) ** 2 + (rc.pts[i].z - c.z) ** 2; if (d < bd) { bd = d; best = { x: rc.pts[i].x, z: rc.pts[i].z, yaw: Math.atan2(rc.pts[i + 1].x - rc.pts[i].x, rc.pts[i + 1].z - rc.pts[i].z) }; } }
    if (!best) return fail('Pas de plan d\'eau pour ramer dans ce monde.'); at = best;
  } else if (kind === 'planeur' || kind === 'avion') { if (!sailField) return fail('Pas de terrain d\'aviation dans ce monde.'); }
  else if (kind === 'parapente') { if (!gliderSite) return fail('Pas de site de parapente dans ce monde.'); }
  else {   // sur le sol praticable le plus proche
    const okp = (x: number, z: number) => !fpvSurface(x, z).wet && !habWorld.blocked(x, z); let found = okp(at.x, at.z);
    for (let r = 4; !found && r < 140; r += 4) for (let k = 0; k < 16 && !found; k++) { const a = (k / 16) * Math.PI * 2, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; if (okp(x, z)) { at = { x, z, yaw: at.yaw }; found = true; } }
    if (!found) return fail('Aucun sol praticable à proximité : place la caméra ailleurs.');
  }
  if (kind === 'planeur' || kind === 'parapente') thermView.show = true;
  setView('jouer'); playCtl!.start(kind, at); refresh();
}
const playGui = gui.addFolder('Jouer (clavier ou manette)');
playGui.add(thermView, 'show').name('Thermiques visibles (cylindres rouges, V)').listen();
for (const k of ['course', 'vélo', 'cheval', 'aviron', 'planeur', 'avion', 'parapente'] as PlayKind[]) playGui.add({ f: () => startPlay(k) }, 'f').name(PLAY_LABEL[k]);
const skyGui = gui.addFolder('Ciel (lune, éclipses, aurores)');
const jump = (d: number, h: number) => { env.day = d; env.hour = h; };
skyGui.add({ f: () => { const e = sky.nextEclipse(env.day, env.hour, 'solaire'); jump(e.day, (e.hour + 24 - 0.4) % 24); } }, 'f').name('☀ Prochaine éclipse de soleil');
skyGui.add({ f: () => { const e = sky.nextEclipse(env.day, env.hour, 'lunaire'); jump(e.day, (e.hour + 24 - 0.4) % 24); } }, 'f').name('🌕 Prochaine éclipse de lune');
skyGui.add({ f: () => { let d = env.day; for (let k = 0; k < 40 && sky.aurora(d) <= 0; k++) d++; jump(d, 23); } }, 'f').name('✨ Prochaine aurore');
skyGui.add({ f: () => { let d = env.day; for (let k = 0; k < 60 && sky.showers(d) <= 1; k++) d++; jump(d, 1); } }, 'f').name('🌠 Prochaine pluie d’étoiles');
skyGui.add({ f: () => { for (let k = 0; k < 400; k++) { const dd = env.day + k; if (sky.comet(dd, 22).on > 0.8) { jump(dd, 22); break; } } } }, 'f').name('☄ Prochaine comète');
skyGui.add({ f: () => { for (let k = 1; k < 40; k++) { const dd = env.day + k, p = sky.phase(dd, 21); if (Math.abs(p - 0.5) < 0.03) { jump(dd, 21); break; } } } }, 'f').name('🌕 Pleine lune');
const fx = gui.addFolder('Environnement');
fx.add(env, 'hour', 0, 24, 0.05).name('Heure').listen();
fx.add(env, 'auto').name('Cycle jour/nuit');
fx.add(sun, 'castShadow').name('Ombres');
const counts: { c: (typeof world.circuits)[number]; info: { actifs: number; auDepot: number } }[] = [];
for (const c of world.circuits) {
  const f = gui.addFolder(c.name);
  const info = { actifs: 0, auDepot: 0 };
  if (!c.depotless) { f.add(c, 'service', 0, c.fleet, 1).name('Rames en service'); f.add(c, 'cars', 1, c.maxCars, 1).name('Caisses (prochaines sorties)'); }
  f.add(info, 'actifs').name('Circulent').listen().disable();
  if (!c.depotless) f.add(info, 'auDepot').name('Au dépôt').listen().disable();
  if (c.type !== 'fret') for (const s of c.served) f.add(c.stops, s).name(`Arrêt ${s}`);
  f.close();
  counts.push({ c, info });
}

addEventListener('keyup', e => { fpvCtl.keyup(e); playCtl?.keyup(e); });
addEventListener('keydown', e => {
  if (state.view === 'jouer' && playCtl?.keydown(e)) return;
  if (!e.ctrlKey && !e.metaKey && !e.altKey) { const kk = e.key.toLowerCase(); if (kk === 'g') { safari.toggle(); return; } if (kk === 'x' && safari.on) { safari.shutter(); return; } if (kk === 'l') { safari.toggleAlbum(); return; } if (e.key === 'Escape') safari.toggleAlbum(false); }
  if (state.view === 'habitant' && habCtl.keydown(e)) return;
  if (state.view === 'fpv' && fpvCtl.keydown(e)) return;
  if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'j') { if (state.view === 'habitant' && habCtl.state.mode === 'libre') { setView('orbite'); habCtl.stop(); } else { habCtl.stop(); setView('habitant'); } return; }
  if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'k') { startDay(); return; }
  if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) { launchDrone(); setView('fpv'); return; }
  const v = VIEWS[(e.key === '0' ? 10 : Number(e.key)) - 1];
  if (v) setView(v);
  const k = e.key.toLowerCase();
  if (e.key === ']') cycle(1);
  if (e.key === '[') cycle(-1);
  if (k === 'b') followBus();
  if (k === 'h') setUiHidden(!uiHidden);
  if (k === 't') setTele(!state.tele);
  if (k === 'p') { tilt.enabled = !tilt.enabled; refresh(); }
  if (k === 'm') { state.multi = !state.multi; refresh(); }
  if (k === 'n') followSubject('navire', state.view === 'navire' ? 1 : 0);
  if (k === 'v') followSubject('avion', state.view === 'avion' ? 1 : 0);
  if (k === 'y') followSubject('tram', state.view === 'tram' ? 1 : 0);
  if (k === 'e') { state.posteS = state.posteS === 'poursuite' ? 'embarqué' : 'poursuite'; refresh(); }
  const sv = isSubjView(state.view) ? state.view : null;
  if (e.key === '.') { if (sv) followSubject(sv, 1); else pickVehicle(1); }
  if (e.key === ',') { if (sv) followSubject(sv, -1); else pickVehicle(-1); }
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  orbitCam.aspect = aspect(); orbitCam.updateProjectionMatrix();
  carCam.aspect = aspect(); carCam.updateProjectionMatrix(); subjCam.aspect = aspect(); subjCam.updateProjectionMatrix(); fpvCam.aspect = aspect(); fpvCam.updateProjectionMatrix(); playCam.aspect = aspect(); playCam.updateProjectionMatrix(); director.setAspect(aspect());
  for (const r of Object.values(rigs)) r.setAspect(aspect());
});

// ---------- Mini-carte ----------
const W = 240; mm.width = W; mm.height = W;
const mctx = mm.getContext('2d')!;
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
for (const e of net.edges) for (const p of e.pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
const sc = (W - 24) / Math.max(maxX - minX, maxZ - minZ);
const mx = (x: number) => 12 + (x - minX) * sc, mz = (z: number) => 12 + (z - minZ) * sc;
const layer = document.createElement('canvas'); layer.width = layer.height = W;
const lctx = layer.getContext('2d')!;
// eau : mer (demi-plan au-delà de la côte) et lacs, sous le reste
if (sea) {
  lctx.save(); lctx.beginPath(); lctx.rect(0, 0, W, W); lctx.clip();
  lctx.fillStyle = 'rgba(79,147,201,0.45)'; lctx.beginPath();
  const tx = -sea.uz, tz = sea.ux, far = 6000;
  ([[-far, 0], [far, 0], [far, far], [-far, far]] as [number, number][]).forEach(([a, d], i) => { const x = sea.ux * (sea.c0 + d) + tx * a, z = sea.uz * (sea.c0 + d) + tz * a; if (i) lctx.lineTo(mx(x), mz(z)); else lctx.moveTo(mx(x), mz(z)); });
  lctx.closePath(); lctx.fill(); lctx.restore();
}
lctx.fillStyle = 'rgba(79,147,201,0.6)';
for (const lk of wp.lakes) { lctx.beginPath(); lctx.arc(mx(lk.x), mz(lk.z), lk.r * sc, 0, 6.3); lctx.fill(); }
lctx.lineWidth = 2;
for (const e of net.edges) {
  lctx.strokeStyle = e.via === 'plat' || e.kind === 'plat' ? '#e0a43c' : e.via === 'depot' || e.kind === 'depot' ? '#6f8aa6' : '#9aa0a8';
  lctx.beginPath();
  e.pts.forEach((p, i) => (i ? lctx.lineTo(mx(p.x), mz(p.z)) : lctx.moveTo(mx(p.x), mz(p.z))));
  lctx.stroke();
}
lctx.strokeStyle = '#6b7684'; lctx.lineWidth = 1;
for (const e of roads.edges) {
  lctx.beginPath();
  e.poly.pts.forEach((p, i) => (i ? lctx.lineTo(mx(p.x), mz(p.z)) : lctx.moveTo(mx(p.x), mz(p.z))));
  lctx.stroke();
}
lctx.fillStyle = '#ff5a4a';
for (const c of roads.crossings) { lctx.beginPath(); lctx.arc(mx(c.x), mz(c.z), 2.5, 0, 6.3); lctx.fill(); }
lctx.strokeStyle = '#4f93c9'; lctx.lineWidth = 3;
for (const r of terrain.rivers) { lctx.beginPath(); r.pts.forEach((p, i) => (i ? lctx.lineTo(mx(p.x), mz(p.z)) : lctx.moveTo(mx(p.x), mz(p.z)))); lctx.stroke(); }
for (const s of net.lines.flatMap(l => l.structures.map(st => ({ ...st, c: l.center })))) {
  lctx.strokeStyle = s.kind === 'tunnel' ? '#2b2118' : '#f2f2f2'; lctx.lineWidth = 5; lctx.setLineDash(s.kind === 'tunnel' ? [3, 3] : []);
  lctx.beginPath();
  for (let k = 0; k < s.n; k++) { const p = s.c[(s.i0 + k) % s.c.length]; if (k) lctx.lineTo(mx(p.x), mz(p.z)); else lctx.moveTo(mx(p.x), mz(p.z)); }
  lctx.stroke(); lctx.setLineDash([]);
}
for (const q of pois) { lctx.fillStyle = q.kind === 'château' ? '#d6b8ff' : q.kind === 'phare' ? '#ffe36b' : q.kind === 'ruine' ? '#b3a99a' : q.kind === 'aérodrome' ? '#8fd0ff' : q.kind === 'port' ? '#5fe0c0' : '#e8e4da'; lctx.fillRect(mx(q.x) - 2.5, mz(q.z) - 2.5, 5, 5); }
lctx.lineWidth = 2;
lctx.fillStyle = '#fff'; lctx.font = '11px sans-serif';
for (const e of net.edges.filter(x => x.kind === 'plat' && (x.track === 'A' || x.track.endsWith('+') || x.track.endsWith('>') || x.turn))) {
  const p = e.at(e.stopOffset - 70); lctx.fillText(e.station, mx(p.x) + 6, mz(p.z) - 6);
}
for (const d of net.depots.filter(x => x.track === 'A')) {
  const p = d.edges[0].at(d.edges[0].len / 2); lctx.fillStyle = '#9fb7d0'; lctx.fillText(d.name, mx(p.x) + 6, mz(p.z) + 14);
}
function drawMinimap() {
  mctx.clearRect(0, 0, W, W); mctx.drawImage(layer, 0, 0);
  for (const v of traffic.vehicles) if (v.kind === 'bus') { mctx.beginPath(); mctx.arc(mx(v.x), mz(v.z), 2.6, 0, 6.3); mctx.fillStyle = '#ff9a2e'; mctx.fill(); }
  if (carSel && traffic.vehicles.includes(carSel)) { mctx.beginPath(); mctx.arc(mx(carSel.x), mz(carSel.z), 3.5, 0, 6.3); mctx.fillStyle = '#7dff9a'; mctx.fill(); }
  world.trains.forEach((t, i) => {
    if (t.status === 'stored') return;
    const p = t.pointAt(0);
    mctx.beginPath(); mctx.arc(mx(p.x), mz(p.z), i === sel ? 6 : 4, 0, 6.3);
    mctx.fillStyle = tv.colors[i]; mctx.fill();
    if (i === sel) { mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.stroke(); }
  });
}
mm.addEventListener('click', ev => {
  const r = mm.getBoundingClientRect(), cx = ((ev.clientX - r.left) * W) / r.width, cy = ((ev.clientY - r.top) * W) / r.height;
  let best = -1, bd = 16;
  movable().forEach(i => { const p = world.trains[i].pointAt(0), d = Math.hypot(mx(p.x) - cx, mz(p.z) - cy); if (d < bd) { bd = d; best = i; } });
  if (best >= 0) setTrain(best);
});

// ---------- Tableau de bord de la cabine ----------
const cabEl = document.getElementById('cab')!, cabSpeed = document.getElementById('cab-speed')!, cabLimit = document.getElementById('cab-limit')!;
const cabSig = document.getElementById('cab-sig')!, cabNext = document.getElementById('cab-next')!, cabGrade = document.getElementById('cab-grade')!;
const SIG_COLOR = { red: '#ff3b3b', yellow: '#ffc400', green: '#2aff5a' };
const SIG_WORD = { red: 'rouge', yellow: 'jaune', green: 'vert' };
function updateCab() {
  const t = world.trains[sel];
  cabEl.style.display = state.view === 'cabine' ? 'flex' : 'none';
  if (state.view !== 'cabine') return;
  cabSpeed.textContent = (t.v * 3.6).toFixed(0);
  cabLimit.textContent = (Math.min(t.spec.vmax, t.head.vmax) * 3.6).toFixed(0);
  cabGrade.textContent = (t.head.grade(t.d) * 100).toFixed(1);
  let dist = t.head.len - t.d, found: string | null = null;
  for (const e of [t.head, ...t.reserved]) {
    if (e.kind === 'block' || e.kind === 'main' || e.kind === 'plat') {
      const a = world.aspect(e);
      cabSig.style.background = SIG_COLOR[a]; cabNext.textContent = `signal ${SIG_WORD[a]} dans ${Math.round(dist)} m`; found = a; break;
    }
    dist += e.len;
  }
  if (!found) { cabSig.style.background = '#555'; cabNext.textContent = 'aiguillage / dépôt'; }
}

// ---------- Boucle ----------
setTrain(sel);
Object.assign(window, { rw: { complex, trails, athletics, games, outdoors, gliders, gliderSite, sailplanes, rowCourses, mountView, complexView, athleteView, safari, hab, habCtl, routine, habWorld, sky, skyView, trams, cross, fpv, fpvCtl, launchDrone, subjects, followSubject, followSport, startPlay, thermView, playCtl: () => playCtl, sportList, sportSubj, daily, ships, sea, lieux, weather, life, tilt, setTele, fauna, pois, terrain, wp, pedestrians, platforms, traffic, roads, roadView, pickVehicle, renderer, scene, sound, world, env, setView, setTrain, tv, controls, state, rigs, director, orbitCam } });   // accès console pour le débogage

const DT = 1 / 60;
const TYPE_LABEL: Record<string, string> = { omnibus: 'omnibus', rapide: 'rapide', fret: 'fret' };
let last = performance.now(), acc = 0, tacc = 0, frameNo = 0;
const head = new THREE.Vector3();

function render() {
  const w = innerWidth, h = innerHeight;
  renderer.shadowMap.needsUpdate = true;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
  if (tilt.enabled) tilt.render(scene, activeCam(), w, h); else renderer.render(scene, activeCam());
  renderer.shadowMap.needsUpdate = false;
  const shown = slots.filter(s => state.multi && s.on);
  const pw = Math.round(Math.min(340, w * 0.28)), ph = Math.round((pw * 9) / 16);
  slots.forEach(s => { s.label.style.display = 'none'; });
  shown.forEach((s, n) => {
    const x = w - 8 - (n + 1) * pw - n * 8, y = 8;
    s.rig.follow(slotTrain(s)); s.rig.setAspect(pw / ph);
    renderer.setScissorTest(true);
    renderer.setScissor(x - 2, y - 2, pw + 4, ph + 4); renderer.setViewport(x - 2, y - 2, pw + 4, ph + 4);
    renderer.setClearColor(0xffffff); renderer.clear(); renderer.setClearColor(0x000000);
    renderer.setScissor(x, y, pw, ph); renderer.setViewport(x, y, pw, ph);
    renderer.render(scene, s.rig.cam);
    s.label.style.display = 'block'; s.label.style.right = `${w - x - pw}px`; s.label.style.bottom = `${y + ph + 4}px`;
    s.label.textContent = `${world.trains[slotTrain(s)].id} · ${s.kind}`;
  });
  renderer.setScissorTest(false);
}

const cf = new THREE.Vector3(), cp = new THREE.Vector3(), ct = new THREE.Vector3();
function updateCarCam(dt: number) {
  const v = carSel; if (!v) return;
  const f = cf.set(Math.sin(v.yaw) * Math.cos(v.pitch), -Math.sin(v.pitch), Math.cos(v.yaw) * Math.cos(v.pitch));
  const hgt = v.kind === 'car' ? 1.34 : v.kind === 'bus' ? 2.5 : 2.7, half = v.len / 2, seat = v.kind === 'car' ? 0.1 : half - 1.1;
  if (state.poste === 'conducteur') {
    cp.set(v.x, v.y + hgt, v.z).addScaledVector(f, seat);
    cp.x += Math.cos(v.yaw) * -0.4; cp.z += -Math.sin(v.yaw) * -0.4;       // place du conducteur, à gauche
    carCam.position.copy(cp); ct.copy(cp).addScaledVector(f, 20); carCam.lookAt(ct);
  } else {
    const back = v.kind === 'car' ? 9 : 17, up = v.kind === 'car' ? 3.6 : 6.5;
    cp.set(v.x, v.y + up, v.z).addScaledVector(f, -(back + half));
    carCam.position.lerp(cp, Math.min(1, dt * 5));
    ct.set(v.x, v.y + hgt * 0.8, v.z).addScaledVector(f, 6); carCam.lookAt(ct);
  }
}
function frame(now: number) {
  requestAnimationFrame(frame);
  const wall = (now - last) / 1000, real = Math.min(wall, 0.1); last = now;
  if (!state.pause) {
    acc += real * state.vitesse; tacc += real * Math.min(state.vitesse, 5);
    while (acc >= DT) { world.step(DT); traffic.updateCrossings(world, DT); acc -= DT; }
    traffic.focus = { x: activeCam().position.x, z: activeCam().position.z };
    threats.length = 0; for (const t of world.trains) if (t.status !== 'stored') { const a = t.pointAt(0), m = t.pointAt(t.length / 2); threats.push({ x: a.x, z: a.z, v: t.v }, { x: m.x, z: m.z, v: t.v }); }
    while (tacc >= DT) { traffic.step(world, DT, false); pedestrians.step(DT); platforms.step(DT, env.hour); fauna.step(DT, threats); ships.step(DT); ships.work(DT); if (director.enabled) for (let q = 1; q < director.shipSpeed; q++) { ships.step(DT); ships.work(DT); } life.step(DT, env.hour); daily.step(DT, env.hour, weather.rain, traffic.vehicles); trams.step(DT, traffic.vehicles, env.hour); athletics?.step(DT, env.hour, env.day, weather.rain, weather.storm, env.night); games?.step(DT, env.hour, env.day, weather.rain, weather.storm, env.night); outdoors.step(DT, { hour: env.hour, day: env.day, rain: weather.rain, storm: weather.storm, night: env.night, fog: weather.fog, cam: activeCam().position }); gliders?.step(DT, { hour: env.hour, rain: weather.rain, storm: weather.storm, fog: weather.fog }); sailplanes?.step(DT, { hour: env.hour, rain: weather.rain, storm: weather.storm, fog: weather.fog }); tacc -= DT; }
    if (autoTraffic && frameNo % 60 === 0) { const a = 0.25 + 0.75 * activity(env.hour); for (const k of ['car', 'bus', 'truck'] as const) traffic.target[k] = Math.max(k === 'bus' ? 4 : 0, Math.round(baseTraffic[k] * a)); pedestrians.active = activity(env.hour); }
  }
  if (carSel && !traffic.vehicles.includes(carSel)) pickVehicle(0);
  { const cp = activeCam().position; env.shade += ((structures.inTunnel(cp.x, cp.y, cp.z) ? 1 : 0) - env.shade) * Math.min(1, real * 6); }
  fog.far = 2300 * biome.fog * (1 - 0.93 * weather.fog) * (1 - 0.6 * weather.rain) * (1 - 0.25 * weather.storm) + Math.max(0, activeCam().position.y - 40) * 3 * (1 - weather.fog);
  fog.near = 250 * (1 - 0.92 * weather.fog);
  { const ms = sky.moon(env.day, env.hour); env.eclipse = ms.solar; env.moon = ms.lit * Math.max(0, ms.up) * (1 - ms.lunar); }
  env.update(real);
  scenery.update(fauna.t);
  { const td = sky.tide(env.day, env.hour); scenery.setTide(td); boatViews.tide = td; }
  const wx = wview.update(Math.min(wall, 1), activeCam(), env.dir.y);
  sound.setRain(wx.rain); while (weather.thunders > 0) { weather.thunders--; sound.thunder(); }
  traffic.speedFactor = 1 - 0.22 * weather.rain - 0.25 * weather.fog;
  director.update(clock());

  tv.update();
  skyView.update(activeCam().position, fauna.t, Math.min(real, 0.1), wx.rain, weather.cloud, env.shade > 0.6);
  precip.update(real, activeCam(), wx.snow, activeCam().position.y - terrain.height(activeCam().position.x, activeCam().position.z)); poiViews.update(performance.now() / 1000, 1); faunaViews.update(activeCam().position); boatViews.update(activeCam().position, fauna.t, env.night); nightWater.update(activeCam().position, fauna.t);
  dailyView.update(env.hour, weather.rain);
  tramView.update();
  people.update(activeCam().position);
  complexView?.update(!!athletics?.lights, Math.min(real, 0.1));
  athleteView.begin(activeCam().position);
  if (athletics) { for (const a of athletics.athletes) athleteView.add(a, athletics.lights); for (const p of athletics.troupe.props) athleteView.prop(p); }
  if (games) { for (const a of games.athletes) athleteView.add(a, games.lights); for (const p of games.troupe.props) athleteView.prop(p); }
  for (const a of outdoors.athletes) athleteView.add(a);
  if (gliders) for (const a of gliders.athletes) athleteView.add(a, false, 4000);
  if (state.view === 'jouer' && playCtl?.player) athleteView.add(playCtl.player.a, false, 4000);
  athleteView.end(env.night);
  mountView.begin(activeCam().position); for (const m of outdoors.mounts) mountView.add(m); if (gliders) for (const m of gliders.mounts) mountView.add(m); if (state.view === 'jouer' && playCtl?.player?.mount) mountView.add(playCtl.player.mount); if (sailplanes) { for (const m of sailplanes.mounts) mountView.add(m); for (const [a, b] of sailplanes.ropes) mountView.rope(a, b); } mountView.end();
  roadView.update(state.view === 'voiture' && state.poste === 'conducteur' ? carSel : null);
  habCtl.update(Math.min(real, 0.1)); if (state.view === 'habitant') habCtl.camera(now);
  if (state.view === 'voiture') updateCarCam(real);
  if (isSubjView(state.view)) updateSubjCam(real);
  if (state.view === 'jouer' && playCtl?.on) { playCtl.update(real); playCtl.camera(real); }
  if (state.view === 'fpv') updateFpv(real);
  thermView.update();
  fpvView.update(real, state.view === 'fpv', fpvOpt.chase, activeCam().position);
  sound.setFpv(state.view === 'fpv' && fpv.armed, fpv.thrust, fpv.speed);
  for (const l of infra.lamps) infra.setAspect(l, world.aspect(l.e));
  if (frameNo % 30 === 0) {
    rinfo.circulent = traffic.vehicles.length; rinfo.arretes = traffic.vehicles.filter(v => v.v < 0.3).length; rinfo.passagesFermes = roads.crossings.filter(c => c.closed).length;
  }
  if (frameNo++ % 30 === 0) for (const { c, info } of counts) {
    const mine = world.trains.filter(t => t.circuit === c);
    info.actifs = mine.filter(t => t.status !== 'stored').length;
    info.auDepot = mine.length - info.actifs;
  }

  const t = world.trains[sel];
  if (state.view === 'voiture' && carSel) head.set(carSel.x, carSel.y, carSel.z); else if (isSubjView(state.view) && subj) head.set(subj.o.x, subj.o.y, subj.o.z); else if (state.view === 'jouer' && playCtl?.player) head.set(playCtl.player.x, playCtl.player.y, playCtl.player.z); else if (state.view === 'fpv') head.set(fpv.x, fpv.y, fpv.z); else if (state.view === 'habitant') head.set(hab.x, hab.y, hab.z); else if (state.view === 'cinéma') head.copy(director.focus); else head.copy(tv.views[sel][0].group.position);
  if (state.suivre) {
    const prev = controls.target.clone();
    controls.target.lerp(head, 0.1);
    orbitCam.position.add(controls.target.clone().sub(prev));   // la caméra accompagne le train suivi
  }
  sun.position.copy(head).addScaledVector(env.dir, 350);
  sun.target.position.copy(head); sun.target.updateMatrixWorld();

  if (state.view === 'orbite') controls.update();
  else if (isRig(state.view)) rigs[state.view].update(real);
  for (const s of slots) if (state.multi && s.on) s.rig.update(real);

  if (state.tele) {
    fadeEl.style.opacity = String(director.fade);
    const since = director.since(clock());
    captionEl.textContent = director.captionFor(t);
    captionEl.style.opacity = since > 0.8 && since < 7 ? '1' : '0';
  }
  updateCab();
  sound.update(world, activeCam().position);

  if (!uiHidden) {
    const label = t.status === 'stored' ? `au dépôt ${t.head.depot}`
      : t.status === 'leaving' ? 'sort du dépôt' : t.status === 'returning' ? 'retour au dépôt'
      : t.state === 'dwell' ? `en gare ${t.head.station} (${t.dwell.toFixed(0)} s)` : t.state === 'signal' ? 'arrêt au signal' : 'en marche';
    const hh = Math.floor(env.hour), mi = Math.floor((env.hour - hh) * 60);
    const hhmm = `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    if (state.view === 'voiture' && carSel) {
      const KIND = { car: 'Voiture', bus: 'Bus', truck: 'Camion' }, stopped = carSel.holdUntil !== undefined && traffic.time < carSel.holdUntil && carSel.v < 0.3;
      hud.textContent = `${KIND[carSel.kind]} n°${carSel.id} — ${(carSel.v * 3.6).toFixed(0)} km/h${stopped ? ' — à l\'arrêt de bus' : ''} — ${hhmm}  (B : suivre un bus, . / , : véhicule suivant)`;
    } else if (state.view === 'habitant') {
      hud.textContent = `${habCtl.state.mode === 'journée' ? 'Une journée d\'habitant' : 'À pied'} — ${hhmm}  (J : à pied / quitter, K : suivre une journée, C : caméra, E : monter / descendre, ZQSD : marcher, Maj : courir)`;
    } else if (state.view === 'fpv') {
      hud.textContent = `Drone FPV — ${fpv.preset.name} — ${hhmm}  (touche F : relancer ici, 1-0 : changer de vue)`;
    } else if (state.view === 'jouer') {
      hud.textContent = '';
    } else if (isSubjView(state.view) && subj) {
      hud.textContent = `${subj.name} — ${state.posteS} — ${hhmm}  (N : navire, V : avion, Y : tram, . / , : suivant, E : poursuite / embarqué)`;
    } else
    hud.textContent = `${t.id} (${TYPE_LABEL[t.circuit.type]}, ${t.cars} caisses) — ${(t.v * 3.6).toFixed(0)} km/h — ${t.pointAt(0).y.toFixed(0)} m — ${label} — ${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')} — ${weather.label}`;
    drawMinimap();
  }
  controls.enableZoom = !safari.on; safari.update(Math.min(real, 0.1));
  render();
  safari.afterRender();
}
requestAnimationFrame(frame);
