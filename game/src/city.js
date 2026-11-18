// Solara Bay — the city itself. A fixed 4096 by 4096 grid: nine roads each way, eight
// districts, buildings packed into the blocks between roads, a few parks, and eleven
// landmarks on road crossings. Everything here derives from one seed, so the same seed
// always builds the same city: buildCity owns its own random stream and consumes it in a
// fixed order (blocks row by row, then parks, then trees), so a later change in how cars
// or pedestrians are spawned can never shift a wall.

import { createRandom } from './random.js';
import { DISTRICT_ROOFS, WORLD } from './config.js';

export const WATER_Y = 3840;

// The eight districts, in the order they are laid down: the smaller ones (Vista Heights,
// Portside) are listed last so they win where they overlap the bigger ones.
const DISTRICTS = [
  { name: 'Old Town', x0: 0, y0: 0, x1: 1536, y1: 1536 },
  { name: 'Downtown', x0: 1536, y0: 0, x1: 4096, y1: 1536 },
  { name: 'Industrial', x0: 2560, y0: 1536, x1: 4096, y1: 3584 },
  { name: 'Calle Ocho', x0: 0, y0: 1536, x1: 1536, y1: 3584 },
  { name: 'Northside', x0: 1536, y0: 1536, x1: 2560, y1: 3584 },
  { name: 'Marina', x0: 0, y0: 3584, x1: 4096, y1: 4096 },
  { name: 'Vista Heights', x0: 3072, y0: 0, x1: 4096, y1: 1536 },
  { name: 'Portside', x0: 2560, y0: 3584, x1: 4096, y1: 4096 },
];

// ------------------------------------------------------------------ the build

/** A district containing a point, last match wins so the smaller overlays (Vista Heights,
// Portside) are reachable instead of being shadowed by the big ones that contain them. */
function districtAt(districts, x, y) {
  for (let i = districts.length - 1; i >= 0; i--) {
    const d = districts[i];
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return null;
}

/** The eleven fixed landmarks, all on road crossings so every one is reachable. */
function buildLandmarks() {
  return {
    garage: { x: 512, y: 512, label: "Maya's Garage" },
    bank: { x: 2560, y: 1024, label: 'Solara Bank' },
    hospital: { x: 2048, y: 1536, label: 'Solara General' },
    policeHq: { x: 2560, y: 512, label: 'Police HQ' },
    diner: { x: 512, y: 2560, label: 'Diner' },
    port: { x: 2560, y: 3584, label: 'Port Gate' },
    market: { x: 512, y: 2048, label: 'Market' },
    university: { x: 1536, y: 512, label: 'University' },
    observatory: { x: 3584, y: 512, label: 'Observatory' },
    raceGate: { x: 1024, y: 3584, label: 'Race Gate' },
    safehouse: { x: 3072, y: 2560, label: 'Safehouse' },
  };
}

/** The city for a seed: roads, districts, buildings, parks and landmarks. */
export function buildCity(seed) {
  const random = createRandom(seed);
  const size = WORLD.size;
  const lines = [];
  for (let p = 0; p <= size; p += WORLD.roadPitch) lines.push(p);
  const districts = DISTRICTS.map((d) => ({ ...d }));
  const buildings = [];
  const parks = [];
  const half = WORLD.roadWidth / 2;
  for (let ix = 0; ix < lines.length - 1; ix++) {
    for (let iy = 0; iy < lines.length - 1; iy++) {
      const x0 = lines[ix] + half + 24;
      const x1 = lines[ix + 1] - half - 24;
      const y0 = lines[iy] + half + 24;
      const y1 = lines[iy + 1] - half - 24;
      if (y0 >= WATER_Y) continue; // the bay strip holds no buildings
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(districts, cx, cy);
      const roofs = district ? DISTRICT_ROOFS[district.name] : DISTRICT_ROOFS['Old Town'];
      if (random() < 0.1) {
        const trees = [];
        const count = 6 + Math.floor(random() * 6);
        for (let t = 0; t < count; t++) {
          trees.push({
            x: x0 + 20 + random() * (x1 - x0 - 40),
            y: y0 + 20 + random() * (y1 - y0 - 40),
            r: 8 + random() * 10,
          });
        }
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, trees });
        continue;
      }
      // One building per block, sometimes two side by side in the wider blocks.
      const twin = random() < 0.35 && x1 - x0 > 300;
      const spots = twin ? 2 : 1;
      for (let s = 0; s < spots; s++) {
        const w = 90 + random() * 130;
        const h = 90 + random() * 130;
        const bx = twin ? x0 + s * ((x1 - x0) / 2) + 8 : x0 + random() * Math.max(1, x1 - x0 - w);
        const by = y0 + random() * Math.max(1, y1 - y0 - h);
        buildings.push({
          x: Math.min(bx, x1 - w - 4),
          y: Math.min(by, y1 - h - 4),
          w: Math.min(w, x1 - x0 - 8),
          h: Math.min(h, y1 - y0 - 8),
          roof: roofs[Math.floor(random() * roofs.length)],
          tall: district !== null && district.name === 'Downtown' && random() < 0.3,
        });
      }
    }
  }
  return { size, lines, districts, buildings, parks, landmarks: buildLandmarks() };
}

