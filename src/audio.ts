import type { World } from './sim/world';

/** Sons procéduraux (Web Audio) : roulement des trains proches de la caméra, klaxon au départ de gare. */
export class Sound {
  enabled = false;
  private ctx: AudioContext | null = null;
  private roll: GainNode | null = null;
  private filt: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private rain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private readonly prevDwell = new Map<string, number>();

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) { this.ensure(); void this.ctx?.resume(); } else void this.ctx?.suspend();
  }

  private ensure() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }   // bruit « brun »
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.filt = ctx.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 300;
    this.roll = ctx.createGain(); this.roll.gain.value = 0;
    this.master = ctx.createGain(); this.master.gain.value = 0.7;
    src.connect(this.filt).connect(this.roll).connect(this.master).connect(ctx.destination);
    src.start();
    // pluie : bruit blanc filtré
    const wb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), wd = wb.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    this.noiseBuf = wb;
    const rs = ctx.createBufferSource(); rs.buffer = wb; rs.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.5;
    this.rain = ctx.createGain(); this.rain.gain.value = 0;
    rs.connect(bp).connect(this.rain).connect(this.master); rs.start();
    this.ctx = ctx;
  }

  private horn(level: number) {
    const ctx = this.ctx!, now = ctx.currentTime, g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.18 * level, now + 0.08);
    g.gain.setValueAtTime(0.18 * level, now + 0.7);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 1.2);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    f.connect(g).connect(this.master!);
    for (const hz of [311, 392]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz;
      o.connect(f); o.start(now); o.stop(now + 1.3);
    }
  }

  private fpv: { g: GainNode; o: OscillatorNode[]; f: BiquadFilterNode } | null = null;
  /** Drone FPV : bourdonnement des moteurs, plus aigu et plus fort avec les gaz (`active` faux : silence). */
  setFpv(active: boolean, thrust: number, speed: number) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    if (!this.fpv) {
      const g = ctx.createGain(); g.gain.value = 0; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
      const o = [0, 1, 2].map(i => { const q = ctx.createOscillator(); q.type = i === 2 ? 'square' : 'sawtooth'; q.frequency.value = 160; q.detune.value = (i - 1) * 14; q.connect(f); q.start(); return q; });
      f.connect(g).connect(this.master!); this.fpv = { g, o, f };
    }
    const F = this.fpv, now = ctx.currentTime, base = 140 + 520 * Math.min(1, thrust * 1.6) + speed * 3;
    F.o.forEach((q, i) => q.frequency.setTargetAtTime(base * (i === 2 ? 2 : 1), now, 0.05));
    F.f.frequency.setTargetAtTime(900 + 3000 * Math.min(1, thrust * 1.5), now, 0.08);
    F.g.gain.setTargetAtTime(active ? 0.02 + 0.07 * Math.min(1, thrust * 1.5) : 0, now, 0.08);
  }

  /** Pluie (0..1) : volume du bruit de fond. */
  setRain(level: number) { if (this.enabled && this.ctx && this.rain) this.rain.gain.setTargetAtTime(level * 0.22, this.ctx.currentTime, 0.5); }

  /** Coup de tonnerre : grondement grave qui s'éteint en quelques secondes. */
  thunder(power = 1) {
    if (!this.enabled || !this.ctx || !this.noiseBuf || !this.master) return;
    const ctx = this.ctx, now = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(420, now); f.frequency.exponentialRampToValueAtTime(70, now + 3.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.55 * power, now + 0.15); g.gain.exponentialRampToValueAtTime(0.001, now + 4);
    src.connect(f).connect(g).connect(this.master); src.start(now); src.stop(now + 4.2);
  }

  /** `listener` = position de la caméra principale. */
  update(world: World, listener: { x: number; y: number; z: number }) {
    if (!this.enabled || !this.ctx || !this.roll || !this.filt) return;
    let vol = 0, speed = 0;
    for (const t of world.trains) {
      if (t.status === 'stored') { this.prevDwell.set(t.id, 0); continue; }
      const p = t.pointAt(0), dist = Math.hypot(p.x - listener.x, p.y - listener.y, p.z - listener.z);
      const k = Math.max(0, 1 - dist / 450) ** 2;
      vol += k * Math.min(1, t.v / 25); speed = Math.max(speed, t.v * k);
      const was = this.prevDwell.get(t.id) ?? 0;
      if (was > 0 && t.dwell === 0 && k > 0.02) this.horn(Math.min(1, k * 2));      // la rame repart du quai
      this.prevDwell.set(t.id, t.dwell);
    }
    this.roll.gain.setTargetAtTime(Math.min(0.5, vol * 0.25), this.ctx.currentTime, 0.2);
    this.filt.frequency.setTargetAtTime(160 + speed * 35, this.ctx.currentTime, 0.2);
  }
}
