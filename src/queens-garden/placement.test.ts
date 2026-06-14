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
  PlacedExpansion,
  PlaceTileAction,
  PlayerState,
  PlayerStorage,
  Expansion,
  SlotId,
  State,
  Symbol,
  Tile,
} from './types';
import { ActionType } from './types';

const tile = (colour: Colour, symbol: Symbol): Tile => ({ colour, symbol });
const NO_PAYMENT: Payment = { tiles: [], expansions: [], coins: 0 };

const emptyPlayer = (): PlayerState => ({
  passed: false,
  score: 0,
  storage: { tileArea: [], expansions: [] },
  garden: createStarterGarden(),
});

function makeState(garden: Garden, storage: PlayerStorage): State {
  return {
    rng: 1,
    round: 1,
    players: [{ passed: false, score: 0, storage, garden }, emptyPlayer()],
    currentPlayer: 0,
    firstPasser: null,
    supply: { bag: [], discard: [], expansions: [] },
    central: { top: null, open: [], pile: [] },
  };
}

// A garden whose centre expansion holds the given tiles, every ring slot empty.
function centreWith(entries: { dir: Direction; tile: Tile }[]): Garden {
  const tiles: (Tile | null)[] = [null, null, null, null, null, null];
  for (const e of entries) tiles[e.dir] = e.tile;
  return [{ tiles }, null, null, null, null, null, null];
}

