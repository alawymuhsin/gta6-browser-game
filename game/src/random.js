// One tiny seeded generator (mulberry32). Feed it a seed and it deals the same
// city, the same traffic and the same staged frames every time, so any scene
// can be replayed exactly from its seed alone.

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

/** A shuffled copy of an array, dealt from the same generator. */
export function shuffle(random, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** One entry of [{ value, weight }], heavier entries drawn more often. */
export function pickWeighted(random, entries) {
  let total = 0;
  for (const entry of entries) total += entry.weight;
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}
