// The ten-job story: Jax Marlowe, a driver who just got back to Solara Bay, works for the
// fixer Maya Solis. One job at a time, each with its own steps, targets and payout; the
// marker on the map always points at the current step's target. After the tenth job the
// story is done and the city is free roam — taxi fares, deliveries and races keep paying.
//
// The mission state is plain data so the world can save it: index, step, the current
// target, and the small scratch fields each job needs (progress, timer, the foes it
// spawned). Setup is lazy: whenever the index:step pair changes, the setup for that pair
// runs once — spawning vans, foes or heat — so a job always starts correctly no matter
// how the player arrived at it.

import { createEnemy } from './combat.js';
import { createCar } from './vehicles.js';
import { startRace } from './activities.js';

const JOBS = [
  { name: 'First Wheels', reward: 100 },
  { name: 'The Package', reward: 300 },
  { name: 'Viper Nest', reward: 400 },
  { name: 'Heat', reward: 350 },
  { name: 'The Big Score', reward: 2500 },
  { name: 'Radio Silence', reward: 400 },
  { name: 'Grand Prix', reward: 500 },
  { name: 'The Safehouse', reward: 600 },
  { name: 'Air Support', reward: 800 },
  { name: 'Harbor Heist', reward: 5000 },
];

/** A fresh story: job zero, step zero, no fare on the books yet. */
export function createMissions() {
  return {
    index: 0,
    step: 0,
    active: true,
    fare: null,
    message: '',
    messageTime: 0,
    raceLaps: 0,
    raceStarted: false,
    setup: '',
    progress: 0,
    timer: 0,
    pickedUp: false,
    targetKey: null,
    targetPoint: null,
    foes: [],
  };
}

function near(a, b, r) {
  return Math.hypot(a.x - b.x, a.y - b.y) < r;
}

function pay(state, amount) {
  state.player.money += amount;
  state.stats.earned += amount;
}

function say(missions, text, seconds = 5) {
  missions.message = text;
  missions.messageTime = seconds;
}

/** Four Vipers around a point, the last one an enforcer when the job calls for it. */
function spawnFoes(state, x, y, enforcers) {
  const foes = [];
  const spots = [
    [0, -90],
    [80, -40],
    [-80, -40],
    [0, 70],
  ];
  for (let i = 0; i < 4; i++) {
    const kind = i === 3 && enforcers > 0 ? 'enforcer' : 'viper';
    const foe = createEnemy(state.random, x + spots[i][0], y + spots[i][1], kind);
    state.enemies.push(foe);
    foes.push(foe);
  }
  return foes;
}

/** The one-time setup for a job step: targets, briefs, spawns and heat. */
function setup(state) {
  const m = state.missions;
  const city = state.city;
  const at = (key) => city.landmarks[key];
  switch (m.index) {
    case 0:
      m.targetKey = null;
      m.targetPoint = null;
      say(m, 'Steal a car — press E beside one, hold it a moment');
      break;
    case 1:
      if (m.step === 0) {
        m.targetKey = 'diner';
        say(m, 'Pick up the package at the Diner (E)');
      } else {
        m.targetKey = 'port';
        say(m, 'Deliver the package to the Port Gate (E)');
      }
      break;
    case 2:
      if (m.step === 0) {
        m.targetPoint = { x: 3584, y: 2560 };
        say(m, 'Clear the Vipers out of the east yards');
      } else {
        say(m, 'Clear them out');
      }
      break;
    case 3:
      state.player.wanted = 3;
      state.wantedQuiet = 0;
      say(m, 'The cops are on you — lose them');
      break;
    case 4:
      if (m.step === 0) {
        m.targetKey = 'bank';
        m.progress = 0;
        say(m, 'Hold E at the bank vault to fill the bag');
      } else {
        m.targetKey = 'garage';
        say(m, "Get the bag to Maya's Garage");
      }
      break;
    case 5: {
      m.targetKey = 'observatory';
      const spot = at('observatory');
      const hasVan = state.cars.some(
        (c) => c.type === 'van' && !c.wrecked && Math.hypot(c.x - spot.x, c.y - spot.y) < 160,
      );
      if (!hasVan) {
        state.cars.push(createCar(state.random, spot.x + 40, spot.y + 40, 0, 'van', 'parked'));
      }
      say(m, 'Steal the broadcast van at the Observatory');
      break;
    }
    case 6:
      if (m.step === 0) {
        m.targetKey = 'raceGate';
        say(m, 'Get to the Race Gate in a car');
      } else {
        say(m, 'Win the race — four checkpoints');
      }
      break;
    case 7:
      if (m.step === 0) {
        m.targetKey = 'safehouse';
        say(m, 'Take the block back — clear the Safehouse');
      } else {
        say(m, 'Clear the block');
      }
      break;
    case 8:
      state.player.wanted = 4;
      state.wantedQuiet = 0;
      m.timer = 75;
      say(m, 'Survive the helicopter — 75 seconds');
      break;
    case 9:
      if (m.step === 0) {
        m.targetKey = 'port';
        say(m, 'Hit the Port Gate');
      } else if (m.step === 1) {
        say(m, 'Clear the Port Gate');
      } else {
        m.targetKey = 'safehouse';
        say(m, 'Run for the Safehouse');
      }
      break;
    default:
      break;
  }
}

