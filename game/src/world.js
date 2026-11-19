// world.js — simulasi Solara Bay: satu dunia yang berisi pemain, mobil, pejalan
// Round 5: one fixed 1/60s step keeps the simulation deterministic across runs.
// kaki, musuh, polisi, helikopter, balapan, delivery, dan sepuluh misi cerita.
// createWorld(seed) membangun keadaan awal yang deterministik; step(dt, input)
// memajukan satu langkah tetap (1/60 detik). File ini yang mengikat semua modul
// lain: city memberi peta, activities memberi balapan/delivery/koleksi, vehicles
// memberi mobil, pedestrians memberi keramaian, combat memberi tembak-menembak,
// police memberi kejaran, dan missions memberi data cerita.
//
// Aturan waktu: time dihitung dari counter frame (frames * STEP) supaya dua run
// dengan input yang sama menghasilkan waktu yang persis sama.
// Aturan reset: reset() membangun keadaan segar lalu menyalinnya KE DALAM objek
// state yang sama — identitas objek tidak pernah diganti, karena shots.js dan
// render memegang referensi state yang sama selama permainan berjalan.

import {
  WORLD, STEP, VIEW, PLAYER, CAR, TRAFFIC, PED, WANTED, POLICE, HELI,
  ROADBLOCK, DAY, RADIO, RACE, COLLECTIBLES, SHOTGUN, SAVE_KEY, BEST_KEY,
  PALETTE, DISTRICT_ROOFS, FONT,
} from './config.js';
import { createRandom } from './random.js';
import {
  buildCity, landmark, nearestRoad, hitsBuilding, pushOutOfBuildings,
  collectibleSpots, randomRoadSpot, WATER_Y,
} from './city.js';
import { MISSION_NAMES, MISSION_PAY, MISSION_BRIEFINGS } from './missions.js';
import {
  createRaceState, startRace, raceTarget, updateRace,
  offerDelivery, updateDelivery, createCollectibles, collectibleNear,
} from './activities.js';
import {
  CAR_TYPES, createCar, carAxles, spawnTraffic, updateTraffic, drivePlayerCar, damageCar,
} from './vehicles.js';
import { spawnPedestrians, scareNearby, updatePedestrians, createPedestrian } from './pedestrians.js';
import {
  createEnemy, fireShotgun, fireBullet, updateBullets, punch, updateEnemies,
} from './combat.js';
import {
  wantedHeli, createHeli, updateHeli, updateRoadblocks,
  wantedCarCount, spawnCopCar, updatePolice,
} from './police.js';

/** Batasi angka ke interval, dipakai untuk posisi pemain dan kamera. */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Tambah satu toast (pesan singkat di layar) ke keadaan. */
function addToast(state, text) {
  state.toasts.push({ text, time: 4 });
  if (state.toasts.length > 4) state.toasts.shift();
}

/** Tampilkan briefing misi di HUD selama beberapa detik. */
function setMissionMessage(missions, text) {
  missions.message = text;
  missions.messageTime = 5;
}

/** Enam pickup di kota: dua nyawa, dua amunisi, dua uang — masing-masing 100 unit
 *  di selatan sebuah landmark, di atas jalan, supaya teleport misi tidak
 *  menyapunya secara tidak sengaja. */
function makePickups(city) {
  const defs = [
    { key: 'hospital', kind: 'health' },
    { key: 'policeHq', kind: 'ammo' },
    { key: 'market', kind: 'cash' },
    { key: 'university', kind: 'health' },
    { key: 'observatory', kind: 'ammo' },
    { key: 'port', kind: 'cash' },
  ];
  return defs.map(({ key, kind }) => {
    const spot = landmark(city, key);
    return { x: spot.x, y: spot.y + 100, kind, taken: false };
  });
}

/** Keadaan segar untuk satu seed: kota, pemain di depan garasi, lalu lintas,
 *  pejalan kaki, dan semua sistem dalam keadaan awal. */
