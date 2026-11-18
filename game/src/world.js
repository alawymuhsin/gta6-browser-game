// The world: everything that moves in Solara Bay, one fixed step at a time. The state is
// a single plain object — city, player, cars, cops, pedestrians, Vipers, bullets, race,
// delivery, missions — and step() advances it all by dt with the player's input. Nothing
// here touches the screen or the speakers: step() returns the events the frame produced
// (a shot fired, a job paid out, a bust) and the caller turns those into sound and toasts.
//
// The world is deterministic from its seed: the city, the traffic and the pedestrians are
// all dealt from one random stream in reset order, so the same seed always opens the same
// city. Only the pedestrians' corner turns use Math.random, and those never change where
// anything stands.

import { CAR, COLLECTIBLES, PLAYER, SHOTGUN, VIEW, WANTED, WORLD } from './config.js';
import { createRandom } from './random.js';
import { buildCity, pushOutOfBuildings } from './city.js';
import { carAxles, createCar, damageCar, drivePlayerCar, spawnTraffic, updateTraffic } from './vehicles.js';
import { scareNearby, spawnPedestrians, updatePedestrians } from './pedestrians.js';
import { createHeli, spawnCopCar, updateHeli, updatePolice, updateRoadblocks, wantedCarCount, wantedHeli } from './police.js';
import { fireBullet, fireShotgun, punch, updateBullets, updateEnemies } from './combat.js';
import { collectibleNear, createCollectibles, createRaceState, offerDelivery, raceTarget, startRace, updateDelivery, updateRace } from './activities.js';
import { createMissions, updateMissions } from './missions.js';

/** What one hidden package pays, on top of the set bonus the twelfth one carries. */
const PACKAGE_VALUE = 150;
/** The shotgun's pause between blasts, in seconds. */
const SHOTGUN_COOLDOWN = 0.7;
/** What a pickup is worth: health, shells, or cash. */
const PICKUP_VALUE = { health: 30, ammo: 24, cash: 50 };
/** The fare's base price; distance adds a little on top. */
const FARE_BASE = 80;
/** How close the player must stand to a car to steal it. */
const STEAL_RADIUS = 64;
/** How far to the side of a car the player steps out. */
const EXIT_OFFSET = 40;

// ------------------------------------------------------------------ state

/** The pickups scattered around town: a first-aid kit by the hospital, shells by the
// police station, cash by the bank, and three more along the way. */
function makePickups(city) {
  const spots = [
    { kind: 'health', at: city.landmarks.hospital },
    { kind: 'ammo', at: city.landmarks.policeHq },
    { kind: 'cash', at: city.landmarks.bank },
    { kind: 'health', at: city.landmarks.diner },
    { kind: 'ammo', at: city.landmarks.market },
    { kind: 'cash', at: city.landmarks.port },
  ];
  return spots.map((s) => ({ x: s.at.x + 60, y: s.at.y, kind: s.kind, taken: false }));
}

/** A fresh world for a seed: the city, the traffic, the pedestrians, the player at the
// garage, and the story at job zero. */
function freshState(seed) {
  const city = buildCity(seed);
  const random = createRandom(seed);
  const garage = city.landmarks.garage;
  const state = {
    seed,
    city,
    random,
    time: 0,
    player: {
      x: garage.x,
      y: garage.y + 60,
      angle: -Math.PI / 2,
      faceAngle: -Math.PI / 2,
      aimAngle: -Math.PI / 2,
      health: PLAYER.health,
      money: 0,
      wanted: 0,
      ammo: PLAYER.startAmmo,
      hasPistol: true,
      hasShotgun: false,
      weapon: 'pistol',
      car: null,
      invulnerable: 0,
      shootCooldown: 0,
      punchCooldown: 0,
      stealTimer: 0,
      stealTarget: null,
    },
    cars: spawnTraffic(city, random),
    cops: [],
    peds: spawnPedestrians(city, random),
    enemies: [],
    bullets: [],
    particles: [],
    pickups: makePickups(city),
    collectibles: createCollectibles(),
    roadblocks: [],
    heli: null,
    race: createRaceState(),
    raceMarker: null,
    missions: createMissions(),
    delivery: null,
    fareCooldown: 20,
    deliveryCooldown: 30,
    toasts: [],
    banner: null,
    camera: { x: garage.x, y: garage.y + 60, zoom: VIEW.zoomFoot },
    shake: 0,
    stats: { earned: 0 },
    safehouseOwned: false,
    wantedQuiet: 0,
    heatCooldown: 0,
  };
  state.roadblocks.cooldown = 0;
  return state;
}

