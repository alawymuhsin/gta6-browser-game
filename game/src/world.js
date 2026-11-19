// The world: everything the game simulates. The city, the player, the traffic,
// the cops and the helicopter, the race, the fares and deliveries, and the ten
// missions for Maya. One fixed step of 1/60 s at a time; the browser's loop calls
// step() and the renderer paints whatever is in state afterwards.
//
// reset() keeps the state object itself — it mutates the old one in place. The
// staged screenshots and the restart button both hold a reference to it, so
// replacing it would leave them pointing at a dead world.

import { buildCity, landmark, pushOutOfBuildings } from './city.js';
import { CAR, PLAYER, RACE, SHOTGUN, STEP, VIEW, WANTED, WORLD } from './config.js';
import { createRandom } from './random.js';
import { createCar, drivePlayerCar, spawnTraffic, updateTraffic } from './vehicles.js';
import { scareNearby, spawnPedestrians, updatePedestrians } from './pedestrians.js';
import { createHeli, spawnCopCar, updateHeli, updatePolice, updateRoadblocks, wantedCarCount, wantedHeli } from './police.js';
import { createEnemy, fireBullet, fireShotgun, punch, updateBullets, updateEnemies } from './combat.js';
import { createCollectibles, collectibleNear, createRaceState, offerDelivery, raceTarget, startRace, updateDelivery, updateRace } from './activities.js';
import { MISSIONS, createMissions, offerFare } from './missions.js';

/** The six pickups on the map: health, ammo, and cash at the big landmarks. */
function spawnPickups(city) {
  const spots = [
    { key: 'hospital', kind: 'health' },
    { key: 'policeHq', kind: 'ammo' },
    { key: 'diner', kind: 'health' },
    { key: 'market', kind: 'ammo' },
    { key: 'port', kind: 'cash' },
    { key: 'raceGate', kind: 'cash' },
  ];
  // A hundred units down the road from the landmark, so a player who teleports to
  // the landmark itself — or steps out of a car beside it — does not scoop it up
  // by accident.
  return spots.map(({ key, kind }) => {
    const spot = landmark(city, key);
    return { x: spot.x + 100, y: spot.y, kind, taken: false };
  });
}

/** A fresh state for a seed: the city, the traffic, the peds, and Maya waiting. */
function freshState(seed) {
  const city = buildCity(seed);
  const random = createRandom(seed + 77);
  const cars = spawnTraffic(city, random);
  const peds = spawnPedestrians(city, random);
  return {
    seed,
    city,
    random,
    frames: 0,
    time: 0,
    player: {
      x: 512, y: 572, faceAngle: 0, aimAngle: 0, angle: 0,
      money: 0, health: 100, wanted: 0,
      ammo: PLAYER.startAmmo, hasPistol: true, hasShotgun: false, weapon: 'pistol',
      car: null, invulnerable: 0, punchCooldown: 0, shootCooldown: 0,
      stealProgress: 0, stealTarget: null,
    },
    missions: createMissions(),
    race: createRaceState(),
    raceMarker: null,
    camera: { x: 512, y: 572, zoom: VIEW.zoomFoot },
    cars, cops: [], peds, enemies: [], bullets: [], particles: [],
    pickups: spawnPickups(city),
    collectibles: createCollectibles(),
    roadblocks: [],
    heli: null,
    delivery: null,
    toasts: [], banner: null, shake: 0,
    stats: { earned: 0 },
    safehouseOwned: false,
    wantedQuiet: 0, wantedDecay: 0, crashCooldown: 0,
    fareCooldown: 20, deliveryCooldown: 30,
  };
}

function payPlayer(state, amount) {
  state.player.money += amount;
  state.stats.earned += amount;
}

function setMessage(state, text) {
  state.missions.message = text;
  state.missions.messageTime = 6;
}

function setWantedLevel(state, level) {
  state.player.wanted = Math.max(0, Math.min(WANTED.max, level));
  state.wantedQuiet = 0;
  state.wantedDecay = 0;
}