function makeFreshState(seed) {
  const random = createRandom(seed);
  const city = buildCity(seed);
  const roadblocks = [];
  roadblocks.cooldown = 0;
  return {
    seed,
    random,
    city,
    frames: 0,
    time: 0,
    player: {
      x: 512, y: 572, angle: 0, faceAngle: 0, aimAngle: 0,
      money: 0, wanted: 0, health: PLAYER.health, ammo: PLAYER.startAmmo,
      hasPistol: true, hasShotgun: false, weapon: 'pistol',
      invulnerable: 0, car: null,
    },
    missions: {
      index: 0, step: 0, active: true, setup: '',
      fare: null, message: '', messageTime: 0,
    },
    cars: spawnTraffic(city, random),
    peds: spawnPedestrians(city, random),
    enemies: [],
    cops: [],
    heli: null,
    roadblocks,
    collectibles: createCollectibles(),
    pickups: makePickups(city),
    race: createRaceState(),
    delivery: null,
    camera: { x: 512, y: 572, zoom: VIEW.zoomFoot },
    safehouseOwned: false,
    bullets: [],
    toasts: [],
    banner: null,
    shake: 0,
    particles: [],
    stats: { earned: 0 },
    raceMarker: null,
    wantedTimer: WANTED.decayDelay,
    vaultTimer: 0,
    missionTimer: 0,
    fareTimer: 0,
    deliveryTimer: 0,
    stealTimer: 0,
    stealTarget: null,
    shootCooldown: 0,
    punchCooldown: 0,
  };
}

/** Bangun satu dunia dari seed. Metode-metodenya dipakai main.js, shots.js, dan tes. */
export function createWorld(seed) {
  const world = {
    seed,
    state: makeFreshState(seed),

    /** Majukan simulasi satu langkah tetap. Input boleh kosong. */
    step(dt, input) {
      stepWorld(world, dt, input || {});
    },

    /** Kembalikan dunia ke keadaan segar (seed yang sama), TANPA mengganti
     *  objek state — referensi world.state tetap sama seperti sebelumnya. */
    reset() {
      const fresh = makeFreshState(world.seed);
      const state = world.state;
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, fresh);
    },

    /** Beri pemain sebuah mobil dari jenis tertentu di posisi dan arah tertentu,
     *  lalu dudukkan pemain di dalamnya. Dipakai tes dan staged shots. */
    giveCar(type, x, y, angle) {
      const s = world.state;
      const car = createCar(s.random, x, y, angle, type, 'player');
      car.speed = 0;
      s.cars.push(car);
      s.player.car = car;
      s.player.x = x;
      s.player.y = y;
      s.player.angle = angle;
      return car;
    },

    /** Atur level wanted (0–5) dan mulai ulang timer pendinginannya. */
    setWanted(n) {
      const s = world.state;
      s.player.wanted = clamp(n, 0, WANTED.max);
      s.wantedTimer = WANTED.decayDelay;
    },

    /** Munculkan n mobil polisi sekarang juga (dipakai staged shot cover). */
    spawnCopsNow(n) {
      const s = world.state;
      let placed = 0;
      let guard = 0;
      while (placed < n && guard < 40) {
        guard += 1;
        const car = spawnCopCar(s.city, s.random, s.player.x, s.player.y);
        if (car) {
          s.cops.push(car);
          placed += 1;
        }
      }
    },

    /** Pindahkan pemain (dan kamera) ke sebuah titik. */
    placePlayer(x, y) {
      const s = world.state;
      s.player.x = x;
      s.player.y = y;
      s.camera.x = x;
      s.camera.y = y;
    },

    /** Simpan progres ke string JSON: pemain, misi, safehouse, koleksi, balapan. */
    save() {
      const s = world.state;
      return JSON.stringify({
        version: 1,
        time: s.time,
        player: {
          x: s.player.x, y: s.player.y, money: s.player.money,
          health: s.player.health, ammo: s.player.ammo,
          hasPistol: s.player.hasPistol, hasShotgun: s.player.hasShotgun,
          weapon: s.player.weapon, wanted: s.player.wanted,
        },
        missions: { index: s.missions.index, step: s.missions.step },
        safehouseOwned: s.safehouseOwned,
        collectibles: s.collectibles.map((c) => c.taken),
        race: { laps: s.race.laps },
        stats: { earned: s.stats.earned },
      });
    },

    /** Muat progres dari save(): pulihkan field-field di atas ke dunia ini. */
    load(data) {
      const s = world.state;
      let parsed = data;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (err) {
          return false;
        }
      }
      if (!parsed || parsed.version !== 1) return false;
      s.time = parsed.time || 0;
      s.frames = Math.round(s.time / STEP);
      Object.assign(s.player, parsed.player || {});
      s.player.car = null;
      s.missions.index = (parsed.missions && parsed.missions.index) || 0;
      s.missions.step = (parsed.missions && parsed.missions.step) || 0;
      s.missions.setup = '';
      s.safehouseOwned = !!parsed.safehouseOwned;
      if (Array.isArray(parsed.collectibles)) {
        parsed.collectibles.forEach((taken, i) => {
          if (s.collectibles[i]) s.collectibles[i].taken = !!taken;
        });
      }
      if (parsed.race) s.race.laps = parsed.race.laps || 0;
      if (parsed.stats) s.stats.earned = parsed.stats.earned || 0;
      return true;
    },
  };
  return world;
}

