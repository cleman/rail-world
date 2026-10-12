// Safari photo : viseur, zoom, déclencheur, missions du jour, album. Fonctionne dans toutes les vues (le drone FPV, qui n'existe qu'en local, photographie aussi).
import * as THREE from 'three';
import { scorePhoto, missionsFor, fulfils, rank, type Ctx, type Mission, type Seen, type Shot, type Target, isSky } from './sim/safari';
import type { Sky } from './sim/sky';

export interface AlbumEntry { jpg: string; score: number; stars: number; title: string; day: number; hour: number; notes: string[]; mission?: string }
interface Saved { points: number; done: string[]; album: AlbumEntry[] }

export function buildSafari(o: {
  canvas: HTMLCanvasElement; cam: () => THREE.PerspectiveCamera; seed: number; sky: Sky;
  gather(cam: THREE.PerspectiveCamera): Target[]; ctx(): Ctx; day(): number; ground(x: number, z: number): number; canZoom(): boolean;
}) {
  const key = `rw-safari-${o.seed}`;
  const saved: Saved = { points: 0, done: [], album: [] };
  try { const j = localStorage.getItem(key); if (j) Object.assign(saved, JSON.parse(j)); } catch { /* stockage indisponible */ }
  const persist = () => { try { localStorage.setItem(key, JSON.stringify({ ...saved, album: saved.album.slice(-18) })); } catch { /* ignoré */ } };

  const el = (css: string, parent: HTMLElement = document.body) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;font:14px/1.4 system-ui,sans-serif;color:#fff;' + css; parent.appendChild(d); return d; };
  const finder = el('inset:0;pointer-events:none;display:none;z-index:4');
  finder.innerHTML = `<svg width="100%" height="100%" style="position:absolute;inset:0"><g stroke="rgba(255,255,255,.35)" stroke-width="1"><line x1="33.33%" y1="0" x2="33.33%" y2="100%"/><line x1="66.66%" y1="0" x2="66.66%" y2="100%"/><line x1="0" y1="33.33%" x2="100%" y2="33.33%"/><line x1="0" y1="66.66%" x2="100%" y2="66.66%"/></g></svg>`;
  const corners = ['top:14px;left:14px;border-width:2px 0 0 2px', 'top:14px;right:14px;border-width:2px 2px 0 0', 'bottom:14px;left:14px;border-width:0 0 2px 2px', 'bottom:14px;right:14px;border-width:0 2px 2px 0'];
  for (const c of corners) el(`width:34px;height:34px;border:solid rgba(255,255,255,.9);${c}`, finder);
  const missionBox = el('top:70px;right:14px;width:300px;padding:10px 12px;border-radius:8px;background:rgba(0,0,0,.55)', finder);
  const info = el('left:50%;bottom:104px;transform:translateX(-50%);padding:4px 12px;border-radius:6px;background:rgba(0,0,0,.45);font-size:13px', finder);
  const flash = el('inset:0;background:#fff;opacity:0;pointer-events:none;z-index:7;transition:opacity .35s');
  const card = el('right:14px;bottom:76px;width:290px;padding:10px;border-radius:10px;background:rgba(10,12,16,.82);display:none;z-index:8;pointer-events:none');
  const album = el('inset:30px;padding:16px;border-radius:12px;background:rgba(10,12,16,.93);display:none;z-index:9;overflow:auto');

  const st = { on: false, zoom: 1, shots: 0, last: null as Shot | null, day: -1, missions: [] as Mission[], pending: false, cardT: 0 };
  const baseFov = new WeakMap<THREE.PerspectiveCamera, number>();
  let zoomed: THREE.PerspectiveCamera | null = null;

  const dayFlags = (day: number) => {
    let solar = false, lunar = false, full = false;
    for (let h = 6; h <= 18; h += 0.5) if (o.sky.moon(day, h).solar > 0.5) solar = true;
    for (let h = 20; h <= 30; h += 0.5) { const m = o.sky.moon(day + (h >= 24 ? 1 : 0), h % 24); if (m.lunar > 0.5) lunar = true; }
    full = Math.abs(o.sky.phase(day, 23) - 0.5) < 0.06;
    return { aurore: o.sky.aurora(day) > 0, comète: o.sky.comet(day, 22).on > 0.5, éclipseSoleil: solar, éclipseLune: lunar, pleineLune: full };
  };
  const refreshMissions = () => { const d = Math.floor(o.day()); if (d !== st.day) { st.day = d; st.missions = missionsFor(d, o.seed, dayFlags(d)); } };

  const renderMissions = () => {
    refreshMissions();
    const li = st.missions.map(m => { const ok = saved.done.includes(m.id); return `<div style="margin:3px 0;${ok ? 'opacity:.55;text-decoration:line-through' : ''}${m.special ? ';color:#ffd36b' : ''}">${ok ? '✔' : m.special ? '★' : '○'} ${m.title} <span style="opacity:.7">(${m.points} pts)</span></div>`; }).join('');
    missionBox.innerHTML = `<div style="font-weight:600;margin-bottom:4px">📷 Missions du jour — ${rank(saved.points)} · ${saved.points} pts</div>${li}<div style="opacity:.65;margin-top:6px;font-size:12px">X : photographier · molette : zoom · L : album · G : quitter</div>`;
  };

  const showCard = (shot: Shot, jpg: string, title: string) => {
    const stars = '★'.repeat(shot.stars) + '☆'.repeat(5 - shot.stars);
    card.innerHTML = `<img src="${jpg}" style="width:100%;border-radius:6px;display:block"><div style="margin-top:6px;font-size:18px;letter-spacing:.1em;color:#ffd36b">${stars} <span style="color:#fff;font-size:15px">${shot.score}/100</span></div>
      <div style="font-size:12px;opacity:.85">${title}</div><div style="font-size:12px;opacity:.7;margin-top:3px">composition ${Math.round(shot.comp * 100)} · lumière ${Math.round(shot.light * 100)} · rareté ${Math.round(shot.rarity * 100)}</div>
      <div style="font-size:12px;margin-top:3px;opacity:.9">${shot.notes.slice(0, 4).join(' · ')}</div>`;
    card.style.display = 'block'; st.cardT = 7;
  };

  const renderAlbum = () => {
    const items = saved.album.slice().reverse().map(a => `<div style="width:240px"><img src="${a.jpg}" style="width:100%;border-radius:6px"><div style="color:#ffd36b;letter-spacing:.1em">${'★'.repeat(a.stars)}${'☆'.repeat(5 - a.stars)} <span style="color:#fff">${a.score}</span></div><div style="font-size:12px;opacity:.85">${a.title}</div><div style="font-size:11px;opacity:.6">jour ${a.day + 1}, ${String(Math.floor(a.hour)).padStart(2, '0')}h${String(Math.floor((a.hour % 1) * 60)).padStart(2, '0')}${a.mission ? ' — mission accomplie' : ''}</div></div>`).join('');
    album.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline"><div style="font-size:20px;font-weight:600">📷 Album — ${rank(saved.points)} (${saved.points} points)</div><div style="opacity:.7">L ou Échap : fermer</div></div><div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:12px">${items || '<div style="opacity:.7">Aucune photo pour l\'instant. Activez le mode photo (G) puis déclenchez avec X.</div>'}</div>`;
  };

  const project = (cam: THREE.PerspectiveCamera): Seen[] => {
    cam.updateMatrixWorld(); const cp = cam.position, out: Seen[] = [], v = new THREE.Vector3(), tanH = Math.tan((cam.fov * Math.PI) / 360);
    for (const t of o.gather(cam)) {
      v.set(t.x, t.y, t.z); const dx = t.x - cp.x, dy = t.y - cp.y, dz = t.z - cp.z, dist = Math.hypot(dx, dy, dz); if (dist < 2) continue;
      v.project(cam); if (v.z > 1 || v.z < -1) continue;
      let occluded = false;
      if (isSky(t.kind)) occluded = dy / dist < -0.015;
      else if (dist > 25) for (let i = 1; i < 14; i++) { const f = i / 14, x = cp.x + dx * f, z = cp.z + dz * f; if (o.ground(x, z) > cp.y + dy * f + 2.5) { occluded = true; break; } }
      out.push({ t, nx: v.x, ny: v.y, size: (2 * t.r) / dist / (2 * tanH), dist, occluded });
    }
    return out;
  };

  const api = {
    state: st, saved,
    get on() { return st.on; },
    toggle(on = !st.on) { st.on = on; finder.style.display = on ? 'block' : 'none'; if (!on) { api.restore(); st.zoom = 1; card.style.display = 'none'; } else renderMissions(); },
    restore() { if (zoomed) { const b = baseFov.get(zoomed); if (b) { zoomed.fov = b; zoomed.updateProjectionMatrix(); } zoomed = null; } },
    zoomBy(d: number) { if (!st.on) return; st.zoom = Math.max(1, Math.min(8, st.zoom * (d < 0 ? 1.18 : 1 / 1.18))); },
    toggleAlbum(on = album.style.display === 'none') { if (on) renderAlbum(); album.style.display = on ? 'block' : 'none'; },
    /** Demande une photo : elle est prise juste après le prochain rendu. */
    shutter() { if (st.on && !st.pending) st.pending = true; },
    /** Chaque image, avant le rendu : zoom du viseur et textes. */
    update(dt: number) {
      if (st.cardT > 0) { st.cardT -= dt; if (st.cardT <= 0) card.style.display = 'none'; }
      if (!st.on) return;
      const cam = o.cam();
      if (zoomed !== cam) { api.restore(); if (o.canZoom()) { zoomed = cam; if (!baseFov.has(cam)) baseFov.set(cam, cam.fov); } }
      if (zoomed === cam) { const b = baseFov.get(cam)!; const f = 2 * Math.atan(Math.tan((b * Math.PI) / 360) / st.zoom) * (180 / Math.PI); if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); } }
      info.textContent = `zoom ×${st.zoom.toFixed(1)} — ${st.shots} photo${st.shots > 1 ? 's' : ''}`;
      if (st.day !== Math.floor(o.day())) renderMissions();
    },
    /** À appeler juste après le rendu : capture le cliché en attente. */
    afterRender() {
      if (!st.pending) return; st.pending = false;
      const cam = o.cam(), ctx = o.ctx(), shot = scorePhoto(project(cam), ctx), src = o.canvas;
      const w = 360, h = Math.round((w * src.height) / src.width), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d')!.drawImage(src, 0, 0, w, h); const jpg = cv.toDataURL('image/jpeg', 0.62);
      flash.style.transition = 'none'; flash.style.opacity = '0.85'; requestAnimationFrame(() => { flash.style.transition = 'opacity .35s'; flash.style.opacity = '0'; });
      st.shots++; st.last = shot;
      const title = shot.main ? `${shot.main.t.name}` : 'Cadre vide';
      let missionTitle: string | undefined;
      refreshMissions();
      for (const m of st.missions) if (!saved.done.includes(m.id) && fulfils(m, shot, ctx)) { saved.done.push(m.id); saved.points += m.points; missionTitle = m.title; }
      if (shot.score > 0) saved.points += Math.round(shot.score / 4);
      if (shot.score >= 25) saved.album.push({ jpg, score: shot.score, stars: shot.stars, title, day: Math.floor(o.day()), hour: ctx.hour, notes: shot.notes, mission: missionTitle });
      showCard(shot, jpg, missionTitle ? `✔ Mission accomplie : ${missionTitle}` : title);
      persist(); renderMissions();
    },
  };
  addEventListener('wheel', e => { if (st.on && !e.ctrlKey) { api.zoomBy(e.deltaY); } }, { passive: true });
  return api;
}