// ------------------------------------------------------------------ queries

/** The district name at a point, or the city name when outside every district. */
export function districtName(city, x, y) {
  const d = districtAt(city.districts, x, y);
  return d ? d.name : 'Solara Bay';
}

/** A random spot on a road: an interior road line, a direction and a lane offset. */
export function randomRoadSpot(city, random) {
  const axis = random() < 0.5 ? 'v' : 'h';
  const inner = city.lines.filter((line) => line > 0 && line < city.size && line < WATER_Y);
  const line = inner[Math.floor(random() * inner.length)];
  const dir = random() < 0.5 ? 1 : -1;
  const along = 256 + random() * (city.size - 512);
  const lane = dir > 0 ? 12 : -12;
  return axis === 'v'
    ? { x: line + lane, y: along, axis, line, dir, lane }
    : { x: along, y: line + lane, axis, line, dir, lane };
}

/** The road line nearest a point, with the coordinate along that road. */
export function nearestRoad(city, x, y) {
  let bestV = null;
  let bestH = null;
  for (const line of city.lines) {
    const dv = Math.abs(x - line);
    if (bestV === null || dv < bestV.d) bestV = { axis: 'v', line, d: dv };
    const dh = Math.abs(y - line);
    if (bestH === null || dh < bestH.d) bestH = { axis: 'h', line, d: dh };
  }
  return bestV.d <= bestH.d
    ? { axis: 'v', line: bestV.line, along: y }
    : { axis: 'h', line: bestH.line, along: x };
}

/** Push a circle out of every building it overlaps, along the smallest penetration. */
export function pushOutOfBuildings(city, body, r) {
  let pushed = false;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - nx;
    const dy = body.y - ny;
    if (dx * dx + dy * dy >= r * r) continue;
    const left = body.x - (b.x - r);
    const right = b.x + b.w + r - body.x;
    const top = body.y - (b.y - r);
    const bottom = b.y + b.h + r - body.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) body.x = b.x - r;
    else if (m === right) body.x = b.x + b.w + r;
    else if (m === top) body.y = b.y - r;
    else body.y = b.y + b.h + r;
    pushed = true;
  }
  return pushed;
}

/** Whether a circle at a point touches any building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

/** A landmark by key, or null when the city has no such landmark. */
export function landmark(city, key) {
  return city.landmarks[key] ?? null;
}

/** The twelve hidden-package spots: road crossings spread over the whole map. */
export function collectibleSpots() {
  const xs = [512, 1536, 2560, 3584];
  const ys = [512, 1536, 3584];
  const out = [];
  for (const y of ys) for (const x of xs) out.push({ x, y });
  return out;
}
