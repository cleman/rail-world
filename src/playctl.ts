// Modes jouables : commandes (clavier et manette), caméra de poursuite ou embarquée, affichage.
import * as THREE from 'three';
import { Player, FlyPlayer, noInput, startPlayer, PLAY_LABEL, type PlayInput, type PlayKind, type PlayWorld } from './sim/play';
import { PadReader, PAD } from './pad';

const HELP: Record<PlayKind, string> = {
  course: 'W / S : avancer, reculer — A / D : tourner — Maj : sprinter',
  vélo: 'W : pédaler — S ou Espace : freiner — A / D : tourner — Maj : à fond',
  cheval: 'W / S : allure supérieure / inférieure — A / D : tourner — Espace : arrêt',
  aviron: 'W : ramer — A / D : barrer — S : cesser de ramer',
  planeur: 'Espace : treuillage — ↑ ↓ : vitesse — ← → : incliner — A / D : palonnier — Ctrl : aérofreins',
  avion: 'Maj : gaz + — Ctrl : gaz − / frein — ↑ ↓ : assiette — ← → : incliner — A / D : palonnier',
  parapente: 'Espace : courir et décoller — A / D (ou ← →) : freins gauche / droit — ↑ ↓ : accélérer / ralentir',
};
const PADHELP = 'Manette : sticks, A action, Y caméra, Start départ, Back quitter';

