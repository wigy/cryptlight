// Plays recorded samples from assets/audio when they are present and otherwise synthesizes each sound,
// so the game has sound without them. The samples aren't in the repository: see "Sound" in the README.
const SOUNDS = {
  step: { noise: 0.05, gain: 0.05, freq: 300 }, turn: { noise: 0.03, gain: 0.015, freq: 500 }, bump: { tone: 70, dur: 0.1, gain: 0.25 },
  hit: { noise: 0.13, gain: 0.3, freq: 900 }, miss: { noise: 0.09, gain: 0.08, freq: 3000 }, kill: { tone: 90, to: 40, dur: 0.3, gain: 0.3 },
  down: { tone: 180, to: 50, dur: 0.6, gain: 0.3 }, door: { noise: 0.5, gain: 0.14, freq: 180 }, click: { tone: 900, dur: 0.04, gain: 0.15 },
  spell: { tone: 500, to: 1300, dur: 0.3, gain: 0.1, type: 'sine' }, heal: { tone: 520, to: 880, dur: 0.4, gain: 0.1, type: 'sine' },
  rage: { tone: 110, to: 70, dur: 0.4, gain: 0.25 }, level: { tone: 440, to: 1320, dur: 0.7, gain: 0.14, type: 'triangle' },
  pickup: { tone: 700, dur: 0.05, gain: 0.08 }, drop: { tone: 240, dur: 0.07, gain: 0.1 }, equip: { tone: 420, dur: 0.05, gain: 0.08 },
  fall: { tone: 500, to: 60, dur: 0.6, gain: 0.2 }, stairs: { noise: 0.25, gain: 0.08, freq: 400 }, throw: { noise: 0.1, gain: 0.06, freq: 2000 },
};

// How a sample sits in the dungeon: reverb sent to the shared room, and random variation in pitch (as a playback rate
// spread) and volume (dB) so that repeats aren't identical. Sounds in the party's hands stay close and dry.
const ROOM = { wet: 0.22, pitch: 0.03, volume: 1.5 };
const PLACING = {
  step: { wet: 0.3, pitch: 0.06, volume: 2.5 }, turn: { wet: 0.08, pitch: 0.05 }, click: { wet: 0, pitch: 0, volume: 0 },
  pickup: { wet: 0.05, pitch: 0.05 }, drop: { wet: 0.15, pitch: 0.05 }, equip: { wet: 0.05, pitch: 0.05 },
  door: { wet: 0.35, pitch: 0.02 }, fall: { wet: 0.35, pitch: 0.02 }, stairs: { wet: 0.3, pitch: 0.02 },
  heal: { wet: 0.3, pitch: 0, volume: 0 }, level: { wet: 0.2, pitch: 0, volume: 0 },
};
const REVERB_SECONDS = 1.5;

export class Audio8 {
  constructor() { this.enabled = true; this.ctx = null; this.files = {}; this.samples = {}; this.lastTake = {}; }

  /** Fetches the samples listed in `base`/index.json. Without them, or for any that fail, the sound stays synthesized. */
  async load(base) {
    try {
      const res = await fetch(`${base}/index.json`);
      if (!res.ok) return;
      const index = await res.json();
      await Promise.all(Object.entries(index).map(async ([name, takes]) => {
        const bodies = await Promise.all(takes.map(async (t) => {
          const r = await fetch(`${base}/${t}`);
          if (!r.ok) throw new Error(`${r.status} ${t}`);
          return r.arrayBuffer();
        }));
        this.files[name] = bodies;
        if (this.ctx) this.decode(name);
      }));
    } catch (e) {
      console.info('Using synthesized sounds:', e.message);
    }
  }

  /** Browsers only allow audio after a user gesture. */
  unlock() {
    if (!this.ctx && window.AudioContext) {
      this.ctx = new AudioContext();
      this.buildMix();
      for (const name of Object.keys(this.files)) this.decode(name);
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  /** A single room and a limiter that everything passes through, so sounds from different recordings belong together. */
  buildMix() {
    const c = this.ctx;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    limiter.connect(c.destination);
    this.dry = limiter;
    this.room = c.createConvolver();
    this.room.buffer = this.roomResponse();
    this.room.connect(limiter);
  }

  /** Decaying noise, darker as it fades, for a stone room's echo. */
  roomResponse() {
    const c = this.ctx;
    const buf = c.createBuffer(2, Math.ceil(c.sampleRate * REVERB_SECONDS), c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let low = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        low += (Math.random() * 2 - 1 - low) * (0.5 - 0.42 * t);
        d[i] = low * (1 - t) ** 4;
      }
    }
    return buf;
  }

  async decode(name) {
    const bodies = this.files[name];
    delete this.files[name]; // decodeAudioData consumes the bytes.
    try {
      const takes = await Promise.all(bodies.map((b) => this.ctx.decodeAudioData(b)));
      this.samples[name] = takes;
    } catch (e) {
      console.info(`Using a synthesized ${name} sound:`, e.message);
    }
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    if (this.samples[name]) this.playSample(name);
    else if (SOUNDS[name]) this.synth(SOUNDS[name]);
  }

  playSample(name) {
    const c = this.ctx, takes = this.samples[name];
    const place = { ...ROOM, ...PLACING[name] };
    // Never the same take twice in a row.
    let take = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && take === this.lastTake[name]) take = (take + 1) % takes.length;
    this.lastTake[name] = take;
    const src = c.createBufferSource();
    src.buffer = takes[take];
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * place.pitch;
    const gain = c.createGain();
    gain.gain.value = 10 ** (((Math.random() * 2 - 1) * place.volume) / 20);
    src.connect(gain);
    gain.connect(this.dry);
    if (place.wet) {
      const send = c.createGain();
      send.gain.value = place.wet;
      gain.connect(send);
      send.connect(this.room);
    }
    src.start();
  }

  synth(s) {
    const c = this.ctx, t = c.currentTime;
    const gain = c.createGain();
    gain.connect(this.dry);
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
