import { describe, expect, it } from 'vitest';

import { applyAction, isLegal } from './engine';
import { createStarterGarden, tileAt } from './garden';
import { coinItem, storageCoins, storageTiles, tileItem } from './types';
import type {
  Colour,
  Direction,
  Garden,
  Payment,
  PlayerState,
  PlayerStorage,
  Section,
  State,
  Symbol,
  Tile,
} from './types';
import { ActionType } from './types';

const tile = (colour: Colour, symbol: Symbol): Tile => ({ colour, symbol });
const NO_PAYMENT: Payment = { tiles: [], sections: [], coins: 0 };

const emptyPlayer = (): PlayerState => ({
  passed: false,
  score: 0,
  storage: { tileArea: [], sections: [] },
  garden: createStarterGarden(),
});

function makeState(garden: Garden, storage: PlayerStorage): State {
  return {
    rng: 1,
    round: 1,
    players: [{ passed: false, score: 0, storage, garden }, emptyPlayer()],
    currentPlayer: 0,
    firstPasser: null,
    supply: { bag: [], discard: [], sections: [] },
    central: { top: null, open: [], pile: [] },
  };
}

// A garden whose centre section holds the given tiles, every ring slot empty.
function centreWith(entries: { dir: Direction; tile: Tile }[]): Garden {
  const tiles: (Tile | null)[] = [null, null, null, null, null, null];
  for (const e of entries) tiles[e.dir] = e.tile;
  return [{ tiles }, null, null, null, null, null, null];
}

