// Sound, all of it synthesised in WebAudio: no audio files, no network, nothing to load.
// The engine and the siren are loops whose pitch follows the game; everything else is a
// one-shot. Nothing plays until the player first presses a key or clicks, which is when the
// browser allows an AudioContext to start. The car radio is three stations of the same
// synth: Solara FM rides the same chords as the score, Bay Beats drops the bass an octave,
// Coast Talk is mostly a host and a jingle.

import { RADIO } from './config.js';

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

const STATION_BASS = [
  [55.0, 43.65, 65.41, 49.0], // Solara FM: the score's own bass
  [36.71, 36.71, 43.65, 41.2], // Bay Beats: deep and slow
  [55.0, 55.0, 55.0, 55.0], // Coast Talk: one note, barely there
];

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
  let rotorOsc = null;
  let rotorGain = null;
  let radioOn = false;
  let radioStation = 0;
  let radioTimer = 0;
  let radioStep = 0;
  let radioInCar = false;
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
      // Rotor: a low sawtooth chopped by an 11 Hz thump, for the police helicopter.
      rotorOsc = context.createOscillator();
      rotorOsc.type = 'sawtooth';
      rotorOsc.frequency.value = 52;
      const rotorLfo = context.createOscillator();
      rotorLfo.type = 'square';
      rotorLfo.frequency.value = 11;
      const rotorLfoGain = context.createGain();
      rotorLfoGain.gain.value = 26;
      rotorLfo.connect(rotorLfoGain);
      rotorLfoGain.connect(rotorOsc.frequency);
      rotorGain = context.createGain();
      rotorGain.gain.value = 0;
      rotorOsc.connect(rotorGain);
      rotorGain.connect(master);
      rotorOsc.start();
      rotorLfo.start();
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
    shotgun() {
      noise(0.22, 0.5, 1800);
      tone('square', 140, 50, 0.16, 0.3);
      tone('sine', 70, 35, 0.2, 0.3, 0.02);
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
    /** The rotor's voice: true while the helicopter is overhead, false otherwise. */
    rotor(on) {
      if (!context) return;
      try {
        rotorGain.gain.setTargetAtTime(on ? 0.05 : 0, context.currentTime, 0.4);
      } catch { /* same as above */ }
    },
    /**
     * Turn the car radio on and move to the next station; one more press after the last
     * station turns it off. Returns what to show: the station's name, or 'Radio off'.
     */
    nextStation() {
      ensure();
      if (!radioOn) {
        radioOn = true;
        radioStation = 0;
      } else if (radioStation < RADIO.stations.length - 1) {
        radioStation += 1;
      } else {
        radioOn = false;
      }
      radioStep = 0;
      radioTimer = 0;
      return radioOn ? RADIO.stations[radioStation].name : 'Radio off';
    },
    /** Whether the radio is on and the player is in a car, for the HUD. */
    radioName(inCar) {
      return radioOn && inCar ? RADIO.stations[radioStation].name : null;
    },
    isRadioOn() {
      return radioOn;
    },
    /** The radio only plays while the player is in a car; the loop sets this every frame. */
    setRadioInCar(value) {
      radioInCar = value;
    },
    /** A slow bass line under a pad: one step per call, called from the game loop. When the radio is on, its station plays instead. */
    music(dt) {
      if (!context) return;
      if (radioOn && radioInCar) {
        const station = RADIO.stations[radioStation];
        radioTimer -= dt;
        if (radioTimer > 0) return;
        const beat = 60 / station.bpm / 2;
        radioTimer += beat;
        const bar = Math.floor(radioStep / 8) % 4;
        const stepInBar = radioStep % 8;
        if (radioStation === 2) {
          // Coast Talk: a host's murmur and a jingle, not a song.
          if (stepInBar === 0) musicNote(660, 0.12, 0.05, 'sine');
          if (stepInBar === 4) musicNote(523, 0.1, 0.04, 'sine');
          if (stepInBar === 7) musicNote(784, 0.1, 0.03, 'sine');
        } else {
          const bass = STATION_BASS[radioStation][bar];
          if (stepInBar === 0 || stepInBar === 4) musicNote(bass, beat * 1.8, 0.5, 'sine');
          if (stepInBar === 0) {
            for (const freq of MUSIC.chords[bar]) musicNote(freq, beat * 7.5, 0.08, station.wave);
          }
          if (stepInBar === 2 || stepInBar === 6) musicNote(MUSIC.chords[bar][1] * 2, beat, 0.08, 'sine');
        }
        radioStep += 1;
        return;
      }
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
