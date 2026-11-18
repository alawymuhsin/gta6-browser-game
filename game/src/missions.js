// The story: ten jobs for Maya Solis, the fixer who runs Solara Bay from a garage in Old
// Town, and the taxi fares that keep the meter running once the story is done. A mission is a
// list of steps; each step names what to do and where, and the world answers when it is done.
// The current mission is always live: the marker on the map is the next step, and the HUD
// carries its text, so the game never leaves the player guessing. The second half of the
// story is where the city answers back: a broadcast van to steal, a street race through
// four checkpoints, a safehouse to take back from the Vipers, a helicopter overhead, and
// one last heist at the harbor.

export const MISSIONS = [
  {
    id: 'wheels',
    title: 'First Wheels',
    giver: 'Maya Solis',
    briefing: 'You need wheels in this town, Jax. Take any car on the street — nobody here locks theirs — and bring it to my garage.',
    reward: 200,
    steps: [
      { type: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { type: 'go', text: "Drive to Maya's Garage", landmark: 'garage', radius: 110 },
    ],
  },
  {
    id: 'package',
    title: 'The Package',
    giver: 'Maya Solis',
    briefing: 'A package is waiting at the Blue Diner. Pick it up, then run it to the Port Gate. The buyer does not like waiting.',
    reward: 400,
    steps: [
      { type: 'pickup', text: 'Pick up the package at the Blue Diner (press E)', landmark: 'diner', radius: 80 },
      { type: 'timed', text: 'Deliver the package to the Port Gate', landmark: 'port', radius: 90, seconds: 90 },
    ],
  },
  {
    id: 'vipers',
    title: 'Viper Nest',
    giver: 'Maya Solis',
    briefing: 'The Vipers have been taxing my drivers. Go to their turf by the east yards and remind them who runs this side of the bay.',
    reward: 600,
    steps: [
      { type: 'go', text: 'Go to the Viper Turf', landmark: 'vipers', radius: 130 },
      { type: 'fight', text: 'Deal with the Vipers (3)', landmark: 'vipers', radius: 260, enemies: 3 },
    ],
  },
  {
    id: 'heat',
    title: 'Heat',
    giver: 'Maya Solis',
    briefing: 'The precinct put your face on the board. Three stars, Jax. Stay out of their hands for a minute and they will lose interest.',
    reward: 800,
    steps: [
      { type: 'survive', text: 'Lose the cops — survive 60 seconds at 3 stars', seconds: 60, wanted: 3 },
    ],
  },
  {
    id: 'score',
    title: 'The Big Score',
    giver: 'Maya Solis',
    briefing: 'One last job. The Solara Bank vault holds the week’s take. Get in, hold the door, grab the cash, and get out to the safehouse before the whole city wakes up.',
    reward: 2500,
    steps: [
      { type: 'go', text: 'Get to the Solara Bank', landmark: 'bank', radius: 100 },
      { type: 'hold', text: 'Hold E at the vault door to crack it', landmark: 'bank', radius: 90, seconds: 5 },
      { type: 'go', text: 'Escape to the Safehouse — the whole city is coming', landmark: 'safehouse', radius: 110, wanted: 4 },
    ],
  },
  {
    id: 'radio',
    title: 'Radio Silence',
    giver: 'Maya Solis',
    briefing: 'The Vipers run a pirate station out of a broadcast van by the docks. Take the van — not just any car, the van — and bring it to my garage before they notice it is gone.',
    reward: 900,
    steps: [
      { type: 'steal-van', text: 'Steal a van (any van on the street, press E)' },
      { type: 'timed', text: "Drive the van to Maya's Garage", landmark: 'garage', radius: 110, seconds: 120 },
    ],
  },
  {
    id: 'prix',
    title: 'Grand Prix',
    giver: 'Maya Solis',
    briefing: 'The street racers meet at the Race Gate on the coastal road. Four checkpoints, one clock, no cops invited. Win it and the whole town knows your name.',
    reward: 1200,
    steps: [
      { type: 'go', text: 'Get to the Race Gate on the coastal road', landmark: 'raceGate', radius: 110 },
      { type: 'race', text: 'Race the checkpoints — beat the clock' },
    ],
  },
  {
    id: 'safehouse',
    title: 'The Safehouse',
    giver: 'Maya Solis',
    briefing: 'The old safehouse on the west side is Viper-held now, and I want it back. Clear the block — four of them, Jax — and the place is yours: a bed, a save, and a shotgun in the closet.',
    reward: 1000,
    steps: [
      { type: 'go', text: 'Get to the Safehouse', landmark: 'safehouse', radius: 130 },
      { type: 'fight', text: 'Clear the Safehouse block (4)', landmark: 'safehouse', radius: 260, enemies: 4, enforcers: 1 },
    ],
  },
  {
    id: 'air',
    title: 'Air Support',
    giver: 'Maya Solis',
    briefing: 'Four stars, Jax, and this time they sent the helicopter. It watches from above and calls the ground cars in. Stay free for seventy-five seconds and it runs out of fuel.',
    reward: 1500,
    steps: [
      { type: 'survive', text: 'Stay free with the helicopter overhead — 75 seconds at 4 stars', seconds: 75, wanted: 4 },
    ],
  },
  {
    id: 'harbor',
    title: 'Harbor Heist',
    giver: 'Maya Solis',
    briefing: 'The last job, and the biggest. A shipment lands at the Port Gate at midnight: hold the dock, load the crates, and run the whole load to the Marina while five stars come down on you.',
    reward: 5000,
    steps: [
      { type: 'go', text: 'Get to the Port Gate', landmark: 'port', radius: 100 },
      { type: 'hold', text: 'Hold E at the dock to load the shipment', landmark: 'port', radius: 90, seconds: 6 },
      { type: 'go', text: 'Run the load to the Marina — five stars, no stopping', landmark: 'raceGate', radius: 110, wanted: 5 },
    ],
  },
];

export function createMissionState() {
  return {
    index: 0,
    step: 0,
    timer: 0,
    holdProgress: 0,
    active: true,
    storyDone: false,
    fare: null,
    fareCooldown: 8,
    message: null,
    messageTime: 0,
    raceLaps: 0,
    raceStarted: false,
  };
}

export function currentMission(state) {
  return state.index < MISSIONS.length ? MISSIONS[state.index] : null;
}

export function currentStep(state) {
  const mission = currentMission(state);
  return mission ? mission.steps[state.step] : null;
}

/** The world point the next step points at, for the marker and the minimap. */
export function stepTarget(state, city) {
  const step = currentStep(state);
  if (!step) return null;
  if (step.type === 'race') return null; // the race checkpoint is the marker, set by the world
  if (step.landmark) {
    const spot = city.landmarks[step.landmark];
    return { x: spot.x, y: spot.y, label: spot.label };
  }
  return null;
}

function startStep(state, city) {
  const step = currentStep(state);
  if (!step) return [];
  state.timer = step.seconds ?? 0;
  state.holdProgress = 0;
  const events = [];
  if (step.wanted !== undefined) events.push({ kind: 'set-wanted', value: step.wanted });
  if (step.type === 'race') events.push({ kind: 'start-race' });
  if (step.enemies) {
    const target = stepTarget(state, city);
    events.push({ kind: 'spawn-enemies', count: step.enemies, enforcers: step.enforcers ?? 0, x: target.x, y: target.y });
  }
  return events;
}

/** Begin the current mission's first step (called when a mission starts or restarts). */
export function beginMission(state, city) {
  state.step = 0;
  state.active = true;
  return startStep(state, city);
}

/** Fail the current mission: it restarts from its first step with a message. */
export function failMission(state, city, reason) {
  state.message = reason;
  state.messageTime = 4;
  return beginMission(state, city);
}

/** The objective line the HUD shows right now. `race` is the world's race state, for the race step's clock. */
export function objectiveText(state, race) {
  const mission = currentMission(state);
  if (!mission) return 'Free roam — Solara Bay is yours.';
  const step = currentStep(state);
  let text = `${mission.title}: ${step.text}`;
  if (step.type === 'timed' || step.type === 'survive') text += ` — ${Math.ceil(state.timer)}s`;
  if (step.type === 'hold') text += ` — ${Math.floor((state.holdProgress / step.seconds) * 100)}%`;
  if (step.type === 'race' && race) {
    text += race.active
      ? ` — checkpoint ${Math.min(race.index + 1, race.checkpoints.length)}/${race.checkpoints.length}, ${Math.ceil(Math.max(0, race.timer))}s`
      : ' — line up at the Race Gate';
  }
  return text;
}

/**
 * Advance the mission one step. `ctx` is the world as the mission sees it: the player's
 * position, whether they are in a car, whether E was pressed or is held this frame, and how
 * many mission enemies are still standing. Returns the events the world must carry out.
 */
export function updateMissions(state, city, ctx, dt) {
  const events = [];
  if (state.messageTime > 0) state.messageTime -= dt;
  const mission = currentMission(state);
  if (!mission || !state.active) {
    updateFare(state, city, ctx, dt);
    return events;
  }
  const step = currentStep(state);
  const target = stepTarget(state, city);
  const distance = target ? Math.hypot(ctx.x - target.x, ctx.y - target.y) : Infinity;
  let done = false;
  let failed = false;
  if (step.type === 'steal') {
    done = ctx.inCar;
  } else if (step.type === 'steal-van') {
    done = ctx.inCar && ctx.carType === 'van';
  } else if (step.type === 'race') {
    if (ctx.race && ctx.race.laps > state.raceLaps) {
      done = true;
      state.raceStarted = false;
    } else if (ctx.race && state.raceStarted && !ctx.race.active && ctx.race.laps === state.raceLaps && ctx.race.timer <= 0) {
      state.message = 'Out of time — the race is lost. Line up at the gate and try again.';
      state.messageTime = 4;
      state.raceStarted = false;
      events.push(...beginMission(state, city));
      return events;
    }
  } else if (step.type === 'go') {
    done = distance < step.radius;
  } else if (step.type === 'pickup') {
    done = ctx.interact && distance < step.radius;
  } else if (step.type === 'timed') {
    state.timer -= dt;
    done = distance < step.radius;
    failed = !done && state.timer <= 0;
  } else if (step.type === 'hold') {
    if (ctx.holding && distance < step.radius) {
      state.holdProgress += dt;
      done = state.holdProgress >= step.seconds;
    } else {
      state.holdProgress = Math.max(0, state.holdProgress - dt * 2);
    }
  } else if (step.type === 'fight') {
    done = ctx.enemiesAlive === 0;
  } else if (step.type === 'survive') {
    state.timer -= dt;
    done = state.timer <= 0;
  }
  if (failed) {
    state.message = 'Too slow — the job fell through. Maya wants you to try again.';
    state.messageTime = 4;
    events.push(...beginMission(state, city));
    return events;
  }
  if (!done) return events;
  state.step += 1;
  if (state.step >= mission.steps.length) {
    events.push({ kind: 'reward', amount: mission.reward });
    events.push({ kind: 'mission-done', id: mission.id, title: mission.title, reward: mission.reward });
    state.index += 1;
    if (state.index >= MISSIONS.length) {
      state.storyDone = true;
      state.active = false;
      events.push({ kind: 'story-done' });
    } else {
      state.message = `${MISSIONS[state.index].title} — ${MISSIONS[state.index].briefing}`;
      state.messageTime = 6;
      events.push(...beginMission(state, city));
    }
  } else {
    events.push({ kind: 'step-done', text: step.text });
    events.push(...startStep(state, city));
  }
  return events;
}

/** A taxi fare: a passenger waiting at a road corner, a destination, a clock and a price. */
export function offerFare(state, city, random) {
  const keys = Object.keys(city.landmarks);
  const from = city.landmarks[keys[Math.floor(random() * keys.length)]];
  let to = city.landmarks[keys[Math.floor(random() * keys.length)]];
  while (to === from) to = city.landmarks[keys[Math.floor(random() * keys.length)]];
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  state.fare = {
    from: { x: from.x, y: from.y, label: from.label },
    to: { x: to.x, y: to.y, label: to.label },
    price: 80 + Math.round(distance / 40) * 10,
    seconds: 45 + distance / 55,
    pickedUp: false,
    timer: 0,
  };
  return state.fare;
}

function updateFare(state, city, ctx, dt) {
  if (!state.storyDone) return;
  state.fareCooldown -= dt;
  if (!state.fare && state.fareCooldown <= 0) {
    offerFare(state, city, ctx.random);
    state.fareCooldown = 20;
    return;
  }
  const fare = state.fare;
  if (!fare) return;
  if (!fare.pickedUp) {
    if (ctx.interact && Math.hypot(ctx.x - fare.from.x, ctx.y - fare.from.y) < 90) {
      fare.pickedUp = true;
      fare.timer = fare.seconds;
      state.message = `Fare to ${fare.to.label} — ${Math.ceil(fare.seconds)}s on the clock.`;
      state.messageTime = 4;
    }
    return;
  }
  fare.timer -= dt;
  if (Math.hypot(ctx.x - fare.to.x, ctx.y - fare.to.y) < 100) {
    ctx.farePaid = fare.price;
    state.message = `Fare paid: $${fare.price}.`;
    state.messageTime = 3;
    state.fare = null;
    state.fareCooldown = 12;
  } else if (fare.timer <= 0) {
    state.message = 'Fare lost — the passenger walked.';
    state.messageTime = 3;
    state.fare = null;
    state.fareCooldown = 12;
  }
}
