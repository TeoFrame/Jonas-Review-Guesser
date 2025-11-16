/**
 * Seeded Random Number Generator
 * Ensures all users see the same random values based on a seed
 */

(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  /**
   * Simple seeded random number generator (Mulberry32)
   * @param {number} seed - Seed value
   * @returns {Function} Random number generator function
   */
  function seededRandom(seed) {
    let state = seed;
    return function() {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Generate a seed from a string (e.g., gameId)
   * @param {string} str - String to generate seed from
   * @returns {number} Seed value
   */
  function seedFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Create a seeded random number generator from a game ID
   * @param {string} gameId - Game/app ID to use as seed
   * @returns {Function} Random number generator function
   */
  function createSeededRandom(gameId) {
    const seed = seedFromString(gameId || 'default');
    return seededRandom(seed);
  }

  /**
   * Generate a random integer between min and max (inclusive) using seeded random
   * @param {Function} rng - Seeded random number generator
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} Random integer
   */
  function seededRandInt(rng, min, max) {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  // Expose API
  ns.seededRandom = {
    create: createSeededRandom,
    randInt: seededRandInt,
    seedFromString: seedFromString,
  };
})(window);