function addWanted(state, amount) {
  setWantedLevel(state, state.player.wanted + amount);
}

function addParticles(state, x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    const angle = state.random() * Math.PI * 2;
    const speed = 40 + state.random() * 120;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + state.random() * 0.3,
      color,
    });
  }
}

/** The player is hurt. A short grace window, then Wasted at the hospital. */
function damagePlayer(state, damage, events) {
  const player = state.player;
  if (player.invulnerable > 0) return;
  player.health -= damage;
  player.invulnerable = 0.8;
  state.shake = Math.max(state.shake, 6);
  if (player.health > 0) return;
  player.health = 100;
  player.invulnerable = 2;
  player.money = Math.max(0, player.money - 250);
  player.wanted = 0;
  state.wantedQuiet = 0;
  if (player.car) {
    player.car.kind = 'parked';
    player.car = null;
  }
  const hospital = landmark(state.city, 'hospital');
  player.x = hospital.x;
  player.y = hospital.y;
  player.faceAngle = 0;
  state.cops.length = 0;
  state.banner = { title: 'Wasted', sub: 'Maya covers the hospital bill — $250', time: 3 };
  events.push({ kind: 'wasted' });
}

/** Get out of a car, on the pavement beside it. */
function leaveCar(state) {
  const player = state.player;
  const car = player.car;
  if (!car) return;
  car.kind = 'parked';
  player.car = null;
  player.x = car.x + 40;
  player.y = car.y;
  player.faceAngle = car.angle;
  pushOutOfBuildings(state.city, player, PLAYER.radius);
}

/** Get in a car. Stealing one brings the heat; taking the van is the job. */
function enterCar(state, car, events) {
  const player = state.player;
  car.kind = 'player';
  car.road = null;
  player.car = car;
  player.x = car.x;
  player.y = car.y;
  player.stealProgress = 0;
  player.stealTarget = null;
  if (!car.missionVan) {
    addWanted(state, WANTED.stealCar);
    events.push({ kind: 'steal' });
  }
  scareNearby(state.peds, car.x, car.y, 200);
}

