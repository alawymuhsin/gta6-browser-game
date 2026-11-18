// The city of Solara Bay: a road grid, the blocks between the roads, the buildings and parks
// in them, the bay along the south edge, and the landmarks the story points at. Everything is
// dealt from the seed, so the same seed always builds the same city. Eight districts now,
// each with its own roof palette, so the town reads differently from the air.

import { DISTRICT_ROOFS, WORLD } from './config.js';
import { pickInt, pickOne } from './random.js';

const PARK_TREES = 7;

/** The bay: everything south of this y is water, and nothing is built there. */
export const WATER_Y = 3840;

/** The eight districts, in the order the HUD's location line names them. */
export const DISTRICTS = ['Old Town', 'Downtown', 'Industrial', 'Marina', 'Calle Ocho', 'Northside', 'Portside', 'Vista Heights'];

/** Landmarks, each on a road corner so the player can always reach them. */
const LANDMARK_SPOTS = {
  garage: { x: 1024, y: 1536, label: "Maya's Garage" },
  bank: { x: 2048, y: 2048, label: 'Solara Bank' },
  hospital: { x: 3072, y: 1024, label: 'St. Anselm Hospital' },
  policeHq: { x: 1024, y: 2560, label: 'Police HQ' },
  safehouse: { x: 512, y: 3072, label: 'Safehouse' },
  vipers: { x: 3584, y: 2560, label: 'Viper Turf' },
  diner: { x: 1536, y: 3072, label: 'Blue Diner' },
  port: { x: 2560, y: 3584, label: 'Port Gate' },
  raceGate: { x: 1024, y: 3584, label: 'Race Gate' },
  market: { x: 512, y: 2048, label: 'Calle Ocho Market' },
  university: { x: 2048, y: 512, label: 'Northside University' },
  observatory: { x: 3584, y: 512, label: 'Vista Observatory' },
};

/**
 * The district at a point. The south shore is the Marina, the east yards are Industrial
 * and Portside, the north-east rise is Vista Heights, the north centre is Northside, the
 * west strip is Calle Ocho, and the rest splits into Old Town and Downtown.
 */
function districtAt(x, y) {
  if (y > 3328) return x > 2688 ? 'Portside' : 'Marina';
  if (y < 1024) return x > 2688 ? 'Vista Heights' : x > 1408 ? 'Northside' : 'Old Town';
  if (x < 1024) return 'Calle Ocho';
  if (x > 2688) return 'Industrial';
  if (x < 1408) return 'Old Town';
  return 'Downtown';
}

/** The roof palette of the district at a point. */
export function districtRoofs(x, y) {
  return DISTRICT_ROOFS[districtAt(x, y)] ?? DISTRICT_ROOFS.Downtown;
}

function roadLines() {
  const lines = [];
  for (let at = 0; at <= WORLD.size; at += WORLD.roadPitch) lines.push(at);
  return lines;
}

function buildBlocks(random) {
  const buildings = [];
  const parks = [];
  const pitch = WORLD.roadPitch;
  const edge = WORLD.roadWidth / 2 + 14;
  for (let bx = 0; bx < 8; bx += 1) {
    for (let by = 0; by < 8; by += 1) {
      const x0 = bx * pitch + edge;
      const y0 = by * pitch + edge;
      const x1 = (bx + 1) * pitch - edge;
      const y1 = (by + 1) * pitch - edge;
      if (y0 >= WATER_Y - 40) continue;
      const roll = random();
      if (roll < 0.1) {
        // The park's rectangle is clipped at the shore, and the trees must be planted
        // inside that clipped rectangle, not the unclipped block, or they grow in the bay.
        const parkH = Math.min(y1, WATER_Y - 40) - y0;
        const trees = [];
        for (let t = 0; t < PARK_TREES; t += 1) {
          trees.push({ x: x0 + 30 + random() * (x1 - x0 - 60), y: y0 + 30 + random() * (parkH - 60), r: 12 + random() * 10 });
        }
        parks.push({ x: x0, y: y0, w: x1 - x0, h: parkH, trees });
        continue;
      }
      if (roll < 0.18) continue; // an empty lot: a car park with room to turn in
      const district = districtAt(x0 + 100, y0 + 100);
      const count = district === 'Downtown' || district === 'Vista Heights' ? pickInt(random, 1, 2) : pickInt(random, 1, 3);
      for (let n = 0; n < count; n += 1) {
        const w = 70 + random() * 130;
        const h = 70 + random() * 130;
        const x = x0 + random() * Math.max(1, x1 - x0 - w);
        const y = y0 + random() * Math.max(1, y1 - y0 - h);
        if (y + h > WATER_Y - 40) continue;
        const tall = (district === 'Downtown' || district === 'Vista Heights') && random() < 0.45;
        buildings.push({
          x, y, w, h,
          roof: pickOne(random, districtRoofs(x, y)),
          tall,
          district,
        });
      }
    }
  }
  return { buildings, parks };
}

