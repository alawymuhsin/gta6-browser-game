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

export const TRAFFIC = { count: 26, cruiseMin: 130, cruiseMax: 190, spawnGap: 90 };

export const PED = { count: 42, walkMin: 45, walkMax: 75, fleeSpeed: 190 };

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
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
