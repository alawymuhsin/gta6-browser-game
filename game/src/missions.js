// missions.js — data sepuluh misi cerita Solara Bay: nama, bayaran, briefing,
// dan dua fungsi yang dipakai HUD dan minimap: objectiveText (apa yang harus
// dilakukan sekarang) dan stepTarget (ke mana penanda di peta harus menunjuk).
// Logika setup dan penyelesaian misinya tinggal di world.js; file ini hanya
// mendeskripsikan misi, supaya render dan tes bisa membaca target tanpa
// menjalankan simulasi.

import { landmark } from './city.js';

/** Sepuluh misi cerita, sesuai urutan di README. */
export const MISSION_NAMES = [
  'First Wheels',
  'The Package',
  'Viper Nest',
  'Heat',
  'The Big Score',
  'Radio Silence',
  'Grand Prix',
  'The Safehouse',
  'Air Support',
  'Harbor Heist',
];

/** Bayaran tiap misi selesai, dalam dolar. Misi 4, 5, dan 9 angkanya dipakai tes. */
export const MISSION_PAY = [200, 300, 400, 500, 2500, 400, 800, 600, 700, 5000];

/** Satu kalimat briefing per misi, ditampilkan saat misi dimulai. */
export const MISSION_BRIEFINGS = [
  'Maya Solis: First job — steal a car. Any car. Then the city is yours.',
  'Maya Solis: Pick up the package at the Diner and take it to the Bank.',
  'Maya Solis: The Vipers own that block. Clear the nest.',
  'Heat: Lose the cops. Stay out of trouble until the heat dies down.',
  'The Big Score: Hold E at the bank vault, then take the bag to the garage.',
  'Radio Silence: Steal the broadcast van at the Observatory. Bring it home.',
  'Grand Prix: Win the street race. Four checkpoints, one winner.',
  'The Safehouse: Take the block from the Vipers. The house is yours after.',
  'Air Support: The helicopter is up. Survive until it gives up.',
  'Harbor Heist: Get to the Port Gate, clear it, then drive the take home.',
];

/** Markas Viper: perempatan tempat empat Viper misi 2 menunggu. */
const VIPER_NEST = { x: 3584, y: 2560 };

/**
 * Titik yang dituju misi saat ini, atau null kalau tidak ada penanda.
 * Dipakai HUD (panah penanda) dan minimap. Untuk misi balap, targetnya adalah
 * checkpoint aktif; setelah cerita selesai, targetnya adalah fare yang sedang jalan.
 */
export function stepTarget(missions, city) {
  if (!missions || !missions.active) {
    if (missions && missions.fare) {
      const fare = missions.fare;
      return fare.pickedUp ? { x: fare.to.x, y: fare.to.y } : { x: fare.from.x, y: fare.from.y };
    }
    return null;
  }
  const index = missions.index;
  const step = missions.step;
  switch (index) {
    case 0:
      return landmark(city, 'garage');
    case 1:
      return step === 0 ? landmark(city, 'diner') : landmark(city, 'bank');
    case 2:
      return VIPER_NEST;
    case 3:
      return null;
    case 4:
      return step === 0 ? landmark(city, 'bank') : landmark(city, 'garage');
    case 5:
      return step === 0 ? landmark(city, 'observatory') : landmark(city, 'garage');
    case 6:
      return null;
    case 7:
      return landmark(city, 'safehouse');
    case 8:
      return null;
    case 9:
      if (step === 0) return landmark(city, 'port');
      if (step === 1) return landmark(city, 'port');
      return landmark(city, 'garage');
    default:
      return null;
  }
}

/**
 * Kalimat objektif untuk HUD: apa yang harus dilakukan pemain sekarang.
 * Selalu mengembalikan string tidak kosong selama cerita berjalan.
 */
export function objectiveText(missions, race) {
  if (!missions || !missions.active) {
    if (missions && missions.fare) {
      return missions.fare.pickedUp
        ? `Drop off the fare at ${missions.fare.to.label || 'the destination'}`
        : `Pick up the fare at ${missions.fare.from.label || 'the pickup'}`;
    }
    return 'The city is yours — drive, earn, and stay free.';
  }
  const index = missions.index;
  const step = missions.step;
  switch (index) {
    case 0:
      return 'First Wheels: Steal a car';
    case 1:
      return step === 0
        ? 'The Package: Pick up the package at the Diner (E)'
        : 'The Package: Deliver the package to the Bank';
    case 2:
      return 'Viper Nest: Clear the Vipers';
    case 3:
      return 'Heat: Lose the cops — stay clean until the heat dies down';
    case 4:
      return step === 0
        ? 'The Big Score: Hold E at the bank vault'
        : 'The Big Score: Take the bag to the garage';
    case 5:
      return step === 0
        ? 'Radio Silence: Steal the broadcast van at the Observatory'
        : 'Radio Silence: Drive the van to the garage';
    case 6:
      if (race && race.active && race.checkpoints && race.checkpoints.length > 0) {
        const left = race.checkpoints.length - race.index;
        return `Grand Prix: Hit the checkpoints (${left} left)`;
      }
      return 'Grand Prix: Win the street race';
    case 7:
      return 'The Safehouse: Take the block from the Vipers';
    case 8:
      return 'Air Support: Survive the helicopter';
    case 9:
      if (step === 0) return 'Harbor Heist: Reach the Port Gate';
      if (step === 1) return 'Harbor Heist: Clear the Port Gate';
      return 'Harbor Heist: Get away — drive to the garage';
    default:
      return 'The city is yours — drive, earn, and stay free.';
  }
}
