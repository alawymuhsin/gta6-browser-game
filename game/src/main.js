// The loop: title screen, play, pause, and the staged screenshots. The world runs on a
// fixed step (sixty a second) no matter the display's rate, so the game plays the same on
// every machine; the renderer draws whatever the world holds after the steps. Sound comes
// from the world's events — a shot, a payout, a bust — plus the continuous voices (engine,
// siren, rotor, music) the loop drives every frame. Progress saves itself every ten
// seconds of play and on the pause screen's S; the title screen offers the save back.

import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createWorld } from './world.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RADIO, createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();
const params = new URLSearchParams(location.search);
const world = createWorld(Number(params.get('seed')) || 11);

let screen = SCREEN_TITLE;
let best = loadBest();
let saveExists = hasSave();
let acc = 0;
let last = performance.now();
let saveTimer = 0;
let newGamePressed = false;
let sArmed = true;

// N is not one of the input module's keys, so the loop watches for it itself: a new
// game from the title screen.
window.addEventListener('keydown', (event) => {
  if (!event.repeat && event.code === 'KeyN') newGamePressed = true;
});

// ------------------------------------------------------------------ save and best

function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function storeBest(value) {
  if (value <= best) return;
  best = value;
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    /* private mode: the best take just lives for the session */
  }
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(world.serialize()));
    saveExists = true;
  } catch {
    /* private mode: nothing is kept */
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    world.deserialize(JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* private mode: nothing was kept */
  }
  saveExists = false;
}

// ------------------------------------------------------------------ sound

/** One world event, one sound. */
function playEvent(ev) {
  switch (ev.kind) {
    case 'shot':
      if (ev.weapon === 'shotgun') audio.shotgun();
      else audio.gunshot();
      break;
    case 'punch':
      audio.punch();
      break;
    case 'pickup':
    case 'collectible':
      audio.pickup();
      break;
    case 'mission-complete':
    case 'race-won':
      audio.cash();
      audio.jingle();
      break;
    case 'delivery-done':
    case 'fare-done':
      audio.cash();
      break;
    case 'race-checkpoint':
    case 'delivery-picked':
    case 'fare-picked':
      audio.click();
      break;
    case 'busted':
      audio.bust();
      break;
    case 'wasted':
      audio.wasted();
      break;
    case 'ram':
    case 'car-wrecked':
      audio.crash();
      break;
    case 'horn':
      audio.horn();
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------------ screens

/** Start from the title: continue the save, or a new game on N. */
function startGame(fresh) {
  audio.ensure();
  audio.click();
  if (fresh) {
    clearSave();
    world.reset();
  } else if (saveExists) {
    loadGame();
  }
  screen = SCREEN_PLAY;
  saveTimer = 0;
}

/** One pressed action, on the screen it belongs to. */
function handleAction(action) {
  if (action === ACTION_MUTE) {
    audio.setMuted(!audio.isMuted());
    return;
  }
  if (action === ACTION_RADIO) {
    audio.nextStation();
    return;
  }
  if (screen === SCREEN_TITLE) {
    if (action === ACTION_CONFIRM) startGame(false);
  } else if (screen === SCREEN_PLAY) {
    if (action === ACTION_PAUSE) {
      audio.click();
      screen = SCREEN_PAUSED;
      sArmed = false;
    }
  } else if (screen === SCREEN_PAUSED) {
    if (action === ACTION_PAUSE || action === ACTION_CONFIRM) {
      audio.click();
      screen = SCREEN_PLAY;
    }
  }
}

// ------------------------------------------------------------------ the frame

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const state = world.state;
  if (screen === SCREEN_PLAY) {
    acc += dt;
    const snap = input.snapshot((sx, sy) => renderer.screenToWorld(sx, sy, state.camera), !!state.player.car);
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      const events = world.step(STEP, snap);
      for (const ev of events) playEvent(ev);
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
    audio.setRadioInCar(!!state.player.car);
    audio.engine(state.player.car ? Math.min(1, state.player.car.speed / 420) : 0);
    audio.siren(state.cops.length > 0);
    audio.rotor(!!state.heli);
    storeBest(state.stats.earned);
    saveTimer += dt;
    if (saveTimer > 10) {
      saveTimer = 0;
      saveGame();
    }
  } else {
    audio.engine(0);
    audio.siren(false);
    audio.rotor(false);
  }
  audio.music(dt);
  const _takenActions = input.takeActions();
  for (const action of [ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_RADIO].filter((a) => _takenActions & a)) handleAction(action);
  if (screen === SCREEN_TITLE && newGamePressed) {
    newGamePressed = false;
    startGame(true);
  }
  if (screen === SCREEN_PAUSED) {
    if (!input.isKeyDown('KeyS')) sArmed = true;
    else if (sArmed) {
      sArmed = false;
      saveGame();
      audio.click();
      screen = SCREEN_TITLE;
    }
  }
  renderer.draw(state, screen, {
    radio: audio.radioName(!!state.player.car),
    saveExists,
    best,
  });
}

// ------------------------------------------------------------------ start

const shotName = params.get('shot');
if (shotName) {
  // A staged screenshot: set the scene, draw it once, and say so.
  const staged = stageShot(shotName, world);
  renderer.draw(world.state, staged.screen, { radio: null, saveExists: false, best: 0 });
  window.__shotReady = true;
  window.__shotDebug = { screen: staged.screen, best: staged.best };
} else {
  if (params.has('debug')) {
    window.__game = {
      get state() {
        return world.state;
      },
      world,
    };
  }
  requestAnimationFrame(frame);
}
