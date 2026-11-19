// city.js — peta Solara Bay: jaringan jalan, delapan distrik, sebelas landmark,
// gedung dan taman, plus semua helper yang dipakai modul lain untuk tetap berada
// di jalan dan keluar dari tembok. Semua yang acak di sini didealt dari satu
// generator ber-seed, jadi seed yang sama selalu membangun kota yang sama.

import { createRandom, pickInt, pickOne } from './random.js';
import { WORLD, DISTRICT_ROOFS } from './config.js';

/** Air dimulai dari garis ini: tidak ada yang dibangun di selatannya. */
export const WATER_Y = 3840;

/** Garis jalan: kisi teratur tiap 512 unit di kota selebar 4096 unit, termasuk tepinya. */
const LINES = [0, 512, 1024, 1536, 2048, 2560, 3072, 3584, 4096];

/** Delapan distrik dalam kisi 4 kolom x 2 baris. */
const DISTRICT_GRID = [
  ['Old Town', 'Downtown', 'Industrial', 'Northside'],
  ['Calle Ocho', 'Portside', 'Marina', 'Vista Heights'],
];

/** Sebelas landmark, semuanya berdiri tepat di perempatan (x dan y kelipatan 512). */
const LANDMARK_DEFS = [
  { key: 'garage', x: 512, y: 512, label: "Maya's Garage" },
  { key: 'hospital', x: 3072, y: 512, label: 'Hospital' },
  { key: 'bank', x: 2048, y: 1024, label: 'Bank' },
  { key: 'observatory', x: 3584, y: 1024, label: 'Observatory' },
  { key: 'diner', x: 1536, y: 1536, label: 'Diner' },
  { key: 'university', x: 3072, y: 1536, label: 'University' },
  { key: 'policeHq', x: 1024, y: 2048, label: 'Police HQ' },
  { key: 'market', x: 2048, y: 2560, label: 'Market' },
  { key: 'safehouse', x: 1024, y: 3072, label: 'Safehouse' },
  { key: 'raceGate', x: 1024, y: 3584, label: 'Race Gate' },
  { key: 'port', x: 2560, y: 3584, label: 'Port' },
];

/** Dua belas titik paket koleksi, tersebar di sudut dan tepi kota. */
const COLLECTIBLE_POINTS = [
  [512, 512], [2048, 512], [3584, 512],
  [1024, 1024], [3072, 1024],
  [512, 2048], [3584, 2048],
  [1024, 3072], [3072, 3072],
  [512, 3584], [2048, 3584], [3584, 3584],
];

/** Jarak tepi trotoar ke badan gedung, supaya gedung tidak pernah menyentuh jalan. */
const BUILDING_MARGIN = 48;

/** Bangun satu kota dari seed. Semua keacakan (gedung, taman) memakai generator ini. */
export function buildCity(seed) {
  const random = createRandom(seed);
  const buildings = [];
  const parks = [];

  // Tiga blok hijau: pilih tiga blok dalam kota, lalu tanami pohon secara acak.
  const parkBlocks = pickParkBlocks(random);
  for (const block of parkBlocks) {
    parks.push(makePark(random, block));
  }
  const parkKeys = new Set(parkBlocks.map((b) => `${b.col},${b.row}`));

  // Gedung: susuri blok demi blok di antara jalan. Tiap blok bisa kosong, berisi
  // satu gedung, atau dua gedung yang berbagi blok (kiri/kanan atau atas/bawah).
  for (let row = 0; row < ROWS.length; row += 1) {
    for (let col = 0; col < COLS.length; col += 1) {
      if (parkKeys.has(`${col},${row}`)) continue;
      const rect = blockRect(col, row);
      if (!rect) continue;
      const roof = DISTRICT_ROOFS[districtName(null, rect.x + rect.w / 2, rect.y + rect.h / 2)] || '#8a6f5c';
      const roll = random();
      if (roll < 0.2) continue;
      if (roll < 0.75) {
        buildings.push(makeBuilding(random, rect, roof));
      } else {
        const halves = splitBlock(rect, random() < 0.5);
        buildings.push(makeBuilding(random, halves[0], roof));
        buildings.push(makeBuilding(random, halves[1], roof));
      }
    }
  }

  const landmarks = {};
  for (const def of LANDMARK_DEFS) {
    landmarks[def.key] = { x: def.x, y: def.y, label: def.label };
  }

  return {
    size: WORLD.size,
    lines: LINES.slice(),
    buildings,
    landmarks,
    parks,
  };
}

