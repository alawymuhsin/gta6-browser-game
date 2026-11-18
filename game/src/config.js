// Every tuning number and colour for Solara Bay in one place. The world is a square city
// measured in world units; the camera shows a 1280x720 slice of it and follows the player.

/** The city is this many world units across, and the roads sit on a regular grid inside it. */
export const WORLD = { size: 4096, roadPitch: 512, roadWidth: 72, sidewalk: 14 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** What the camera shows: a 1280x720 window that zooms out a little while driving. */
export const VIEW = { width: 1280, height: 720, zoomFoot: 1.0, zoomCar: 0.82 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  runSpeed: 320,
  health: 100,
  punchRange: 46,
  punchDamage: 34,
  punchCooldown: 0.35,
  pistolDamage: 34,
  pistolCooldown: 0.22,
  bulletSpeed: 760,
  startAmmo: 24,
  maxAmmo: 120,
};

export const CAR = {
  length: 52,
  width: 26,
  accel: 420,
  brake: 620,
  reverseMax: 160,
  grip: 3.4,
  drift: 0.92,
  health: 100,
  stealTime: 0.6,
};

export const TRAFFIC = { count: 34, cruiseMin: 130, cruiseMax: 190, spawnGap: 90 };

export const PED = { count: 56, walkMin: 45, walkMax: 75, fleeSpeed: 190, gangCount: 8 };

export const WANTED = {
  max: 5,
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  killCop: 2,
  decayDelay: 18,
  decayStep: 14,
  bustRadius: 34,
  bustTime: 1.4,
};

export const POLICE = { carSpeed: 330, carAccel: 460, maxCars: 6, ramDamage: 9 };

/** The police helicopter: it only flies once the heat is serious, and it never lands. */
export const HELI = { minWanted: 4, speed: 300, hover: 260, rotorRate: 22, spotlight: 190 };

/** A roadblock: two parked cop cars and a barrier across the road ahead of the player. */
export const ROADBLOCK = { minWanted: 3, cooldown: 25, ahead: 520 };

/**
 * One full day in the city, in seconds of play. The day starts at 06:00: dawn 05:00–07:00,
 * daylight 07:00–19:30, dusk 19:30–22:00, night 22:00–05:00, when the headlights and the
 * helicopter's searchlight come on.
 */
export const DAY = { length: 300, dawnHour: 5, dayHour: 7, duskHour: 19.5, nightHour: 22 };

/** The car radio: three synth stations, switched with R while driving. */
export const RADIO = {
  stations: [
    { name: 'Solara FM', bpm: 112, wave: 'sawtooth' },
    { name: 'Bay Beats', bpm: 88, wave: 'square' },
    { name: 'Coast Talk', bpm: 72, wave: 'triangle' },
  ],
};

/** Street races and hidden packages: the repeatable work after the story. */
export const RACE = { checkpoints: 4, timePerLeg: 26, reward: 500 };
export const COLLECTIBLES = { count: 12, reward: 1000 };

/** The shotgun: five pellets in one blast, four shells of ammo a shot. */
export const SHOTGUN = { pellets: 5, spread: 0.34, damage: 14, ammoCost: 4, shells: 12 };

export const SAVE_KEY = 'solara-bay.save.v1';
export const BEST_KEY = 'solara-bay.best.v1';

export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#74a24f',
  water: '#3f8fd2',
  sand: '#d9c48a',
  asphalt: '#3a3f46',
  asphaltDark: '#33373e',
  sidewalk: '#9aa0a8',
  lane: '#e8d44d',
  curb: '#c9ced4',
  buildingRoof: '#b08968',
  buildingRoof2: '#8d7b8f',
  buildingRoof3: '#7d8a99',
  buildingRoof4: '#a8695e',
  buildingEdge: 'rgba(0,0,0,0.28)',
  park: '#5d9b4a',
  parkTree: '#3f7a33',
  player: '#ffcf3f',
  playerDark: '#c79a12',
  cop: '#2b6fd6',
  copLightR: '#ff2e2e',
  copLightB: '#2e7dff',
  viper: '#7a3fd1',
  hud: '#10141c',
  hudText: '#f2f4f7',
  hudMuted: '#9aa3b0',
  gold: '#f2c94c',
  red: '#e5534b',
  green: '#58c472',
  sky: '#8ec9ee',
  heli: '#23282f',
  heliLight: '#ffe9a8',
  dusk: 'rgba(232,120,60,0.26)',
  night: 'rgba(10,16,40,0.42)',
  race: '#ff7a3c',
  collectible: '#ff5fa2',
};

/** One roof palette per district, so each part of town reads differently from above. */
export const DISTRICT_ROOFS = {
  'Old Town': ['#b08968', '#a8695e', '#8d6b52'],
  Downtown: ['#7d8a99', '#5d6b7a', '#8d7b8f'],
  Industrial: ['#6b6f66', '#7a6a55', '#565b52'],
  Marina: ['#d9c48a', '#b08968', '#e8dcc0'],
  'Calle Ocho': ['#e07a5f', '#e0a13c', '#c94f4f'],
  Northside: ['#4f7ec9', '#7d8a99', '#3f9e6b'],
  Portside: ['#5d7a8a', '#6b6f66', '#8a6f4d'],
  'Vista Heights': ['#d8d8d8', '#b8c4cc', '#a8695e'],
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
