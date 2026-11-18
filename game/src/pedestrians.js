// Pedestrians: the city's foot traffic. They walk the sidewalks, turn at corners, and run
// from gunfire, speeding cars and bodies on the ground. A pedestrian has no name and no
// destination that matters; what matters is that the street feels alive.

import { PED, WORLD } from './config.js';
import { pickOne } from './random.js';
import { nearestRoad } from './city.js';

const SHIRTS = ['#c94f4f', '#4f7ec9', '#3f9e6b', '#e0a13c', '#8a5fc0', '#d8d8d8', '#2f9e8a', '#e07a5f'];
const PANTS = ['#2f2f38', '#4a4a55', '#5d4a35', '#3a4a5d'];

/** A fresh pedestrian standing on a sidewalk near a road. */
export function createPedestrian(random, city) {
  const road = nearestRoad(city, 256 + random() * (city.size - 512), 256 + random() * (city.size - 512));
  // The southernmost east-west line is in the bay: spawn on the coastal road instead.
  if (road.axis === 'h' && road.line >= 3840) road.line = 3584;
  const side = random() < 0.5 ? -1 : 1;
  const edge = WORLD.roadWidth / 2 - 4;
  const x = road.axis === 'v' ? road.line + side * edge : road.along;
  const y = road.axis === 'v' ? road.along : road.line + side * edge;
  return {
    x, y,
    angle: random() * Math.PI * 2,
    speed: PED.walkMin + random() * (PED.walkMax - PED.walkMin),
    state: 'walk',
    walkPhase: random() * Math.PI * 2,
    shirt: pickOne(random, SHIRTS),
    pants: pickOne(random, PANTS),
    fleeX: 0, fleeY: 0, fleeTime: 0,
    down: false, downTime: 0,
    kind: 'civilian',
    roadAxis: road.axis, roadLine: road.line, roadDir: random() < 0.5 ? -1 : 1, side,
  };
}

/** A Viper gang member, loitering on their own turf: purple shirt, slower, and he does not run. */
export function createGangPed(random, city) {
  const ped = createPedestrian(random, city);
  ped.x = 3584 + (random() - 0.5) * 320;
  ped.y = 2560 + (random() - 0.5) * 320;
  ped.shirt = '#7a3fd1';
  ped.pants = '#2f2f38';
  ped.speed = 35 + random() * 20;
  ped.kind = 'gang';
  return ped;
}

/** Fill the sidewalks, and put the gang on their turf in the east yards. */
export function spawnPedestrians(city, random) {
  const peds = [];
  for (let i = 0; i < PED.count; i += 1) peds.push(createPedestrian(random, city));
  for (let i = 0; i < PED.gangCount; i += 1) peds.push(createGangPed(random, city));
  return peds;
}

/** Scare every pedestrian near a point: they run away from it for a few seconds. Gang members stand their ground. */
export function scareNearby(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.down || ped.kind === 'gang') continue;
    const dx = ped.x - x;
    const dy = ped.y - y;
    const d = Math.hypot(dx, dy);
    if (d < radius && d > 0.01) {
      ped.state = 'flee';
      ped.fleeX = dx / d;
      ped.fleeY = dy / d;
      ped.fleeTime = 2.5;
    }
  }
}

/** Walk the sidewalks: follow the road's edge, turn at the next corner, keep inside the city. */
function walkSidewalk(ped, city, dt) {
  const edge = WORLD.roadWidth / 2 - 4;
  const step = ped.speed * ped.roadDir * dt;
  if (ped.roadAxis === 'v') {
    ped.y += step;
    ped.x += (ped.roadLine + ped.side * edge - ped.x) * Math.min(1, 3 * dt);
    ped.angle = ped.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const next = Math.round(ped.y / WORLD.roadPitch) * WORLD.roadPitch;
    if (Math.abs(ped.y - next) < 6 && next > 0 && next < city.size) {
      // A corner: sometimes turn onto the crossing road.
      if (Math.random() < 0.004) {
        ped.roadAxis = 'h';
        ped.roadLine = next;
        ped.roadDir = Math.random() < 0.5 ? -1 : 1;
        ped.side = Math.random() < 0.5 ? -1 : 1;
      }
    }
    if (ped.y < 40) ped.roadDir = 1;
    if (ped.y > 3760) ped.roadDir = -1;
  } else {
    ped.x += step;
    ped.y += (ped.roadLine + ped.side * edge - ped.y) * Math.min(1, 3 * dt);
    ped.angle = ped.roadDir > 0 ? 0 : Math.PI;
    const next = Math.round(ped.x / WORLD.roadPitch) * WORLD.roadPitch;
    if (Math.abs(ped.x - next) < 6 && next > 0 && next < city.size) {
      if (Math.random() < 0.004) {
        ped.roadAxis = 'v';
        ped.roadLine = next;
        ped.roadDir = Math.random() < 0.5 ? -1 : 1;
        ped.side = Math.random() < 0.5 ? -1 : 1;
      }
    }
    if (ped.x < 40) ped.roadDir = 1;
    if (ped.x > city.size - 40) ped.roadDir = -1;
  }
  ped.walkPhase += dt * 9;
}

/** Move every pedestrian one step; the caller decides what scares them. */
export function updatePedestrians(peds, city, dt) {
  for (const ped of peds) {
    if (ped.down) {
      ped.downTime -= dt;
      if (ped.downTime <= 0) {
        ped.down = false;
        ped.state = 'flee';
        ped.fleeTime = 3;
        ped.fleeX = Math.cos(ped.angle);
        ped.fleeY = Math.sin(ped.angle);
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeTime -= dt;
      ped.x += ped.fleeX * PED.fleeSpeed * dt;
      ped.y += ped.fleeY * PED.fleeSpeed * dt;
      ped.angle = Math.atan2(ped.fleeY, ped.fleeX);
      ped.walkPhase += dt * 14;
      if (ped.fleeTime <= 0) {
        ped.state = 'walk';
        const road = nearestRoad(city, ped.x, ped.y);
        ped.roadAxis = road.axis;
        // The southernmost east-west line is in the bay: walk the coastal road instead.
        ped.roadLine = road.axis === 'h' && road.line >= 3840 ? 3584 : road.line;
        ped.roadDir = Math.random() < 0.5 ? -1 : 1;
        ped.side = Math.random() < 0.5 ? -1 : 1;
      }
    } else {
      walkSidewalk(ped, city, dt);
    }
    // Nobody walks in the bay: the shore is the southern edge of the pavement.
    ped.x = Math.max(20, Math.min(city.size - 20, ped.x));
    ped.y = Math.max(20, Math.min(3800, ped.y));
  }
}