// ------------------------------------------------------------------ helpers

/** A short toast under the HUD, at most three at once. */
function addToast(state, text) {
  state.toasts.push({ text, time: 3.5 });
  if (state.toasts.length > 3) state.toasts.shift();
}

/** A spark at a point, gone in less than half a second. */
function addParticle(state, x, y) {
  state.particles.push({
    x,
    y,
    vx: (Math.random() - 0.5) * 140,
    vy: (Math.random() - 0.5) * 140,
    life: 0.4,
    color: '#ffd94d',
    size: 3,
  });
  if (state.particles.length > 120) state.particles.splice(0, state.particles.length - 120);
}

/** Raise the wanted level and restart the quiet clock. Small heat has a short cooldown
// so one burst of gunfire does not stack five stars by itself. */
function addHeat(state, amount) {
  if (amount <= 1 && state.heatCooldown > 0) return;
  const p = state.player;
  p.wanted = Math.min(WANTED.max, p.wanted + amount);
  state.wantedQuiet = 0;
  state.heatCooldown = 2;
}

/** Hurt the player, with a short window where nothing else can land. */
function damagePlayer(state, amount, events) {
  const p = state.player;
  if (p.invulnerable > 0 || p.health <= 0) return;
  p.health -= amount;
  p.invulnerable = 0.8;
  state.shake = Math.min(10, state.shake + 4);
  events.push({ kind: 'player-hurt', damage: amount });
  if (p.health <= 0) {
    p.health = 0;
    wasted(state, events);
  }
}

/** Put the player back on their feet somewhere safe, the chase called off. */
function respawn(state, x, y) {
  const p = state.player;
  if (p.car) {
    p.car.kind = 'parked';
    p.car.road = null;
    p.car = null;
  }
  p.x = x;
  p.y = y;
  p.health = PLAYER.health;
  p.wanted = 0;
  p.invulnerable = 2;
  p.angle = -Math.PI / 2;
  p.faceAngle = -Math.PI / 2;
  state.wantedQuiet = 0;
  for (const cop of state.cops) {
    const i = state.cars.indexOf(cop);
    if (i !== -1) state.cars.splice(i, 1);
  }
  state.cops = [];
  state.heli = null;
  for (const block of state.roadblocks) {
    for (const car of block.cars) {
      const i = state.cars.indexOf(car);
      if (i !== -1) state.cars.splice(i, 1);
    }
  }
  state.roadblocks = [];
  state.roadblocks.cooldown = 0;
}

/** Killed: the hospital takes a cut and patches the player up. */
function wasted(state, events) {
  const p = state.player;
  const lost = Math.floor(p.money * 0.1);
  p.money -= lost;
  const at = state.city.landmarks.hospital;
  respawn(state, at.x, at.y + 60);
  state.banner = {
    title: 'Wasted',
    sub: lost > 0 ? `The hospital took $${lost}` : 'The hospital patched you up',
    time: 3,
  };
  events.push({ kind: 'wasted', lost });
}

/** Caught: the cops take a cut and drop the player at the station. */
function busted(state, events) {
  const p = state.player;
  const lost = Math.floor(p.money * 0.1);
  p.money -= lost;
  const at = state.city.landmarks.policeHq;
  respawn(state, at.x, at.y + 60);
  state.banner = {
    title: 'Busted',
    sub: lost > 0 ? `The cops took $${lost}` : 'The cops let you go with a warning',
    time: 3,
  };
  events.push({ kind: 'busted', lost });
}

// ------------------------------------------------------------------ the player

