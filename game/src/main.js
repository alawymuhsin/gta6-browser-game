// The loop: title screen, play, pause, and the staged screenshots. The world runs
// on a fixed 60 Hz step whatever the display's rate; the renderer paints the state
// each frame. Sound is all synthesised, and every one-shot key press is taken once
// from the input, so a held key never double-fires.

import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createWorld } from './world.js';
import { objectiveText } from './missions.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RADIO, createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const canvas = document.getElementById('game');
const statusLine = document.getElementById('status');
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

const seed = Number(params.get('seed')) || 11;
const world = createWorld(seed);
let screen = SCREEN_TITLE;
let best = 0;
let saveExists = false;
try {
  best = Number(window.localStorage.getItem(BEST_KEY)) || 0;
  saveExists = !!window.localStorage.getItem(SAVE_KEY);
} catch {
  // Private mode: play without saving.
}
if (params.has('debug')) window.__game = world;

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    world.load(raw);
    return true;
  } catch {
    return false;
  }
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, world.save());
    saveExists = true;
  } catch {
    // Ignore: the game keeps running without a save.
  }
  const earned = world.state.stats.earned;
  if (earned > best) {
    best = earned;
    try {
      window.localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // Ignore.
    }
  }
}

function playEventSounds(events) {
  for (const ev of events) {
    switch (ev.kind) {
      case 'shot':
        if (ev.weapon === 'shotgun') audio.shotgun();
        else audio.gunshot();
        break;
      case 'punch':
        audio.punch();
        break;
      case 'crash':
      case 'ram':
        audio.crash();
        break;
      case 'horn':
        audio.horn();
        break;
      case 'pickup':
        audio.pickup();
        break;
      case 'mission-done':
      case 'race-won':
        audio.jingle();
        audio.cash();
        break;
      case 'delivery-done':
      case 'fare-done':
      case 'collectible':
        audio.cash();
        break;
      case 'busted':
        audio.bust();
        break;
      case 'wasted':
        audio.wasted();
        break;
      default:
        break;
    }
  }
}

/** The one-shot keys, taken once: confirm, pause, mute, radio. */
function takeActions() {
  const flags = input.takeActions();
  return {
    confirm: (flags & ACTION_CONFIRM) !== 0,
    pause: (flags & ACTION_PAUSE) !== 0,
    mute: (flags & ACTION_MUTE) !== 0,
    radio: (flags & ACTION_RADIO) !== 0,
  };
}

function tick(dt) {
  const state = world.state;
  const snap = input.snapshot(
    (sx, sy) => renderer.screenToWorld(sx, sy, state.camera),
    !!state.player.car,
  );
  const acts = takeActions();
  if (acts.mute) audio.setMuted(!audio.isMuted());

  if (screen === SCREEN_TITLE) {
    // The city lives behind the panel: traffic, peds and the clock keep moving.
    world.step(dt, {
      moveX: 0, moveY: 0, run: false, steer: 0, throttle: 0, brake: 0,
      interact: false, interactHeld: false, punch: false, shoot: false,
      horn: false, weapon: false, aimX: state.player.x, aimY: state.player.y,
    });
    if (acts.confirm) {
      audio.ensure();
      audio.click();
      if (saveExists) loadSave();
      else world.beginStory();
      screen = SCREEN_PLAY;
    } else if (input.isKeyDown('KeyN')) {
      audio.ensure();
      audio.click();
      world.reset();
      world.beginStory();
      screen = SCREEN_PLAY;
    }
    return;
  }

  if (screen === SCREEN_PAUSED) {
    if (acts.pause) screen = SCREEN_PLAY;
    else if (input.isKeyDown('KeyS')) {
      saveGame();
      screen = SCREEN_TITLE;
    }
    return;
  }

  // Playing.
  if (acts.radio) {
    const name = audio.nextStation();
    state.toasts.push({ text: name === 'Radio off' ? 'Radio off' : `♪ ${name}`, time: 2 });
  }
  const events = world.step(dt, snap);
  for (const ev of events) {
    if (ev.kind === 'save') saveGame();
  }
  playEventSounds(events);
  audio.engine(state.player.car ? Math.min(1, state.player.car.speed / 420) : 0);
  audio.siren(state.cops.length > 0);
  audio.rotor(!!state.heli);
  audio.setRadioInCar(!!state.player.car);
  audio.music(dt);
  if (acts.pause) {
    saveGame();
    screen = SCREEN_PAUSED;
  }
  const objective = objectiveText(state.missions, state.race);
  if (statusLine && statusLine.textContent !== objective) statusLine.textContent = objective;
}

const shotName = params.get('shot');
if (shotName) {
  // A staged screenshot: set the scene, draw it twice, and say so.
  const staged = stageShot(shotName, world);
  const extras = { radio: null, saveExists: false, best: staged.best };
  renderer.draw(world.state, staged.screen, extras);
  renderer.draw(world.state, staged.screen, extras);
  window.__shotReady = true;
  window.__shotDebug = { screen: staged.screen, best: staged.best };
} else {
  let last = performance.now();
  let acc = 0;
  const frame = (now) => {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 8) {
      acc -= STEP;
      guard += 1;
      tick(STEP);
    }
    if (acc > STEP) acc = 0;
    renderer.draw(world.state, screen, {
      radio: audio.radioName(!!world.state.player.car),
      saveExists,
      best,
    });
  };
  requestAnimationFrame(frame);
}