/** One frame of the simulation. The input is a plain snapshot; events come back in the array. */
function stepWorld(state, dt, input, events) {
  const player = state.player;
  const city = state.city;

  // The clock counts frames, not added-up fractions: frames * STEP is exactly 1
  // after a second and exactly 300 after a day, where adding 1/60 sixty times is not.
  state.frames += 1;
  state.time = state.frames * STEP;
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  state.crashCooldown = Math.max(0, state.crashCooldown - dt);
  if (state.missions.messageTime > 0) state.missions.messageTime -= dt;

  // The story's setups happen first, so a job's enemies and vans exist before the
  // rest of the frame runs. The advance checks run last, so a job can complete in
  // the same step its condition is met.
  updateStorySetup(state);

  // --- The player ------------------------------------------------------------
  if (player.car) {
    const car = player.car;
    drivePlayerCar(car, input.steer || 0, input.throttle || 0, input.brake || 0, dt);
    const body = { x: car.x, y: car.y };
    if (pushOutOfBuildings(city, body, 13)) {
      car.x = body.x;
      car.y = body.y;
      car.speed *= 0.5;
    }
    car.x = Math.max(30, Math.min(city.size - 30, car.x));
    car.y = Math.max(30, Math.min(3810, car.y));
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.faceAngle = car.angle;
    // A shunt: the other car takes a knock and swerves off.
    for (const other of state.cars) {
      if (other === car || other.kind === 'parked' || other.wrecked) continue;
      if (Math.hypot(other.x - car.x, other.y - car.y) < 40) {
        other.x += (other.x - car.x) * 0.15;
        other.y += (other.y - car.y) * 0.15;
        car.speed *= 0.9;
        state.shake = Math.max(state.shake, 4);
        if (state.crashCooldown <= 0) {
          state.crashCooldown = 0.5;
          events.push({ kind: 'crash' });
        }
      }
    }
    // Hit-and-run: running someone over is a crime, and worse when a cop sees it.
    for (const ped of state.peds) {
      if (ped.down) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 30) {
        ped.down = true;
        ped.downTime = 6;
        addWanted(state, WANTED.hitPed);
        // Worse when a cop sees it happen.
        if (state.cops.some((cop) => Math.hypot(cop.x - player.x, cop.y - player.y) < 500)) {
          addWanted(state, 1);
        }
        scareNearby(state.peds, ped.x, ped.y, 200);
        addParticles(state, ped.x, ped.y, 6, '#ffd24a');
        events.push({ kind: 'hit-ped' });
      }
    }
  } else {
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let mx = input.moveX || 0;
    let my = input.moveY || 0;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    player.x += mx * speed * dt;
    player.y += my * speed * dt;
    if (len > 0.1) player.faceAngle = Math.atan2(my, mx);
    player.angle = player.faceAngle;
    pushOutOfBuildings(city, player, PLAYER.radius);
    player.x = Math.max(20, Math.min(city.size - 20, player.x));
    player.y = Math.max(20, Math.min(3800, player.y));
    // Stealing: hold E near a car for 0.6 s.
    let target = null;
    let best = 64;
    for (const c of state.cars) {
      if (c.kind !== 'parked' && c.kind !== 'traffic') continue;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d < best) {
        best = d;
        target = c;
      }
    }
    if (target && input.interactHeld) {
      player.stealProgress += dt;
      player.stealTarget = target;
      if (player.stealProgress >= CAR.stealTime) enterCar(state, target, events);
    } else {
      player.stealProgress = 0;
      player.stealTarget = null;
    }
  }

  // Getting out, and saving at the Safehouse, are the E key's other jobs.
  if (player.car && input.interact) {
    leaveCar(state);
  } else if (!player.car && state.safehouseOwned && input.interact) {
    const safehouse = landmark(city, 'safehouse');
    if (Math.hypot(player.x - safehouse.x, player.y - safehouse.y) < 80) {
      player.health = 100;
      state.toasts.push({ text: 'Saved at the Safehouse', time: 2 });
      events.push({ kind: 'save' });
    }
  }

  // --- Fighting ---------------------------------------------------------------
  if (!player.car && input.punch && player.punchCooldown <= 0) {
    player.punchCooldown = PLAYER.punchCooldown;
    const hit = punch(player, player.faceAngle, [...state.enemies, ...state.peds], PLAYER.punchRange, PLAYER.punchDamage);
    if (hit.length > 0) {
      events.push({ kind: 'punch' });
      for (const target of hit) {
        if (target.kind === 'civilian' || target.kind === 'gang') addWanted(state, WANTED.hitPed);
      }
      scareNearby(state.peds, player.x, player.y, 200);
    }
  }
  if (input.shoot && player.shootCooldown <= 0 && player.hasPistol && player.ammo > 0) {
    const angle = Math.atan2((input.aimY ?? player.y) - player.y, (input.aimX ?? player.x) - player.x);
    player.aimAngle = angle;
    player.faceAngle = angle;
    if (player.weapon === 'shotgun' && player.hasShotgun) {
      fireShotgun(state.bullets, player.x, player.y, angle, 'player');
      player.ammo = Math.max(0, player.ammo - SHOTGUN.ammoCost);
      player.shootCooldown = 0.5;
      events.push({ kind: 'shot', weapon: 'shotgun' });
    } else {
      fireBullet(state.bullets, player.x, player.y, angle, 'player', PLAYER.pistolDamage);
      player.ammo -= 1;
      player.shootCooldown = PLAYER.pistolCooldown;
      events.push({ kind: 'shot', weapon: 'pistol' });
    }
    if (state.cops.some((cop) => Math.hypot(cop.x - player.x, cop.y - player.y) < 600)) {
      addWanted(state, WANTED.shoot);
    }
    scareNearby(state.peds, player.x, player.y, 260);
  }
  if (input.weapon && player.hasShotgun) {
    player.weapon = player.weapon === 'shotgun' ? 'pistol' : 'shotgun';
    events.push({ kind: 'click' });
  }
  if (input.horn) events.push({ kind: 'horn' });

  // --- Bullets ----------------------------------------------------------------
  const bulletEvents = updateBullets(
    state.bullets, city,
    [...state.cars, ...state.cops],
    state.peds, state.enemies, player, dt,
  );
  for (const ev of bulletEvents) {
    if (ev.kind === 'hit-player') damagePlayer(state, ev.damage, events);
    else if (ev.kind === 'hit-car' && ev.car.kind === 'police' && ev.car.wrecked) addWanted(state, WANTED.killCop);
    else if (ev.kind === 'hit-ped') addWanted(state, WANTED.hitPed);
    else if (ev.kind === 'spark') addParticles(state, ev.x, ev.y, 4, '#ffe9a8');
    else if (ev.kind === 'enemy-down') events.push({ kind: 'enemy-down' });
  }
  if (player.car && player.car.wrecked) {
    const car = player.car;
    car.kind = 'parked';
    player.car = null;
    damagePlayer(state, 15, events);
    state.shake = 8;
    events.push({ kind: 'crash' });
  }
  state.cops = state.cops.filter((cop) => !cop.wrecked);

  // --- The rest of the city ----------------------------------------------------
  updateEnemies(state.enemies, player, city, state.bullets, dt, state.random, (damage) => damagePlayer(state, damage, events));
  updateTraffic(city, state.cars, dt, state.random);
  updatePedestrians(state.peds, city, dt);

  const policeResult = updatePolice(city, state.cops, player, player.car, dt);
  if (policeResult === 'busted') {
    state.banner = { title: 'Busted', sub: 'The cops took you in — $200 fine', time: 3 };
    player.money = Math.max(0, player.money - 200);
    player.wanted = 0;
    player.health = 100;
    player.invulnerable = 2;
    if (player.car) {
      player.car.kind = 'parked';
      player.car = null;
    }
    player.x = 512;
    player.y = 572;
    state.cops.length = 0;
    events.push({ kind: 'busted' });
  } else if (policeResult && policeResult.type === 'ram') {
    state.shake = Math.max(state.shake, 5);
    events.push({ kind: 'ram', damage: policeResult.damage });
    if (player.car && player.car.wrecked) {
      player.car.kind = 'parked';
      player.car = null;
      damagePlayer(state, 10, events);
      state.shake = 8;
    }
  }

  if (wantedHeli(player.wanted)) {
    if (!state.heli) state.heli = createHeli(player.x - 200, player.y - 200);
    updateHeli(state.heli, player, dt);
  } else {
    state.heli = null;
  }

  const roadblockEvent = updateRoadblocks(state.roadblocks, state.cars, player, player.wanted, dt, city, state.random);
  if (roadblockEvent === 'roadblock') events.push({ kind: 'roadblock' });

  // The cop count follows the wanted level: two new ones a frame, excess ones drive off.
  const want = wantedCarCount(player.wanted);
  let spawned = 0;
  while (state.cops.length < want && spawned < 2) {
    const cop = spawnCopCar(city, state.random, player.x, player.y);
    if (!cop) break;
    state.cops.push(cop);
    spawned += 1;
  }
  if (state.cops.length > want) {
    state.cops.sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
    state.cops.length = want;
  }

  // --- The race -----------------------------------------------------------------
  const raceEvents = updateRace(state.race, { x: player.x, y: player.y }, dt);
  for (const ev of raceEvents) {
    if (ev.kind === 'race-checkpoint') {
      state.toasts.push({ text: `Checkpoint — ${ev.left} left`, time: 2 });
      events.push(ev);
    } else if (ev.kind === 'race-won') {
      payPlayer(state, RACE.reward);
      state.toasts.push({ text: `Race won — +$${RACE.reward}`, time: 3 });
      events.push(ev);
    } else if (ev.kind === 'race-lost') {
      state.toasts.push({ text: 'Race lost — the clock ran out', time: 3 });
      events.push(ev);
    }
  }
  state.raceMarker = raceTarget(state.race);
  state.missions.raceTarget = state.raceMarker;

  // --- Deliveries and fares ------------------------------------------------------
  if (state.delivery) {
    const ctx = { x: player.x, y: player.y, interact: !!input.interact, deliveryPaid: 0 };
    const dev = updateDelivery(state.delivery, ctx, dt);
    if (dev) {
      if (dev.kind === 'delivery-picked') {
        // The package goes on foot: step out of the car.
        if (player.car) {
          player.car.kind = 'parked';
          player.car = null;
        }
        state.toasts.push({ text: `Deliver to ${dev.label} — ${dev.seconds}s`, time: 3 });
        events.push(dev);
      } else if (dev.kind === 'delivery-done') {
        payPlayer(state, dev.amount);
        state.delivery = null;
        state.toasts.push({ text: `Delivery done — +$${dev.amount}`, time: 3 });
        events.push(dev);
      } else if (dev.kind === 'delivery-lost') {
        state.delivery = null;
        state.toasts.push({ text: 'Delivery lost — too slow', time: 3 });
        events.push(dev);
      }
    }
  }
  const fare = state.missions.fare;
  if (fare) {
    if (!fare.pickedUp && player.car && Math.hypot(player.x - fare.from.x, player.y - fare.from.y) < 90) {
      fare.pickedUp = true;
      state.toasts.push({ text: `Fare to ${fare.to.label}`, time: 3 });
      events.push({ kind: 'fare-picked', label: fare.to.label });
    } else if (fare.pickedUp && Math.hypot(player.x - fare.to.x, player.y - fare.to.y) < 100) {
      payPlayer(state, fare.price);
      state.missions.fare = null;
      state.toasts.push({ text: `Fare paid — +$${fare.price}`, time: 3 });
      events.push({ kind: 'fare-done', amount: fare.price });
    }
  }

  // --- Pickups and hidden packages ----------------------------------------------
  for (const pickup of state.pickups) {
    if (pickup.taken) continue;
    if (Math.hypot(player.x - pickup.x, player.y - pickup.y) < 30) {
      pickup.taken = true;
      if (pickup.kind === 'health') {
        player.health = Math.min(100, player.health + 50);
        state.toasts.push({ text: 'Health +50', time: 2 });
      } else if (pickup.kind === 'ammo') {
        player.ammo = Math.min(PLAYER.maxAmmo, player.ammo + 24);
        state.toasts.push({ text: 'Ammo +24', time: 2 });
      } else {
        payPlayer(state, 100);
        state.toasts.push({ text: 'Cash +$100', time: 2 });
      }
      events.push({ kind: 'pickup', pickup: pickup.kind });
    }
  }
  const found = collectibleNear(state.collectibles, player.x, player.y);
  if (found) {
    const amount = 100 + (found.bonus || 0);
    payPlayer(state, amount);
    state.toasts.push({
      text: found.bonus
        ? `Hidden package ${found.found}/12 — +$${amount} (set bonus!)`
        : `Hidden package ${found.found}/12 — +$${amount}`,
      time: 3,
    });
    events.push({ kind: 'collectible', found: found.found, bonus: found.bonus, amount });
  }

  // --- The heat cools -------------------------------------------------------------
  if (player.wanted > 0) {
    state.wantedQuiet += dt;
    if (state.wantedQuiet > WANTED.decayDelay) {
      state.wantedDecay += dt;
      if (state.wantedDecay >= WANTED.decayStep) {
        state.wantedDecay = 0;
        player.wanted -= 1;
        if (player.wanted === 0) state.wantedQuiet = 0;
      }
    }
  }

  // --- Camera and the day's little decays -----------------------------------------
  const cam = state.camera;
  const targetZoom = player.car ? VIEW.zoomCar : VIEW.zoomFoot;
  cam.zoom += (targetZoom - cam.zoom) * Math.min(1, 3 * dt);
  cam.x += (player.x - cam.x) * Math.min(1, 5 * dt);
  cam.y += (player.y - cam.y) * Math.min(1, 5 * dt);

  state.toasts = state.toasts.filter((toast) => (toast.time -= dt) > 0);
  if (state.banner) {
    state.banner.time -= dt;
    if (state.banner.time <= 0) state.banner = null;
  }
  state.shake = Math.max(0, state.shake - dt * 20);
  for (const particle of state.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);

  // The story's advance checks run last, so a job can complete in the same step
  // its condition is met.
  updateStoryAdvance(state, dt, input, events);
}

