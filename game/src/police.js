// The police: cars that spawn when the wanted level rises, chase the player
// Round 5: the helicopter's searchlight is the four-star answer to a getaway.
// through the streets, ram a getaway car, and bust a player on foot who lets
// one pull up beside them. They drive straight at the player and slide along
// walls instead of following roads, which is what makes a chase feel like a
// chase. At four stars the helicopter comes up and watches from above; at
// three stars a roadblock goes down on the road ahead of the player.

import { HELI, POLICE, ROADBLOCK, WANTED } from './config.js';
import { createCar, carAxles, damageCar } from './vehicles.js';
import { nearestRoad, pushOutOfBuildings, randomRoadSpot } from './city.js';

/** Whether the helicopter flies at this wanted level. */
export function wantedHeli(wanted) {
  return wanted >= HELI.minWanted;
}

/** A helicopter, hovering above the player and watching with its searchlight. */
export function createHeli(x, y) {
  return { x, y, angle: 0, rotorPhase: 0, active: true };
}

/** The helicopter drifts toward the player and keeps its light on them. */
export function updateHeli(heli, player, dt) {
  if (!heli || !heli.active) return;
  heli.rotorPhase += dt * HELI.rotorRate;
  const dx = player.x - heli.x;
  const dy = player.y - heli.y;
  const d = Math.hypot(dx, dy);
  heli.angle = Math.atan2(dy, dx);
  if (d > HELI.hover) {
    heli.x += Math.cos(heli.angle) * HELI.speed * dt;
    heli.y += Math.sin(heli.angle) * HELI.speed * dt;
  }
}

/**
 * Roadblocks: when the heat is high and the player is driving, two parked cop cars and a
 * barrier go down on the road ahead of them. They are ordinary cars in the world's list
 * (kind 'police', parked), so the player can smash through them or steer around them; they
 * leave when the heat drops. Returns 'roadblock' when one goes down.
 */
export function updateRoadblocks(roadblocks, cars, player, wanted, dt, city, random) {
  let result = null;
  for (let i = roadblocks.length - 1; i >= 0; i -= 1) {
    const block = roadblocks[i];
    block.time -= dt;
    if (wanted < ROADBLOCK.minWanted || block.time <= 0) {
      for (const car of block.cars) {
        const index = cars.indexOf(car);
        if (index !== -1) cars.splice(index, 1);
      }
      roadblocks.splice(i, 1);
    }
  }
  if (wanted >= ROADBLOCK.minWanted && player.car && roadblocks.length === 0) {
    roadblocks.cooldown = (roadblocks.cooldown ?? 0) - dt;
    if (roadblocks.cooldown <= 0) {
      roadblocks.cooldown = ROADBLOCK.cooldown;
      const aheadX = player.x + Math.cos(player.angle) * ROADBLOCK.ahead;
      const aheadY = player.y + Math.sin(player.angle) * ROADBLOCK.ahead;
      const road = nearestRoad(city, aheadX, aheadY);
      const cx = road.axis === 'v' ? road.line : aheadX;
      const cy = road.axis === 'v' ? aheadY : road.line;
      const angle = road.axis === 'v' ? Math.PI / 2 : 0;
      const carsOnBlock = [];
      for (const side of [-1, 1]) {
        const ox = road.axis === 'v' ? side * 40 : 0;
        const oy = road.axis === 'v' ? 0 : side * 40;
        const blockCar = createCar(random, cx + ox, cy + oy, angle, 'police', 'police');
        blockCar.siren = true;
        blockCar.sirenPhase = random() * 2;
        blockCar.road = null;
        cars.push(blockCar);
        carsOnBlock.push(blockCar);
      }
      roadblocks.push({ x: cx, y: cy, angle, cars: carsOnBlock, time: 40 });
      result = 'roadblock';
    }
  } else if (wanted < ROADBLOCK.minWanted) {
    roadblocks.cooldown = 0;
  }
  return result;
}

