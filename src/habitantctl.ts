// Habitant : clavier, souris, caméra à hauteur d'yeux (1,70 m) ou par-dessus l'épaule, messages à l'écran et fondus entre les temps forts d'une journée.
import * as THREE from 'three';
import { EYE, type Habitant, type Routine, type Walkways } from './sim/habitant';
import type { Figure } from './sim/streetlife';
import { PadReader, PAD } from './pad';

export type HabMode = 'libre' | 'journée';

export function buildHabitantCtl(o: { canvas: HTMLElement; cam: THREE.PerspectiveCamera; hab: Habitant; routine: Routine; ways: Walkways; hour: () => number; onJump: (hour: number) => void }) {
  const { canvas, cam, hab, routine, ways } = o;
  const keys = new Set<string>();
  const box = (css: string) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;pointer-events:none;font:14px/1.35 system-ui,sans-serif;color:#fff;' + css; document.body.appendChild(d); return d; };
  const hud = box('left:50%;bottom:64px;transform:translateX(-50%);padding:8px 14px;border-radius:8px;background:rgba(0,0,0,.5);text-align:center;max-width:80vw;display:none;z-index:5');
  const fade = box('inset:0;background:#000;opacity:0;transition:opacity .8s;z-index:6;display:flex;align-items:center;justify-content:center;font-size:30px;letter-spacing:.04em');
  const state = { on: false, mode: 'libre' as HabMode, shoulder: false, msg: '', msgT: 0, jumping: 0, lastHeading: 0 };
  let view = false; const padR = new PadReader();

  const say = (m: string) => { state.msg = m; state.msgT = 4; };
  const isMove = (k: string) => ['w', 'z', 'a', 'q', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k);

  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (!view || state.mode === 'journée' && state.shoulder) return;
    if (document.pointerLockElement === canvas || e.buttons & 1) { hab.yaw -= e.movementX * 0.0024; hab.pitch = Math.max(-1.35, Math.min(1.35, hab.pitch - e.movementY * 0.0024)); }
  });
  canvas.addEventListener('click', () => { if (view && canvas.requestPointerLock && document.pointerLockElement !== canvas) try { canvas.requestPointerLock(); } catch { /* ignoré */ } });

  const api = {
    state,
    /** Touches : renvoie vrai si la touche est consommée (on est dans la vue « habitant »). */
    keydown(e: KeyboardEvent): boolean {
      if (!view) return false;
      const k = e.key.toLowerCase();
      if (isMove(k)) { keys.add(k); return true; }
      if (k === 'e' && state.mode === 'libre') { say(hab.interact()); return true; }
      if (k === 'e') { return true; }
      if (k === 'c') { state.shoulder = !state.shoulder; say(state.shoulder ? 'Caméra par-dessus l\'épaule' : 'Caméra à hauteur d\'yeux'); return true; }
      return false;
    },
    setView(on: boolean) { view = on; if (!on && document.pointerLockElement === canvas) document.exitPointerLock?.(); hud.style.display = on && state.on ? 'block' : 'none'; },
    get on() { return state.on; },
    /** Se place sur le trottoir le plus proche d'un point et laisse la main au joueur. */
    startFree(x: number, z: number): boolean {
      const p = ways.project(x, z); if (!p) return false;
      const q = ways.walk(p.e, p.s, 1), t = p.e.poly.at(p.s);
      hab.place(q.x, q.z, Math.atan2(t.tx, t.tz)); state.on = true; state.mode = 'libre'; state.shoulder = false;
      say('ZQSD / WASD : marcher — Maj : courir — souris (clic) : regarder — E : monter / descendre — manette : sticks, A, Y, RT'); return true;
    },
    startDay(): boolean {
      if (!routine.start()) return false;
      state.on = true; state.mode = 'journée'; state.shoulder = false; state.msgT = 0; return true;
    },
    stop() { state.on = false; hud.style.display = 'none'; hab.veh = null; },
    /** Personnage visible depuis les autres vues (ou par-dessus l'épaule). */
    figure(): Figure | null {
      if (!state.on || hab.veh) return null;
      if (view && !state.shoulder) return null;
      const hx = Math.sin(hab.yaw), hz = Math.cos(hab.yaw);
      return { x: hab.x, y: hab.y, z: hab.z, hx, hz, phase: hab.phase, pause: hab.v > 0.1 ? 0 : 1, kind: 4 } as Figure;
    },
    update(dt: number) {
      if (!state.on) return;
      // saut d'horloge entre deux temps forts : fondu au noir, légende, changement d'heure, retour
      if (routine.jump && !state.jumping) {
        state.jumping = 1; const j = routine.jump; const h = j.hour, hh = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h - Math.floor(h)) * 60)).padStart(2, '0')}`;
        fade.textContent = `${hh} — ${j.text}`; fade.style.opacity = '1';
        setTimeout(() => { o.onJump(h); routine.jump = null; routine.jumped(); fade.style.opacity = '0'; setTimeout(() => { fade.textContent = ''; state.jumping = 0; }, 900); }, 1300);
      }
      if (state.mode === 'journée') { routine.update(state.jumping ? 0 : dt, o.hour()); }
      else {
        let f = (keys.has('w') || keys.has('z') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
        let side = (keys.has('a') || keys.has('q') ? 1 : 0) - (keys.has('d') ? 1 : 0), run = keys.has('shift');
        if (keys.has('arrowleft')) hab.yaw += dt * 1.6; if (keys.has('arrowright')) hab.yaw -= dt * 1.6;
        const pad = view ? padR.poll() : null;
        if (pad) {   // manette : stick gauche = marcher, stick droit = regarder, RT / L3 = courir, A = monter / descendre, Y = caméra
          f += -pad.ly; side += -pad.lx; run = run || pad.rt > 0.3 || pad.held(PAD.L3);
          hab.yaw -= pad.rx * dt * 2.4; hab.pitch = Math.max(-1.35, Math.min(1.35, hab.pitch - pad.ry * dt * 1.8));
          if (pad.pressed(PAD.A)) say(hab.interact());
          if (pad.pressed(PAD.Y)) { state.shoulder = !state.shoulder; say(state.shoulder ? 'Caméra par-dessus l\'épaule' : 'Caméra à hauteur d\'yeux'); }
        }
        hab.walk(dt, { fwd: Math.max(-1, Math.min(1, f)), side: Math.max(-1, Math.min(1, side)), run }); hab.update(dt);
      }
      if (state.msgT > 0) state.msgT -= dt;
      const lines: string[] = [];
      if (state.mode === 'journée') lines.push(`${routine.caption.hour} ${routine.caption.text}`.trim());
      if (hab.prompt && (state.mode === 'libre' || hab.veh)) lines.push(state.mode === 'libre' ? hab.prompt : hab.prompt.replace(/ — E : .*$/, ''));
      if (state.msgT > 0 && state.msg) lines.push(state.msg);
      hud.textContent = ''; for (const l of lines) { const d = document.createElement('div'); d.textContent = l; hud.appendChild(d); }
      hud.style.display = view && lines.length ? 'block' : 'none';
    },
    /** Place la caméra. */
    camera(t: number) {
      const yaw = hab.heading, pit = hab.pitch, bob = Math.sin(hab.phase * 2) * 0.035 * Math.min(1, hab.v), sway = Math.sin(hab.phase) * 0.012 * Math.min(1, hab.v);
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      if (state.shoulder) {
        const back = hab.veh ? 1.9 : 3.4;
        cam.position.set(hab.x - fx * back - fz * 0.5, hab.y + (hab.veh ? 1.9 : 2.2), hab.z - fz * back + fx * 0.5);
        cam.lookAt(hab.x + fx * 2, hab.y + 1.35, hab.z + fz * 2);
      } else {
        cam.position.set(hab.x, hab.y + EYE + bob, hab.z);
        const cp = Math.cos(pit);
        cam.lookAt(cam.position.x + fx * cp + sway, cam.position.y + Math.sin(pit), cam.position.z + fz * cp);
      }
      void t;
    },
  };
  return api;
}