/** Run once when a job (or a job step) starts: spawn its enemies, park its van, set its heat. */
function updateStorySetup(state) {
  const m = state.missions;
  if (!m.active) {
    // After the story: fares and deliveries keep coming, on a timer.
    if (!m.fare) {
      state.fareCooldown -= 1 / 60;
      if (state.fareCooldown <= 0) {
        m.fare = offerFare(state.city, state.random);
        state.fareCooldown = 30;
      }
    }
    if (!state.delivery) {
      state.deliveryCooldown -= 1 / 60;
      if (state.deliveryCooldown <= 0) {
        state.delivery = offerDelivery(state.city, state.random);
        state.deliveryCooldown = 45;
      }
    }
    return;
  }
  const key = `${m.index}:${m.step}`;
  if (m.setup === key) return;
  const prevIndex = m.setup ? Number(m.setup.split(':')[0]) : -1;
  m.setup = key;
  const job = MISSIONS[m.index];
  if (!job) return;
  // A new job gets its briefing; a new step inside a job keeps the message the
  // advance set for that step.
  if (m.index !== prevIndex) setMessage(state, job.briefing);
  const city = state.city;
  // Spawn a crew on the road through a landmark: four spots along it, the first
  // an enforcer when the job wants one. A crew that is already there (a staged
  // scene placed its own) is left alone.
  const spawnCrew = (x, y, count, enforcers) => {
    const live = state.enemies.filter((e) => !e.down).length;
    if (live > 0) {
      m.spawned = live;
      return;
    }
    const spots = [-150, -50, 50, 150];
    for (let i = 0; i < count; i += 1) {
      const kind = i < enforcers ? 'enforcer' : 'viper';
      state.enemies.push(createEnemy(state.random, x + spots[i], y, kind));
    }
    m.spawned = count;
  };
  switch (m.index) {
    case 2:
      spawnCrew(3584, 2560, 4, 0);
      break;
    case 3:
      setWantedLevel(state, 3);
      break;
    case 5: {
      if (!state.cars.some((c) => c.missionVan)) {
        const spot = landmark(city, 'observatory');
        const van = createCar(state.random, spot.x, spot.y, 0, 'van', 'parked');
        van.missionVan = true;
        state.cars.push(van);
      }
      break;
    }
    case 6:
      startRace(state.race, city, state.random);
      m.raceStarted = true;
      m.raceLaps = state.race.laps;
      m.raceTarget = raceTarget(state.race);
      state.raceMarker = m.raceTarget;
      break;
    case 7:
      spawnCrew(3072, 2048, 4, 1);
      break;
    case 8:
      setWantedLevel(state, 4);
      m.surviveTime = 0;
      break;
    case 9:
      if (m.step === 1) spawnCrew(2560, 3584, 4, 1);
      break;
    default:
      break;
  }
}