describe('place tile', () => {
  it('places a cost-1 tile for free onto a expansion space', () => {
    // 'tree' is the first symbol → cost 1 → pays for itself.
    const s0 = makeState(createStarterGarden(), { tileArea: [tileItem(tile('red', 'tree'))], expansions: [] });
    const s1 = applyAction(s0, { type: ActionType.PlaceTile, tile: tile('red', 'tree'), slot: 0, dir: 0, payment: NO_PAYMENT });

    expect(tileAt(s1.players[0]!.garden[0]!, 0)).toEqual(tile('red', 'tree'));
    expect(storageTiles(s1.players[0]!.storage)).toHaveLength(0);
  });

  it('pays a cost-2 tile with one matching item, discarding it', () => {
    // 'bird' is the second symbol → cost 2 → needs 1 more, paid with a colour-match.
    const s0 = makeState(createStarterGarden(), {
      tileArea: [tileItem(tile('red', 'bird')), tileItem(tile('red', 'butterflies'))],
      expansions: [],
    });
    const payment: Payment = { tiles: [tile('red', 'butterflies')], expansions: [], coins: 0 };
    const s1 = applyAction(s0, { type: ActionType.PlaceTile, tile: tile('red', 'bird'), slot: 0, dir: 0, payment });

    expect(tileAt(s1.players[0]!.garden[0]!, 0)).toEqual(tile('red', 'bird'));
    expect(storageTiles(s1.players[0]!.storage)).toHaveLength(0); // both the placed tile and the payment left
    expect(s1.supply.discard).toContainEqual(tile('red', 'butterflies')); // payment tile → discard
  });

  it('is illegal to underpay', () => {
    const s0 = makeState(createStarterGarden(), { tileArea: [tileItem(tile('red', 'bird'))], expansions: [] });
    const action = { type: ActionType.PlaceTile, tile: tile('red', 'bird'), slot: 0, dir: 0, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(false); // cost 2, paid 0
  });

  it('is illegal to place onto an empty garden area with no expansion', () => {
    const s0 = makeState(createStarterGarden(), { tileArea: [tileItem(tile('red', 'tree'))], expansions: [] });
    // slot 1 is an empty ring slot (no expansion placed)
    const action = { type: ActionType.PlaceTile, tile: tile('red', 'tree'), slot: 1, dir: 0, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(false);
  });

  it('rejects an adjacency that matches on neither attribute', () => {
    const garden = centreWith([{ dir: 0, tile: tile('red', 'tree') }]);
    const s0 = makeState(garden, {
      tileArea: [tileItem(tile('blue', 'bird')), tileItem(tile('blue', 'butterflies'))],
      expansions: [],
    });
    // payment is valid (blue/butterflies shares the blue colour); the only problem is the adjacency —
    // blue/bird next to red/tree matches neither colour nor symbol.
    const payment: Payment = { tiles: [tile('blue', 'butterflies')], expansions: [], coins: 0 };
    const action = { type: ActionType.PlaceTile, tile: tile('blue', 'bird'), slot: 0, dir: 1, payment } as const;
    expect(isLegal(s0, action)).toBe(false);
  });

  it('allows an adjacency that matches exactly one attribute', () => {
    const garden = centreWith([{ dir: 0, tile: tile('red', 'tree') }]);
    const s0 = makeState(garden, { tileArea: [tileItem(tile('blue', 'tree'))], expansions: [] });
    // blue/tree shares the symbol (not the colour) with red/tree, and 'tree' is cost-1 → free & legal
    const action = { type: ActionType.PlaceTile, tile: tile('blue', 'tree'), slot: 0, dir: 1, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(true);
  });

  it('allows a tile that matches one neighbour even though another neighbour matches neither', () => {
    // centre: dir2 = yellow/butterflies, dir4 = blue/bird. dir3 (between them) is adjacent to BOTH.
    // Placing green/bird at dir3 matches the blue/bird (shares 'bird') but shares nothing with the
    // yellow/butterflies. A non-matching neighbour is tolerated as long as some neighbour matches, so
    // this is legal. ('bird' is cost 2 → pay 1, here with a coin.)
    const garden = centreWith([
      { dir: 2, tile: tile('yellow', 'butterflies') },
      { dir: 4, tile: tile('blue', 'bird') },
    ]);
    const s0 = makeState(garden, { tileArea: [tileItem(tile('green', 'bird')), coinItem], expansions: [] });
    const payment: Payment = { tiles: [], expansions: [], coins: 1 };
    const action = { type: ActionType.PlaceTile, tile: tile('green', 'bird'), slot: 0, dir: 3, payment } as const;
    expect(isLegal(s0, action)).toBe(true);
  });

  it('still rejects a tile that matches none of its neighbours', () => {
    // Same board, but red/herb at dir3 shares nothing with either the yellow/butterflies or the
    // blue/bird — matching zero neighbours is still illegal.
    const garden = centreWith([
      { dir: 2, tile: tile('yellow', 'butterflies') },
      { dir: 4, tile: tile('blue', 'bird') },
    ]);
    const s0 = makeState(garden, {
      tileArea: [tileItem(tile('red', 'herb')), coinItem, coinItem, coinItem, coinItem],
      expansions: [],
    });
    const payment: Payment = { tiles: [], expansions: [], coins: 4 }; // 'herb' is cost 5 → pay 4
    const action = { type: ActionType.PlaceTile, tile: tile('red', 'herb'), slot: 0, dir: 3, payment } as const;
    expect(isLegal(s0, action)).toBe(false);
  });

  it('rejects a placement that joins identical tiles in a mono-colour run', () => {
    // centre: dir0 = red/tree, dir1 = red/bird. Placing red/tree at dir2 makes the red run
    // dir0–dir1–dir2 = red/tree, red/bird, red/tree → two red/trees joined.
    const garden = centreWith([
      { dir: 0, tile: tile('red', 'tree') },
      { dir: 1, tile: tile('red', 'bird') },
    ]);
    const s0 = makeState(garden, { tileArea: [tileItem(tile('red', 'tree'))], expansions: [] });
    const action = { type: ActionType.PlaceTile, tile: tile('red', 'tree'), slot: 0, dir: 2, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(false);
  });

  it('allows identical tiles in one arc when no single-attribute run joins them', () => {
    // centre dir0..dir3 form an arc whose shared attribute alternates — colour, symbol, colour:
    //   red/tree — red/bird — blue/bird — blue/tree
    // Placing red/tree at dir4 (sharing 'tree' with blue/tree) sits four along the arc from the
    // other red/tree at dir0, but neither the tree-run {dir4, dir3} nor the red-run {dir4}
    // reaches it — the two are not joined, so it is legal. (The old contiguous-arc model wrongly
    // rejected this: dir0..dir4 is one occupied arc holding two red/trees.)
    const garden = centreWith([
      { dir: 0, tile: tile('red', 'tree') },
      { dir: 1, tile: tile('red', 'bird') },
      { dir: 2, tile: tile('blue', 'bird') },
      { dir: 3, tile: tile('blue', 'tree') },
    ]);
    const s0 = makeState(garden, { tileArea: [tileItem(tile('red', 'tree'))], expansions: [] });
    const action = { type: ActionType.PlaceTile, tile: tile('red', 'tree'), slot: 0, dir: 4, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(true);
  });

  it('rejects a mono-colour run that bends across a rosette boundary to join identical tiles', () => {
    // A red run turns a corner the old fixed-line model could not see. The centre holds
    // dir5 = red/tree and dir4 = red/bird; the centre's east petal (dir4) touches the right
    // rosette (slot 1) at its west petal (dir1) across the junction. Placing red/tree there forms
    // one red run
    //   slot1·dir1 red/tree — centre·dir4 red/bird — centre·dir5 red/tree
    // joining two red/trees. No single rosette-ring or junction-ring contains all three.
    const garden: Garden = [
      { tiles: [null, null, null, null, tile('red', 'bird'), tile('red', 'tree')] },
      { tiles: [null, null, null, null, null, null] }, // a placed (empty) frame on slot 1
      null,
      null,
      null,
      null,
      null,
    ];
    const s0 = makeState(garden, { tileArea: [tileItem(tile('red', 'tree'))], expansions: [] });
    const action = { type: ActionType.PlaceTile, tile: tile('red', 'tree'), slot: 1, dir: 1, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(false);
  });
});

describe('place expansion', () => {
  it('drops a frame and places its identity tile, paying the cost', () => {
    // 'flower' is the 4th symbol → cost 4 → needs 3, here paid with 3 coins.
    const expansion: Expansion = { identity: tile('red', 'flower') };
    const s0 = makeState(createStarterGarden(), {
      tileArea: [coinItem, coinItem, coinItem],
      expansions: [expansion],
    });
    const payment: Payment = { tiles: [], expansions: [], coins: 3 };
    const s1 = applyAction(s0, { type: ActionType.PlaceExpansion, expansion, slot: 1, identityDir: 0, payment });

    expect(tileAt(s1.players[0]!.garden[1]!, 0)).toEqual(tile('red', 'flower'));
    expect(s1.players[0]!.storage.expansions).toHaveLength(0);
    expect(storageCoins(s1.players[0]!.storage)).toBe(0);
  });

  it('is illegal to place a expansion into a non-empty slot', () => {
    const expansion: Expansion = { identity: tile('red', 'tree') }; // cost 1, free
    const s0 = makeState(createStarterGarden(), { tileArea: [], expansions: [expansion] });
    // slot 0 (centre) already holds the starter expansion
    const action = { type: ActionType.PlaceExpansion, expansion, slot: 0, identityDir: 0, payment: NO_PAYMENT } as const;
    expect(isLegal(s0, action)).toBe(false);
  });
});

// A garden with the given positions occupied. Tile values are irrelevant to coin geometry (the
// region checks only test occupancy), so we fill with an arbitrary tile.
function gardenWithPositions(positions: readonly TilePosition[]): Garden {
  const slots: (PlacedExpansion | null)[] = [null, null, null, null, null, null, null];
  for (const p of positions) {
    const tiles: (Tile | null)[] = slots[p.slot]
      ? [...slots[p.slot]!.tiles]
      : [null, null, null, null, null, null];
    tiles[p.dir] = tile('red', 'tree');
    slots[p.slot] = { tiles };
  }
  return slots;
}

const placeTree = (slot: SlotId, dir: Direction): PlaceTileAction => ({
  type: ActionType.PlaceTile,
  tile: tile('red', 'tree'),
  slot,
  dir,
  payment: NO_PAYMENT,
});

// A ring expansion filled at dirs 1–5 with distinct-symbol reds (a legal arc), dir 0 left empty.
const ringRedsMissingDir0 = (): (Tile | null)[] => {
  const symbols: Symbol[] = ['bird', 'butterflies', 'flower', 'herb', 'tulip'];
  const tiles: (Tile | null)[] = [null, null, null, null, null, null];
  [1, 2, 3, 4, 5].forEach((dir, i) => (tiles[dir] = tile('red', symbols[i]!)));
  return tiles;
};

describe('earning coins (completion bonuses)', () => {
  it('earns 1 coin for completing the centre expansion', () => {
    const symbols: Symbol[] = ['bird', 'butterflies', 'flower', 'herb', 'tulip'];
    const garden = centreWith(
      ([1, 2, 3, 4, 5] as Direction[]).map((dir, i) => ({ dir, tile: tile('red', symbols[i]!) })),
    );
    const s0 = makeState(garden, { tileArea: [tileItem(tile('red', 'tree'))], expansions: [] });
    const s1 = applyAction(s0, placeTree(0, 0));
    expect(storageCoins(s1.players[0]!.storage)).toBe(1);
  });

  it('earns 3 coins for completing a ring expansion', () => {
    const garden: Garden = [
      { tiles: [null, null, null, null, null, null] },
      { tiles: ringRedsMissingDir0() },
      null,
      null,
      null,
      null,
      null,
    ];
    const s0 = makeState(garden, { tileArea: [tileItem(tile('red', 'tree'))], expansions: [] });
    const s1 = applyAction(s0, placeTree(1, 0));
    expect(storageCoins(s1.players[0]!.storage)).toBe(3);
  });

  it('earns 2 coins for completing a junction gap', () => {
    const gap = JUNCTION_GAPS[0]!;
    const target = gap[0]!;
    const s0 = makeState(gardenWithPositions(gap.slice(1)), {
      tileArea: [tileItem(tile('red', 'tree'))],
      expansions: [],
    });
    expect(placeTileCoins(s0, placeTree(target.slot, target.dir))).toEqual({ max: 2, actual: 2 });
  });

  it('stacks bonuses: one tile completing the centre expansion and two gaps earns 5', () => {
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
      tileArea: [tileItem(tile('red', 'tree'))],
      expansions: [],
    });
    expect(placeTileCoins(s0, placeTree(target.slot, target.dir)).max).toBe(5); // 1 + 2 + 2
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
    const tileArea = [tileItem(tile('red', 'tree')), ...Array.from({ length: 11 }, () => coinItem)];
    const s0 = makeState(garden, { tileArea, expansions: [] });
    const action = placeTree(1, 0);

    expect(placeTileCoins(s0, action)).toEqual({ max: 3, actual: 1 });
    const s1 = applyAction(s0, action);
    expect(storageCoins(s1.players[0]!.storage)).toBe(12); // 11 kept + 1 earned, the other 2 lost
  });
});
