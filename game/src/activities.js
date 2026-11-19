// The work that never ends, after the story: street races against the clock,
// Round 5: staged shots replay these activities from a fixed seed, so the frames are reproducible.
// package deliveries for cash, and twelve hidden packages stashed around the
// city. A race is a list of checkpoints to drive through in order before the
// timer runs out; a delivery is a pickup and a drop-off with a price on it;
// a hidden package pays out once, and all twelve together pay a bonus. None
// of this touches the story missions: missions.js runs the story, this file
// runs the jobs that keep coming.

import { COLLECTIBLES, RACE } from './config.js';
import { collectibleSpots, landmark } from './city.js';
import { shuffle } from './random.js';

/** The race state: null when no race is running, else its checkpoints and clock. */
export function createRaceState() {
  return { active: false, index: 0, timer: 0, checkpoints: [], laps: 0 };
}

/**
 * Start a race from the Race Gate: four checkpoints dealt from the city's landmarks,
 * in an order the seed shuffles, with a clock of one leg's time each.
 */
export function startRace(race, city, random) {
  const keys = shuffle(random, ['garage', 'bank', 'hospital', 'policeHq', 'diner', 'port', 'market', 'university', 'observatory']);
  race.checkpoints = keys.slice(0, RACE.checkpoints).map((key) => {
    const spot = landmark(city, key);
    return { x: spot.x, y: spot.y, label: spot.label };
  });
  race.index = 0;
  race.timer = RACE.checkpoints * RACE.timePerLeg;
  race.active = true;
  race.laps = 0;
  return race.checkpoints[0];
}

/** The checkpoint the race points at right now, or null when no race runs. */
export function raceTarget(race) {
  return race.active && race.index < race.checkpoints.length ? race.checkpoints[race.index] : null;
}

/**
 * Advance a running race one step. Returns the events the world must carry out:
 * a checkpoint chime, a win with the reward, or a loss when the clock runs out.
 */
export function updateRace(race, ctx, dt) {
  const events = [];
  if (!race.active) return events;
  race.timer -= dt;
  const target = raceTarget(race);
  if (target && Math.hypot(ctx.x - target.x, ctx.y - target.y) < 110) {
    race.index += 1;
    events.push({ kind: 'race-checkpoint', label: target.label, left: race.checkpoints.length - race.index });
    if (race.index >= race.checkpoints.length) {
      race.active = false;
      race.laps += 1;
      events.push({ kind: 'race-won', amount: RACE.reward });
    }
  } else if (race.timer <= 0) {
    race.active = false;
    events.push({ kind: 'race-lost' });
  }
  return events;
}

/** A delivery: a pickup point, a drop-off, a price and a clock. */
export function offerDelivery(city, random) {
  const keys = Object.keys(city.landmarks);
  const from = city.landmarks[keys[Math.floor(random() * keys.length)]];
  let to = city.landmarks[keys[Math.floor(random() * keys.length)]];
  while (to === from) to = city.landmarks[keys[Math.floor(random() * keys.length)]];
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    from: { x: from.x, y: from.y, label: from.label },
    to: { x: to.x, y: to.y, label: to.label },
    price: 120 + Math.round(distance / 40) * 15,
    seconds: 60 + distance / 45,
    pickedUp: false,
    timer: 0,
  };
}

/**
 * Advance a delivery one step. `ctx` carries the player's spot, whether E was pressed,
 * and a `deliveryPaid` slot the world reads. Returns nothing; the world watches the slot.
 */
export function updateDelivery(delivery, ctx, dt) {
  if (!delivery) return null;
  if (!delivery.pickedUp) {
    if (ctx.interact && Math.hypot(ctx.x - delivery.from.x, ctx.y - delivery.from.y) < 90) {
      delivery.pickedUp = true;
      delivery.timer = delivery.seconds;
      return { kind: 'delivery-picked', label: delivery.to.label, seconds: delivery.seconds };
    }
    return null;
  }
  delivery.timer -= dt;
  if (Math.hypot(ctx.x - delivery.to.x, ctx.y - delivery.to.y) < 100) {
    ctx.deliveryPaid = delivery.price;
    return { kind: 'delivery-done', amount: delivery.price };
  }
  if (delivery.timer <= 0) return { kind: 'delivery-lost' };
  return null;
}

/** The hidden packages: twelve spots dealt from the city's corners, none taken yet. */
export function createCollectibles() {
  return collectibleSpots().map((spot, i) => ({
    x: spot.x + 36, y: spot.y + 36, index: i, taken: false,
  }));
}

/**
 * The package at the player's feet, if any: marks it taken and says what it is worth.
 * The twelfth pays the set bonus on top of its own value.
 */
export function collectibleNear(list, x, y) {
  for (const item of list) {
    if (item.taken) continue;
    if (Math.hypot(item.x - x, item.y - y) < 34) {
      item.taken = true;
      const found = list.filter((other) => other.taken).length;
      return { kind: 'collectible', index: item.index, found, total: list.length, bonus: found === list.length ? COLLECTIBLES.reward : 0 };
    }
  }
  return null;
}