/** Pay out, banner it, and move the story to the next job. */
function completeMission(state, index, events) {
  const m = state.missions;
  const job = MISSIONS[index];
  payPlayer(state, job.pay);
  state.banner = { title: job.name, sub: `+$${job.pay}`, time: 3 };
  state.toasts.push({ text: `${job.name} — +$${job.pay}`, time: 3 });
  events.push({ kind: 'mission-done', name: job.name, amount: job.pay });
  m.index = index + 1;
  m.step = 0;
  m.setup = '';
  m.spawned = 0;
  m.holdTime = 0;
  m.surviveTime = 0;
  if (m.index >= MISSIONS.length) {
    m.active = false;
    state.banner = { title: 'The city is yours', sub: 'Race, deliver, collect — Solara Bay is open', time: 5 };
    setMessage(state, 'The city is yours.');
  } else {
    setMessage(state, MISSIONS[m.index].briefing);
  }
}

/** The advance checks: has the player done what the current job step asks? */
function updateStoryAdvance(state, dt, input, events) {
  const m = state.missions;
  if (!m.active) return;
  const player = state.player;
  const near = (x, y, r) => Math.hypot(player.x - x, player.y - y) < r;
  const liveEnemies = () => state.enemies.filter((e) => !e.down).length;
  switch (m.index) {
    case 0:
      if (player.car) completeMission(state, 0, events);
      break;
    case 1: {
      if (m.step === 0) {
        const diner = landmark(state.city, 'diner');
        if (near(diner.x, diner.y, 90) && input.interact) {
          m.step = 1;
          m.setup = '';
          setMessage(state, 'Deliver the package to the Bank.');
        }
      } else {
        const bank = landmark(state.city, 'bank');
        if (near(bank.x, bank.y, 90)) completeMission(state, 1, events);
      }
      break;
    }
    case 2:
      if (m.spawned > 0 && liveEnemies() === 0) completeMission(state, 2, events);
      break;
    case 3:
      if (player.wanted === 0) completeMission(state, 3, events);
      break;
    case 4: {
      if (m.step === 0) {
        const bank = landmark(state.city, 'bank');
        if (near(bank.x, bank.y, 90) && input.interactHeld) {
          m.holdTime += dt;
          if (m.holdTime >= 3) {
            m.step = 1;
            m.setup = '';
            m.holdTime = 0;
            setMessage(state, 'Run the bag to the Garage.');
          }
        } else {
          m.holdTime = 0;
        }
      } else {
        const garage = landmark(state.city, 'garage');
        if (near(garage.x, garage.y, 120)) completeMission(state, 4, events);
      }
      break;
    }
    case 5: {
      const van = state.cars.find((c) => c.missionVan);
      if (m.step === 0) {
        if (van && player.car === van) {
          m.step = 1;
          m.setup = '';
          setMessage(state, 'Drive the van to the Garage.');
        }
      } else {
        const garage = landmark(state.city, 'garage');
        if (van && player.car === van && near(garage.x, garage.y, 120)) completeMission(state, 5, events);
      }
      break;
    }
    case 6:
      if (m.raceStarted && !state.race.active && state.race.laps === m.raceLaps) {
        // The clock ran out: run it back.
        startRace(state.race, state.city, state.random);
        state.toasts.push({ text: 'The Grand Prix is on again', time: 3 });
      }
      if (state.race.laps > m.raceLaps) completeMission(state, 6, events);
      break;
    case 7:
      if (m.spawned > 0 && liveEnemies() === 0) {
        state.safehouseOwned = true;
        state.player.hasShotgun = true;
        completeMission(state, 7, events);
      }
      break;
    case 8:
      // The heat never cools while the helicopter is up.
      state.wantedQuiet = 0;
      if (player.wanted < 4) setWantedLevel(state, 4);
      m.surviveTime += dt;
      if (m.surviveTime >= 75) completeMission(state, 8, events);
      break;
    case 9: {
      if (m.step === 0) {
        const port = landmark(state.city, 'port');
        if (near(port.x, port.y, 120)) {
          m.step = 1;
          m.setup = '';
        }
      } else if (m.step === 1) {
        if (m.spawned > 0 && liveEnemies() === 0) {
          m.step = 2;
          m.setup = '';
          setMessage(state, 'Get away — reach the Garage.');
        }
      } else {
        const garage = landmark(state.city, 'garage');
        if (near(garage.x, garage.y, 120)) completeMission(state, 9, events);
      }
      break;
    }
    default:
      break;
  }
  // A step that just changed gets its setup in this same step, so its enemies,
  // its van, or its heat exist the moment the step begins.
  if (m.setup !== `${m.index}:${m.step}`) updateStorySetup(state);
}

