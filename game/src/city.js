// Solara Bay's map: one square city on a road grid, eight districts, eleven
// landmarks, and buildings tucked inside the blocks between the roads. The whole
// city is dealt from a single seeded generator, so the same seed always builds the
// same streets, the same blocks, and the same skyline.

import { createRandom } from './random.js';
import { DISTRICT_ROOFS, WORLD } from './config.js';

/** The bay starts here. Water south of this line, sand just above it. */
export const WATER_Y = 3840;

const LINES = [512, 1024, 1536, 2048, 2560, 3072, 3584];

const LANDMARKS = {
  garage: { x: 512, y: 512, label: 'Maya\u2019s Garage' },
  bank: { x: 1536, y: 1024, label: 'Solara Bank' },
  hospital: { x: 2560, y: 512, label: 'General Hospital' },
  policeHq: { x: 1024, y: 2048, label: 'Police HQ' },
  diner: { x: 1024, y: 1024, label: 'Diner' },
  port: { x: 2560, y: 3584, label: 'Port Gate' },
  market: { x: 512, y: 2560, label: 'Calle Ocho Market' },
  university: { x: 2048, y: 1024, label: 'University' },
  observatory: { x: 3584, y: 512, label: 'Observatory' },
  safehouse: { x: 3072, y: 2048, label: 'Safehouse' },
  raceGate: { x: 1024, y: 3584, label: 'Race Gate' },
};

const DISTRICTS = [
  ['Old Town', 'Downtown', 'Northside', 'Vista Heights'],
  ['Calle Ocho', 'Industrial', 'Portside', 'Marina'],
];

// Twelve places the city hides things: crossings only, never inside a block, so a
// package is always reachable on foot.
const COLLECTIBLE_CORNERS = [
  [512, 1536], [1536, 512], [2048, 512], [3072, 512],
  [512, 3072], [3584, 1536], [1536, 2048], [2048, 2048],
  [2560, 2048], [3584, 2560], [1536, 3072], [2560, 3072],
];

/** The district a point belongs to. Columns of the grid, then north or south. */
export function districtName(_city, x, y) {
  const column = x < 1024 ? 0 : x < 2048 ? 1 : x < 3072 ? 2 : 3;
  const row = y < 2048 ? 0 : 1;
  return DISTRICTS[row][column];
}

export function landmark(city, key) {
  return city.landmarks[key] || null;
}

export function collectibleSpots() {
  return COLLECTIBLE_CORNERS.map(([x, y]) => ({ x, y }));
}

export function nearestRoad(city, x, y) {
  let vLine = city.lines[0];
  let vDist = Math.abs(x - vLine);
  let hLine = city.lines[0];
  let hDist = Math.abs(y - hLine);
  for (const line of city.lines) {
    if (Math.abs(x - line) < vDist) {
      vDist = Math.abs(x - line);
      vLine = line;
    }
    if (Math.abs(y - line) < hDist) {
      hDist = Math.abs(y - line);
      hLine = line;
    }
  }
  return vDist <= hDist
    ? { axis: 'v', line: vLine, along: y }
    : { axis: 'h', line: hLine, along: x };
}

export function hitsBuilding(city, x, y, radius) {
  for (const b of city.buildings) {
    if (x + radius > b.x && x - radius < b.x + b.w
      && y + radius > b.y && y - radius < b.y + b.h) return true;
  }
  return false;
}

/**
 * Shove a body out of whatever building it overlaps, along the shallowest side.
 * Repeats a few times because a push out of one block can land inside the next.
 * Returns true when the body moved.
 */
export function pushOutOfBuildings(city, body, radius) {
  let moved = false;
  for (let tries = 0; tries < 4; tries += 1) {
    let hit = null;
    for (const b of city.buildings) {
      if (body.x + radius > b.x && body.x - radius < b.x + b.w
        && body.y + radius > b.y && body.y - radius < b.y + b.h) {
        hit = b;
        break;
      }
    }
    if (!hit) return moved;
    const left = (body.x + radius) - hit.x;
    const right = (hit.x + hit.w) - (body.x - radius);
    const top = (body.y + radius) - hit.y;
    const bottom = (hit.y + hit.h) - (body.y - radius);
    const shallow = Math.min(left, right, top, bottom);
    if (shallow === left) body.x = hit.x - radius;
    else if (shallow === right) body.x = hit.x + hit.w + radius;
    else if (shallow === top) body.y = hit.y - radius;
    else body.y = hit.y + hit.h + radius;
    moved = true;
  }
  return moved;
}

/** A random point on a road, with its direction and lane, for traffic and parking. */
export function randomRoadSpot(city, random) {
  const vertical = random() < 0.5;
  const line = city.lines[Math.floor(random() * city.lines.length)];
  const along = 256 + random() * (city.size - 512);
  const dir = random() < 0.5 ? -1 : 1;
  const lane = dir > 0 ? 12 : -12;
  if (vertical) return { x: line + lane, y: along, axis: 'v', line, dir, lane };
  return { x: along, y: line + lane, axis: 'h', line, dir, lane };
}

export function buildCity(seed) {
  const random = createRandom(seed);
  const buildings = [];
  const parks = [];

  // The blocks are the squares between roads; the outer strips count too. The
  // coastal strip (y 3584-3840) is land; south of the bay is not.
  const bands = [0, 512, 1024, 1536, 2048, 2560, 3072, 3584, 4096];
  const parkPicks = new Set();
  while (parkPicks.size < 3) {
    parkPicks.add(Math.floor(random() * 64));
  }
  let blockIndex = 0;
  for (let bx = 0; bx < bands.length - 1; bx += 1) {
    for (let by = 0; by < bands.length - 1; by += 1) {
      const x0 = bands[bx];
      const y0 = bands[by];
      const x1 = bands[bx + 1];
      const y1 = Math.min(bands[by + 1], WATER_Y);
      const isPark = parkPicks.has(blockIndex);
      blockIndex += 1;
      if (y0 >= WATER_Y) continue;
      if (isPark) {
        const trees = [];
        const treeCount = 5 + Math.floor(random() * 4);
        for (let i = 0; i < treeCount; i += 1) {
          trees.push({
            x: x0 + 40 + random() * (x1 - x0 - 80),
            y: y0 + 40 + random() * (y1 - y0 - 80),
            r: 8 + random() * 8,
          });
        }
        parks.push({ x: x0 + 20, y: y0 + 20, w: x1 - x0 - 40, h: y1 - y0 - 40, trees });
        continue;
      }
      const roll = random();
      const count = roll < 0.2 ? 0 : roll > 0.85 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const inset = 60;
        const w = 60 + random() * 110;
        const h = 60 + random() * 110;
        const roomX = x1 - x0 - inset * 2 - w;
        const roomY = y1 - y0 - inset * 2 - h;
        if (roomX < 0 || roomY < 0) continue;
        const cx = x0 + inset + random() * roomX;
        const cy = y0 + inset + random() * roomY;
        const roofs = DISTRICT_ROOFS[districtName(null, cx + w / 2, cy + h / 2)];
        buildings.push({
          x: Math.round(cx),
          y: Math.round(cy),
          w: Math.round(w),
          h: Math.round(h),
          roof: roofs[Math.floor(random() * roofs.length)],
          tall: random() < 0.25,
        });
      }
    }
  }

  return {
    size: WORLD.size,
    lines: LINES.slice(),
    buildings,
    parks,
    landmarks: LANDMARKS,
    seed,
  };
}
