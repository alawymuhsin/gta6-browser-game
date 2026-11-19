// Cars: their types, the traffic that drives the roads, the parked cars waiting
// to be taken, and the arcade driving model the player's car uses. A car is a
// point with a heading and a speed; collisions treat it as two circles, one at
// each axle.

import { CAR, TRAFFIC, WORLD } from './config.js';
import { pickInt, pickOne } from './random.js';
import { randomRoadSpot } from './city.js';

export const CAR_TYPES = {
  sedan: { length: 52, width: 26, accel: 380, maxSpeed: 300, turn: 2.6, colors: ['#c94f4f', '#4f7ec9', '#7a8a99', '#3f9e6b', '#d8d8d8'] },
  coupe: { length: 48, width: 24, accel: 460, maxSpeed: 350, turn: 3.0, colors: ['#e0a13c', '#8a5fc0', '#c94f4f', '#2f2f38'] },
  taxi: { length: 52, width: 26, accel: 380, maxSpeed: 300, turn: 2.6, colors: ['#f2c230'] },
  truck: { length: 66, width: 28, accel: 280, maxSpeed: 230, turn: 2.0, colors: ['#8a6f4d', '#5d7a8a', '#a8a8a8'] },
  van: { length: 58, width: 28, accel: 320, maxSpeed: 250, turn: 2.2, colors: ['#e8e4da', '#6b8e6b', '#7a8a99'] },
  sports: { length: 50, width: 24, accel: 560, maxSpeed: 420, turn: 3.2, colors: ['#e5534b', '#f2c94c', '#2f9e8a', '#d8d8d8'] },
  limo: { length: 64, width: 28, accel: 340, maxSpeed: 280, turn: 2.0, colors: ['#1c1c22', '#d8d8d8', '#3a3a3a'] },
  police: { length: 52, width: 26, accel: 520, maxSpeed: 380, turn: 3.0, colors: ['#2b6fd6'] },
};

const TRAFFIC_TYPES = ['sedan', 'sedan', 'coupe', 'taxi', 'truck', 'van', 'sports', 'limo'];

/** A fresh car at a place, facing an angle, of a type, with a role (traffic, parked, player, police). */
export function createCar(random, x, y, angle, type, kind) {
  const def = CAR_TYPES[type];
  return {
    x, y, angle, speed: 0, vx: 0, vy: 0,
    type, kind,
    color: pickOne(random, def.colors),
    length: def.length, width: def.width,
    health: CAR.health,
    cruise: TRAFFIC.cruiseMin + random() * (TRAFFIC.cruiseMax - TRAFFIC.cruiseMin),
    road: null, lane: 0, turnCooldown: 0,
    siren: false, sirenPhase: 0,
    wrecked: false, smoke: 0,
  };
}

/** The two axle circles a car collides with: front and rear, each radius width/2. */
export function carAxles(car) {
  const half = car.length / 2 - car.width / 2;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  return [
    { x: car.x + cos * half, y: car.y + sin * half, r: car.width / 2 },
    { x: car.x - cos * half, y: car.y - sin * half, r: car.width / 2 },
  ];
}

