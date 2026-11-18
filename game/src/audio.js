// Sound, all of it synthesised in WebAudio: no audio files, no network, nothing to load.
// The engine and the siren are loops whose pitch follows the game; everything else is a
// one-shot. Nothing plays until the player first presses a key or clicks, which is when the
// browser allows an AudioContext to start.

const MUSIC = {
  bpm: 96,
  chords: [
    [110.0, 130.81, 164.81], // Am
    [87.31, 110.0, 130.81], // F
    [130.81, 164.81, 196.0], // C
    [98.0, 123.47, 146.83], // G
  ],
  bass: [55.0, 43.65, 65.41, 49.0],
};

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let musicGain = null;
  let musicTimer = 0;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return true;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      context = new Ctx();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      // Engine: a sawtooth through a low-pass, its pitch following the car's speed.
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle wave wobbling between two tones.
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenLfo = context.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.9;
      const lfoGain = context.createGain();
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      musicGain = context.createGain();
      musicGain.gain.value = 0.05;
      musicGain.connect(master);
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function tone(type, freq, freqEnd, dur, gain, delay = 0) {
    if (!context) return;
    try {
      const t0 = context.currentTime + delay;
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
      const g = context.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* a failed blip is never worth crashing the game over */ }
  }

  function noise(dur, gain, filterFreq, delay = 0) {
    if (!context) return;
    try {
      const t0 = context.currentTime + delay;
      const length = Math.max(1, Math.floor(context.sampleRate * dur));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const g = context.createGain();
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      source.connect(filter);
      filter.connect(g);
      g.connect(master);
      source.start(t0);
    } catch { /* same as above */ }
  }

  function musicNote(freq, dur, gain, type = 'triangle') {
    if (!context) return;
    try {
      const t0 = context.currentTime;
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const g = context.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(musicGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch { /* same as above */ }
  }

  return {
    /** Call from any user gesture: creates the context the browser will allow. */
    ensure,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    click() {
      ensure();
      tone('square', 660, 520, 0.07, 0.12);
    },
    pickup() {
      tone('sine', 880, null, 0.09, 0.16);
      tone('sine', 1318, null, 0.12, 0.16, 0.08);
    },
    cash() {
      tone('sine', 988, null, 0.1, 0.18);
      tone('sine', 1318, null, 0.1, 0.18, 0.09);
      tone('sine', 1760, null, 0.16, 0.18, 0.18);
    },
    punch() {
      tone('sine', 160, 60, 0.12, 0.3);
      noise(0.08, 0.2, 900);
    },
    gunshot() {
      noise(0.14, 0.4, 2600);
      tone('square', 220, 70, 0.1, 0.2);
    },
    crash() {
      noise(0.3, 0.35, 700);
      tone('sine', 90, 40, 0.25, 0.3);
    },
    horn() {
      tone('square', 370, null, 0.22, 0.12);
      tone('square', 466, null, 0.22, 0.12);
    },
    jingle() {
      [523, 659, 784, 1047].forEach((freq, i) => tone('sine', freq, null, 0.16, 0.2, i * 0.11));
    },
    bust() {
      [392, 330, 262, 196].forEach((freq, i) => tone('triangle', freq, null, 0.22, 0.2, i * 0.16));
    },
    wasted() {
      [330, 262, 196, 131].forEach((freq, i) => tone('sawtooth', freq, null, 0.3, 0.14, i * 0.2));
    },
    /** The engine's voice: 0 is idling, 1 is flat out. Call every frame while driving. */
    engine(level) {
      if (!context) return;
      try {
        engineOsc.frequency.setTargetAtTime(55 + level * 165, context.currentTime, 0.06);
        engineGain.gain.setTargetAtTime(level > 0.02 ? 0.05 + level * 0.05 : 0, context.currentTime, 0.08);
      } catch { /* same as above */ }
    },
    /** The siren's voice: true while any cop is chasing, false when the heat is off. */
    siren(on) {
      if (!context) return;
      try {
        sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, context.currentTime, 0.3);
      } catch { /* same as above */ }
    },
    /** A slow bass line under a pad: one step per call, called from the game loop. */
    music(dt) {
      if (!context) return;
      musicTimer -= dt;
      if (musicTimer > 0) return;
      const beat = 60 / MUSIC.bpm / 2;
      musicTimer += beat;
      const bar = Math.floor(musicStep / 8) % 4;
      const stepInBar = musicStep % 8;
      if (stepInBar === 0 || stepInBar === 4) musicNote(MUSIC.bass[bar], beat * 1.8, 0.5, 'sine');
      if (stepInBar === 0) {
        for (const freq of MUSIC.chords[bar]) musicNote(freq, beat * 7.5, 0.1, 'triangle');
      }
      if (stepInBar === 2 || stepInBar === 6) musicNote(MUSIC.chords[bar][1] * 2, beat, 0.08, 'sine');
      musicStep += 1;
    },
  };
}