/** Satu langkah simulasi. Urutannya disengaja: setup misi dulu (supaya musuh/van/
 *  balapan sudah ada sebelum tes memeriksa setelah satu step), lalu pemain, lalu
 *  dunia, lalu logika cerita, lalu setup lagi — karena cerita bisa mengubah step
 *  di tengah langkah, dan setup step yang baru harus jalan di langkah yang sama. */
function stepWorld(world, dt, input) {
  const s = world.state;
  // Hormati waktu yang diatur dari luar (staged shots mengatur senja, siang,
  // atau tengah malam langsung di state.time): sinkronkan counter frame dari
  // time sebelum melangkah, supaya time tidak ditimpa kembali ke nol.
  if (s.time !== s.frames * STEP) {
    s.frames = Math.round(s.time / STEP);
  }
  s.frames += 1;
  s.time = s.frames * STEP;
  runMissionSetup(world);
  updatePlayer(world, dt, input);
  updateWorld(world, dt, input);
  updateStory(world, dt, input);
  runMissionSetup(world);
  updatePostStory(world, dt);
}

/** Naikkan wanted dan mulai ulang timer pendinginan. */
function addWanted(world, amount) {
  const s = world.state;
  s.player.wanted = Math.min(WANTED.max, s.player.wanted + amount);
  s.wantedTimer = WANTED.decayDelay;
}

/** Lukai pemain sekali, dengan jendela kebal singkat supaya satu tembakan
 *  tidak menghabiskan nyawa sekaligus. */
function damagePlayer(world, amount) {
  const s = world.state;
  const p = s.player;
  if (p.invulnerable > 0 || p.health <= 0) return;
  p.health -= amount;
  p.invulnerable = 0.6;
  s.shake = Math.max(s.shake, 5);
}

/** Semburan partikel kecil di satu titik (percikan peluru, debu tabrakan). */
function spawnParticles(state, x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    const angle = state.random() * Math.PI * 2;
    const speed = 60 + state.random() * 140;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.3 + state.random() * 0.3, color, size: 2 + state.random() * 2,
    });
  }
}

/** Mobil pemain menabrak gedung: dorong keluar dari tembok, rem mendadak,
 *  dan rusak kalau benturannya keras. */
function collideCarWithBuildings(state, car) {
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
    const impact = Math.hypot(car.vx, car.vy);
    car.vx *= 0.4;
    car.vy *= 0.4;
    car.speed = Math.hypot(car.vx, car.vy);
    if (impact > 220) {
      damageCar(car, Math.round((impact - 220) / 20));
      state.shake = Math.max(state.shake, 5);
      spawnParticles(state, car.x, car.y, 8, '#c9c9c9');
    }
  }
}

/** Gerakan dan aksi pemain: mengemudi atau jalan kaki, interaksi, pukul, tembak. */
function updatePlayer(world, dt, input) {
  const s = world.state;
  const p = s.player;
  s.shootCooldown = Math.max(0, (s.shootCooldown || 0) - dt);
  s.punchCooldown = Math.max(0, (s.punchCooldown || 0) - dt);
  p.invulnerable = Math.max(0, (p.invulnerable || 0) - dt);

  if (p.car) {
    drivePlayerCar(p.car, input.steer, input.throttle, input.brake, dt);
    collideCarWithBuildings(s, p.car);
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    if (input.horn) scareNearby(s.peds, p.x, p.y, 220);
    if (input.interact) exitCar(world);
    if (input.shoot) tryShoot(world, input);
    return;
  }

  const moving = input.moveX !== 0 || input.moveY !== 0;
  if (moving) p.faceAngle = Math.atan2(input.moveY, input.moveX);
  if (input.aimX !== undefined && input.aimY !== undefined) {
    p.aimAngle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  } else {
    p.aimAngle = p.faceAngle;
  }

  const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  p.x = clamp(p.x + input.moveX * speed * dt, PLAYER.radius, WORLD.size - PLAYER.radius);
  p.y = clamp(p.y + input.moveY * speed * dt, PLAYER.radius, WATER_Y - PLAYER.radius);
  pushOutOfBuildings(s.city, p, PLAYER.radius);

  // Interaksi misi didahulukan: tombol E di dekat target misi tidak boleh
  // malah mencuri mobil parkir yang kebetulan berdiri di situ.
  const missionHandled = handleMissionInteract(world, input, dt);
  if (!missionHandled) handleSteal(world, input, dt);

  if (input.punch && s.punchCooldown <= 0) {
    const hit = punch(p, p.faceAngle, [...s.enemies, ...s.peds], PLAYER.punchRange, PLAYER.punchDamage);
    if (hit.length > 0) {
      s.punchCooldown = PLAYER.punchCooldown;
      if (hit.some((t) => t.health === undefined)) addWanted(world, WANTED.hitPed);
    }
  }
  if (input.shoot) tryShoot(world, input);
  if (input.weapon && p.hasShotgun) {
    p.weapon = p.weapon === 'pistol' ? 'shotgun' : 'pistol';
  }
}

