// Entrées du drone FPV : manette (API Gamepad : Logitech F310 en mode XInput, manette Xbox, radio USB…) ou clavier de secours.
import type { FpvInput } from './sim/fpv';

export interface PadConfig {
  /** indices des axes de la manette */
  roll: number; pitch: number; yaw: number; thr: number;
  invRoll: boolean; invPitch: boolean; invYaw: boolean; invThr: boolean;
  /** zone morte (0..0.3) */
  dead: number;
}
/** Mode 2 (le plus courant) : manche gauche = gaz (haut/bas) et lacet, manche droit = tangage et roulis. Sur les manettes, « haut » donne −1 : on inverse donc tangage et gaz. */
export const DEFAULT_PAD: PadConfig = { roll: 2, pitch: 3, yaw: 0, thr: 1, invRoll: false, invPitch: true, invYaw: false, invThr: true, dead: 0.06 };
export type PadEvent = 'armer' | 'reset' | 'preset' | 'mode' | 'inclinaison+' | 'inclinaison-' | 'vue';

const KEY = 'rw.fpv.pad';
export function loadConfig(): PadConfig {
  try { const s = localStorage.getItem(KEY); if (s) return { ...DEFAULT_PAD, ...JSON.parse(s) }; } catch { /* stockage indisponible */ }
  return { ...DEFAULT_PAD };
}
export function saveConfig(c: PadConfig) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignoré */ } }

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

export class FpvControls {
  cfg = loadConfig();
  readonly raw = { roll: 0, pitch: 0, yaw: 0, thr: 0 };
  padName = '';
  private keys = new Set<string>();
  private kb = { roll: 0, pitch: 0, yaw: 0, thr: 0 };
  private prev: boolean[] = [];
  /** événements depuis la dernière lecture (boutons, touches) */
  private ev: PadEvent[] = [];

  keydown(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase(), used = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' ', 'r', 'x', 'c', 'q', 'e'].includes(k);
    if (!used) return false;
    if (!e.repeat) { if (k === ' ') this.ev.push('armer'); else if (k === 'r') this.ev.push('reset'); else if (k === 'x') this.ev.push('mode'); else if (k === 'c') this.ev.push('vue'); else if (k === 'q') this.ev.push('inclinaison-'); else if (k === 'e') this.ev.push('inclinaison+'); }
    this.keys.add(k); e.preventDefault(); return true;
  }
  keyup(e: KeyboardEvent) { this.keys.delete(e.key.toLowerCase()); }

  private pad(): Gamepad | null {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected && p.axes.length >= 4) return p;
    return null;
  }

  /** Lit les manches (−1..1) et renvoie les événements de boutons. */
  poll(dt: number): { input: FpvInput; events: PadEvent[]; usingPad: boolean } {
    const p = this.pad(), c = this.cfg;
    let roll = 0, pitch = 0, yaw = 0, thr = 0;
    if (p) {
      this.padName = p.id;
      const ax = (i: number) => p.axes[Math.max(0, Math.min(p.axes.length - 1, i))] ?? 0;
      const dz = (v: number) => { const a = Math.abs(v); return a < c.dead ? 0 : Math.sign(v) * (a - c.dead) / (1 - c.dead); };
      roll = dz(ax(c.roll)) * (c.invRoll ? -1 : 1); pitch = dz(ax(c.pitch)) * (c.invPitch ? -1 : 1); yaw = dz(ax(c.yaw)) * (c.invYaw ? -1 : 1); thr = dz(ax(c.thr)) * (c.invThr ? -1 : 1);
      const B = (i: number) => !!p.buttons[i]?.pressed;
      const map: [number, PadEvent][] = [[0, 'armer'], [1, 'reset'], [2, 'preset'], [3, 'mode'], [12, 'inclinaison+'], [13, 'inclinaison-'], [9, 'vue']];
      for (const [i, name] of map) { const now = B(i); if (now && !this.prev[i]) this.ev.push(name); this.prev[i] = now; }
    } else {
      this.padName = '';
      // clavier : les valeurs montent et redescendent progressivement, comme un manche à ressort
      const tgt = (a: string, b: string) => (this.keys.has(a) ? 1 : 0) - (this.keys.has(b) ? 1 : 0), k = this.kb;
      const ramp = (cur: number, t: number) => (t === 0 ? cur * Math.max(0, 1 - 9 * dt) : clamp(cur + Math.sign(t - cur) * Math.min(Math.abs(t - cur), 5 * dt)));
      k.pitch = ramp(k.pitch, tgt('arrowup', 'arrowdown')); k.roll = ramp(k.roll, tgt('arrowright', 'arrowleft'));
      k.yaw = ramp(k.yaw, tgt('d', 'a')); k.thr = ramp(k.thr, tgt('w', 's'));
      roll = k.roll; pitch = k.pitch; yaw = k.yaw; thr = k.thr;
    }
    Object.assign(this.raw, { roll, pitch, yaw, thr });
    const events = this.ev; this.ev = [];
    return { input: { roll, pitch, yaw, thr }, events, usingPad: !!p };
  }
}