/** Fire the held weapon toward the aim. A shot is loud: the heat rises and the street
// clears. */
function doShoot(state, events) {
  const p = state.player;
  if (p.shootCooldown > 0) return;
  if (p.weapon === 'shotgun') {
    if (!p.hasShotgun || p.ammo < SHOTGUN.ammoCost) return;
    p.ammo -= SHOTGUN.ammoCost;
    p.shootCooldown = SHOTGUN_COOLDOWN;
    fireShotgun(state.bullets, p.x, p.y, p.aimAngle, 'player');
    events.push({ kind: 'shot', weapon: 'shotgun' });
  } else {
    if (!p.hasPistol || p.ammo < 1) return;
    p.ammo -= 1;
    p.shootCooldown = PLAYER.pistolCooldown;
    fireBullet(state.bullets, p.x, p.y, p.aimAngle, 'player', PLAYER.pistolDamage);
    events.push({ kind: 'shot', weapon: 'pistol' });
  }
  addHeat(state, WANTED.shoot);
  scareNearby(state.peds, p.x, p.y, 260);
}

/** Step into a car: its driver bails when it has one, and the law notices a steal. */
function enterCar(state, car, events) {
  const p = state.player;
  if (car.kind === 'traffic') {
    scareNearby(state.peds, car.x, car.y, 200);
    addHeat(state, WANTED.stealCar);
    events.push({ kind: 'steal', car });
  } else if (car.kind === 'police') {
    addHeat(state, WANTED.stealCar);
    events.push({ kind: 'steal', car });
  }
  car.kind = 'player';
  car.road = null;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.faceAngle = car.angle;
}

/** Step out beside the car, on the side away from the traffic. */
function exitCar(state) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  const side = { x: Math.cos(car.angle + Math.PI / 2), y: Math.sin(car.angle + Math.PI / 2) };
  p.x = car.x + side.x * EXIT_OFFSET;
  p.y = car.y + side.y * EXIT_OFFSET;
  p.faceAngle = car.angle;
  p.angle = car.angle;
  car.kind = 'parked';
  car.road = null;
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  p.car = null;
  pushOutOfBuildings(state.city, p, PLAYER.radius);
}

/** Hold E beside a car to steal it: the timer runs while E is held and the same car
// stays in reach, and the door opens after the steal time. */
function trySteal(state, input, dt, events) {
  const p = state.player;
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (car.wrecked) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < STEAL_RADIUS + 24 && d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (!best) {
    p.stealTimer = 0;
    p.stealTarget = null;
    return;
  }
  if (p.stealTarget !== best) {
    p.stealTarget = best;
    p.stealTimer = 0;
  }
  p.stealTimer += dt;
  if (p.stealTimer >= CAR.stealTime) {
    enterCar(state, best, events);
    p.stealTimer = 0;
    p.stealTarget = null;
  }
}

/** A fare between two landmarks, priced by how far apart they are. */
function makeFare(state) {
  const keys = Object.keys(state.city.landmarks);
  const from = state.city.landmarks[keys[Math.floor(state.random() * keys.length)]];
  let to = state.city.landmarks[keys[Math.floor(state.random() * keys.length)]];
  while (to === from) to = state.city.landmarks[keys[Math.floor(state.random() * keys.length)]];
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    from: { x: from.x, y: from.y, label: from.label },
    to: { x: to.x, y: to.y, label: to.label },
    price: FARE_BASE + Math.round(dist / 50) * 10,
    pickedUp: false,
  };
}

// ------------------------------------------------------------------ the step