/** Kolom blok: interval x di antara garis vertikal. */
const COLS = LINES.slice(0, -1).map((x, i) => [x, LINES[i + 1]]);

/** Baris blok: interval y di antara garis horizontal, ditambah strip pesisir sebelum air. */
const ROWS = [...LINES.slice(0, -2).map((y, i) => [y, LINES[i + 1]]), [3584, WATER_Y]];

/** Pilih tiga blok taman yang tidak berdekatan dengan start pemain. */
function pickParkBlocks(random) {
  const candidates = [];
  for (let row = 0; row < ROWS.length; row += 1) {
    for (let col = 0; col < COLS.length; col += 1) {
      if (col === 0 && row === 0) continue; // blok garasi: biarkan lapang
      candidates.push({ col, row });
    }
  }
  const chosen = [];
  while (chosen.length < 3 && candidates.length > 0) {
    const idx = pickInt(random, 0, candidates.length - 1);
    chosen.push(candidates.splice(idx, 1)[0]);
  }
  return chosen;
}

/** Kotak bangun sebuah blok: intervalnya dikurangi margin trotoar di semua sisi. */
function blockRect(col, row) {
  const [x0, x1] = COLS[col];
  const [y0, y1] = ROWS[row];
  const x = x0 + BUILDING_MARGIN;
  const y = y0 + BUILDING_MARGIN;
  const w = x1 - x0 - BUILDING_MARGIN * 2;
  const h = y1 - y0 - BUILDING_MARGIN * 2;
  if (w < 60 || h < 60) return null;
  return { x, y, w, h };
}

/** Bagi satu blok menjadi dua kotak (vertikal atau horizontal) untuk dua gedung. */
function splitBlock(rect, vertical) {
  if (vertical) {
    const mid = rect.x + rect.w / 2;
    return [
      { x: rect.x, y: rect.y, w: rect.w / 2 - 8, h: rect.h },
      { x: mid + 8, y: rect.y, w: rect.w / 2 - 8, h: rect.h },
    ];
  }
  const mid = rect.y + rect.h / 2;
  return [
    { x: rect.x, y: rect.y, w: rect.w, h: rect.h / 2 - 8 },
    { x: rect.x, y: mid + 8, w: rect.w, h: rect.h / 2 - 8 },
  ];
}

/** Satu gedung acak di dalam kotak yang diberikan. */
function makeBuilding(random, rect, roof) {
  const w = Math.max(70, Math.round(rect.w * (0.45 + random() * 0.5)));
  const h = Math.max(70, Math.round(rect.h * (0.45 + random() * 0.5)));
  const x = rect.x + Math.round(random() * Math.max(0, rect.w - w));
  const y = rect.y + Math.round(random() * Math.max(0, rect.h - h));
  return {
    x, y, w, h,
    roof: pickOne(random, roof),
    tall: random() < 0.25,
  };
}

/** Satu taman di blok yang diberikan, lengkap dengan pohon-pohonnya. */
function makePark(random, block) {
  const rect = blockRect(block.col, block.row);
  const trees = [];
  const count = pickInt(random, 4, 9);
  for (let i = 0; i < count; i += 1) {
    trees.push({
      x: rect.x + 20 + random() * (rect.w - 40),
      y: rect.y + 20 + random() * (rect.h - 40),
      r: 12 + random() * 10,
    });
  }
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h, trees };
}

