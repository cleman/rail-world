// Vue du drone FPV : modèle, caméra embarquée (ou de poursuite) et affichage tête haute (OSD).
import * as THREE from 'three';
import type { Fpv } from './sim/fpv';

const mm = (v: number) => v.toString().padStart(2, '0');

export interface FpvView {
  /** dt en secondes réelles ; `active` : la vue FPV est affichée. */
  update(dt: number, active: boolean, chase: boolean, camPos: THREE.Vector3): void;
  osd: HTMLElement;
}

export function buildFpvView(scene: THREE.Scene, fpv: Fpv, cam: THREE.PerspectiveCamera, hint: () => string): FpvView {
  // --- modèle : cadre en croix, quatre moteurs et hélices, caméra et LED
  const g = new THREE.Group(), carbon = new THREE.MeshLambertMaterial({ color: 0x1b1d22, flatShading: true });
  for (const a of [Math.PI / 4, -Math.PI / 4]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.022), carbon); arm.rotation.y = a; g.add(arm); }
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.11), new THREE.MeshLambertMaterial({ color: 0x2c313a, flatShading: true })); g.add(body);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: 0x66aaff })); lens.position.set(0, 0.01, -0.06); g.add(lens);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.02), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); led.position.set(0, 0.025, 0.03); g.add(led);
  const props: THREE.Mesh[] = [];
  for (const [x, z] of [[0.12, -0.12], [-0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.018, 8), carbon); m.position.set(x, 0.01, z); g.add(m);
    const pr = new THREE.Mesh(new THREE.CircleGeometry(0.065, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); pr.position.set(x, 0.026, z); g.add(pr); props.push(pr);
  }
  const root = new THREE.Group(); root.add(g); root.visible = false; scene.add(root);

  // --- OSD
  const osd = document.createElement('div');
  osd.style.cssText = 'position:fixed;inset:0;pointer-events:none;display:none;font:600 15px/1.3 ui-monospace,Menlo,Consolas,monospace;color:#fff;text-shadow:0 0 3px #000,0 0 2px #000;z-index:5';
  osd.innerHTML = `<canvas id="osd-h" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)" width="520" height="360"></canvas>
    <div id="osd-top" style="position:absolute;top:14px;left:0;right:0;text-align:center"></div>
    <div id="osd-bl" style="position:absolute;left:24px;bottom:56px"></div>
    <div id="osd-br" style="position:absolute;right:24px;bottom:56px;text-align:right"></div>
    <div id="osd-msg" style="position:absolute;top:30%;left:0;right:0;text-align:center;font-size:26px"></div>
    <div id="osd-hint" style="position:absolute;top:40px;left:0;right:0;text-align:center;font-size:12px;opacity:.85"></div>`;
  document.body.appendChild(osd);
  const $ = (id: string) => osd.querySelector('#' + id) as HTMLElement, cv = osd.querySelector('#osd-h') as HTMLCanvasElement, cx = cv.getContext('2d')!;
  const top = $('osd-top'), bl = $('osd-bl'), br = $('osd-br'), msg = $('osd-msg'), hintEl = $('osd-hint');

  const q = new THREE.Quaternion(), tq = new THREE.Quaternion(), v = new THREE.Vector3(), cp = new THREE.Vector3(), chasePos = new THREE.Vector3();
  let t = 0, inited = false;
  const horizon = (pitch: number, roll: number, fovV: number) => {
    const W = cv.width, H = cv.height; cx.clearRect(0, 0, W, H); cx.save(); cx.translate(W / 2, H / 2); cx.strokeStyle = 'rgba(255,255,255,.9)'; cx.fillStyle = 'rgba(255,255,255,.9)'; cx.lineWidth = 2;
    // réticule fixe
    cx.beginPath(); cx.moveTo(-14, 0); cx.lineTo(-5, 0); cx.moveTo(14, 0); cx.lineTo(5, 0); cx.moveTo(0, 5); cx.lineTo(0, 12); cx.stroke();
    cx.rotate(-roll); const ppd = (window.innerHeight / 2) / Math.tan((fovV / 2) * Math.PI / 180) / (180 / Math.PI) * 1.0;   // pixels par degré, au centre
    cx.globalAlpha = 0.8;
    for (let d = -30; d <= 30; d += 10) {
      const y = (d + pitch * 180 / Math.PI) * ppd * 0.9; if (Math.abs(y) > H / 2 - 4) continue;
      const w = d === 0 ? 150 : 38; cx.beginPath(); cx.moveTo(-w, y); cx.lineTo(-12, y); cx.moveTo(12, y); cx.lineTo(w, y); cx.stroke();
      if (d !== 0) { cx.font = '11px monospace'; cx.fillText(String(Math.abs(d)), w + 5, y + 4); }
    }
    cx.restore();
  };

  return {
    osd,
    update(dt, active, chase, camPos) {
      t += dt;
      // modèle : visible hors vue FPV (ou en poursuite), grossi avec la distance pour rester repérable
      const show = fpv.state !== 'écrasé' && (!active || chase); root.visible = show || (fpv.state === 'écrasé' && !active);
      root.position.set(fpv.x, fpv.y, fpv.z); q.set(fpv.q[1], fpv.q[2], fpv.q[3], fpv.q[0]); root.quaternion.copy(q);
      const dist = root.position.distanceTo(camPos), sc = active ? 1.6 : THREE.MathUtils.clamp(dist / 22, 1.6, 14); root.scale.setScalar(sc);
      for (const p of props) { p.rotation.y += dt * (40 + 500 * fpv.thrust) * (fpv.armed ? 1 : 0); p.visible = true; (p.material as THREE.MeshBasicMaterial).opacity = fpv.armed ? 0.5 : 0.18; }
      led.visible = fpv.armed || Math.sin(t * 4) > 0;
      osd.style.display = active ? 'block' : 'none';
      if (!active) { inited = false; return; }
      // --- caméra
      if (chase) {
        const f = fpv.forward, fl = Math.hypot(f[0], f[2]) || 1;
        chasePos.set(fpv.x - (f[0] / fl) * 3.2, fpv.y + 1.1, fpv.z - (f[2] / fl) * 3.2); if (!inited) cam.position.copy(chasePos); else cam.position.lerp(chasePos, Math.min(1, dt * 6));
        cam.fov = 70; cam.updateProjectionMatrix(); cam.lookAt(fpv.x, fpv.y + 0.2, fpv.z);
      } else {
        const u = fpv.up, f = fpv.forward, vib = fpv.armed ? 0.0015 + 0.003 * fpv.thrust : 0;
        cam.position.set(fpv.x + u[0] * 0.03 + f[0] * 0.06, fpv.y + u[1] * 0.03 + f[1] * 0.06, fpv.z + u[2] * 0.03 + f[2] * 0.06);
        tq.setFromAxisAngle(v.set(1, 0, 0), (fpv.tilt * Math.PI) / 180); cam.quaternion.copy(q).multiply(tq);
        if (vib) { cp.set((Math.random() - 0.5) * vib, (Math.random() - 0.5) * vib, 0); tq.setFromEuler(new THREE.Euler(cp.x, cp.y, 0)); cam.quaternion.multiply(tq); }
        if (cam.fov !== fpv.preset.fov) { cam.fov = fpv.preset.fov; cam.updateProjectionMatrix(); }
      }
      inited = true;
      // --- OSD
      const fw = fpv.forward, up = fpv.up, camPitch = Math.asin(Math.max(-1, Math.min(1, fw[1]))) + (fpv.tilt * Math.PI) / 180, roll = Math.atan2(-qx(fpv, 1), up[1]);
      horizon(camPitch, roll, cam.fov);
      const hd = ((fpv.yaw * 180 / Math.PI) % 360 + 360) % 360, ft = Math.floor(fpv.flight), bat = fpv.battery;
      top.innerHTML = `${fpv.armed ? '<span style="color:#7dff9a">ARMÉ</span>' : '<span style="color:#ffd166">DÉSARMÉ</span>'} · ${fpv.preset.name} · ${fpv.mode.toUpperCase()}${chase ? ' · POURSUITE' : ''} · CAP ${hd.toFixed(0).padStart(3, '0')}°`;
      bl.innerHTML = `VIT ${(fpv.speed * 3.6).toFixed(0).padStart(3, ' ')} km/h<br>ALT ${Math.max(0, fpv.agl).toFixed(0).padStart(3, ' ')} m<br>DIST ${Math.hypot(fpv.x - fpv.home.x, fpv.z - fpv.home.z).toFixed(0)} m`;
      br.innerHTML = `${bar(fpv.thrust)} GAZ ${(fpv.thrust * 100).toFixed(0)} %<br>${bar(bat)} <span style="color:${bat < 0.15 && Math.sin(t * 6) > 0 ? '#ff5a4a' : '#fff'}">BAT ${(bat * 100).toFixed(0)} %</span><br>⏱ ${mm(Math.floor(ft / 60))}:${mm(ft % 60)}`;
      msg.textContent = fpv.state === 'écrasé' ? `💥 ${fpv.crashWhy}` : bat <= 0 ? 'BATTERIE VIDE' : !fpv.armed && fpv.state === 'sol' ? 'A : armer' : '';
      hintEl.textContent = hint();
    },
  };
}
const bar = (u: number) => { const n = Math.round(Math.max(0, Math.min(1, u)) * 10); return '▮'.repeat(n) + '▯'.repeat(10 - n); };
/** composante x de l'axe droit du drone en monde (pour calculer le roulis) */
function qx(f: Fpv, i: number) { const [w, x, y, z] = f.q; const r = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)]; return r[i]; }