/** The save: the seed plus everything a fresh state would not know. */
function serializeState(state) {
  return JSON.stringify({
    seed: state.seed,
    frames: state.frames,
    time: state.time,
    player: {
      x: state.player.x, y: state.player.y, faceAngle: state.player.faceAngle,
      money: state.player.money, health: state.player.health, wanted: state.player.wanted,
      ammo: state.player.ammo, hasPistol: state.player.hasPistol, hasShotgun: state.player.hasShotgun,
      weapon: state.player.weapon,
    },
    missions: {
      index: state.missions.index, step: state.missions.step, setup: state.missions.setup,
      active: state.missions.active, message: state.missions.message, messageTime: state.missions.messageTime,
      fare: state.missions.fare, raceLaps: state.missions.raceLaps, raceStarted: state.missions.raceStarted,
      holdTime: state.missions.holdTime, surviveTime: state.missions.surviveTime, spawned: state.missions.spawned,
    },
    race: {
      active: state.race.active, index: state.race.index, timer: state.race.timer,
      checkpoints: state.race.checkpoints, laps: state.race.laps,
    },
    collectibles: state.collectibles.map((c) => c.taken),
    pickups: state.pickups.map((p) => p.taken),
    safehouseOwned: state.safehouseOwned,
    stats: state.stats,
  });
}

