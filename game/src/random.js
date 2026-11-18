// A small seeded generator (mulberry32): the same seed always deals the same city, the same
// traffic and the same staged screenshots, so a scene can be replayed exactly.

export function createRandom(seed) {
  let value = seed >>> 0;
  return function random() {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer from min to max inclusive, from the same generator. */
export function pickInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of an array, from the same generator. */
export function pickOne(random, list) {
  return list[Math.floor(random() * list.length)];
}
