// The screenshot scenes behind ?shot=cover|street|drive|mission. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple autopilot,
// so the frame is what a short game really looks like and the same seed always gives the
// same frame. The cover is the Harbor Heist escape at dusk: five stars, the helicopter
// overhead, a roadblock on the road ahead, and two cop cars on the player's tail.

import { DAY, STEP } from './config.js';
import { nearestRoad } from './city.js';
import { createEnemy } from './combat.js';
import { raceTarget, startRace } from './activities.js';
import { SCREEN_PLAY } from './render.js';

const COVER_SECONDS = 3.5;
const STREET_SECONDS = 4;
const DRIVE_SECONDS = 5;
const MISSION_SECONDS = 2.5;

function normAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/**
 * A driver that keeps a car on its road and sometimes turns at an intersection. `turnChance`
 * is the per-frame chance of turning while crossing one: low for a straight fast run, higher
 * for a chase that weaves. The edge turn only fires while the car is actually heading for
 * the edge, so it never flip-flops.
 */
function roadPilot(city, random, turnChance = 0.012) {
  let road = null;
  return {
    // `start` pins the road when the car sits on an intersection, where the nearest
    // road is a tie: without it the pilot may pick the wrong avenue entirely.
    reset(car, start) {
      if (start) road = { ...start };
      else {
        const near = nearestRoad(city, car.x, car.y);
        road = { axis: near.axis, line: near.line, dir: 1 };
      }
    },
    drive(car) {
      const targetAngle = road.axis === 'v' ? (road.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (road.dir > 0 ? 0 : Math.PI);
      let diff = normAngle(targetAngle - car.angle);
      const lateral = road.axis === 'v' ? car.x - (road.line + 12 * road.dir) : car.y - (road.line + 12 * road.dir);
      diff += Math.max(-0.5, Math.min(0.5, -lateral * 0.002));
      const steer = Math.max(-1, Math.min(1, diff * 2));
      // A corner taken flat out swings wide off the road: brake while the nose is still
      // pointing the wrong way, and only then pour the speed back on.
      if (Math.abs(normAngle(targetAngle - car.angle)) > 0.6) {
        return { steer, throttle: 0, brake: 1 };
      }
      const along = road.axis === 'v' ? car.y : car.x;
      const edge = road.axis === 'v' ? 3620 : city.size - 300;
      for (const line of city.lines) {
        if (line <= 0 || line >= city.size) continue;
        if (Math.abs(along - line) < 30 && random() < turnChance) {
          road = { axis: road.axis === 'v' ? 'h' : 'v', line, dir: random() < 0.5 ? -1 : 1 };
          break;
        }
      }
      if ((road.dir > 0 && along > edge) || (road.dir < 0 && along < 300)) road.dir *= -1;
      return { steer, throttle: 1, brake: 0 };
    },
  };
}

function idleInput(aim) {
  return {
    moveX: 0, moveY: 0, run: false, steer: 0, throttle: 0, brake: 0,
    interact: false, interactHeld: false, punch: false, shoot: false,
    aimX: aim.x, aimY: aim.y,
  };
}

function driveInput(pilot, car, aim) {
  const drive = pilot.drive(car);
  return { ...idleInput(aim), steer: drive.steer, throttle: drive.throttle, brake: drive.brake };
}

/** The chase: the Harbor Heist escape at dusk, five stars, the helicopter overhead. */
function stageCover(world) {
  const state = world.state;
  world.reset();
  state.time = DAY.length * 0.6; // dusk, about 20:24: the warm wash, before the headlights come on
  state.missions.index = 9;
  state.missions.step = 2;
  state.missions.active = true;
  world.setWanted(5);
  world.giveCar('sports', 2048, 1536, 0);
  world.spawnCopsNow(2);
  // Pull the cops in close behind, so the chase fills the frame.
  state.cops.forEach((cop, i) => {
    cop.x = 2048 - 260 - i * 120;
    cop.y = 1536 + (i === 0 ? -14 : 14);
    cop.angle = 0;
    cop.speed = 300;
  });
  const pilot = roadPilot(state.city, state.random, 0.008);
  pilot.reset(state.player.car, { axis: 'h', line: 1536, dir: 1 });
  const aim = { x: state.player.x + 400, y: state.player.y };
  for (let i = 0; i < COVER_SECONDS / STEP; i += 1) {
    // A staged chase only reads as a chase while the cops are in the frame: every half
    // second, pull them back in behind the player at chase speed, and keep the
    // helicopter above and to the left of the player so its searchlight reads.
    if (i % 30 === 0) {
      const car = state.player.car;
      const back = car.angle + Math.PI;
      state.cops.forEach((cop, index) => {
        cop.x = car.x + Math.cos(back) * (230 + index * 110) + Math.cos(back + Math.PI / 2) * (index === 0 ? -16 : 16);
        cop.y = car.y + Math.sin(back) * (230 + index * 110) + Math.sin(back + Math.PI / 2) * (index === 0 ? -16 : 16);
        cop.angle = car.angle;
        cop.speed = Math.max(car.speed * 0.95, 300);
      });
      if (state.heli) {
        state.heli.x = car.x - 320;
        state.heli.y = car.y - 280;
      }
    }
    world.step(STEP, driveInput(pilot, state.player.car, aim));
  }
  // The roadblock goes down ahead of the player: pull the one that spawned onto the
  // road in front of the car, so the frame shows the chase, the helicopter and the block.
  if (state.roadblocks.length > 0) {
    const car = state.player.car;
    const block = state.roadblocks[0];
    const bx = car.x + Math.cos(car.angle) * 430;
    const by = car.y + Math.sin(car.angle) * 430;
    const px = Math.cos(car.angle + Math.PI / 2);
    const py = Math.sin(car.angle + Math.PI / 2);
    block.x = bx;
    block.y = by;
    block.angle = car.angle;
    block.cars.forEach((blockCar, i) => {
      const side = i === 0 ? -1 : 1;
      blockCar.x = bx + px * side * 40;
      blockCar.y = by + py * side * 40;
      blockCar.angle = car.angle;
    });
  }
  return { screen: SCREEN_PLAY, best: state.stats.earned };
}

/** On foot in Calle Ocho: the market street, traffic and pedestrians, a car waiting to be taken, and a hidden package on the corner. */
function stageStreet(world) {
  const state = world.state;
  world.reset();
  world.placePlayer(512, 2100);
  const aim = { x: state.player.x, y: state.player.y };
  for (let i = 0; i < STREET_SECONDS / STEP; i += 1) {
    // Walk toward the nearest car, as a player starting the first job would.
    let nearest = null;
    let nearestD = Infinity;
    for (const car of state.cars) {
      if (car.wrecked) continue;
      const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
      if (d < nearestD) {
        nearestD = d;
        nearest = car;
      }
    }
    const input = idleInput(aim);
    if (nearest) {
      const dx = nearest.x - state.player.x;
      const dy = nearest.y - state.player.y;
      const len = Math.hypot(dx, dy) || 1;
      input.moveX = dx / len;
      input.moveY = dy / len;
    }
    world.step(STEP, input);
  }
  return { screen: SCREEN_PLAY, best: 0 };
}

/** The Grand Prix, mid-race: a coupe flat out down the coastal avenue, the race clock on the HUD and the first checkpoint on the map. */
function stageDrive(world) {
  const state = world.state;
  world.reset();
  state.time = DAY.length * 0.29; // midday, about 13:00: full daylight for the race
  state.missions.index = 6;
  state.missions.step = 1;
  state.missions.active = true;
  world.giveCar('coupe', 1024, 3584, 0);
  startRace(state.race, state.city, state.random);
  state.missions.raceLaps = 0;
  state.missions.raceStarted = true;
  state.raceMarker = raceTarget(state.race);
  const pilot = roadPilot(state.city, state.random, 0);
  pilot.reset(state.player.car, { axis: 'h', line: 3584, dir: 1 });
  const aim = { x: state.player.x + 400, y: state.player.y };
  for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
    world.step(STEP, driveInput(pilot, state.player.car, aim));
  }
  return { screen: SCREEN_PLAY, best: 0 };
}