/** Advance the world one fixed step and return the events the frame produced. */
function stepWorld(state, dt, input) {
  const events = [];
  const p = state.player;
  state.time += dt;
  if (p.invulnerable > 0) p.invulnerable -= dt;
  if (p.shootCooldown > 0) p.shootCooldown -= dt;
  if (p.punchCooldown > 0) p.punchCooldown -= dt;
  if (state.heatCooldown > 0) state.heatCooldown -= dt;
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2);
  if (state.banner) {
    state.banner.time -= dt;
    if (state.banner.time <= 0) state.banner = null;
  }
  for (const t of state.toasts) t.time -= dt;
  state.toasts = state.toasts.filter((t) => t.time > 0);
  if (state.missions.messageTime > 0) state.missions.messageTime -= dt;
  state.wantedQuiet += dt;

  // --- the player: drive, or walk, punch, shoot and steal ---
  if (p.car) {
    const car = p.car;
    drivePlayerCar(car, input.steer || 0, input.throttle || 0, input.brake || 0, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.faceAngle = car.angle;
    let hitWall = false;
    for (const axle of carAxles(car)) {
      const body = { x: axle.x, y: axle.y };
      if (pushOutOfBuildings(state.city, body, axle.r)) {
        car.x += body.x - axle.x;
        car.y += body.y - axle.y;
        hitWall = true;
      }
    }
    if (hitWall) {
      car.speed *= 0.85;
      car.vx *= 0.85;
      car.vy *= 0.85;
      if (car.speed > 120) damageCar(car, 1);
    }
    car.x = Math.max(30, Math.min(WORLD.size - 30, car.x));
    car.y = Math.max(30, Math.min(3810, car.y));
    p.x = car.x;
    p.y = car.y;
    for (const ped of state.peds) {
      if (ped.down) continue;
      if (car.speed > 90 && Math.hypot(ped.x - p.x, ped.y - p.y) < 40) {
        ped.down = true;
        ped.downTime = 6;
        addHeat(state, WANTED.hitPed);
        scareNearby(state.peds, ped.x, ped.y, 220);
        events.push({ kind: 'hit-ped', ped, x: ped.x, y: ped.y });
      }
    }
    if (car.wrecked) {
      exitCar(state);
      events.push({ kind: 'car-wrecked' });
    } else if (input.interact) {
      exitCar(state);
    }
    if (input.horn) events.push({ kind: 'horn' });
  } else {
    const mx = input.moveX || 0;
    const my = input.moveY || 0;
    const len = Math.hypot(mx, my);
    if (len > 0.01) {
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const nx = mx / len;
      const ny = my / len;
      p.x += nx * speed * dt;
      p.y += ny * speed * dt;
      p.faceAngle = Math.atan2(ny, nx);
      p.angle = p.faceAngle;
      pushOutOfBuildings(state.city, p, PLAYER.radius);
      p.x = Math.max(16, Math.min(WORLD.size - 16, p.x));
      p.y = Math.max(16, Math.min(WORLD.size - 16, p.y));
    }
    if (input.aimX !== undefined && input.aimY !== undefined) {
      p.aimAngle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    }
    if (input.punch && p.punchCooldown <= 0) {
      p.punchCooldown = PLAYER.punchCooldown;
      const hit = punch(p, p.faceAngle, [...state.peds, ...state.enemies], PLAYER.punchRange, PLAYER.punchDamage);
      if (hit.length > 0) {
        events.push({ kind: 'punch', count: hit.length });
        for (const target of hit) {
          if (target.health === undefined) {
            addHeat(state, WANTED.hitPed);
            scareNearby(state.peds, target.x, target.y, 220);
          }
        }
      }
    }
    if (input.shoot) doShoot(state, events);
    if (input.weapon && p.hasShotgun) {
      p.weapon = p.weapon === 'pistol' ? 'shotgun' : 'pistol';
      events.push({ kind: 'weapon', weapon: p.weapon });
    }
    if (input.interact || input.interactHeld) {
      trySteal(state, input, dt, events);
    } else {
      p.stealTimer = 0;
      p.stealTarget = null;
    }
  }

  // --- the traffic and the street ---
  updateTraffic(state.city, state.cars, dt, state.random);
  updatePedestrians(state.peds, state.city, dt);
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }

  // --- the story ---
  const missionEvents = updateMissions(state, input, dt);
  for (const ev of missionEvents) {
    if (ev.kind === 'mission-complete') {
      state.banner = { title: 'Job Done', sub: `${ev.name} — +$${ev.amount}`, time: 2.5 };
      addToast(state, `${ev.name} — +$${ev.amount}`);
    }
    events.push(ev);
  }

  // --- the police: cars, helicopter, roadblocks ---
  for (let i = state.cops.length - 1; i >= 0; i--) {
    if (state.cops[i].wrecked) state.cops.splice(i, 1);
  }
  const want = wantedCarCount(p.wanted);
  while (state.cops.length < want) {
    const cop = spawnCopCar(state.city, state.random, p.x, p.y);
    if (!cop) break;
    state.cops.push(cop);
    state.cars.push(cop);
  }
  while (state.cops.length > want) {
    const cop = state.cops.pop();
    const i = state.cars.indexOf(cop);
    if (i !== -1) state.cars.splice(i, 1);
  }
  const policeResult = updatePolice(state.city, state.cops, p, p.car, dt);
  if (policeResult === 'busted') {
    busted(state, events);
  } else if (policeResult && policeResult.type === 'ram') {
    state.shake = Math.min(10, state.shake + 3);
    events.push({ kind: 'ram', damage: policeResult.damage });
    if (p.car && p.car.wrecked) {
      exitCar(state);
      events.push({ kind: 'car-wrecked' });
    }
  }
  if (wantedHeli(p.wanted)) {
    if (!state.heli) {
      state.heli = createHeli(p.x, p.y - 200);
      events.push({ kind: 'heli-up' });
    }
    updateHeli(state.heli, p, dt);
  } else if (state.heli) {
    state.heli = null;
    events.push({ kind: 'heli-down' });
  }
  if (updateRoadblocks(state.roadblocks, state.cars, p, p.wanted, dt, state.city, state.random) === 'roadblock') {
    events.push({ kind: 'roadblock' });
    addToast(state, 'Roadblock ahead — smash through or steer around');
  }

  // --- bullets and Vipers ---
  const bulletEvents = updateBullets(state.bullets, state.city, state.cars, state.peds, state.enemies, p, dt);
  for (const ev of bulletEvents) {
    if (ev.kind === 'hit-player') {
      damagePlayer(state, ev.damage, events);
    } else if (ev.kind === 'hit-ped') {
      addHeat(state, WANTED.hitPed);
      scareNearby(state.peds, ev.x, ev.y, 220);
    } else if (ev.kind === 'enemy-down') {
      p.money += 25;
      state.stats.earned += 25;
      events.push({ kind: 'enemy-down', enemy: ev.enemy });
    } else if (ev.kind === 'hit-car' && ev.car.kind === 'police' && ev.car.wrecked) {
      addHeat(state, WANTED.killCop);
      events.push({ kind: 'cop-down' });
    }
    if (ev.kind === 'spark' || ev.kind === 'hit-car' || ev.kind === 'hit-enemy') {
      addParticle(state, ev.x, ev.y);
    }
    events.push(ev);
  }
  updateEnemies(state.enemies, p, state.city, state.bullets, dt, state.random, (dmg) => damagePlayer(state, dmg, events));

  // --- the repeatable work: races, deliveries, fares ---
  const raceEvents = updateRace(state.race, { x: p.x, y: p.y }, dt);
  for (const ev of raceEvents) {
    if (ev.kind === 'race-checkpoint') {
      addToast(state, `Checkpoint — ${ev.left} to go`);
    } else if (ev.kind === 'race-won') {
      const isStoryRace = state.missions.index === 6 && state.missions.step === 1;
      if (!isStoryRace) {
        p.money += ev.amount;
        state.stats.earned += ev.amount;
      }
      state.banner = { title: 'Race Won', sub: `+$${ev.amount}`, time: 2.5 };
      addToast(state, `Race won — +$${ev.amount}`);
    } else if (ev.kind === 'race-lost') {
      addToast(state, 'Race lost — the clock ran out');
    }
    events.push(ev);
  }
  state.raceMarker = raceTarget(state.race);
  if (state.missions.index >= 10 && !state.race.active && p.car) {
    const gate = state.city.landmarks.raceGate;
    if (Math.hypot(p.x - gate.x, p.y - gate.y) < 140) {
      startRace(state.race, state.city, state.random);
      addToast(state, 'Race! Four checkpoints — beat the clock');
      events.push({ kind: 'race-start' });
    }
  }
  if (state.missions.index >= 10) {
    if (!state.delivery) {
      state.deliveryCooldown -= dt;
      if (state.deliveryCooldown <= 0) {
        state.delivery = offerDelivery(state.city, state.random);
        state.deliveryCooldown = 45;
        addToast(state, `Delivery — pick up at ${state.delivery.from.label}`);
      }
    }
  }
  if (state.delivery) {
    const dctx = { x: p.x, y: p.y, interact: !!input.interact, deliveryPaid: 0 };
    const dev = updateDelivery(state.delivery, dctx, dt);
    if (dev) {
      if (dev.kind === 'delivery-picked') {
        addToast(state, `Deliver to ${dev.label}`);
      } else if (dev.kind === 'delivery-done') {
        p.money += dev.amount;
        state.stats.earned += dev.amount;
        addToast(state, `Delivery done — +$${dev.amount}`);
        state.delivery = null;
        state.deliveryCooldown = 30;
      } else if (dev.kind === 'delivery-lost') {
        addToast(state, 'Delivery lost — too slow');
        state.delivery = null;
        state.deliveryCooldown = 30;
      }
      events.push(dev);
    }
  }
  if (state.missions.index >= 10) {
    const m = state.missions;
    if (!m.fare) {
      state.fareCooldown -= dt;
      if (state.fareCooldown <= 0 && p.car) m.fare = makeFare(state);
    }
    if (m.fare) {
      const fare = m.fare;
      if (!fare.pickedUp) {
        if (Math.hypot(p.x - fare.from.x, p.y - fare.from.y) < 70) {
          fare.pickedUp = true;
          addToast(state, `Fare aboard — take them to ${fare.to.label}`);
          events.push({ kind: 'fare-picked', to: fare.to.label });
        }
      } else if (Math.hypot(p.x - fare.to.x, p.y - fare.to.y) < 80) {
        p.money += fare.price;
        state.stats.earned += fare.price;
        addToast(state, `Fare paid — +$${fare.price}`);
        events.push({ kind: 'fare-done', amount: fare.price });
        m.fare = null;
        state.fareCooldown = 20;
      }
    }
  }

  // --- pickups and hidden packages ---
  for (const pickup of state.pickups) {
    if (pickup.taken) continue;
    if (Math.hypot(p.x - pickup.x, p.y - pickup.y) < 34) {
      pickup.taken = true;
      if (pickup.kind === 'health') {
        p.health = Math.min(PLAYER.health, p.health + PICKUP_VALUE.health);
      } else if (pickup.kind === 'ammo') {
        p.ammo = Math.min(PLAYER.maxAmmo, p.ammo + PICKUP_VALUE.ammo);
      } else {
        p.money += PICKUP_VALUE.cash;
        state.stats.earned += PICKUP_VALUE.cash;
      }
      events.push({ kind: 'pickup', pickup: pickup.kind });
    }
  }
  const found = collectibleNear(state.collectibles, p.x, p.y);
  if (found) {
    const amount = PACKAGE_VALUE + found.bonus;
    p.money += amount;
    state.stats.earned += amount;
    addToast(
      state,
      found.bonus > 0
        ? `All twelve packages — set bonus +$${found.bonus}`
        : `Hidden package ${found.found} of ${found.total} — +$${PACKAGE_VALUE}`,
    );
    events.push({ kind: 'collectible', index: found.index, found: found.found, total: found.total, amount });
  }

  // --- the heat cools, the camera follows ---
  if (p.wanted > 0 && state.wantedQuiet >= WANTED.decayDelay) {
    p.wanted -= 1;
    state.wantedQuiet = WANTED.decayDelay - WANTED.decayStep;
  }
  const targetZoom = p.car ? VIEW.zoomCar : VIEW.zoomFoot;
  state.camera.zoom += (targetZoom - state.camera.zoom) * Math.min(1, dt * 3);
  state.camera.x += (p.x - state.camera.x) * Math.min(1, dt * 5);
  state.camera.y += (p.y - state.camera.y) * Math.min(1, dt * 5);
  return events;
}

