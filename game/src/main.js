// main.js — titik masuk Solara Bay: memasang canvas, input, audio, dan dunia,
// Round 5: the staged-shot mode marks window.__shotReady when the frame is ready for Playwright.
// lalu menjalankan loop permainan. Dua mode: mode biasa (title → play → pause,
// dengan save/load di localStorage) dan mode staged shot (?shot=cover|street|
// drive|mission) yang memainkan satu scene dari seed tetap, menggambarnya, dan
// menandai window.__shotReady supaya Playwright tahu frame-nya sudah siap.

import { createWorld } from './world.js';
import { createRenderer, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED } from './render.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_RADIO } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { STEP, SAVE_KEY, BEST_KEY } from './config.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number.parseInt(params.get('seed') || '11', 10) || 11;

const world = createWorld(seed);
// Diekspos untuk smoke test dan debugging di browser: window.__game.state.
window.__game = world;
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

/** Skor terbaik yang pernah dibawa pulang (localStorage), untuk layar judul. */
let best = 0;
try {
  best = Number.parseInt(window.localStorage.getItem(BEST_KEY) || '0', 10) || 0;
} catch {
  best = 0;
}

/** Apakah ada save yang bisa dilanjutkan. */
function hasSave() {
  try {
    return !!window.localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

/** Simpan progres sekarang, dan perbarui skor terbaik kalau take-nya lebih besar. */
function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, world.save());
    const earned = world.state.stats.earned;
    if (earned > best) {
      best = earned;
      window.localStorage.setItem(BEST_KEY, String(best));
    }
  } catch {
    // localStorage penuh atau diblokir: permainan tetap jalan tanpa save.
  }
}

/** Muat save yang ada ke dunia ini; false kalau tidak ada atau rusak. */
function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    return world.load(raw);
  } catch {
    return false;
  }
}

/** Hapus save supaya permainan baru dimulai dari garasi. */
function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Abaikan: permainan baru tetap jalan.
  }
}

/** Extra yang dipakai renderer untuk HUD dan layar judul. */
function extras() {
  return {
    radio: audio.radioName(!!world.state.player.car),
    best,
    saveExists: hasSave(),
  };
}

if (shotName) {
  // Mode staged shot: mainkan scene-nya, gambar satu frame, lalu beri tahu
  // Playwright bahwa frame sudah siap. Loop terus menggambar supaya kanvas
  // tetap menampilkan frame itu kalau screenshot diambil agak terlambat.
  const staged = stageShot(shotName, world);
  renderer.draw(world.state, staged.screen, { radio: null, best: staged.best, saveExists: false });
  window.__shotReady = true;
  if (statusEl) statusEl.textContent = `Solara Bay — staged shot: ${shotName}`;
  requestAnimationFrame(function keepDrawing() {
    renderer.draw(world.state, staged.screen, { radio: null, best: staged.best, saveExists: false });
    requestAnimationFrame(keepDrawing);
  });
} else {
  // Mode permainan biasa.
  let screen = SCREEN_TITLE;
  let lastMission = world.state.missions.index;
  let last = performance.now();
  let acc = 0;

  if (statusEl) statusEl.textContent = 'Solara Bay — Street Heat';

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    if (dt < 0) dt = 0;
    const actions = input.takeActions();

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.ensure();
        audio.click();
        if (hasSave() && !input.isKeyDown('KeyN')) {
          loadSave();
        } else {
          clearSave();
          world.reset();
        }
        lastMission = world.state.missions.index;
        screen = SCREEN_PLAY;
      } else if (input.isKeyDown('KeyN')) {
        audio.ensure();
        audio.click();
        clearSave();
        world.reset();
        lastMission = world.state.missions.index;
        screen = SCREEN_PLAY;
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        audio.click();
        saveGame();
        screen = SCREEN_PAUSED;
      } else {
        if (actions & ACTION_MUTE) {
          audio.setMuted(!audio.isMuted());
        }
        if (actions & ACTION_RADIO) {
          const name = audio.nextStation();
          if (name !== 'Radio off') audio.click();
        }
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 5) {
          const snap = input.snapshot(
            (sx, sy) => renderer.screenToWorld(sx, sy, world.state.camera),
            !!world.state.player.car,
          );
          if (snap.horn) audio.horn();
          world.step(STEP, snap);
          acc -= STEP;
          steps += 1;
        }
        if (steps === 5) acc = 0;
        const state = world.state;
        audio.setRadioInCar(!!state.player.car);
        audio.engine(state.player.car ? Math.min(1, state.player.car.speed / 400) : 0);
        audio.siren(state.cops.length > 0);
        audio.rotor(!!state.heli);
        audio.music(dt);
        if (state.missions.index !== lastMission) {
          lastMission = state.missions.index;
          saveGame();
          audio.jingle();
        }
        if (state.banner && state.banner.title === 'Busted') audio.bust();
        if (state.banner && state.banner.title === 'Wasted') audio.wasted();
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE) {
        audio.click();
        screen = SCREEN_PLAY;
      } else if (input.isKeyDown('KeyS')) {
        saveGame();
        audio.click();
        screen = SCREEN_TITLE;
      }
    }

    renderer.draw(world.state, screen, extras());
  }

  requestAnimationFrame(frame);
}