/** Fill the roads with traffic and the curbs with parked cars. */
export function spawnTraffic(city, random) {
  const cars = [];
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const spot = randomRoadSpot(city, random);
    const type = pickOne(random, TRAFFIC_TYPES);
    const car = createCar(random, spot.x, spot.y, spot.axis === 'v' ? (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (spot.dir > 0 ? 0 : Math.PI), type, 'traffic');
    car.road = { axis: spot.axis, line: spot.line, dir: spot.dir };
    car.lane = spot.lane;
    car.speed = car.cruise * (0.7 + random() * 0.3);
    cars.push(car);
  }
  // Parked cars along the curbs, free for the taking.
  for (let i = 0; i < 18; i += 1) {
    const spot = randomRoadSpot(city, random);
    const type = pickOne(random, TRAFFIC_TYPES);
    const angle = spot.axis === 'v' ? (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (spot.dir > 0 ? 0 : Math.PI);
    const parked = createCar(random, spot.x + (spot.axis === 'v' ? 26 : 0), spot.y + (spot.axis === 'h' ? 26 : 0), angle, type, 'parked');
    parked.road = null;
    cars.push(parked);
  }
  return cars;
}

/** The lane offset (right-hand side) for a road and a direction of travel. */
function laneOffset(axis, dir) {
  return dir > 0 ? 12 : -12;
}

/** Steer a traffic car toward its road and lane, and pick a new road at intersections. */
function followRoad(car, city, dt, random) {
  const road = car.road;
  if (!road) return;
  const targetAngle = road.axis === 'v' ? (road.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (road.dir > 0 ? 0 : Math.PI);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
  // Drift back onto the lane line.
  const lateral = road.axis === 'v' ? car.x - (road.line + car.lane) : car.y - (road.line + car.lane);
  const pull = Math.max(-60 * dt, Math.min(60 * dt, -lateral * 1.2 * dt));
  if (road.axis === 'v') car.x += pull;
  else car.y += pull;
  // At an intersection, sometimes turn onto the crossing road.
  car.turnCooldown -= dt;
  if (car.turnCooldown <= 0) {
    const along = road.axis === 'v' ? car.y : car.x;
    for (const line of city.lines) {
      if (line <= 0 || line >= city.size) continue;
      if (Math.abs(along - line) < 26) {
        if (random() < 0.22) {
          const newDir = random() < 0.5 ? -1 : 1;
          const newAxis = road.axis === 'v' ? 'h' : 'v';
          car.road = { axis: newAxis, line, dir: newDir };
          car.lane = laneOffset(newAxis, newDir);
        } else if (random() < 0.06) {
          // Rare U-turn at the end of a road.
          road.dir *= -1;
          car.lane = laneOffset(road.axis, road.dir);
        }
        car.turnCooldown = 2.5;
        break;
      }
    }
  }
  // The city's edge turns a car back: a north-south road ends at the coastal road, it
  // never drives on into the bay.
  const along = road.axis === 'v' ? car.y : car.x;
  const southLimit = road.axis === 'v' ? 3620 : city.size - 200;
  if ((road.dir > 0 && along > southLimit) || (road.dir < 0 && along < 200)) {
    road.dir *= -1;
    car.lane = laneOffset(road.axis, road.dir);
    car.turnCooldown = 2.5;
  }
}

/** Slow a car when another car is close ahead in the same lane. */
function carAhead(car, cars) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  let nearest = Infinity;
  for (const other of cars) {
    if (other === car || other.kind === 'parked') continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * cos + dy * sin;
    const side = Math.abs(-dx * sin + dy * cos);
    if (ahead > 0 && ahead < 90 && side < 22 && ahead < nearest) nearest = ahead;
  }
  return nearest;
}

/** Move every traffic car one step. Police and player cars are driven elsewhere. */
export function updateTraffic(city, cars, dt, random) {
  for (const car of cars) {
    if (car.kind !== 'traffic' || car.wrecked) continue;
    followRoad(car, city, dt, random);
    const gap = carAhead(car, cars);
    const target = gap < 90 ? Math.max(0, car.cruise * (gap / 90)) : car.cruise;
    car.speed += Math.max(-420 * dt, Math.min(300 * dt, target - car.speed));
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (car.speed > 0 && car.siren) car.sirenPhase += dt;
  }
}

/**
 * The player's driving model: throttle accelerates, brake slows or reverses, steering bites
 * harder the faster the car goes, and the car keeps a little of its sideways slide.
 */
export function drivePlayerCar(car, steer, throttle, brake, dt) {
  const def = CAR_TYPES[car.type];
  const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const speedAlong = car.vx * forward.x + car.vy * forward.y;
  const speedSide = car.vx * -forward.y + car.vy * forward.x;
  let along = speedAlong;
  if (throttle > 0) along += def.accel * throttle * dt;
  if (brake > 0) along -= (along > 0 ? CAR.brake : def.accel * 0.7) * brake * dt;
  along -= along * 0.25 * dt; // rolling drag
  along = Math.max(-CAR.reverseMax, Math.min(def.maxSpeed, along));
  const side = speedSide * Math.max(0, 1 - CAR.grip * dt);
  const steerAmount = steer * def.turn * Math.min(1, Math.abs(along) / 120) * (along >= 0 ? 1 : -1);
  car.angle += steerAmount * dt;
  const nx = Math.cos(car.angle);
  const ny = Math.sin(car.angle);
  car.vx = nx * along + -ny * side;
  car.vy = ny * along + nx * side;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = Math.hypot(car.vx, car.vy);
  return car.speed;
}

/** Damage a car; returns true when it is wrecked. */
export function damageCar(car, amount) {
  car.health -= amount;
  if (car.health <= 0 && !car.wrecked) {
    car.wrecked = true;
    car.smoke = 1;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
  }
  return car.wrecked;
}
