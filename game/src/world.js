// The game's rules and state, with no drawing and no browser in it: the player on foot or
// behind the wheel, the traffic, the pedestrians, the police, the missions, the wanted level,
// money, health and the save. step() advances one fixed step and returns what happened as
// events, so the caller can play sounds and announce without the world knowing about them.

import { BEST_KEY, PLAYER, SAVE_KEY, WANTED } from './config.js';
import { createRandom } from './random.js';
import { buildCity, clampToCity, districtName, hitsBuilding, landmark, pushOutOfBuildings } from './city.js';
import { carAxles, createCar, damageCar, drivePlayerCar, spawnTraffic, updateTraffic } from './vehicles.js';
import { createPedestrian, scareNearby, spawnPedestrians, updatePedestrians } from './pedestrians.js';
import { spawnCopCar, updatePolice, wantedCarCount } from './police.js';
import {
  beginMission, createMissionState, currentMission, failMission, objectiveText, stepTarget, updateMissions,
} from './missions.js';
import { createEnemy, fireBullet, punch, updateBullets, updateEnemies } from './combat.js';

export const EVENT_NONE = 0;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch { /* a best score that cannot be kept is no reason to stop playing */ }
}

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    time: 0,
    random,
    city,
    player: {
      x: 1024, y: 1024, angle: 0, faceAngle: 0, aimAngle: 0,
      health: PLAYER.health, money: 100, wanted: 0, lastCrime: -999,
      ammo: PLAYER.startAmmo, hasPistol: false, car: null,
      punchCooldown: 0, shootCooldown: 0, invulnerable: 0, lastDamage: -999,
      lastShootCrime: -999, lastPedCrime: -999,
    },
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    enemies: [],
    pickups: [],
    particles: [],
    camera: { x: 1024, y: 1024, zoom: 1 },
    missions: createMissionState(),
    stats: { carsStolen: 0, missionsDone: 0, faresDone: 0, earned: 0 },
    copSpawnTimer: 0,
    saveTimer: 30,
    shake: 0,
    banner: null,
    toasts: [],
  };
  state.cars = spawnTraffic(city, random);
  state.peds = spawnPedestrians(city, random);
  state.pickups = spawnPickups(city, random);
  return { state, city, reset, step, save, load, placePlayer, giveCar, setWanted, spawnCopsNow, beginStory };

  function spawnPickups(cityArg, rand) {
    const spots = [
      { kind: 'health', at: landmark(cityArg, 'hospital') },
      { kind: 'health', at: landmark(cityArg, 'diner') },
      { kind: 'ammo', at: landmark(cityArg, 'garage') },
      { kind: 'ammo', at: landmark(cityArg, 'port') },
      { kind: 'cash', at: { x: 1536, y: 1536 } },
      { kind: 'cash', at: { x: 2560, y: 1024 } },
      { kind: 'cash', at: { x: 1024, y: 2560 } },
      { kind: 'cash', at: { x: 3072, y: 3072 } },
    ];
    return spots.map((spot, i) => ({
      x: spot.at.x + 40 + (i % 2) * 30, y: spot.at.y + 40,
      kind: spot.kind, amount: spot.kind === 'cash' ? 50 : spot.kind === 'health' ? 40 : 24,
      taken: false, respawn: 0,
    }));
  }

  function reset() {
    state.time = 0;
    state.player.x = 1024;
    state.player.y = 1024;
    state.player.health = PLAYER.health;
    state.player.money = 100;
    state.player.wanted = 0;
    state.player.ammo = PLAYER.startAmmo;
    state.player.hasPistol = false;
    state.player.car = null;
    state.cars = spawnTraffic(city, random);
    state.peds = spawnPedestrians(city, random);
    state.cops = [];
    state.bullets = [];
    state.enemies = [];
    state.pickups = spawnPickups(city, random);
    state.particles = [];
    state.missions = createMissionState();
    state.stats = { carsStolen: 0, missionsDone: 0, faresDone: 0, earned: 0 };
    state.banner = null;
    state.toasts = [];
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
  }

  function placePlayer(x, y) {
    state.player.x = x;
    state.player.y = y;
    state.player.car = null;
    state.camera.x = x;
    state.camera.y = y;
  }

  function giveCar(type, x, y, angle) {
    const car = createCar(random, x, y, angle, type, 'player');
    state.cars.push(car);
    state.player.car = car;
    state.player.x = x;
    state.player.y = y;
    return car;
  }

  function setWanted(value) {
    state.player.wanted = Math.max(0, Math.min(WANTED.max, value));
    state.player.lastCrime = state.time;
  }

  function addWanted(value) {
    if (value <= 0) return;
    setWanted(state.player.wanted + value);
  }

  function spawnCopsNow(count) {
    for (let i = 0; i < count; i += 1) {
      const cop = spawnCopCar(city, random, state.player.x, state.player.y);
      if (cop) state.cops.push(cop);
    }
  }

  function beginStory() {
    beginMission(state.missions, city);
  }

  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: state.player.money,
        health: state.player.health,
        ammo: state.player.ammo,
        hasPistol: state.player.hasPistol,
        missionIndex: state.missions.index,
        storyDone: state.missions.storyDone,
        x: state.player.x,
        y: state.player.y,
        stats: state.stats,
      }));
    } catch { /* a save that cannot be kept is no reason to stop playing */ }
    if (state.stats.earned > readBest()) writeBest(state.stats.earned);
  }

  function load() {
    return readSave();
  }

  function toast(text, seconds = 3) {
    state.toasts.push({ text, time: seconds });
    if (state.toasts.length > 3) state.toasts.shift();
  }

  function addParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = random() * Math.PI * 2;
      const v = speed * (0.4 + random() * 0.8);
      state.particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, life: 0.5 + random() * 0.4, color, size: 2 + random() * 3 });
    }
    if (state.particles.length > 240) state.particles.splice(0, state.particles.length - 240);
  }

  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car.wrecked || car.kind === 'police') continue;
      const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car, events) {
    const wasTraffic = car.kind === 'traffic';
    if (wasTraffic) {
      // The driver bails and runs.
      const driver = createPedestrian(random, city);
      driver.x = car.x + 30;
      driver.y = car.y + 30;
      driver.state = 'flee';
      driver.fleeX = 0.7;
      driver.fleeY = 0.7;
      driver.fleeTime = 3;
      state.peds.push(driver);
      addWanted(WANTED.stealCar);
      state.stats.carsStolen += 1;
      events.push({ kind: 'steal' });
    }
    car.kind = 'player';
    car.vx = 0;
    car.vy = 0;
    state.player.car = car;
    state.player.x = car.x;
    state.player.y = car.y;
  }

  function exitCar() {
    const car = state.player.car;
    if (!car) return;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    const side = car.angle + Math.PI / 2;
    state.player.x = car.x + Math.cos(side) * 34;
    state.player.y = car.y + Math.sin(side) * 34;
    state.player.car = null;
    const body = { x: state.player.x, y: state.player.y };
    pushOutOfBuildings(city, body, PLAYER.radius);
    state.player.x = body.x;
    state.player.y = body.y;
  }

  function damagePlayer(amount, events) {
    if (state.player.invulnerable > 0) return;
    state.player.health -= amount;
    state.player.lastDamage = state.time;
    state.player.invulnerable = 0.5;
    state.shake = Math.max(state.shake, 5);
    if (state.player.health <= 0) {
      state.player.health = 0;
      events.push({ kind: 'wasted' });
    }
  }

  function handleWasted(events) {
    const lost = Math.floor(state.player.money * 0.1);
    state.player.money -= lost;
    state.player.health = PLAYER.health;
    state.player.wanted = 0;
    state.cops = [];
    state.enemies = [];
    const hospital = landmark(city, 'hospital');
    placePlayer(hospital.x + 60, hospital.y + 60);
    if (state.player.car) state.player.car = null;
    events.push(...failMission(state.missions, city, 'You woke up at St. Anselm. The job is still waiting.'));
    state.banner = { title: 'WASTED', sub: `You lost $${lost}.`, time: 3 };
  }

  function handleBusted(events) {
    const lost = Math.floor(state.player.money * 0.2);
    state.player.money -= lost;
    state.player.health = Math.max(50, state.player.health);
    state.player.wanted = 0;
    state.cops = [];
    state.enemies = [];
    const hq = landmark(city, 'policeHq');
    placePlayer(hq.x + 60, hq.y + 60);
    events.push(...failMission(state.missions, city, 'They let you go with a warning. The job is still waiting.'));
    state.banner = { title: 'BUSTED', sub: `You lost $${lost}.`, time: 3 };
  }

  function stepPlayerOnFoot(dt, input, events) {
    const player = state.player;
    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    player.x += mx * speed * dt;
    player.y += my * speed * dt;
    if (len > 0.1) player.faceAngle = Math.atan2(my, mx);
    const body = { x: player.x, y: player.y };
    pushOutOfBuildings(city, body, PLAYER.radius);
    player.x = body.x;
    player.y = body.y;
    clampToCity(city, body, PLAYER.radius);
    player.x = body.x;
    player.y = body.y;
    player.aimAngle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    // Punch: a swing in the direction the player faces.
    player.punchCooldown = Math.max(0, player.punchCooldown - dt);
    if (input.punch && player.punchCooldown <= 0) {
      player.punchCooldown = PLAYER.punchCooldown;
      const hitEnemies = punch(player, player.faceAngle, state.enemies, PLAYER.punchRange, PLAYER.punchDamage);
      const hitPeds = punch(player, player.faceAngle, state.peds, PLAYER.punchRange, PLAYER.punchDamage);
      if (hitEnemies.length > 0 || hitPeds.length > 0) {
        events.push({ kind: 'punch' });
        for (const ped of hitPeds) {
          if (ped.down) {
            addWanted(WANTED.hitPed);
            scareNearby(state.peds, ped.x, ped.y, 220);
          }
        }
      } else {
        events.push({ kind: 'punch-miss' });
      }
    }
    // Pistol: the mouse aims, a click fires.
    player.shootCooldown = Math.max(0, player.shootCooldown - dt);
    if (input.shoot && player.hasPistol && player.shootCooldown <= 0) {
      player.shootCooldown = PLAYER.pistolCooldown;
      if (player.ammo > 0) {
        player.ammo -= 1;
        const gx = player.x + Math.cos(player.aimAngle) * 20;
        const gy = player.y + Math.sin(player.aimAngle) * 20;
        fireBullet(state.bullets, gx, gy, player.aimAngle, 'player', PLAYER.pistolDamage);
        addParticles(gx, gy, '#ffd76a', 4, 120);
        events.push({ kind: 'shot' });
        const copNear = state.cops.some((cop) => Math.hypot(cop.x - player.x, cop.y - player.y) < 600);
        if (copNear && state.time - player.lastShootCrime > 10) {
          player.lastShootCrime = state.time;
          addWanted(WANTED.shoot);
        }
        scareNearby(state.peds, player.x, player.y, 260);
      }
    }
    // Getting in: E near a car takes it.
    if (input.interact) {
      const car = nearestCar(64);
      if (car) enterCar(car, events);
    }
    // Health comes back slowly when nothing has hurt the player for a while.
    if (state.time - player.lastDamage > 8 && player.health > 0 && player.health < PLAYER.health) {
      player.health = Math.min(PLAYER.health, player.health + 2 * dt);
    }
  }

  function stepPlayerInCar(dt, input, events) {
    const player = state.player;
    const car = player.car;
    const speed = drivePlayerCar(car, input.steer, input.throttle, input.brake, dt);
    // The city ends at the bay: a car never drives into the water or off the map.
    if (car.x < 30) { car.x = 30; car.vx = Math.max(0, car.vx); }
    if (car.x > city.size - 30) { car.x = city.size - 30; car.vx = Math.min(0, car.vx); }
    if (car.y < 30) { car.y = 30; car.vy = Math.max(0, car.vy); }
    if (car.y > 3810) { car.y = 3810; car.vy = Math.min(0, car.vy); }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.aimAngle = car.angle;
    // Walls: push each axle out and bill the impact. The scrape is damped once per
    // step, not once per axle, or the car stops dead on a touch and wedges itself
    // against the wall.
    let crashed = false;
    let hitWall = false;
    for (const axle of carAxles(car)) {
      const body = { x: axle.x, y: axle.y };
      if (pushOutOfBuildings(city, body, axle.r)) {
        const impact = Math.abs(speed);
        car.x += body.x - axle.x;
        car.y += body.y - axle.y;
        if (impact > 180) {
          damageCar(car, Math.min(24, (impact - 180) / 12));
          crashed = true;
          state.shake = Math.max(state.shake, 6);
        }
        hitWall = true;
      }
    }
    if (hitWall) {
      car.vx *= 0.6;
      car.vy *= 0.6;
    }
    if (crashed && state.time - (stepPlayerInCar.lastCrash || -999) > 0.7) {
      stepPlayerInCar.lastCrash = state.time;
      events.push({ kind: 'crash' });
      scareNearby(state.peds, car.x, car.y, 200);
    }
    // Other cars: a bump is a bump, a smash is damage.
    for (const other of state.cars) {
      if (other === car || other.wrecked) continue;
      for (const axle of carAxles(car)) {
        for (const oax of carAxles(other)) {
          const dx = oax.x - axle.x;
          const dy = oax.y - axle.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.01 && d < axle.r + oax.r) {
            const push = (axle.r + oax.r - d) / 2;
            const nx = dx / d;
            const ny = dy / d;
            car.x -= nx * push;
            car.y -= ny * push;
            if (other.kind !== 'parked') {
              other.x += nx * push;
              other.y += ny * push;
            }
            if (speed > 240 && state.time - (stepPlayerInCar.lastCrash || -999) > 0.7) {
              stepPlayerInCar.lastCrash = state.time;
              damageCar(car, 8);
              damageCar(other, 12);
              events.push({ kind: 'crash' });
            }
          }
        }
      }
    }
    // Pedestrians under the wheels: a crime, and a crowd that runs.
    for (const ped of state.peds) {
      if (ped.down) continue;
      for (const axle of carAxles(car)) {
        if (Math.hypot(ped.x - axle.x, ped.y - axle.y) < axle.r + 10 && speed > 40) {
          ped.down = true;
          ped.downTime = 8;
          if (state.time - player.lastPedCrime > 3) {
            player.lastPedCrime = state.time;
            addWanted(WANTED.hitPed);
          }
          scareNearby(state.peds, ped.x, ped.y, 260);
          events.push({ kind: 'ped-down' });
          state.shake = Math.max(state.shake, 4);
          break;
        }
      }
    }
    if (car.wrecked) {
      events.push({ kind: 'car-wrecked' });
      exitCar();
      addParticles(car.x, car.y, '#555', 16, 90);
    }
    if (input.interact) exitCar();
    if (speed > 60) {
      if (random() < 0.3) {
        state.particles.push({
          x: car.x - Math.cos(car.angle) * car.length / 2,
          y: car.y - Math.sin(car.angle) * car.length / 2,
          vx: -Math.cos(car.angle) * 20, vy: -Math.sin(car.angle) * 20,
          life: 0.4, color: 'rgba(200,200,200,0.5)', size: 3,
        });
      }
    }
  }

  function step(dt, input) {
    const events = [];
    const player = state.player;
    state.time += dt;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    // The wanted level cools off when the player stays quiet and unseen.
    if (player.wanted > 0 && state.time - player.lastCrime > WANTED.decayDelay) {
      const copNear = state.cops.some((cop) => Math.hypot(cop.x - player.x, cop.y - player.y) < 500);
      if (!copNear) {
        player.lastCrime = state.time - WANTED.decayDelay + WANTED.decayStep;
        setWanted(player.wanted - 1);
      }
    }
    // Police: keep the street staffed to the wanted level.
    const target = wantedCarCount(player.wanted);
    if (state.cops.length < target) {
      state.copSpawnTimer -= dt;
      if (state.copSpawnTimer <= 0) {
        spawnCopsNow(1);
        state.copSpawnTimer = 1.5;
      }
    }
    if (player.wanted === 0) {
      for (let i = state.cops.length - 1; i >= 0; i -= 1) {
        if (Math.hypot(state.cops[i].x - player.x, state.cops[i].y - player.y) > 800) state.cops.splice(i, 1);
      }
    }
    if (player.car) stepPlayerInCar(dt, input, events);
    else stepPlayerOnFoot(dt, input, events);
    updateTraffic(city, state.cars, dt, random);
    updatePedestrians(state.peds, city, dt);
    const policeResult = updatePolice(city, state.cops, player, player.car, dt);
    if (policeResult === 'busted') {
      handleBusted(events);
      events.push({ kind: 'busted' });
    } else if (policeResult && policeResult.type === 'ram') {
      state.shake = Math.max(state.shake, 5);
      events.push({ kind: 'ram', damage: policeResult.damage });
      if (player.car && player.car.wrecked) {
        events.push({ kind: 'car-wrecked' });
        exitCar();
      }
    }
    // A wrecked cop car loses its cop: the officer bails and the heat jumps.
    for (let i = state.cops.length - 1; i >= 0; i -= 1) {
      const cop = state.cops[i];
      if (cop.wrecked) {
        const officer = createPedestrian(random, city);
        officer.x = cop.x + 30;
        officer.y = cop.y;
        officer.state = 'flee';
        officer.fleeX = 0.7;
        officer.fleeY = -0.7;
        officer.fleeTime = 3;
        state.peds.push(officer);
        addWanted(WANTED.killCop);
        state.cops.splice(i, 1);
        events.push({ kind: 'cop-down' });
      }
    }
    updateEnemies(state.enemies, player, city, state.bullets, dt, random, (damage) => damagePlayer(damage, events));
    // A Viper's punch hurts the player straight through punch(): if it put their health
    // to zero, that is a wasted run, and the world has to say so.
    if (player.health <= 0 && !events.some((e) => e.kind === 'wasted')) {
      player.health = 0;
      events.push({ kind: 'wasted' });
    }
    const bulletEvents = updateBullets(state.bullets, city, state.cars, state.peds, state.enemies, player, dt);
    for (const be of bulletEvents) {
      if (be.kind === 'hit-player') {
        damagePlayer(be.damage, events);
        events.push({ kind: 'player-hit' });
      } else if (be.kind === 'hit-ped') {
        addWanted(WANTED.hitPed);
        scareNearby(state.peds, be.x, be.y, 220);
        events.push({ kind: 'ped-down' });
      } else if (be.kind === 'spark') {
        addParticles(be.x, be.y, '#ffd76a', 5, 140);
      } else if (be.kind === 'enemy-down') {
        addParticles(be.enemy.x, be.enemy.y, '#7a3fd1', 10, 120);
        events.push({ kind: 'enemy-down' });
      }
    }
    if (events.some((e) => e.kind === 'wasted')) handleWasted(events);
    // Pickups: walk over one to take it.
    for (const pickup of state.pickups) {
      if (pickup.taken) {
        pickup.respawn -= dt;
        if (pickup.respawn <= 0) pickup.taken = false;
        continue;
      }
      if (!player.car && Math.hypot(pickup.x - player.x, pickup.y - player.y) < 30) {
        pickup.taken = true;
        pickup.respawn = 60;
        if (pickup.kind === 'health') {
          player.health = Math.min(PLAYER.health, player.health + pickup.amount);
          events.push({ kind: 'pickup-health' });
        } else if (pickup.kind === 'ammo') {
          player.ammo = Math.min(PLAYER.maxAmmo, player.ammo + pickup.amount);
          events.push({ kind: 'pickup-ammo' });
        } else {
          player.money += pickup.amount;
          state.stats.earned += pickup.amount;
          events.push({ kind: 'pickup-cash', amount: pickup.amount });
        }
      }
    }
    // Missions.
    const ctx = {
      x: player.x, y: player.y,
      inCar: !!player.car,
      enemiesAlive: state.enemies.filter((e) => !e.down).length,
      interact: input.interact,
      holding: input.interactHeld,
      random,
      farePaid: 0,
    };
    const missionEvents = updateMissions(state.missions, city, ctx, dt);
    for (const me of missionEvents) {
      if (me.kind === 'reward') {
        player.money += me.amount;
        state.stats.earned += me.amount;
      } else if (me.kind === 'mission-done') {
        state.stats.missionsDone += 1;
        state.banner = { title: me.title, sub: `Job done — $${me.reward}`, time: 3.5 };
        events.push({ kind: 'mission-done', title: me.title });
        if (me.id === 'package') {
          player.hasPistol = true;
          player.ammo = Math.min(PLAYER.maxAmmo, player.ammo + 24);
          toast('Maya gave you a pistol. Click to shoot.', 4);
        }
        save();
      } else if (me.kind === 'story-done') {
        state.banner = { title: 'THE BIG SCORE', sub: 'Solara Bay is yours now, Jax.', time: 5 };
        events.push({ kind: 'story-done' });
        save();
      } else if (me.kind === 'set-wanted') {
        setWanted(me.value);
      } else if (me.kind === 'spawn-enemies') {
        for (let i = 0; i < me.count; i += 1) {
          const angle = (i / me.count) * Math.PI * 2;
          state.enemies.push(createEnemy(random, me.x + Math.cos(angle) * 90, me.y + Math.sin(angle) * 90));
        }
        events.push({ kind: 'viper-spawn' });
      } else if (me.kind === 'step-done') {
        events.push({ kind: 'step-done' });
      }
    }
    if (ctx.farePaid > 0) {
      player.money += ctx.farePaid;
      state.stats.earned += ctx.farePaid;
      state.stats.faresDone += 1;
      events.push({ kind: 'fare', amount: ctx.farePaid });
    }
    // Wrecked cars smoke.
    for (const car of state.cars) {
      if (car.wrecked && car.smoke > 0) {
        car.smoke = Math.max(0, car.smoke - dt * 0.1);
        if (random() < 0.25) {
          state.particles.push({
            x: car.x + (random() - 0.5) * 20, y: car.y + (random() - 0.5) * 12,
            vx: 0, vy: -26, life: 0.9, color: 'rgba(60,60,60,0.6)', size: 4,
          });
        }
      }
    }
    // Particles fade.
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    // Toasts fade.
    for (let i = state.toasts.length - 1; i >= 0; i -= 1) {
      state.toasts[i].time -= dt;
      if (state.toasts[i].time <= 0) state.toasts.splice(i, 1);
    }
    if (state.banner) {
      state.banner.time -= dt;
      if (state.banner.time <= 0) state.banner = null;
    }
    if (state.missions.messageTime > 0) state.missions.messageTime -= dt;
    // Camera: follow the player, zoom out a little in a car, shake on impacts.
    const targetZoom = player.car ? 0.82 : 1.0;
    state.camera.zoom += (targetZoom - state.camera.zoom) * Math.min(1, 2 * dt);
    state.camera.x += (player.x - state.camera.x) * Math.min(1, 6 * dt);
    state.camera.y += (player.y - state.camera.y) * Math.min(1, 6 * dt);
    state.shake = Math.max(0, state.shake - dt * 14);
    // Autosave every half minute of play.
    state.saveTimer -= dt;
    if (state.saveTimer <= 0) {
      state.saveTimer = 30;
      save();
    }
    return events;
  }
}

export { districtName, objectiveText, stepTarget };
export { currentMission };