/** The Harbor Heist: the player on foot at the Port Gate, shotgun out, three Vipers and an enforcer closing in while four stars bring the helicopter up. */
function stageMission(world) {
  const state = world.state;
  world.reset();
  state.time = DAY.length * 0.708; // midnight, about 23:00: the searchlight and the headlights show
  state.missions.index = 9;
  state.missions.step = 1;
  state.missions.active = true;
  world.placePlayer(2560, 3584);
  world.setWanted(4);
  state.player.hasPistol = true;
  state.player.hasShotgun = true;
  state.player.weapon = 'shotgun';
  state.player.ammo = 24;
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + 0.6;
    state.enemies.push(createEnemy(state.random, 2560 + Math.cos(angle) * 130, 3584 + Math.sin(angle) * 130));
  }
  state.enemies.push(createEnemy(state.random, 2560 + 190, 3584 - 90, 'enforcer'));
  for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
    let nearest = null;
    let nearestD = Infinity;
    for (const enemy of state.enemies) {
      if (enemy.down) continue;
      const d = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
      if (d < nearestD) {
        nearestD = d;
        nearest = enemy;
      }
    }
    const input = idleInput(nearest ? { x: nearest.x, y: nearest.y } : { x: state.player.x + 100, y: state.player.y });
    // Fire in short bursts at the nearest Viper.
    input.shoot = i < 30 && i % 14 < 7;
    world.step(STEP, input);
  }
  return { screen: SCREEN_PLAY, best: 0 };
}

/**
 * Set `world` to the named scene (cover, street, drive or mission; any other name is the
 * cover) and return the screen to draw over it and the best take to show.
 */
export function stageShot(name, world) {
  if (name === 'street') return stageStreet(world);
  if (name === 'drive') return stageDrive(world);
  if (name === 'mission') return stageMission(world);
  return stageCover(world);
}