/** How many cop cars the street should hold at each wanted level. */
export function wantedCarCount(wanted) {
  return [0, 1, 2, 3, 4, 6][Math.max(0, Math.min(WANTED.max, wanted))];
}

/** A cop car on a road some distance from the player, already rolling toward them. */
export function spawnCopCar(city, random, playerX, playerY) {
  for (let tries = 0; tries < 12; tries += 1) {
    const spot = randomRoadSpot(city, random);
    const d = Math.hypot(spot.x - playerX, spot.y - playerY);
    if (d < 420 || d > 1100) continue;
    const car = createCar(random, spot.x, spot.y, Math.atan2(playerY - spot.y, playerX - spot.x), 'police', 'police');
    car.siren = true;
    car.bustTimer = 0;
    car.ramCooldown = 0;
    car.stuckTime = 0;
    return car;
  }
  return null;
}

/** Separate two cop cars that drove into each other. */
function separateCops(cops) {
  for (let i = 0; i < cops.length; i += 1) {
    for (let j = i + 1; j < cops.length; j += 1) {
      const a = cops[i];
      const b = cops[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 56) {
        const push = (56 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

/**
 * Move every cop car one step. Returns 'busted' when a cop holds the player on foot long
 * enough, 'ram' with the damage dealt when a cop rams the player's car, or null.
 */
export function updatePolice(city, cops, player, playerCar, dt) {
  let result = null;
  for (const cop of cops) {
    if (cop.wrecked) continue;
    cop.sirenPhase += dt;
    cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const distance = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    let diff = want - cop.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-3.4 * dt, Math.min(3.4 * dt, diff * 2.2));
    cop.angle += turn;
    const targetSpeed = distance > 320 ? POLICE.carSpeed : POLICE.carSpeed * 0.85;
    cop.speed += Math.max(-500 * dt, Math.min(POLICE.carAccel * dt, targetSpeed - cop.speed));
    const beforeX = cop.x;
    const beforeY = cop.y;
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
    // A cop car never drives into the bay or off the map either.
    cop.x = Math.max(30, Math.min(city.size - 30, cop.x));
    cop.y = Math.max(30, Math.min(3810, cop.y));
    // Walls stop a cop: slide along them instead of driving through. The scrape is
    // damped once per step, not once per axle, or the cop wedges itself on a corner.
    let hitWall = false;
    for (const axle of carAxles(cop)) {
      const body = { x: axle.x, y: axle.y };
      if (pushOutOfBuildings(city, body, axle.r)) {
        cop.x += body.x - axle.x;
        cop.y += body.y - axle.y;
        hitWall = true;
      }
    }
    if (hitWall) cop.speed *= 0.9;
    if (Math.hypot(cop.x - beforeX, cop.y - beforeY) < cop.speed * dt * 0.25 && cop.speed > 40) {
      cop.stuckTime += dt;
      if (cop.stuckTime > 1.2) {
        cop.angle += Math.PI / 2;
        cop.stuckTime = 0;
      }
    } else {
      cop.stuckTime = 0;
    }
    // A bust: the player on foot, a cop pulled up beside them, and nowhere left to run.
    if (!playerCar && distance < WANTED.bustRadius && cop.speed < 90) {
      cop.bustTimer += dt;
      if (cop.bustTimer >= WANTED.bustTime) return 'busted';
    } else {
      cop.bustTimer = Math.max(0, cop.bustTimer - dt * 2);
    }
    // A ram: the cop's nose in the player's car.
    if (playerCar && cop.ramCooldown <= 0) {
      const playerAxles = carAxles(playerCar);
      for (const axle of carAxles(cop)) {
        for (const pax of playerAxles) {
          if (Math.hypot(axle.x - pax.x, axle.y - pax.y) < axle.r + pax.r) {
            cop.ramCooldown = 0.6;
            damageCar(playerCar, POLICE.ramDamage);
            cop.speed *= 0.5;
            result = { type: 'ram', damage: POLICE.ramDamage };
          }
        }
      }
    }
  }
  separateCops(cops);
  return result;
}