export function buildCity(random) {
  const { buildings, parks } = buildBlocks(random);
  return {
    size: WORLD.size,
    lines: roadLines(),
    buildings,
    parks,
    landmarks: LANDMARK_SPOTS,
  };
}

/** The district name at a point, for the HUD's location line. */
export function districtName(city, x, y) {
  if (y > WATER_Y) return 'The Bay';
  return districtAt(x, y);
}

/** Where a landmark sits, by its key (garage, bank, hospital, policeHq, safehouse, vipers, diner, port, raceGate, market, university, observatory). */
export function landmark(city, key) {
  return city.landmarks[key];
}

/** Twelve hidden-package spots, one per district corner, for the collectible hunt. */
export function collectibleSpots() {
  return [
    { x: 512, y: 512 }, { x: 1536, y: 512 }, { x: 2560, y: 512 }, { x: 3584, y: 1024 },
    { x: 512, y: 1536 }, { x: 3584, y: 1536 }, { x: 1024, y: 2560 }, { x: 3072, y: 2048 },
    { x: 512, y: 3072 }, { x: 2048, y: 3072 }, { x: 3072, y: 3072 }, { x: 1536, y: 3584 },
  ];
}

/** True when the point is on a road's asphalt (not on the sidewalk or in a block). */
export function onAsphalt(city, x, y) {
  const half = WORLD.roadWidth / 2 - WORLD.sidewalk;
  for (const line of city.lines) {
    if (Math.abs(x - line) <= half || Math.abs(y - line) <= half) return true;
  }
  return false;
}

/**
 * Which road a point is nearest to, and how far along it: { axis, line, along, offset }.
 * axis 'v' means the road runs north-south (the line is an x), 'h' east-west.
 */
export function nearestRoad(city, x, y) {
  let best = null;
  for (const line of city.lines) {
    const dV = Math.abs(x - line);
    const dH = Math.abs(y - line);
    if (best === null || dV < best.distance) best = { axis: 'v', line, along: y, offset: x - line, distance: dV };
    if (dH < best.distance) best = { axis: 'h', line, along: x, offset: y - line, distance: dH };
  }
  return best;
}

/** True when a circle of radius r at (x, y) touches a building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

/**
 * Push a circle out of any building it overlaps, one axis at a time, and return whether it
 * was pushed. The caller moves, then calls this, so a wall stops the walk instead of swallowing it.
 */
export function pushOutOfBuildings(city, body, r) {
  let pushed = false;
  for (const b of city.buildings) {
    if (body.x + r <= b.x || body.x - r >= b.x + b.w || body.y + r <= b.y || body.y - r >= b.y + b.h) continue;
    const pushLeft = body.x + r - b.x;
    const pushRight = b.x + b.w - (body.x - r);
    const pushUp = body.y + r - b.y;
    const pushDown = b.y + b.h - (body.y - r);
    const smallest = Math.min(pushLeft, pushRight, pushUp, pushDown);
    if (smallest === pushLeft) body.x = b.x - r;
    else if (smallest === pushRight) body.x = b.x + b.w + r;
    else if (smallest === pushUp) body.y = b.y - r;
    else body.y = b.y + b.h + r;
    pushed = true;
  }
  return pushed;
}

/** Keep a circle inside the city and out of the bay. */
export function clampToCity(city, body, r) {
  body.x = Math.max(r, Math.min(city.size - r, body.x));
  body.y = Math.max(r, Math.min(WATER_Y - r, body.y));
}

/** A random spot on an interior road, for spawning traffic: { x, y, axis, dir, line, lane }. */
export function randomRoadSpot(city, random) {
  const inner = city.lines.slice(1, -1);
  const axis = random() < 0.5 ? 'v' : 'h';
  const line = pickOne(random, inner);
  const along = 256 + random() * (city.size - 512);
  const lane = (random() < 0.5 ? -1 : 1) * 12;
  const dir = random() < 0.5 ? -1 : 1;
  return axis === 'v'
    ? { x: line + lane, y: along, axis, dir, line, lane }
    : { x: along, y: line + lane, axis, dir, line, lane };
}