export function buildPlayCtl(o: { cam: THREE.PerspectiveCamera; world: () => PlayWorld; onQuit: () => void; onThermals?: () => void }) {
  const keys = new Set<string>(); const pr = new PadReader();
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);padding:8px 14px;border-radius:8px;background:rgba(0,0,0,.55);color:#fff;font:14px/1.4 system-ui,sans-serif;text-align:center;max-width:86vw;pointer-events:none;display:none;z-index:5';
  document.body.appendChild(hud);
  // instruments de vol embarqués : horizon artificiel, échelle de tangage, variomètre
  const hz = document.createElement('canvas'); hz.width = 360; hz.height = 360; hz.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:360px;height:360px;pointer-events:none;display:none;z-index:5';
  document.body.appendChild(hz); const hg = hz.getContext('2d')!;
  const drawHorizon = (p: FlyPlayer | null) => {
    hg.clearRect(0, 0, 360, 360); if (!p) { hz.style.display = 'none'; return; } hz.style.display = 'block';
    const c = 180, K = (innerHeight / 2) / Math.tan(40 * Math.PI / 180), D = Math.PI / 180;   // px par radian (caméra de 80° de champ vertical)
    hg.save(); hg.strokeStyle = 'rgba(255,255,255,.85)'; hg.fillStyle = 'rgba(255,255,255,.9)'; hg.lineWidth = 2; hg.font = '11px system-ui'; hg.shadowColor = 'rgba(0,0,0,.6)'; hg.shadowBlur = 3;
    hg.translate(c, c); hg.rotate(-p.roll);        // le monde tourne à l'opposé de l'inclinaison de l'appareil
    const off = p.pitch * K;
    for (let a = -30; a <= 30; a += 5) {
      const y = off - a * D * K; const w = a === 0 ? 150 : a % 10 === 0 ? 46 : 24;
      hg.beginPath(); hg.moveTo(-w, y); hg.lineTo(a === 0 ? -20 : -w + 0, y); hg.moveTo(a === 0 ? 20 : w, y); hg.lineTo(w, y); if (a === 0) { hg.stroke(); hg.beginPath(); hg.moveTo(-20, y); hg.lineTo(20, y); } hg.stroke();
      if (a !== 0 && a % 10 === 0) { hg.fillText(String(Math.abs(a)), w + 4, y + 4); hg.fillText(String(Math.abs(a)), -w - 18, y + 4); }
    }
    hg.restore();
    hg.save(); hg.strokeStyle = '#ffd24a'; hg.lineWidth = 3; hg.beginPath(); hg.moveTo(c - 34, c); hg.lineTo(c - 12, c); hg.lineTo(c, c + 8); hg.lineTo(c + 12, c); hg.lineTo(c + 34, c); hg.stroke(); hg.restore();
    // variomètre : barre verticale à droite (± 5 m/s), couleur selon la masse d'air
    const vy = Math.max(-5, Math.min(5, p.vy)), bx = 340, by = c, hh = 110;
    hg.save(); hg.fillStyle = 'rgba(0,0,0,.4)'; hg.fillRect(bx - 7, by - hh, 14, hh * 2); hg.fillStyle = vy >= 0 ? '#5cf08a' : '#ff7a5a'; hg.fillRect(bx - 7, vy >= 0 ? by - vy / 5 * hh : by, 14, Math.abs(vy) / 5 * hh);
    hg.strokeStyle = '#fff'; hg.lineWidth = 1; hg.beginPath(); hg.moveTo(bx - 10, by); hg.lineTo(bx + 10, by); hg.stroke();
    hg.fillStyle = '#fff'; hg.font = '11px system-ui'; hg.textAlign = 'right'; hg.fillText((p.vy >= 0 ? '+' : '') + p.vy.toFixed(1), bx - 11, by - hh - 5);
    if (p.air > 0.4) { hg.fillStyle = '#ff6a4a'; hg.font = '600 15px system-ui'; hg.textAlign = 'center'; hg.fillText(`▲ THERMIQUE +${p.air.toFixed(1)}`, c, 46); }
    hg.restore();
  };
  const st = { p: null as Player | null, cockpit: false, edges: { action: false, up: false, down: false, cam: false, reset: false } };
  const smooth = new THREE.Vector3(); let primed = false;
  const down = (...k: string[]) => k.some(x => keys.has(x));

  const api = {
    get on() { return !!st.p; },
    get player() { return st.p; },
    start(kind: PlayKind, at: { x: number; z: number; yaw: number }) { st.p = startPlayer(kind, o.world(), at); st.cockpit = false; primed = false; hud.style.display = 'block'; return st.p; },
    stop() { st.p = null; hud.style.display = 'none'; hz.style.display = 'none'; },
    keydown(e: KeyboardEvent): boolean {
      if (!st.p) return false; const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'backspace') { o.onQuit(); return true; }
      if (k === 'v') { if (!e.repeat) o.onThermals?.(); return true; }
      if (k === 'c') { if (!e.repeat) st.cockpit = !st.cockpit; return true; }
      if (k === 'r') { if (st.p instanceof FlyPlayer) st.p.reset(); return true; }
      if (k === ' ' || k === 'e') { if (!e.repeat) st.edges.action = true; e.preventDefault(); return true; }
      if (['w', 'z', 'arrowup'].includes(k) && !e.repeat) st.edges.up = true;
      if (['s', 'arrowdown'].includes(k) && !e.repeat) st.edges.down = true;
      if (['w', 'z', 'a', 'q', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'control', 'x'].includes(k)) { keys.add(k); e.preventDefault(); return true; }
      return false;
    },
    keyup(e: KeyboardEvent) { keys.delete(e.key.toLowerCase()); },
    /** Commandes de l'image courante (clavier + manette). */
    input(): PlayInput {
      const p = st.p!, i = noInput(), pad = pr.poll();
      const up = down('w', 'z', 'arrowup') ? 1 : 0, dn = down('s', 'arrowdown') ? 1 : 0, left = down('a', 'q') ? 1 : 0, right = down('d') ? 1 : 0, aL = down('arrowleft') ? 1 : 0, aR = down('arrowright') ? 1 : 0;
      const fly = p instanceof FlyPlayer;
      if (fly) {
        i.pitch = dn - up; i.roll = aR - aL; i.turn = left - right; i.run = down('shift'); i.brake = down('control', 'x');
        if (p.kind === 'parapente') { i.turn = left + aL - right - aR; i.roll = 0; }
      } else { i.fwd = up - dn; i.turn = left + aL - right - aR; i.run = down('shift'); i.brake = down('control', 'x', ' '); }
      i.action = st.edges.action; i.gearUp = st.edges.up; i.gearDown = st.edges.down;
      if (pad) {
        if (fly) { i.pitch += pad.ry; i.roll += pad.rx; i.turn += -pad.lx; i.thr += -pad.ly; if (pad.rt > 0.3) i.run = true; if (pad.lt > 0.3) i.brake = true; if (p.kind === 'parapente') { i.turn += -pad.rx; i.pitch += -pad.ly * 0; } }
        else { i.fwd += -pad.ly; i.turn += -pad.lx; if (pad.rt > 0.3 || pad.held(PAD.L3)) i.run = true; if (pad.held(PAD.B) || pad.lt > 0.4) i.brake = true; }
        if (pad.pressed(PAD.A)) i.action = true; if (pad.pressed(PAD.UP) || pad.pressed(PAD.RB)) i.gearUp = true; if (pad.pressed(PAD.DOWN) || pad.pressed(PAD.LB)) i.gearDown = true;
        if (pad.pressed(PAD.Y)) st.cockpit = !st.cockpit; if (pad.pressed(PAD.START) && fly) p.reset(); if (pad.pressed(PAD.BACK)) o.onQuit();
      }
      for (const k of ['fwd', 'turn', 'roll', 'pitch', 'thr'] as const) i[k] = Math.max(-1, Math.min(1, i[k]));
      st.edges.action = st.edges.up = st.edges.down = false;
      return i;
    },
    update(dt: number) {
      const p = st.p; if (!p) { drawHorizon(null); return; }
      drawHorizon(p instanceof FlyPlayer && st.cockpit ? p : null); p.step(Math.min(dt, 0.05), api.input());
      const lines = [PLAY_LABEL[p.kind] + ' — ' + p.hud()]; if (p.messageT > 0 && p.message) lines.push(p.message); else lines.push(HELP[p.kind] + ' — C : caméra — V : thermiques — R : départ — Échap : quitter'); lines.push(PADHELP);
      hud.innerHTML = ''; lines.forEach((l, k) => { const d = document.createElement('div'); d.textContent = l; if (k === 2) d.style.opacity = '.6'; if (k === 0) d.style.fontWeight = '600'; hud.appendChild(d); });
      // les sportifs et montures sont dessinés par les vues ; en vue embarquée on les cache
      p.a.hidden = p.a.hidden || st.cockpit; if (p.mount) p.mount.hidden = st.cockpit && !(p instanceof FlyPlayer && p.kind === 'parapente');
      if (!(p instanceof FlyPlayer) || p.kind === 'parapente') p.a.hidden = st.cockpit;
    },
    camera(dt: number) {
      const p = st.p; if (!p) return; const c = o.cam, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), K = p.cam;
      const fly = p instanceof FlyPlayer, pitch = fly ? p.pitch : 0, roll = fly ? p.roll : 0;
      if (st.cockpit) {
        const cp = Math.cos(pitch), dir = new THREE.Vector3(fx * cp, Math.sin(pitch), fz * cp), right = new THREE.Vector3(-fz, 0, fx);
        c.position.set(p.x + fx * K.eye[0], p.y + K.eye[1] + (p.kind === 'course' || p.kind === 'cheval' || p.kind === 'vélo' ? 0 : 0), p.z + fz * K.eye[0]);
        c.up.copy(new THREE.Vector3(0, 1, 0).multiplyScalar(Math.cos(roll)).addScaledVector(right, Math.sin(roll)));
        c.lookAt(c.position.clone().add(dir)); c.fov = 80; c.updateProjectionMatrix(); primed = false; return;
      }
      c.up.set(0, 1, 0); c.fov = 62; c.updateProjectionMatrix();
      const tgt = new THREE.Vector3(p.x - fx * K.back, p.y + K.up, p.z - fz * K.back);
      if (!primed) { smooth.copy(tgt); primed = true; } else smooth.lerp(tgt, 1 - Math.exp(-dt * (fly ? 4.5 : 7)));
      c.position.copy(smooth); c.lookAt(p.x + fx * 2, p.y + K.look, p.z + fz * 2);
    },
  };
  return api;
}
export type PlayCtl = ReturnType<typeof buildPlayCtl>;
