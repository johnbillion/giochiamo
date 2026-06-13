import { describe, expect, it } from 'vitest';

import { applyAction, isLegal } from './engine';
import { buildDraft } from './draft';
import {
  ActionType,
  STORAGE_TILE_LIMIT,
  type Action,
  type CentralArea,
  type Colour,
  type Display,
  type PlayerState,
  type State,
  type Symbol,
  type Tile,
} from './types';

const tile = (colour: Colour, symbol: Symbol): Tile => ({ colour, symbol });
const emptyPlayer = (): PlayerState => ({
  passed: false,
  score: 0,
  storage: { tiles: [], sections: [], coins: 0 },
});

function makeState(central: CentralArea, opts: { bag?: Tile[]; players?: PlayerState[] } = {}): State {
  return {
    rng: 1,
    round: 1,
    players: opts.players ?? [emptyPlayer(), emptyPlayer()],
    currentPlayer: 0,
    firstPasser: null,
    supply: { bag: opts.bag ?? [], discard: [], sections: [] },
    central,
  };
}

function totalTiles(s: State): number {
  const central =
    (s.central.top?.tiles.length ?? 0) + s.central.open.reduce((n, d) => n + d.tiles.length, 0);
  const storage = s.players.reduce((n, p) => n + p.storage.tiles.length, 0);
  return s.supply.bag.length + s.supply.discard.length + central + storage;
}

describe('draft — taking tiles', () => {
  it('takes one of each distinct matching colour and reveals the next section when the top drops below 4', () => {
    const s0 = makeState(
      {
        top: {
          section: { identity: tile('blue', 'acorn') },
          tiles: [tile('red', 'bird'), tile('red', 'flower'), tile('blue', 'bird'), tile('green', 'leaf')],
        },
        open: [],
        pile: [{ identity: tile('orange', 'clover') }],
      },
      { bag: [tile('yellow', 'leaf'), tile('yellow', 'bird'), tile('pink', 'acorn'), tile('green', 'clover'), tile('blue', 'leaf')] },
    );

    const s1 = applyAction(s0, buildDraft(s0, { kind: 'colour', colour: 'red' }));

    expect(s1.players[0]!.storage.tiles).toHaveLength(2); // the two distinct reds
    expect(s1.central.open).toHaveLength(1); // old top split off…
    expect(s1.central.open[0]!.tiles).toHaveLength(2); // …carrying its two leftovers
    expect(s1.central.top!.section.identity).toEqual(tile('orange', 'clover')); // next revealed
    expect(s1.central.top!.tiles).toHaveLength(4); // with a fresh batch
    expect(totalTiles(s1)).toBe(totalTiles(s0)); // conserved
  });

  it('leaves the top intact when the drafted tile lives only in an open display', () => {
    const top: Display = {
      section: { identity: tile('blue', 'acorn') },
      tiles: [tile('blue', 'bird'), tile('blue', 'flower'), tile('green', 'leaf'), tile('green', 'bird')],
    };
    const s0 = makeState({
      top,
      open: [{ section: { identity: tile('pink', 'clover') }, tiles: [tile('red', 'bird')] }],
      pile: [],
    });

    const s1 = applyAction(s0, buildDraft(s0, { kind: 'colour', colour: 'red' }));

    expect(s1.players[0]!.storage.tiles).toEqual([tile('red', 'bird')]);
    expect(s1.central.top).toEqual(top); // untouched
    expect(s1.central.open[0]!.tiles).toHaveLength(0); // emptied (takeable next turn)
  });

  it('honours which copy the player takes (the source choice)', () => {
    const top: Display = {
      section: { identity: tile('blue', 'acorn') },
      tiles: [tile('red', 'bird'), tile('blue', 'flower'), tile('green', 'leaf'), tile('pink', 'bird')],
    };
    const central: CentralArea = {
      top,
      open: [{ section: { identity: tile('green', 'clover') }, tiles: [tile('red', 'bird')] }],
      pile: [],
    };
    const s0 = makeState(central);

    // Take the red/bird from the OPEN display, deliberately sparing the top.
    const draft: Action = {
      type: ActionType.Draft,
      attribute: { kind: 'colour', colour: 'red' },
      picks: [{ tile: tile('red', 'bird'), source: { area: 'open', index: 0 } }],
    };

    expect(isLegal(s0, draft)).toBe(true);
    const s1 = applyAction(s0, draft);
    expect(s1.central.top).toEqual(top); // spared
    expect(s1.central.open[0]!.tiles).toHaveLength(0);
  });
});

describe('draft — taking sections', () => {
  it('takes matching already-emptied sections into storage', () => {
    const s0 = makeState({
      top: {
        section: { identity: tile('blue', 'acorn') },
        tiles: [tile('blue', 'bird'), tile('green', 'flower'), tile('green', 'leaf'), tile('pink', 'bird')],
      },
      open: [{ section: { identity: tile('red', 'flower') }, tiles: [] }], // emptied, takeable
      pile: [],
    });

    const s1 = applyAction(s0, buildDraft(s0, { kind: 'colour', colour: 'red' }));

    expect(s1.players[0]!.storage.sections).toEqual([{ identity: tile('red', 'flower') }]);
    expect(s1.players[0]!.storage.tiles).toHaveLength(0);
    expect(s1.central.open).toHaveLength(0); // the section was taken
  });
});

describe('draft — legality', () => {
  it('is illegal when the draft would overflow tile storage', () => {
    const nearlyFull: PlayerState = {
      passed: false,
      score: 0,
      storage: {
        tiles: Array.from({ length: STORAGE_TILE_LIMIT - 1 }, () => tile('blue', 'bird')),
        sections: [],
        coins: 0,
      },
    };
    const s0 = makeState(
      {
        top: {
          section: { identity: tile('green', 'acorn') },
          tiles: [tile('red', 'bird'), tile('red', 'flower'), tile('green', 'leaf'), tile('green', 'bird')],
        },
        open: [],
        pile: [],
      },
      { players: [nearlyFull, emptyPlayer()] },
    );

    const draft = buildDraft(s0, { kind: 'colour', colour: 'red' }); // wants 2 tiles, 1 space free
    expect(isLegal(s0, draft)).toBe(false);
    expect(() => applyAction(s0, draft)).toThrow();
  });

  it('counts coins against tile storage', () => {
    // 10 tiles + 1 coin = 11 of 12 → only 1 free, so a 2-tile red draft is illegal.
    const cramped: PlayerState = {
      passed: false,
      score: 0,
      storage: { tiles: Array.from({ length: 10 }, () => tile('blue', 'bird')), sections: [], coins: 1 },
    };
    const s0 = makeState(
      {
        top: {
          section: { identity: tile('green', 'acorn') },
          tiles: [tile('red', 'bird'), tile('red', 'flower'), tile('green', 'leaf'), tile('green', 'bird')],
        },
        open: [],
        pile: [],
      },
      { players: [cramped, emptyPlayer()] },
    );

    expect(isLegal(s0, buildDraft(s0, { kind: 'colour', colour: 'red' }))).toBe(false);
  });

  it('is illegal to draft an attribute nothing matches', () => {
    const s0 = makeState({
      top: {
        section: { identity: tile('blue', 'acorn') },
        tiles: [tile('blue', 'bird'), tile('green', 'flower'), tile('green', 'leaf'), tile('pink', 'bird')],
      },
      open: [],
      pile: [],
    });

    expect(isLegal(s0, buildDraft(s0, { kind: 'colour', colour: 'red' }))).toBe(false);
  });
});
