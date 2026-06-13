import { describe, expect, it } from 'vitest';

import { applyAction, isLegal } from './engine';
import { createStarterGarden, JUNCTION_GAPS, tileAt, type TilePosition } from './garden';
import { placeTileCoins } from './placement';
import { coinItem, storageCoins, storageTiles, tileItem } from './types';
import type {
  Colour,
  Direction,
  Garden,
  Payment,
  PlacedSection,
  PlaceTileAction,
  PlayerState,
  PlayerStorage,
  Section,
  SlotId,
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

// A garden with the given positions occupied. Tile values are irrelevant to coin geometry (the
// region checks only test occupancy), so we fill with an arbitrary tile.
function gardenWithPositions(positions: readonly TilePosition[]): Garden {
  const slots: (PlacedSection | null)[] = [null, null, null, null, null, null, null];
  for (const p of positions) {
    const tiles: (Tile | null)[] = slots[p.slot]
      ? [...slots[p.slot]!.tiles]
      : [null, null, null, null, null, null];
    tiles[p.dir] = tile('red', 'acorn');
    slots[p.slot] = { tiles };
  }
  return slots;
}

const placeAcorn = (slot: SlotId, dir: Direction): PlaceTileAction => ({
  type: ActionType.PlaceTile,
  tile: tile('red', 'acorn'),
  slot,
  dir,
  payment: NO_PAYMENT,
});

// A ring section filled at dirs 1–5 with distinct-symbol reds (a legal arc), dir 0 left empty.
const ringRedsMissingDir0 = (): (Tile | null)[] => {
  const symbols: Symbol[] = ['bird', 'clover', 'flower', 'leaf', 'pinecone'];
  const tiles: (Tile | null)[] = [null, null, null, null, null, null];
  [1, 2, 3, 4, 5].forEach((dir, i) => (tiles[dir] = tile('red', symbols[i]!)));
  return tiles;
};

describe('earning coins (completion bonuses)', () => {
  it('earns 1 coin for completing the centre section', () => {
    const symbols: Symbol[] = ['bird', 'clover', 'flower', 'leaf', 'pinecone'];
    const garden = centreWith(
      ([1, 2, 3, 4, 5] as Direction[]).map((dir, i) => ({ dir, tile: tile('red', symbols[i]!) })),
    );
    const s0 = makeState(garden, { tileArea: [tileItem(tile('red', 'acorn'))], sections: [] });
    const s1 = applyAction(s0, placeAcorn(0, 0));
    expect(storageCoins(s1.players[0]!.storage)).toBe(1);
  });

  it('earns 3 coins for completing a ring section', () => {
    const garden: Garden = [
      { tiles: [null, null, null, null, null, null] },
      { tiles: ringRedsMissingDir0() },
      null,
      null,
      null,
      null,
      null,
    ];
    const s0 = makeState(garden, { tileArea: [tileItem(tile('red', 'acorn'))], sections: [] });
    const s1 = applyAction(s0, placeAcorn(1, 0));
    expect(storageCoins(s1.players[0]!.storage)).toBe(3);
  });

  it('earns 2 coins for completing a junction gap', () => {
    const gap = JUNCTION_GAPS[0]!;
    const target = gap[0]!;
    const s0 = makeState(gardenWithPositions(gap.slice(1)), {
      tileArea: [tileItem(tile('red', 'acorn'))],
      sections: [],
    });
    expect(placeTileCoins(s0, placeAcorn(target.slot, target.dir))).toEqual({ max: 2, actual: 2 });
  });

  it('stacks bonuses: one tile completing the centre section and two gaps earns 5', () => {
    const target: TilePosition = { slot: 0, dir: 0 };
    const gapsThroughTarget = JUNCTION_GAPS.filter((g) =>
      g.some((p) => p.slot === target.slot && p.dir === target.dir),
    );
    expect(gapsThroughTarget).toHaveLength(2); // a centre petal sits on exactly two gaps

    const occupied = new Map<string, TilePosition>();
    const add = (p: TilePosition): void => {
      if (p.slot === target.slot && p.dir === target.dir) return; // leave the target empty
      occupied.set(`${p.slot}:${p.dir}`, p);
    };
    ([0, 1, 2, 3, 4, 5] as Direction[]).forEach((dir) => add({ slot: 0, dir })); // centre minus target
    for (const g of gapsThroughTarget) for (const p of g) add(p); // both gaps minus target

    const s0 = makeState(gardenWithPositions([...occupied.values()]), {
      tileArea: [tileItem(tile('red', 'acorn'))],
      sections: [],
    });
    expect(placeTileCoins(s0, placeAcorn(target.slot, target.dir)).max).toBe(5); // 1 + 2 + 2
  });

  it('caps earned coins at available storage, reporting max vs actual', () => {
    const garden: Garden = [
      { tiles: [null, null, null, null, null, null] },
      { tiles: ringRedsMissingDir0() },
      null,
      null,
      null,
      null,
      null,
    ];
    // tile area full at 12 (the placed tile + 11 coins); placing frees one slot → room for 1 coin.
    const tileArea = [tileItem(tile('red', 'acorn')), ...Array.from({ length: 11 }, () => coinItem)];
    const s0 = makeState(garden, { tileArea, sections: [] });
    const action = placeAcorn(1, 0);

    expect(placeTileCoins(s0, action)).toEqual({ max: 3, actual: 1 });
    const s1 = applyAction(s0, action);
    expect(storageCoins(s1.players[0]!.storage)).toBe(12); // 11 kept + 1 earned, the other 2 lost
  });
});
