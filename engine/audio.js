// Small synthesized sound effects, so the engine ships no audio files.
const SOUNDS = {
  step: { noise: 0.05, gain: 0.05, freq: 300 }, turn: { noise: 0.03, gain: 0.015, freq: 500 }, bump: { tone: 70, dur: 0.1, gain: 0.25 },
  hit: { noise: 0.13, gain: 0.3, freq: 900 }, miss: { noise: 0.09, gain: 0.08, freq: 3000 }, kill: { tone: 90, to: 40, dur: 0.3, gain: 0.3 },
  down: { tone: 180, to: 50, dur: 0.6, gain: 0.3 }, door: { noise: 0.5, gain: 0.14, freq: 180 }, click: { tone: 900, dur: 0.04, gain: 0.15 },
  spell: { tone: 500, to: 1300, dur: 0.3, gain: 0.1, type: 'sine' }, heal: { tone: 520, to: 880, dur: 0.4, gain: 0.1, type: 'sine' },
  rage: { tone: 110, to: 70, dur: 0.4, gain: 0.25 }, level: { tone: 440, to: 1320, dur: 0.7, gain: 0.14, type: 'triangle' },
  pickup: { tone: 700, dur: 0.05, gain: 0.08 }, drop: { tone: 240, dur: 0.07, gain: 0.1 }, equip: { tone: 420, dur: 0.05, gain: 0.08 },
  fall: { tone: 500, to: 60, dur: 0.6, gain: 0.2 }, stairs: { noise: 0.25, gain: 0.08, freq: 400 }, throw: { noise: 0.1, gain: 0.06, freq: 2000 },
};

export class Audio8 {
  constructor() { this.enabled = true; this.ctx = null; }
  /** Browsers only allow audio after a user gesture. */
  unlock() { if (!this.ctx && window.AudioContext) this.ctx = new AudioContext(); if (this.ctx?.state === 'suspended') this.ctx.resume(); }
  toggle() { this.enabled = !this.enabled; }
  play(name) {
    const s = SOUNDS[name];
    if (!s || !this.enabled || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const gain = c.createGain();
    gain.connect(c.destination);
    const dur = s.noise ?? s.dur;
    gain.gain.setValueAtTime(s.gain, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    if (s.noise) {
      const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = s.freq;
      src.connect(f); f.connect(gain);
      src.start(t);
    } else {
      const o = c.createOscillator();
      o.type = s.type ?? 'square';
      o.frequency.setValueAtTime(s.tone, t);
      if (s.to) o.frequency.exponentialRampToValueAtTime(s.to, t + dur);
      o.connect(gain);
      o.start(t); o.stop(t + dur);
    }
  }
}
