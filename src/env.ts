import * as THREE from 'three';

const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function rngSeed(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

/** Texture de façade : fenêtres sombres le jour, carte d'émission (fenêtres éclairées au hasard) la nuit. */
function windowTextures(cols: number, rows: number, cell: [number, number], litProb: number, seed: number) {
  const W = cols * cell[0], H = rows * cell[1], rnd = rngSeed(seed);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const day = mk(), night = mk(), a = day.getContext('2d')!, b = night.getContext('2d')!;
  a.fillStyle = '#ffffff'; a.fillRect(0, 0, W, H);
  b.fillStyle = '#000000'; b.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * cell[0] + cell[0] * 0.2, y = r * cell[1] + cell[1] * 0.18, w = cell[0] * 0.6, h = cell[1] * 0.58;
    a.fillStyle = '#2f4258'; a.fillRect(x, y, w, h);
    a.fillStyle = '#9fb3c8'; a.fillRect(x, y + h * 0.5, w, 2);
    if (rnd() < litProb) { b.fillStyle = rnd() < 0.5 ? '#ffd58a' : '#fff0c4'; b.fillRect(x, y, w, h); }
  }
  const t = (cv: HTMLCanvasElement) => {
    const tx = new THREE.CanvasTexture(cv);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    return tx;
  };
  return { map: t(day), emissive: t(night) };
}

const C = (h: number) => new THREE.Color(h);

/** Cycle jour/nuit : ciel, brouillard, lumières, fenêtres et lampes allumées la nuit. */
export class DayNight {
  hour = 9;
  /** Numéro du jour du monde (pour la lune, les marées, les événements du ciel). */
  day = 0;
  /** Part du soleil cachée par la lune (0..1), réglée par le ciel : le jour s'assombrit pendant une éclipse. */
  eclipse = 0;
  /** Éclairage de la lune (0..1) : éclaire un peu les nuits de pleine lune. */
  moon = 0;
  auto = true;
  dayLength = 1200; // secondes réelles pour 24 h
  night = 0;
  /** 0..1 : l'observateur est dans un tunnel, la lumière du jour est coupée. */
  shade = 0;
  readonly dir = new THREE.Vector3(0.5, 0.8, 0.3);
  /** Météo : assombrissement général (0..1), ciel gris (0..1), éclair (0..1). Réglés chaque image par main.ts. */
  dim = 0; grey = 0; flash = 0;

  readonly lampHead = new THREE.MeshBasicMaterial({ color: 0x666666 });
  readonly headlight = new THREE.MeshBasicMaterial({ color: 0xdddddd });
  readonly tailLight = new THREE.MeshBasicMaterial({ color: 0xcc1111 });
  readonly towerWin: THREE.MeshLambertMaterial;
  readonly houseWin: THREE.MeshLambertMaterial;
  /** Dimensions d'une tuile de façade en mètres (largeur, hauteur). */
  readonly towerTile: [number, number] = [16, 9];
  readonly houseTile: [number, number] = [8, 3];

  private readonly skyNight = C(0x070b18); private readonly skyDay = C(0xbfd8ea);
  /** Teinte du sol pour l'éclairage hémisphérique de jour. */
  private groundDay = C(0x557744); private readonly skyTw = C(0xf0a070);
  private readonly tmp = new THREE.Color(); private readonly tmp2 = new THREE.Color();

  constructor(private scene: THREE.Scene, private sun: THREE.DirectionalLight, private hemi: THREE.HemisphereLight, private fog: THREE.Fog) {
    const tw = windowTextures(4, 3, [64, 64], 0.45, 11), hs = windowTextures(2, 1, [64, 64], 0.6, 23);
    this.towerWin = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: tw.map, emissive: 0xffffff, emissiveMap: tw.emissive, emissiveIntensity: 0, side: THREE.DoubleSide });
    this.houseWin = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: hs.map, emissive: 0xffffff, emissiveMap: hs.emissive, emissiveIntensity: 0, side: THREE.DoubleSide });
    this.scene.background = new THREE.Color(0xbfd8ea);
    this.apply();
  }

  /** Applique la teinte d'un biome (ciel de jour, sol). */
  setTheme(sky: number, ground: number) { this.skyDay.set(sky); this.groundDay.set(ground); this.apply(); }

  update(dt: number) {
    if (this.auto) { const h0 = this.hour; this.hour = (this.hour + (dt * 24) / this.dayLength) % 24; if (this.hour < h0) this.day++; }
    this.apply();
  }

  private apply() {
    const e = Math.sin(((this.hour - 6) / 24) * Math.PI * 2);   // hauteur du soleil, -1..1
    const ec = Math.pow(this.eclipse, 1.5), day = sm(-0.08, 0.22, e) * (1 - 0.86 * ec);
    this.night = 1 - day;
    const twilight = Math.max(Math.max(0, 1 - Math.abs(e) / 0.2), ec * 0.9);   // en éclipse totale : lueur de crépuscule sur tout l'horizon

    const sky = this.tmp.copy(this.skyNight).lerp(this.skyDay, day).lerp(this.skyTw, twilight * 0.45);
    if (this.grey > 0) sky.lerp(this.tmp2.set(0x6e757d).multiplyScalar(0.1 + 0.9 * day), Math.min(1, this.grey * 1.15));
    if (this.flash > 0.02) sky.lerp(this.tmp2.set(0xdfe6ff), this.flash * 0.6);
    (this.scene.background as THREE.Color).copy(sky);
    this.fog.color.copy(sky);

    const az = (this.hour / 24) * Math.PI * 2, ang = e >= 0 ? Math.asin(e) : Math.asin(-e);
    const el = Math.max(0.22, ang), ce = Math.cos(el);
    this.dir.set(Math.cos(az) * ce, Math.sin(el), Math.sin(az) * ce);
    this.sun.color.set(e >= 0 ? 0xfff2dd : 0x7f93c8).lerp(this.skyTw, e >= 0 ? twilight * 0.5 : 0);
    this.sun.intensity = (0.45 + 1.15 * day) * (1 - 0.9 * this.shade) * (1 - 0.88 * this.dim) + 0.3 * this.moon * this.night * (1 - this.shade) * (1 - this.dim);
    this.hemi.intensity = (0.3 + 1.1 * day) * (1 - 0.62 * this.shade) * (1 - 0.38 * this.dim) + this.flash * 2.2;
    this.hemi.color.set(0xffffff).lerp(C(0x5a6a9a), this.night);
    this.hemi.groundColor.copy(this.groundDay).multiplyScalar(0.35 + 0.65 * day);

    const n = this.night;
    this.towerWin.emissiveIntensity = n * 1.15;
    this.houseWin.emissiveIntensity = n * 0.9;
    this.lampHead.color.copy(C(0x666666)).lerp(C(0xffd88a), n);
    this.headlight.color.copy(C(0xcfcfcf)).lerp(C(0xfffff0), n);
  }
}