/**
 * Interaksi yang terikat misi. Mengembalikan true kalau tombol E sudah ditangani
 * di sini, supaya logika curi mobil dilewati pada langkah ini.
 */
function handleMissionInteract(world, input, dt) {
  const s = world.state;
  const m = s.missions;
  const p = s.player;
  if (!m.active) {
    if (s.delivery && !s.delivery.pickedUp && input.interact) {
      const d = Math.hypot(p.x - s.delivery.from.x, p.y - s.delivery.from.y);
      if (d < 90) return true;
    }
    return false;
  }
  if (m.index === 1 && m.step === 0 && input.interact) {
    const diner = landmark(s.city, 'diner');
    if (Math.hypot(p.x - diner.x, p.y - diner.y) < 90) {
      setMissionStep(world, 1);
      addToast(s, 'Package picked up — take it to the Bank');
      return true;
    }
  }
  if (m.index === 4 && m.step === 0) {
    const bank = landmark(s.city, 'bank');
    if (Math.hypot(p.x - bank.x, p.y - bank.y) < 90) {
      if (input.interactHeld) {
        s.vaultTimer = (s.vaultTimer || 0) + dt;
        // Epsilon kecil: 240 langkah x (1/60) berakumulasi jadi 3,9999... bukan 4,0.
        if (s.vaultTimer >= 4 - 0.001) {
          s.vaultTimer = 0;
          setMissionStep(world, 1);
          addToast(s, 'Vault open — take the bag to the garage');
        }
      } else {
        s.vaultTimer = 0;
      }
      return true;
    }
    s.vaultTimer = 0;
  }
  return false;
}