// ------------------------------------------------------------------ save and load

/** The save: everything a fresh world needs to pick up where this one left off. */
function serializeState(state) {
  const p = state.player;
  return {
    seed: state.seed,
    money: p.money,
    missionIndex: state.missions.index,
    missionStep: state.missions.step,
    health: p.health,
    x: p.x,
    y: p.y,
    hasPistol: p.hasPistol,
    hasShotgun: p.hasShotgun,
    weapon: p.weapon,
    ammo: p.ammo,
    safehouseOwned: state.safehouseOwned,
    collectiblesTaken: state.collectibles.filter((c) => c.taken).map((c) => c.index),
    raceLaps: state.missions.raceLaps,
    time: state.time,
    earned: state.stats.earned,
  };
}

/** Load a save into a fresh world of the same seed. */
function deserializeState(world, data) {
  const state = freshState(data.seed ?? world.seed);
  const p = state.player;
  p.money = data.money ?? 0;
  p.health = data.health ?? PLAYER.health;
  p.x = data.x ?? state.city.landmarks.garage.x;
  p.y = data.y ?? state.city.landmarks.garage.y + 60;
  p.hasPistol = data.hasPistol ?? true;
  p.hasShotgun = data.hasShotgun ?? false;
  p.weapon = data.weapon ?? 'pistol';
  p.ammo = data.ammo ?? PLAYER.startAmmo;
  state.safehouseOwned = data.safehouseOwned ?? false;
  state.missions.index = data.missionIndex ?? 0;
  state.missions.step = data.missionStep ?? 0;
  state.missions.raceLaps = data.raceLaps ?? 0;
  state.missions.setup = '';
  state.time = data.time ?? 0;
  state.stats.earned = data.earned ?? 0;
  if (Array.isArray(data.collectiblesTaken)) {
    for (const i of data.collectiblesTaken) {
      const item = state.collectibles[i];
      if (item) item.taken = true;
    }
  }
  state.camera.x = p.x;
  state.camera.y = p.y;
  world.state = state;
}

