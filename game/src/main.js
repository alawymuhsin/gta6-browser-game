// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is there.
// The game moves between three screens: title, play and paused. Wasted and busted are not
// screens: the world respawns the player and the banner says what it cost.
//
// ?seed=N fixes the city's seed. ?shot=cover|street|drive|mission (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RADIO, createInput } from './input.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
// A read-only handle for play-testing: ?debug exposes the world so a test can watch the
// player steal a car and drive it, the way a human would. It changes nothing in the game.
if (params.has('debug')) window.__game = world;
const renderer = createRenderer(canvas);
const audio = createAudio();
let newGameKey = false;

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyN') newGameKey = true;
  audio.ensure();
});
canvas.addEventListener('pointerdown', () => audio.ensure());

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem('solara-bay.best.v1') ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function applySave(save) {
  const player = world.state.player;
  const missions = world.state.missions;
  player.money = save.money;
  player.health = save.health;
  player.ammo = save.ammo;
  player.hasPistol = save.hasPistol;
  player.hasShotgun = save.hasShotgun ?? false;
  player.weapon = save.weapon ?? 'pistol';
  world.state.safehouseOwned = save.safehouseOwned ?? false;
  world.state.stats = { ...world.state.stats, ...save.stats };
  missions.index = save.missionIndex;
  missions.storyDone = save.storyDone;
  missions.active = !save.storyDone;
  world.placePlayer(save.x, save.y);
  // startGame calls beginStory next, which starts the first step of this mission.
}

function startGame(continueSave) {
  world.reset();
  const save = continueSave ? world.load() : null;
  if (save) applySave(save);
  world.beginStory();
  return SCREEN_PLAY;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { best: scene.best, saveExists: false, muted: audio.isMuted() });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else {
      // Staged-shot readout for the screenshot tooling: where the player and the
      // cops ended up, so a shot can be checked without squinting at pixels.
      const player = world.state.player;
      window.__shotDebug = {
        shot: name,
        player: { x: Math.round(player.x), y: Math.round(player.y), speed: Math.round(player.car ? player.car.speed : 0), wanted: player.wanted },
        cops: world.state.cops.map((cop) => ({
          x: Math.round(cop.x),
          y: Math.round(cop.y),
          speed: Math.round(cop.speed),
          distance: Math.round(Math.hypot(cop.x - player.x, cop.y - player.y)),
        })),
        heli: world.state.heli ? { x: Math.round(world.state.heli.x), y: Math.round(world.state.heli.y) } : null,
        race: world.state.race.active ? { checkpoint: world.state.race.index + 1, of: world.state.race.checkpoints.length, timer: Math.round(world.state.race.timer) } : null,
        roadblocks: world.state.roadblocks.length,
      };
      window.__shotReady = true;
    }
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let attractTime = 0;
  let saveExists = !!world.load();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function playEventSounds(events) {
    for (const event of events) {
      if (event.kind === 'shot') audio.gunshot();
      else if (event.kind === 'shotgun') audio.shotgun();
      else if (event.kind === 'punch') audio.punch();
      else if (event.kind === 'pickup-health' || event.kind === 'pickup-ammo') audio.pickup();
      else if (event.kind === 'pickup-cash' || event.kind === 'fare' || event.kind === 'delivery-done' || event.kind === 'collectible') audio.cash();
      else if (event.kind === 'crash' || event.kind === 'ram' || event.kind === 'car-wrecked' || event.kind === 'cop-down') audio.crash();
      else if (event.kind === 'steal' || event.kind === 'horn' || event.kind === 'roadblock') audio.horn();
      else if (event.kind === 'mission-done' || event.kind === 'story-done' || event.kind === 'race-won') audio.jingle();
      else if (event.kind === 'step-done' || event.kind === 'race-checkpoint' || event.kind === 'delivery-picked') audio.pickup();
      else if (event.kind === 'busted' || event.kind === 'race-lost') audio.bust();
      else if (event.kind === 'wasted') audio.wasted();
      else if (event.kind === 'enemy-down') audio.punch();
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_RADIO) {
      const station = audio.nextStation();
      announce(station === 'Radio off' ? 'Radio off.' : `Radio: ${station}.`);
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        screen = startGame(saveExists && !newGameKey);
        saveExists = !!world.load();
        announce('Playing. Follow the gold marker.');
      } else if (newGameKey && saveExists) {
        screen = startGame(false);
        announce('New game. Follow the gold marker.');
      }
      newGameKey = false;
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        world.save();
        announce('Paused. Progress saved.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (input.isKeyDown('KeyS')) {
        // S is "drive backwards" in play, and "save and quit" here on the pause screen.
        world.save();
        screen = SCREEN_TITLE;
        saveExists = !!world.load();
        announce('Saved. Solara Bay. Press Space or click to start.');
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title lives: traffic drives, pedestrians walk, the camera drifts over Downtown.
      attractTime += STEP;
      const idle = {
        moveX: 0, moveY: 0, run: false, steer: 0, throttle: 0, brake: 0,
        interact: false, interactHeld: false, punch: false, shoot: false,
        horn: false, weapon: false,
        aimX: world.state.player.x, aimY: world.state.player.y,
      };
      world.step(STEP, idle);
      world.state.camera.x = 2048 + Math.sin(attractTime * 0.05) * 500;
      world.state.camera.y = 2048 + Math.cos(attractTime * 0.04) * 350;
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const snapshot = input.snapshot(
      (sx, sy) => renderer.screenToWorld(sx, sy, world.state.camera),
      !!world.state.player.car,
    );
    const events = world.step(STEP, snapshot);
    playEventSounds(events);
    for (const event of events) {
      if (event.kind === 'busted') announce('Busted. The cops took their cut.');
      else if (event.kind === 'wasted') announce('Wasted. You woke up at the hospital.');
      else if (event.kind === 'mission-done') announce(`${event.title} done.`);
      else if (event.kind === 'story-done') announce('The Harbor Heist is done. Solara Bay is yours.');
      else if (event.kind === 'race-won') announce(`Race won — $${event.amount}.`);
      else if (event.kind === 'roadblock') announce('Roadblock ahead.');
    }
    // The engine, the siren and the rotor follow the game; the music keeps its own time.
    const player = world.state.player;
    audio.engine(player.car ? Math.min(1, player.car.speed / 420) : 0);
    audio.siren(player.wanted > 0 && world.state.cops.length > 0);
    audio.rotor(!!world.state.heli);
    audio.setRadioInCar(!!player.car);
    audio.music(STEP);
    if (world.state.stats.earned > best) best = world.state.stats.earned;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step();
      accumulator -= STEP;
    }
    renderer.draw(world.state, screen, { best, saveExists, muted: audio.isMuted(), radio: audio.radioName(!!world.state.player.car) });
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solara Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