/** Tahan E di dekat mobil untuk mencurinya (0,6 detik). */
function handleSteal(world, input, dt) {
  const s = world.state;
  const p = s.player;
  let best = null;
  let bestDist = 70;
  for (const car of s.cars) {
    if (car === p.car || car.wrecked) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  if (!best || !input.interactHeld) {
    s.stealTimer = 0;
    s.stealTarget = null;
    return;
  }
  if (s.stealTarget !== best) {
    s.stealTarget = best;
    s.stealTimer = 0;
  }
  s.stealTimer += dt;
  if (s.stealTimer >= CAR.stealTime) {
    s.stealTimer = 0;
    s.stealTarget = null;
    stealCar(world, best);
  }
}

/** Ambil alih sebuah mobil: sopir lalu lintas kabur, pemain duduk di dalamnya. */
function stealCar(world, car) {
  const s = world.state;
  const p = s.player;
  if (car.kind === 'traffic') {
    const driver = createPedestrian(s.random, s.city);
    driver.x = car.x;
    driver.y = car.y;
    driver.state = 'flee';
    const fleeAngle = s.random() * Math.PI * 2;
    driver.fleeX = Math.cos(fleeAngle);
    driver.fleeY = Math.sin(fleeAngle);
    driver.fleeTime = 2.5;
    s.peds.push(driver);
  }
  car.kind = 'player';
  car.speed = 0;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  addWanted(world, WANTED.stealCar);
  if (s.missions.active && s.missions.index === 0) advanceMission(world);
  if (s.missions.active && s.missions.index === 5 && s.missions.step === 0 && car.missionVan) {
    setMissionStep(world, 1);
    addToast(s, 'Van stolen — drive it to the garage');
  }
}

/** Keluar dari mobil: mobil jadi parkir, pemain berdiri di sisi kanannya. */
function exitCar(world) {
  const s = world.state;
  const p = s.player;
  const car = p.car;
  if (!car) return;
  car.kind = 'parked';
  car.speed = 0;
  p.car = null;
  const side = car.angle + Math.PI / 2;
  p.x = clamp(car.x + Math.cos(side) * 40, PLAYER.radius, WORLD.size - PLAYER.radius);
  p.y = clamp(car.y + Math.sin(side) * 40, PLAYER.radius, WATER_Y - PLAYER.radius);
  pushOutOfBuildings(s.city, p, PLAYER.radius);
}

/** Tembak sekali (pistol atau shotgun) ke arah aim; ada cooldown dan amunisi. */
function tryShoot(world, input) {
  const s = world.state;
  const p = s.player;
  if (s.shootCooldown > 0) return;
  if (!p.hasPistol && !p.hasShotgun) return;
  if (p.weapon === 'shotgun' && p.hasShotgun) {
    if (p.ammo < SHOTGUN.ammoCost) return;
    fireShotgun(s.bullets, p.x, p.y, p.aimAngle, 'player');
    p.ammo -= SHOTGUN.ammoCost;
    s.shootCooldown = 0.45;
  } else {
    if (p.ammo <= 0) return;
    fireBullet(s.bullets, p.x, p.y, p.aimAngle, 'player', PLAYER.pistolDamage);
    p.ammo -= 1;
    s.shootCooldown = PLAYER.pistolCooldown;
  }
  addWanted(world, WANTED.shoot);
}

/** Semua sistem selain pemain: lalu lintas, pejalan kaki, musuh, peluru, polisi,
 *  helikopter, roadblock, balapan, delivery, koleksi, pickup, pendinginan wanted,
 *  kamera, toast, banner, dan partikel. */
function updateWorld(world, dt, input) {
  const s = world.state;

  if (wantedHeli(s.player.wanted)) {
    if (!s.heli) s.heli = createHeli(s.player.x, s.player.y);
  } else if (s.heli) {
    s.heli = null;
  }
  if (s.heli) updateHeli(s.heli, s.player, dt);

  const targetCops = wantedCarCount(s.player.wanted);
  let guard = 0;
  while (s.cops.length < targetCops && guard < 20) {
    guard += 1;
    const car = spawnCopCar(s.city, s.random, s.player.x, s.player.y);
    if (car) s.cops.push(car);
  }
  while (s.cops.length > targetCops) s.cops.pop();

  updateRoadblocks(s.roadblocks, s.cars, s.player, s.player.wanted, dt, s.city, s.random);
  updateTraffic(s.city, s.cars, dt, s.random);
  updatePedestrians(s.peds, s.city, dt);
  updateEnemies(s.enemies, s.player, s.city, s.bullets, dt, s.random, (damage) => damagePlayer(world, damage));
  const bulletEvents = updateBullets(s.bullets, s.city, s.cars, s.peds, s.enemies, s.player, dt);
  for (const event of bulletEvents) {
    if (event.kind === 'hit-player') damagePlayer(world, event.damage);
    else if (event.kind === 'hit-ped') addWanted(world, WANTED.hitPed);
    else if (event.kind === 'spark') spawnParticles(s, event.x, event.y, 6, '#ffd76a');
  }

  const policeResult = updatePolice(s.city, s.cops, s.player, s.player.car, dt);
  if (policeResult === 'busted') {
    handleBusted(world);
  } else if (policeResult && policeResult.type === 'ram') {
    s.shake = Math.max(s.shake, 6);
  }

  const raceEvents = updateRace(s.race, { x: s.player.x, y: s.player.y }, dt);
  for (const event of raceEvents) {
    if (event.kind === 'race-checkpoint') {
      s.raceMarker = raceTarget(s.race);
      addToast(s, `Checkpoint ${event.label} — ${event.left} left`);
    } else if (event.kind === 'race-won') {
      s.player.money += event.amount;
      s.stats.earned += event.amount;
      addToast(s, `Race won — $${event.amount}`);
      s.raceMarker = null;
      if (s.missions.active && s.missions.index === 6) advanceMission(world);
    } else if (event.kind === 'race-lost') {
      s.raceMarker = null;
      addToast(s, 'Race lost — the Grand Prix is still open');
    }
  }

  if (s.delivery) {
    const deliveryCtx = { x: s.player.x, y: s.player.y, interact: input.interact, deliveryPaid: 0 };
    const event = updateDelivery(s.delivery, deliveryCtx, dt);
    if (event) {
      if (event.kind === 'delivery-picked') {
        if (s.player.car) exitCar(world);
        addToast(s, 'Package picked up');
      } else if (event.kind === 'delivery-done') {
        s.player.money += event.amount;
        s.stats.earned += event.amount;
        addToast(s, `Delivery paid — $${event.amount}`);
        s.delivery = null;
      } else if (event.kind === 'delivery-lost') {
        addToast(s, 'Delivery expired');
        s.delivery = null;
      }
    }
  }

  const found = collectibleNear(s.collectibles, s.player.x, s.player.y);
  if (found) {
    const amount = 100 + (found.bonus || 0);
    s.player.money += amount;
    s.stats.earned += amount;
    addToast(s, found.bonus ? `All packages found — bonus $${amount}` : `Package found — $${amount}`);
  }
  updatePickups(world);

  updateWantedDecay(world, dt);

  s.camera.zoom = s.player.car ? VIEW.zoomCar : VIEW.zoomFoot;
  s.camera.x = s.player.x;
  s.camera.y = s.player.y;

  updateToasts(s, dt);
  if (s.banner) {
    s.banner.time -= dt;
    if (s.banner.time <= 0) s.banner = null;
  }
  s.shake = Math.max(0, s.shake - dt * 20);
  updateParticles(s, dt);

  if (s.player.health <= 0) handleWasted(world);
}

/** Pickup di dekat pemain: nyawa, amunisi, atau uang tunai $100. */
function updatePickups(world) {
  const s = world.state;
  const p = s.player;
  for (const pickup of s.pickups) {
    if (pickup.taken) continue;
    if (Math.hypot(p.x - pickup.x, p.y - pickup.y) >= 34) continue;
    pickup.taken = true;
    if (pickup.kind === 'health') {
      p.health = Math.min(PLAYER.health, p.health + 50);
      addToast(s, 'Health +50');
    } else if (pickup.kind === 'ammo') {
      p.ammo = Math.min(PLAYER.maxAmmo, p.ammo + 24);
      addToast(s, 'Ammo +24');
    } else {
      p.money += 100;
      s.stats.earned += 100;
      addToast(s, 'Cash +$100');
    }
  }
}

/**
 * Wanted mendingin sendiri kalau pemain berhenti berbuat onar: turun satu
 * tingkat setelah 18 detik, lalu satu tingkat tiap 14 detik. Selama misi 8
 * (bertahan dari helikopter) pendinginan ditahan supaya heli tetap di udara.
 */
function updateWantedDecay(world, dt) {
  const s = world.state;
  if (s.player.wanted <= 0) return;
  if (s.missions.active && s.missions.index === 8) {
    s.wantedTimer = WANTED.decayDelay;
    return;
  }
  s.wantedTimer = (s.wantedTimer ?? WANTED.decayDelay) - dt;
  if (s.wantedTimer <= 0) {
    s.player.wanted = Math.max(0, s.player.wanted - 1);
    s.wantedTimer = WANTED.decayStep;
  }
}

/** Pemeriksaan penyelesaian misi dan perubahan step, sekali per langkah. */
function updateStory(world, dt, input) {
  const s = world.state;
  const m = s.missions;
  if (!m.active) return;
  const p = s.player;
  switch (m.index) {
    case 0:
      break; // selesai saat mencuri mobil (stealCar)
    case 1:
      if (m.step === 1) {
        const bank = landmark(s.city, 'bank');
        if (Math.hypot(p.x - bank.x, p.y - bank.y) < 100) advanceMission(world);
      }
      break;
    case 2:
      if (s.enemies.length > 0 && s.enemies.every((e) => e.down)) advanceMission(world);
      break;
    case 3:
      if (p.wanted === 0) advanceMission(world);
      break;
    case 4:
      if (m.step === 1) {
        const garage = landmark(s.city, 'garage');
        if (Math.hypot(p.x - garage.x, p.y - garage.y) < 100) advanceMission(world);
      }
      break;
    case 5:
      if (m.step === 1) {
        const garage = landmark(s.city, 'garage');
        if (Math.hypot(p.x - garage.x, p.y - garage.y) < 100) advanceMission(world);
      }
      break;
    case 6:
      break; // selesai saat balapan dimenangkan (event race-won)
    case 7:
      if (s.enemies.length > 0 && s.enemies.every((e) => e.down)) {
        s.safehouseOwned = true;
        p.hasShotgun = true;
        addToast(s, 'Safehouse yours — shotgun unlocked');
        advanceMission(world);
      }
      break;
    case 8:
      s.missionTimer = (s.missionTimer || 0) - dt;
      if (s.missionTimer <= 0.001) advanceMission(world);
      break;
    case 9:
      if (m.step === 0) {
        const port = landmark(s.city, 'port');
        if (Math.hypot(p.x - port.x, p.y - port.y) < 100) {
          setMissionStep(world, 1);
          addToast(s, 'Port Gate — clear it');
        }
      } else if (m.step === 1) {
        if (s.enemies.length > 0 && s.enemies.every((e) => e.down)) {
          setMissionStep(world, 2);
          addToast(s, 'Gate clear — get to the garage');
        }
      } else if (m.step === 2) {
        const garage = landmark(s.city, 'garage');
        if (Math.hypot(p.x - garage.x, p.y - garage.y) < 100) advanceMission(world);
      }
      break;
    default:
      break;
  }
}

/** Setelah cerita selesai: fare (20 detik) dan delivery (30 detik) ditawarkan
 *  bergantian, lalu diantar sampai dibayar. */
function updatePostStory(world, dt) {
  const s = world.state;
  const m = s.missions;
  if (m.active) return;
  if (!m.fare) {
    s.fareTimer = (s.fareTimer || 0) + dt;
    if (s.fareTimer >= 20) {
      s.fareTimer = 0;
      m.fare = offerFare(s.city, s.random);
      if (m.fare) addToast(s, `Fare: pick up at ${m.fare.from.label || 'the pickup'}`);
    }
  }
  if (!s.delivery) {
    s.deliveryTimer = (s.deliveryTimer || 0) + dt;
    if (s.deliveryTimer >= 30) {
      s.deliveryTimer = 0;
      s.delivery = offerDelivery(s.city, s.random);
      if (s.delivery) addToast(s, 'Delivery available — pick it up (E)');
    }
  }
  if (m.fare) {
    const fare = m.fare;
    const p = s.player;
    if (!fare.pickedUp) {
      if (p.car && Math.hypot(p.x - fare.from.x, p.y - fare.from.y) < 90) {
        fare.pickedUp = true;
        addToast(s, `Fare picked up — drop off at ${fare.to.label || 'the destination'}`);
      }
    } else if (p.car && Math.hypot(p.x - fare.to.x, p.y - fare.to.y) < 100) {
      s.player.money += fare.price;
      s.stats.earned += fare.price;
      addToast(s, `Fare paid — $${fare.price}`);
      m.fare = null;
      s.fareTimer = 0;
    }
  }
}

/** Satu fare taksi: dua landmark berbeda, harga dari jaraknya. */
function offerFare(city, random) {
  const keys = Object.keys(city.landmarks);
  if (keys.length < 2) return null;
  const fromKey = keys[Math.floor(random() * keys.length)];
  let toKey = keys[Math.floor(random() * keys.length)];
  let guard = 0;
  while (toKey === fromKey && guard < 10) {
    toKey = keys[Math.floor(random() * keys.length)];
    guard += 1;
  }
  if (toKey === fromKey) return null;
  const from = city.landmarks[fromKey];
  const to = city.landmarks[toKey];
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const price = 50 + Math.round(distance / 100) * 10;
  return {
    from: { x: from.x, y: from.y, label: from.label },
    to: { x: to.x, y: to.y, label: to.label },
    price,
    pickedUp: false,
  };
}

/**
 * Jalankan setup untuk (index, step) saat ini, sekali saja per kombinasi.
 * Dipanggil di awal dan di akhir tiap langkah: kalau cerita mengubah step di
 * tengah langkah, setup step yang baru langsung jalan di langkah yang sama —
 * musuh misi 9 muncul di langkah yang sama saat pemain mencapai Port Gate.
 */
function runMissionSetup(world) {
  const s = world.state;
  const m = s.missions;
  if (!m.active) return;
  const key = `${m.index}:${m.step}`;
  if (m.setup === key) return;
  m.setup = key;
  switch (m.index) {
    case 0:
      setMissionMessage(m, MISSION_BRIEFINGS[0]);
      break;
    case 1:
      setMissionMessage(m, MISSION_BRIEFINGS[1]);
      break;
    case 2:
      spawnMissionEnemies(s, 3584, 2560, ['viper', 'viper', 'viper', 'viper']);
      setMissionMessage(m, MISSION_BRIEFINGS[2]);
      break;
    case 3:
      world.setWanted(3);
      setMissionMessage(m, MISSION_BRIEFINGS[3]);
      break;
    case 4:
      s.vaultTimer = 0;
      setMissionMessage(m, MISSION_BRIEFINGS[4]);
      break;
    case 5:
      spawnBroadcastVan(s);
      setMissionMessage(m, MISSION_BRIEFINGS[5]);
      break;
    case 6:
      startRace(s.race, s.city, s.random);
      s.raceMarker = raceTarget(s.race);
      setMissionMessage(m, MISSION_BRIEFINGS[6]);
      break;
    case 7:
      spawnMissionEnemies(s, 1024, 3072, ['viper', 'viper', 'viper', 'enforcer']);
      setMissionMessage(m, MISSION_BRIEFINGS[7]);
      break;
    case 8:
      world.setWanted(4);
      s.missionTimer = 75;
      setMissionMessage(m, MISSION_BRIEFINGS[8]);
      break;
    case 9:
      if (m.step === 1) {
        spawnMissionEnemies(s, 2560, 3584, ['viper', 'viper', 'viper', 'viper']);
      }
      setMissionMessage(m, MISSION_BRIEFINGS[9]);
      break;
    default:
      break;
  }
}

/** Munculkan musuh misi di sekitar satu titik, tetap di atas jalan/trotoar. */
function spawnMissionEnemies(state, cx, cy, kinds) {
  const offsets = [[0, 0], [40, 0], [-40, 0], [0, 40]];
  kinds.forEach((kind, i) => {
    const [dx, dy] = offsets[i % offsets.length];
    state.enemies.push(createEnemy(state.random, cx + dx, cy + dy, kind));
  });
}

/** Van siaran misi 5: mobil parkir di Observatory yang bisa dicuri pemain. */
function spawnBroadcastVan(state) {
  const observatory = landmark(state.city, 'observatory');
  const van = createCar(state.random, observatory.x, observatory.y, 0, 'van', 'parked');
  van.missionVan = true;
  state.cars.push(van);
  return van;
}

/** Selesaikan misi aktif: bayar, maju ke misi berikut, atau tutup cerita. */
function advanceMission(world) {
  const s = world.state;
  const m = s.missions;
  const pay = MISSION_PAY[m.index] || 0;
  s.player.money += pay;
  s.stats.earned += pay;
  addToast(s, `${MISSION_NAMES[m.index]} complete — $${pay}`);
  m.index += 1;
  m.step = 0;
  m.setup = '';
  if (m.index >= MISSION_NAMES.length) {
    m.active = false;
    s.banner = { title: 'The city is yours', sub: 'Story complete — keep driving', time: 4 };
  } else {
    s.banner = { title: MISSION_NAMES[m.index], sub: MISSION_BRIEFINGS[m.index], time: 4 };
  }
}

/** Pindah ke step berikut dalam misi yang sama (setup step baru akan jalan). */
function setMissionStep(world, step) {
  const s = world.state;
  s.missions.step = step;
  s.missions.setup = '';
}

/** Ditangkap polisi: kembali ke garasi, wanted hilang, denda $100. */
function handleBusted(world) {
  const s = world.state;
  const p = s.player;
  s.banner = { title: 'Busted', sub: 'The cops got you — back to the garage', time: 4 };
  addToast(s, 'Busted — you lost $100');
  p.wanted = 0;
  p.money = Math.max(0, p.money - 100);
  const garage = landmark(s.city, 'garage');
  p.x = garage.x;
  p.y = garage.y + 60;
  p.car = null;
  p.health = Math.max(p.health, 50);
  s.camera.x = p.x;
  s.camera.y = p.y;
  s.cops.length = 0;
  s.heli = null;
}

/** Nyawa habis: bangun di rumah sakit, wanted hilang, denda $100. */
function handleWasted(world) {
  const s = world.state;
  const p = s.player;
  s.banner = { title: 'Wasted', sub: 'You woke up at the hospital', time: 4 };
  addToast(s, 'Wasted — you lost $100');
  p.health = PLAYER.health;
  p.wanted = 0;
  p.money = Math.max(0, p.money - 100);
  const hospital = landmark(s.city, 'hospital');
  p.x = hospital.x;
  p.y = hospital.y + 60;
  p.car = null;
  s.camera.x = p.x;
  s.camera.y = p.y;
  s.cops.length = 0;
  s.heli = null;
}

/** Kurangi umur toast dan pesan misi; hapus yang sudah habis. */
function updateToasts(state, dt) {
  for (const toast of state.toasts) toast.time -= dt;
  state.toasts = state.toasts.filter((t) => t.time > 0);
  if (state.missions.messageTime > 0) {
    state.missions.messageTime -= dt;
    if (state.missions.messageTime <= 0) state.missions.message = '';
  }
}

/** Gerakkan partikel (debu, percikan) dan hapus yang sudah mati. */
function updateParticles(state, dt) {
  for (const particle of state.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
}