/** Nama distrik di sebuah titik. Kisi 4x2, di-clamp supaya tepi kota tetap terpetakan. */
export function districtName(city, x, y) {
  const col = Math.min(3, Math.max(0, Math.floor(x / 1024)));
  const row = Math.min(1, Math.max(0, Math.floor(y / 2048)));
  return DISTRICT_GRID[row][col];
}

/** Ambil satu landmark dari kota berdasarkan kuncinya. */
export function landmark(city, key) {
  return city.landmarks[key];
}

/** Jalan terdekat dari sebuah titik: sumbu, garis, dan posisi sepanjang jalannya. */
export function nearestRoad(city, x, y) {
  let vLine = city.lines[0];
  let vDist = Math.abs(x - vLine);
  for (const line of city.lines) {
    const d = Math.abs(x - line);
    if (d < vDist) { vDist = d; vLine = line; }
  }
  let hLine = city.lines[0];
  let hDist = Math.abs(y - hLine);
  for (const line of city.lines) {
    const d = Math.abs(y - line);
    if (d < hDist) { hDist = d; hLine = line; }
  }
  if (vDist <= hDist) return { axis: 'v', line: vLine, along: y };
  return { axis: 'h', line: hLine, along: x };
}

/** Benar kalau titik (dengan radius r) berada di dalam salah satu gedung. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

/**
 * Dorong sebuah badan keluar dari gedung terdekat, ke tepi yang paling dekat.
 * Mengembalikan true kalau badan itu memang sempat bertabrakan. Dipanggil
 * berulang sampai badannya bersih (gedung bisa tumpang tindih di sudut blok).
 */
export function pushOutOfBuildings(city, body, r) {
  let pushed = false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let hit = null;
    for (const b of city.buildings) {
      if (body.x + r > b.x && body.x - r < b.x + b.w && body.y + r > b.y && body.y - r < b.y + b.h) {
        hit = b;
        break;
      }
    }
    if (!hit) break;
    pushed = true;
    const left = body.x - (hit.x - r);
    const right = (hit.x + hit.w + r) - body.x;
    const top = body.y - (hit.y - r);
    const bottom = (hit.y + hit.h + r) - body.y;
    const smallest = Math.min(left, right, top, bottom);
    if (smallest === left) body.x = hit.x - r;
    else if (smallest === right) body.x = hit.x + hit.w + r;
    else if (smallest === top) body.y = hit.y - r;
    else body.y = hit.y + hit.h + r;
  }
  return pushed;
}

/** Dua belas titik paket koleksi — tetap, tidak tergantung seed. */
export function collectibleSpots() {
  return COLLECTIBLE_POINTS.map(([x, y]) => ({ x, y }));
}

/**
 * Satu titik acak di atas jalan: garis, arah lalu lintas, dan lajur (±12).
 * Dipakai untuk menaruh mobil lalu lintas, mobil parkir, dan mobil polisi.
 */
export function randomRoadSpot(city, random) {
  const axis = random() < 0.5 ? 'v' : 'h';
  const inner = city.lines.filter((line) => line > 0 && line < WORLD.size);
  if (axis === 'v') {
    const line = pickOne(random, inner);
    const along = 100 + random() * 3400;
    const dir = random() < 0.5 ? -1 : 1;
    return { x: line + (dir > 0 ? 12 : -12), y: along, axis, line, dir, lane: dir > 0 ? 12 : -12 };
  }
  const roadLines = inner.filter((line) => line < WATER_Y);
  const line = pickOne(random, roadLines);
  const along = 100 + random() * 3900;
  const dir = random() < 0.5 ? -1 : 1;
  return { x: along, y: line + (dir > 0 ? 12 : -12), axis, line, dir, lane: dir > 0 ? 12 : -12 };
}
