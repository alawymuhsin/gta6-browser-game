// The story: ten jobs for Maya Solis, then the city is yours. This file owns the
// mission data — what each job is called, what it pays, what the HUD says, and
// where the marker points. The world runs the jobs; this file only describes them.

import { landmark } from './city.js';

export const MISSIONS = [
  {
    name: 'First Wheels',
    pay: 400,
    briefing: 'Maya Solis needs a driver. First: wheels. Steal a car — any car will do.',
    objectives: ['Steal a car — any car will do'],
  },
  {
    name: 'The Package',
    pay: 300,
    briefing: 'A package waits at the Diner. Pick it up, run it to the Bank.',
    objectives: ['Pick up the package at the Diner', 'Deliver the package to the Bank'],
  },
  {
    name: 'Viper Nest',
    pay: 600,
    briefing: 'The Vipers hold the east yards. Clear the nest.',
    objectives: ['Clear the Viper Nest'],
  },
  {
    name: 'Heat',
    pay: 500,
    briefing: 'Three stars and every cop in town knows your face. Stay clean until the heat fades.',
    objectives: ['Lose the heat — stay clean until the stars fade'],
  },
  {
    name: 'The Big Score',
    pay: 2500,
    briefing: 'The Bank vault, at night. Hold E at the vault, then run the bag to the Garage.',
    objectives: ['Hold E at the Bank vault', 'Run the bag to the Garage'],
  },
  {
    name: 'Radio Silence',
    pay: 400,
    briefing: 'A broadcast van sits at the Observatory. Take it, drive it to the Garage.',
    objectives: ['Steal the broadcast van at the Observatory', 'Drive the van to the Garage'],
  },
  {
    name: 'Grand Prix',
    pay: 800,
    briefing: 'Four checkpoints, one clock. Win the Grand Prix.',
    objectives: ['Win the Grand Prix — 4 checkpoints'],
  },
  {
    name: 'The Safehouse',
    pay: 1000,
    briefing: 'The block by the Safehouse belongs to the Vipers. Take it back — and keep it.',
    objectives: ['Take the Safehouse back — clear the block'],
  },
  {
    name: 'Air Support',
    pay: 1200,
    briefing: 'Four stars. The helicopter is up. Survive it for 75 seconds.',
    objectives: ['Survive the helicopter — 75 seconds'],
  },
  {
    name: 'Harbor Heist',
    pay: 5000,
    briefing: 'The Port Gate, at midnight. Clear it, then run — the city is yours after this.',
    objectives: ['Reach the Port Gate', 'Clear the Port Gate', 'Get away — reach the Garage'],
  },
];

/** A fresh story: the first job, no step taken, nothing spawned yet. */
export function createMissions() {
  return {
    index: 0,
    step: 0,
    setup: '',
    active: true,
    message: MISSIONS[0].briefing,
    messageTime: 6,
    fare: null,
    raceLaps: 0,
    raceStarted: false,
    raceTarget: null,
    holdTime: 0,
    surviveTime: 0,
    spawned: 0,
  };
}

/** The one-line objective on the HUD, for the current job and step. */
export function objectiveText(missions, race) {
  if (!missions.active || missions.index >= MISSIONS.length) {
    return 'The city is yours — race, deliver, collect.';
  }
  const job = MISSIONS[missions.index];
  if (missions.index === 6 && race && race.active) {
    const left = race.checkpoints.length - race.index;
    return `Grand Prix — ${left} checkpoint${left === 1 ? '' : 's'} left, ${Math.ceil(race.timer)}s`;
  }
  return job.objectives[Math.min(missions.step, job.objectives.length - 1)];
}

/** Where the marker points for the current job and step, or null when it is not needed. */
export function stepTarget(missions, city) {
  if (!missions.active || missions.index >= MISSIONS.length) return null;
  const at = (key) => {
    const spot = landmark(city, key);
    return spot ? { x: spot.x, y: spot.y } : null;
  };
  switch (missions.index) {
    case 0:
      return null;
    case 1:
      return missions.step === 0 ? at('diner') : at('bank');
    case 2:
      return { x: 3584, y: 2560 };
    case 3:
      return null;
    case 4:
      return missions.step === 0 ? at('bank') : at('garage');
    case 5:
      return missions.step === 0 ? at('observatory') : at('garage');
    case 6:
      return missions.raceTarget || at('raceGate');
    case 7:
      return at('safehouse');
    case 8:
      return null;
    case 9:
      return missions.step === 2 ? at('garage') : at('port');
    default:
      return null;
  }
}

/**
 * A taxi fare: a random pair of landmarks, priced by distance, the long way
 * across town paying more than a trip round the corner.
 */
export function offerFare(city, random) {
  const keys = Object.keys(city.landmarks);
  const from = city.landmarks[keys[Math.floor(random() * keys.length)]];
  let to = city.landmarks[keys[Math.floor(random() * keys.length)]];
  while (to === from) {
    to = city.landmarks[keys[Math.floor(random() * keys.length)]];
  }
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return {
    from: { x: from.x, y: from.y, label: from.label },
    to: { x: to.x, y: to.y, label: to.label },
    price: 100 + Math.round(distance / 40) * 10,
    pickedUp: false,
  };
}
