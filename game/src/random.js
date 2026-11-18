// A small seeded random source (mulberry32 core) with the helpers the city and
// traffic code need. The same seed always gives the same city, the same traffic
// and the same screenshot scenes, which is what makes the staged shots repeatable.

export function createRandom(seed) {
  let a = (seed >>> 0) || 1;

  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  function range(min, max) {
    return min + next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  function int(min, max) {
    return min + Math.floor(next() * (max - min + 1));
  }

  /** One element of an array. */
  function pick(array) {
    return array[Math.floor(next() * array.length)];
  }

  /** True with probability p. */
  function chance(p) {
    return next() < p;
  }

  /** A value from a normal-ish distribution (sum of three uniforms), in [min, max]. */
  function bell(min, max) {
    const v = (next() + next() + next()) / 3;
    return min + v * (max - min);
  }

  return { next, range, int, pick, chance, bell };
}