/** Pay out a finished job and move to the next one. */
function complete(state, events) {
  const m = state.missions;
  const job = JOBS[m.index];
  pay(state, job.reward);
  events.push({ kind: 'mission-complete', name: job.name, amount: job.reward });
  m.index += 1;
  m.step = 0;
  m.setup = '';
  m.progress = 0;
  m.timer = 0;
  m.pickedUp = false;
  m.targetKey = null;
  m.targetPoint = null;
  m.foes = [];
  if (m.index >= JOBS.length) {
    m.active = false;
    say(m, 'The city is yours — taxi, deliveries and races pay');
  }
}

/**
 * Advance the story one step. Returns the events the world must carry out: a job
 * starting, or a job paid out. `input` carries the E key the pickup and vault jobs need.
 */
export function updateMissions(state, input, dt) {
  const events = [];
  const m = state.missions;
  const p = state.player;
  if (m.index >= JOBS.length) return events;
  const key = `${m.index}:${m.step}`;
  if (m.setup !== key) {
    m.setup = key;
    setup(state);
    events.push({ kind: 'mission-start', name: JOBS[m.index].name });
  }
  const city = state.city;
  const at = (k) => city.landmarks[k];
  switch (m.index) {
    case 0: {
      let best = null;
      let bestD = Infinity;
      for (const car of state.cars) {
        if (car.wrecked || car.kind === 'police') continue;
        const d = Math.hypot(car.x - p.x, car.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      m.targetPoint = best ? { x: best.x, y: best.y } : null;
      if (p.car) complete(state, events);
      break;
    }
    case 1:
      if (m.step === 0) {
        if (input.interact && near(p, at('diner'), 90)) {
          m.pickedUp = true;
          m.step = 1;
          m.setup = '';
        }
      } else if (input.interact && near(p, at('port'), 100)) {
        complete(state, events);
      }
      break;
    case 2:
      if (m.step === 0) {
        if (near(p, { x: 3584, y: 2560 }, 220)) {
          m.foes = spawnFoes(state, 3584, 2560, 0);
          m.step = 1;
          m.setup = '';
        }
      } else if (m.foes.length > 0 && m.foes.every((e) => e.down)) {
        complete(state, events);
      }
      break;
    case 3:
      if (p.wanted <= 0) complete(state, events);
      break;
    case 4:
      if (m.step === 0) {
        if (near(p, at('bank'), 90) && input.interactHeld) {
          m.progress += dt;
          if (m.progress >= 3) {
            m.step = 1;
            m.setup = '';
            p.wanted = Math.min(5, p.wanted + 2);
            state.wantedQuiet = 0;
          }
        } else if (!input.interactHeld) {
          m.progress = Math.max(0, m.progress - dt * 0.5);
        }
      } else if (near(p, at('garage'), 120)) {
        complete(state, events);
      }
      break;
    case 5:
      if (p.car && p.car.type === 'van') complete(state, events);
      break;
    case 6:
      if (m.step === 0) {
        if (p.car && near(p, at('raceGate'), 140)) {
          startRace(state.race, city, state.random);
          m.raceStarted = true;
          m.raceLaps = 0;
          m.step = 1;
          m.setup = '';
        }
      } else if (!state.race.active && m.raceStarted) {
        if (state.race.laps > m.raceLaps) {
          m.raceLaps = state.race.laps;
          complete(state, events);
        } else {
          m.raceStarted = false;
          m.step = 0;
          m.setup = '';
        }
      }
      break;
    case 7:
      if (m.step === 0) {
        if (near(p, at('safehouse'), 220)) {
          m.foes = spawnFoes(state, at('safehouse').x, at('safehouse').y, 1);
          m.step = 1;
          m.setup = '';
        }
      } else if (m.foes.length > 0 && m.foes.every((e) => e.down)) {
        state.safehouseOwned = true;
        p.hasShotgun = true;
        p.ammo = Math.min(120, p.ammo + 24);
        complete(state, events);
      }
      break;
    case 8:
      m.timer -= dt;
      if (p.wanted < 4) {
        p.wanted = 4;
        state.wantedQuiet = 0;
      }
      if (m.timer <= 0) complete(state, events);
      break;
    case 9:
      if (m.step === 0) {
        if (near(p, at('port'), 200)) {
          m.foes = spawnFoes(state, at('port').x, at('port').y, 1);
          p.wanted = Math.max(p.wanted, 4);
          state.wantedQuiet = 0;
          m.step = 1;
          m.setup = '';
        }
      } else if (m.step === 1) {
        if (m.foes.length > 0 && m.foes.every((e) => e.down)) {
          m.step = 2;
          m.setup = '';
        }
      } else if (near(p, at('safehouse'), 140)) {
        complete(state, events);
      }
      break;
    default:
      break;
  }
  return events;
}

/** The one-line objective the HUD shows for the current job and step. */
export function objectiveText(missions, race) {
  const i = missions.index;
  if (i >= JOBS.length) return 'Free roam — the city is yours. Taxi, deliveries and races pay.';
  switch (i) {
    case 0:
      return 'Steal a car — press E beside one, hold it a moment';
    case 1:
      return missions.step === 0
        ? 'Pick up the package at the Diner (E)'
        : 'Deliver the package to the Port Gate (E)';
    case 2:
      return missions.step === 0 ? 'Get to the Viper Nest in the east yards' : 'Clear out the Vipers';
    case 3:
      return 'Lose the cops — get your wanted level to zero';
    case 4:
      return missions.step === 0
        ? `Fill the bag at the vault — hold E (${Math.min(100, Math.floor((missions.progress / 3) * 100))}%)`
        : "Get the bag to Maya's Garage";
    case 5:
      return 'Steal the broadcast van at the Observatory';
    case 6:
      return missions.step === 0
        ? 'Get to the Race Gate in a car'
        : race && race.active
          ? `Race — checkpoint ${race.index + 1} of ${race.checkpoints.length}`
          : 'Win the race — four checkpoints';
    case 7:
      return missions.step === 0 ? 'Get to the Safehouse block' : 'Clear the block — take the Safehouse';
    case 8:
      return `Survive the helicopter — ${Math.max(0, Math.ceil(missions.timer))}s`;
    case 9:
      return missions.step === 0
        ? 'Get to the Port Gate'
        : missions.step === 1
          ? 'Clear the Port Gate'
          : 'Run for the Safehouse';
    default:
      return '';
  }
}

/** Where the map marker points: the current step's target, or null when there is none. */
export function stepTarget(missions, city) {
  if (missions.index >= JOBS.length || !missions.active) return null;
  if (missions.targetPoint) return missions.targetPoint;
  if (missions.targetKey) {
    const at = city.landmarks[missions.targetKey];
    if (at) return { x: at.x, y: at.y };
  }
  return null;
}