describe('place tile', () => {
  it('places a cost-1 tile for free onto a section space', () => {
    // 'acorn' is the first symbol → cost 1 → pays for itself.
    const s0 = makeState(createStarterGarden(), { tileArea: [tileItem(tile('red', 'acorn'))], sections: [] });
    const s1 = applyAction(s0, { type: ActionType.PlaceTile, tile: tile('red', 'acorn'), slot: 0, dir: 0, payment: NO_PAYMENT });

    expect(tileAt(s1.players[0]!.garden[0]!, 0)).toEqual(tile('red', 'acorn'));
    expect(storageTiles(s1.players[0]!.storage)).toHaveLength(0);
  });

  it('pays a cost-2 tile with one matching item, discarding it', () => {
    // 'bird' is the second symbol → cost 2 → needs 1 more, paid with a colour-match.
    const s0 = makeState(createStarterGarden(), {
      tileArea: [tileItem(tile('red', 'bird')), tileItem(tile('red', 'clover'))],
      sections: [],
    });
    const payment: Payment = { tiles: [tile('red', 'clover')], sections: [], coins: 0 };
    const s1 = applyAction(s0, { type: ActionType.PlaceTile, tile: tile('red', 'bird'), slot: 0, dir: 0, payment });

    expect(tileAt(s1.players[0]!.garden[0]!, 0)).toEqual(tile('red', 'bird'));
    expect(storageTiles(s1.players[0]!.storage)).toHaveLength(0); // both the placed tile and the payment left
    expect(s1.supply.discard).toContainEqual(tile('red', 'clover')); // payment tile → discard
  });

  it('is illegal to underpay', () => {
    const s0 = makeState(createStarterGarden(), { tileArea: [tileItem(tile('red', 'bird'))], sections: [] });
    const action = { type: ActionType.PlaceTile, tile: tile('red', 'bird'), slot: 0, dir: 0, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(false); // cost 2, paid 0
  });

  it('is illegal to place onto an empty garden area with no section', () => {
    const s0 = makeState(createStarterGarden(), { tileArea: [tileItem(tile('red', 'acorn'))], sections: [] });
    // slot 1 is an empty ring slot (no section placed)
    const action = { type: ActionType.PlaceTile, tile: tile('red', 'acorn'), slot: 1, dir: 0, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(false);
  });

  it('rejects an adjacency that matches on neither attribute', () => {
    const garden = centreWith([{ dir: 0, tile: tile('red', 'acorn') }]);
    const s0 = makeState(garden, {
      tileArea: [tileItem(tile('blue', 'bird')), tileItem(tile('blue', 'clover'))],
      sections: [],
    });
    // payment is valid (blue/clover shares the blue colour); the only problem is the adjacency —
    // blue/bird next to red/acorn matches neither colour nor symbol.
    const payment: Payment = { tiles: [tile('blue', 'clover')], sections: [], coins: 0 };
    const action = { type: ActionType.PlaceTile, tile: tile('blue', 'bird'), slot: 0, dir: 1, payment } as const;
    expect(isLegal(s0, action)).toBe(false);
  });

  it('allows an adjacency that matches exactly one attribute', () => {
    const garden = centreWith([{ dir: 0, tile: tile('red', 'acorn') }]);
    const s0 = makeState(garden, { tileArea: [tileItem(tile('blue', 'acorn'))], sections: [] });
    // blue/acorn shares the symbol (not the colour) with red/acorn, and 'acorn' is cost-1 → free & legal
    const action = { type: ActionType.PlaceTile, tile: tile('blue', 'acorn'), slot: 0, dir: 1, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(true);
  });

  it('rejects a placement that joins identical tiles in a mono-colour run', () => {
    // centre: dir0 = red/acorn, dir1 = red/bird. Placing red/acorn at dir2 makes the red run
    // dir0–dir1–dir2 = red/acorn, red/bird, red/acorn → two red/acorns joined.
    const garden = centreWith([
      { dir: 0, tile: tile('red', 'acorn') },
      { dir: 1, tile: tile('red', 'bird') },
    ]);
    const s0 = makeState(garden, { tileArea: [tileItem(tile('red', 'acorn'))], sections: [] });
    const action = { type: ActionType.PlaceTile, tile: tile('red', 'acorn'), slot: 0, dir: 2, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(false);
  });

  it('allows identical tiles in one arc when no single-attribute run joins them', () => {
    // centre dir0..dir3 form an arc whose shared attribute alternates — colour, symbol, colour:
    //   red/acorn — red/bird — blue/bird — blue/acorn
    // Placing red/acorn at dir4 (sharing 'acorn' with blue/acorn) sits four along the arc from the
    // other red/acorn at dir0, but neither the acorn-run {dir4, dir3} nor the red-run {dir4}
    // reaches it — the two are not joined, so it is legal. (The old contiguous-arc model wrongly
    // rejected this: dir0..dir4 is one occupied arc holding two red/acorns.)
    const garden = centreWith([
      { dir: 0, tile: tile('red', 'acorn') },
      { dir: 1, tile: tile('red', 'bird') },
      { dir: 2, tile: tile('blue', 'bird') },
      { dir: 3, tile: tile('blue', 'acorn') },
    ]);
    const s0 = makeState(garden, { tileArea: [tileItem(tile('red', 'acorn'))], sections: [] });
    const action = { type: ActionType.PlaceTile, tile: tile('red', 'acorn'), slot: 0, dir: 4, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(true);
  });

  it('rejects a mono-colour run that bends across a section boundary to join identical tiles', () => {
    // A red run turns a corner the old fixed-line model could not see. The centre holds
    // dir5 = red/acorn and dir0 = red/bird; placing red/acorn across the shared edge on slot 1
    // (its dir3 faces the centre's dir0) forms one red run
    //   slot1·dir3 red/acorn — centre·dir0 red/bird — centre·dir5 red/acorn
    // joining two red/acorns. No single section-ring or junction-ring contains all three.
    const garden: Garden = [
      { tiles: [tile('red', 'bird'), null, null, null, null, tile('red', 'acorn')] },
      { tiles: [null, null, null, null, null, null] }, // a placed (empty) frame on slot 1
      null,
      null,
      null,
      null,
      null,
    ];
    const s0 = makeState(garden, { tileArea: [tileItem(tile('red', 'acorn'))], sections: [] });
    const action = { type: ActionType.PlaceTile, tile: tile('red', 'acorn'), slot: 1, dir: 3, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(false);
  });
});

describe('place section', () => {
  it('drops a frame and places its identity tile, paying the cost', () => {
    // 'flower' is the 4th symbol → cost 4 → needs 3, here paid with 3 coins.
    const section: Section = { identity: tile('red', 'flower') };
    const s0 = makeState(createStarterGarden(), {
      tileArea: [coinItem, coinItem, coinItem],
      sections: [section],
    });
    const payment: Payment = { tiles: [], sections: [], coins: 3 };
    const s1 = applyAction(s0, { type: ActionType.PlaceSection, section, slot: 1, identityDir: 0, payment });

    expect(tileAt(s1.players[0]!.garden[1]!, 0)).toEqual(tile('red', 'flower'));
    expect(s1.players[0]!.storage.sections).toHaveLength(0);
    expect(storageCoins(s1.players[0]!.storage)).toBe(0);
  });

  it('is illegal to place a section into a non-empty slot', () => {
    const section: Section = { identity: tile('red', 'acorn') }; // cost 1, free
    const s0 = makeState(createStarterGarden(), { tileArea: [], sections: [section] });
    // slot 0 (centre) already holds the starter section
    const action = { type: ActionType.PlaceSection, section, slot: 0, identityDir: 0, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(false);
  });
});
