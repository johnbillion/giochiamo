import { describe, expect, it } from 'vitest';

import { createInitialState } from './engine';
import { COLOURS, SYMBOLS, type State } from './types';

// Tiles visible right after the deal: bag + discard + whatever sits in the central area.
function tilesInPlay(state: State): number {
  const central =
    (state.central.top?.tiles.length ?? 0) +
    state.central.open.reduce((n, display) => n + display.tiles.length, 0);
  return state.supply.bag.length + state.supply.discard.length + central;
}

describe('initial deal', () => {
  it('accounts for all 108 tiles (none created or lost in the deal)', () => {
    expect(tilesInPlay(createInitialState(2, 1))).toBe(108);
  });

  it('deals n sections into the pile by player count (2→5, 3→6, 4→7)', () => {
    for (const [count, n] of [
      [2, 5],
      [3, 6],
      [4, 7],
    ] as const) {
      const s = createInitialState(count, 1);
      const inPile = (s.central.top ? 1 : 0) + s.central.pile.length;
      expect(inPile).toBe(n);
      expect(inPile + s.supply.sections.length).toBe(36); // all 36 accounted for
    }
  });

  it('puts 4 tiles on the top section and nothing split off yet', () => {
    const s = createInitialState(2, 1);
    expect(s.central.top?.tiles).toHaveLength(4);
    expect(s.central.open).toHaveLength(0);
  });

  it('is deterministic: same seed → identical deal, different seed → different', () => {
    expect(createInitialState(3, 42)).toEqual(createInitialState(3, 42));
    expect(createInitialState(3, 42)).not.toEqual(createInitialState(3, 43));
  });

  it('every dealt section identity is a real colour+symbol combo', () => {
    const s = createInitialState(4, 7);
    const all = [...(s.central.top ? [s.central.top.section] : []), ...s.central.pile, ...s.supply.sections];
    expect(all).toHaveLength(36);
    for (const section of all) {
      expect(section.identity).not.toBeNull();
      expect(COLOURS).toContain(section.identity!.colour);
      expect(SYMBOLS).toContain(section.identity!.symbol);
    }
  });
});
