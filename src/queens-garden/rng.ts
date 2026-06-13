// Deterministic seeded PRNG (mulberry32). The numeric state is threaded through `State.rng`
// so the same seed + the same action sequence reproduces every draw — the property that makes
// the action log replayable (and, later, safe to send over the wire).

export type Rng = {
  float(): number; // [0, 1)
  int(maxExclusive: number): number; // [0, maxExclusive)
  shuffle<T>(items: readonly T[]): T[]; // Fisher–Yates copy
  state(): number; // current PRNG state, to store back into State.rng
};

export function makeRng(seed: number): Rng {
  let a = seed | 0;

  const float = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => Math.floor(float() * maxExclusive);

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  };

  return { float, int, shuffle, state: () => a };
}