export function createWorld(seed = 11) {
  const world = {
    seed,
    state: null,
    city: null,

    /** Rebuild the world from its seed, into the same state object it already has. */
    reset() {
      const next = freshState(world.seed);
      const current = world.state;
      for (const key of Object.keys(current)) {
        if (!(key in next)) delete current[key];
      }
      for (const key of Object.keys(next)) {
        current[key] = next[key];
      }
      world.city = current.city;
    },

    step(dt, input) {
      const events = [];
      stepWorld(world.state, dt, input || {}, events);
      return events;
    },

    save() {
      return serializeState(world.state);
    },

    load(data) {
      const saved = JSON.parse(data);
      world.seed = saved.seed;
      world.reset();
      const s = world.state;
      s.frames = saved.frames || 0;
      s.time = saved.time;
      Object.assign(s.player, saved.player);
      s.player.car = null;
      s.player.invulnerable = 0;
      s.player.punchCooldown = 0;
      s.player.shootCooldown = 0;
      s.player.stealProgress = 0;
      s.player.stealTarget = null;
      Object.assign(s.missions, saved.missions);
      s.missions.raceTarget = null;
      Object.assign(s.race, saved.race);
      s.raceMarker = raceTarget(s.race);
      s.missions.raceTarget = s.raceMarker;
      saved.collectibles.forEach((taken, i) => {
        if (s.collectibles[i]) s.collectibles[i].taken = taken;
      });
      saved.pickups.forEach((taken, i) => {
        if (s.pickups[i]) s.pickups[i].taken = taken;
      });
      s.safehouseOwned = saved.safehouseOwned;
      s.stats = saved.stats;
    },

    placePlayer(x, y) {
      const s = world.state;
      const p = s.player;
      if (p.car) {
        p.car.kind = 'parked';
        p.car = null;
      }
      p.x = x;
      p.y = y;
    },

    giveCar(type, x, y, angle) {
      const s = world.state;
      const p = s.player;
      if (p.car) {
        p.car.kind = 'parked';
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

    setWanted(level) {
      setWantedLevel(world.state, level);
    },

    spawnCopsNow(count) {
      const s = world.state;
      for (let i = 0; i < count; i += 1) {
        const cop = spawnCopCar(s.city, s.random, s.player.x, s.player.y);
        if (!cop) break;
        s.cops.push(cop);
      }
    },

    /** Start the story over from job one. The title screen calls this on Space. */
    beginStory() {
      Object.assign(world.state.missions, createMissions());
    },
  };
  world.state = freshState(seed);
  world.city = world.state.city;
  return world;
}