// ------------------------------------------------------------------ the world

/** A world for a seed: the state and the verbs that move it. */
export function createWorld(seed = 11) {
  const world = {
    seed,
    state: null,
    reset() {
      // Reset the state object in place, never replace it: callers capture
      // world.state in a local first (the main loop, the staged shots) and
      // keep using that reference across a reset. Swapping in a fresh object
      // orphaned those references — their player.car stayed null and the
      // staged shots crashed reading its angle.
      const next = freshState(seed);
      if (!world.state) {
        world.state = next;
        return;
      }
      for (const key of Object.keys(world.state)) {
        if (!(key in next)) delete world.state[key];
      }
      for (const key of Object.keys(next)) {
        world.state[key] = next[key];
      }
    },
    step(dt, input) {
      return stepWorld(world.state, dt, input || {});
    },
    setWanted(n) {
      const s = world.state;
      s.player.wanted = Math.max(0, Math.min(WANTED.max, n));
      s.wantedQuiet = 0;
    },
    giveCar(type, x, y, angle) {
      const s = world.state;
      const p = s.player;
      if (p.car) {
        p.car.kind = 'parked';
        p.car.road = null;
        p.car = null;
      }
      const car = createCar(s.random, x, y, angle, type, 'player');
      s.cars.push(car);
      p.car = car;
      p.x = x;
      p.y = y;
      p.angle = angle;
      p.faceAngle = angle;
      return car;
    },
    spawnCopsNow(n) {
      const s = world.state;
      for (let i = 0; i < n; i++) {
        const cop = spawnCopCar(s.city, s.random, s.player.x, s.player.y);
        if (!cop) break;
        s.cops.push(cop);
        s.cars.push(cop);
      }
    },
    placePlayer(x, y) {
      const s = world.state;
      const p = s.player;
      if (p.car) {
        p.car.kind = 'parked';
        p.car.road = null;
        p.car = null;
      }
      p.x = x;
      p.y = y;
    },
    serialize() {
      return serializeState(world.state);
    },
    deserialize(data) {
      deserializeState(world, data);
    },
  };
  world.reset();
  return world;
}
