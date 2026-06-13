// Azul: Queen's Garden — engine types.
//
// Covers the round/turn skeleton plus the component & central-area model ("the deal").
// Placement and scoring of a player's play area are still deferred — see
// docs/queens-garden/model.md.

export const ROUND_COUNT = 4;

export type PlayerCount = 2 | 3 | 4;

export const Phase = { Playing: 'playing', GameOver: 'game-over' } as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

// Tiles and expansions share the same 36-combo space: 6 colours × 6 symbols.
// (Names are arbitrary placeholders — only the 6×6 structure matters to the engine.)
export const COLOURS = ['blue', 'green', 'orange', 'pink', 'red', 'yellow'] as const;
export type Colour = (typeof COLOURS)[number];

export const SYMBOLS = ['tree', 'bird', 'butterflies', 'flower', 'herb', 'lily'] as const;
export type Symbol = (typeof SYMBOLS)[number];

export const TILE_COPIES = 3; // 36 combos × 3 = 108 tiles

export type Tile = { readonly colour: Colour; readonly symbol: Symbol };

// A garden expansion. `identity` is the colour+symbol shown as its immovable tile (one of the 36
// expansions). The central starter expansion has `identity: null` — all 6 spaces free.
export type Expansion = { readonly identity: Tile | null };

// A revealed expansion in the central area, plus the draftable tiles sitting on it. The tiles
// array is positional: a fresh display holds 4 tiles, and a drafted tile leaves a `null` hole
// behind so the survivors keep their slots. An expansion is emptied (takeable) once every slot
// is null. Once that expansion is itself taken, `expansion` becomes null too — a spent pile that
// stays in place (so the surviving piles don't shift) until the round is re-dealt.
export type Display = { readonly expansion: Expansion | null; readonly tiles: readonly (Tile | null)[] };

export type CentralArea = {
  readonly top: Display | null; // current top of the pile (fresh = 4 tiles); null once exhausted
  readonly open: readonly Display[]; // split-off expansions holding their leftover tiles
  readonly pile: readonly Expansion[]; // unrevealed expansions beneath the top
};

export type Supply = {
  readonly bag: readonly Tile[]; // remaining drawable tiles
  readonly discard: readonly Tile[]; // spent tiles; reshuffled into the bag when it empties
  readonly expansions: readonly Expansion[]; // remaining undealt expansions
};

export const STORAGE_TILE_LIMIT = 12; // the tile area holds tiles AND coins, up to this total
export const STORAGE_EXPANSION_LIMIT = 2;
export const STARTING_COINS = 3;

// The tile-storage area is one ordered list of items — tiles and coins interleaved — so a
// player can rearrange it. The order has no gameplay effect; it's purely for human comfort.
export type StorageItem =
  | { readonly kind: 'tile'; readonly tile: Tile }
  | { readonly kind: 'coin' };

export type PlayerStorage = {
  readonly tileArea: readonly StorageItem[]; // tiles + coins; length ≤ STORAGE_TILE_LIMIT
  readonly expansions: readonly Expansion[]; // ≤ STORAGE_EXPANSION_LIMIT
};

export const coinItem: StorageItem = { kind: 'coin' };
export const tileItem = (tile: Tile): StorageItem => ({ kind: 'tile', tile });

export function storageTiles(storage: PlayerStorage): Tile[] {
  return storage.tileArea.flatMap((item) => (item.kind === 'tile' ? [item.tile] : []));
}
export function storageCoins(storage: PlayerStorage): number {
  return storage.tileArea.reduce((n, item) => n + (item.kind === 'coin' ? 1 : 0), 0);
}

export type PlayerId = number; // 0-based index into State.players

// --- the garden (play area) — its fixed topology lives in garden.ts ---
// 7 hex slots: 0 = centre, 1–6 = the ring. Directions 0–5 are the six hex directions;
// opposite(d) = (d + 3) % 6.
export type SlotId = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Direction = 0 | 1 | 2 | 3 | 4 | 5;

// A placed expansion is just a frame of 6 slots (indexed by board direction). The immovable
// identity tile is no different from a player-placed tile once it's down — it's simply the tile
// that sat on a slot when the expansion was placed. So all placement & scoring works tile-level.
export type PlacedExpansion = {
  readonly tiles: readonly (Tile | null)[]; // length 6, indexed by board direction
};

export type Garden = readonly (PlacedExpansion | null)[]; // length 7, indexed by SlotId

export type PlayerState = {
  readonly passed: boolean; // has this player passed this round?
  readonly score: number;
  readonly storage: PlayerStorage;
  readonly garden: Garden;
};

export type State = {
  readonly rng: number; // PRNG state, threaded so seed + action log reproduces every draw
  readonly round: number; // 1..ROUND_COUNT during play; ROUND_COUNT + 1 is the terminal sentinel
  readonly players: readonly PlayerState[];
  readonly currentPlayer: PlayerId; // whose turn — stored, because turn order is path-dependent
  readonly firstPasser: PlayerId | null; // first to pass THIS round (∅ until someone does)
  readonly supply: Supply;
  readonly central: CentralArea;
};

export const ActionType = {
  Draft: 'draft',
  Reorder: 'reorder',
  PlaceExpansion: 'place-expansion',
  PlaceTile: 'place-tile',
  Pass: 'pass',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

// A draft is parameterised by a chosen colour OR symbol, plus — for each distinct matching
// tile — which physical copy to take (its location can change whether a expansion is revealed).
export type Attribute =
  | { readonly kind: 'colour'; readonly colour: Colour }
  | { readonly kind: 'symbol'; readonly symbol: Symbol };

// Where a drafted tile is taken from: the top of the pile, or a split-off (open) display.
export type DraftSource = { readonly area: 'top' } | { readonly area: 'open'; readonly index: number };

export type TilePick = { readonly tile: Tile; readonly source: DraftSource };

export type DraftAction = {
  readonly type: typeof ActionType.Draft;
  readonly attribute: Attribute;
  readonly picks: readonly TilePick[]; // exactly one per distinct matching combo
};

// Rearrange one of the current player's storage areas — the tile area or the expansion row
// (cosmetic, no gameplay effect). Free: it does not consume the turn. `order` must be a
// permutation of that area's current contents.
export type ReorderAction =
  | { readonly type: typeof ActionType.Reorder; readonly area: 'tiles'; readonly order: readonly StorageItem[] }
  | { readonly type: typeof ActionType.Reorder; readonly area: 'expansions'; readonly order: readonly Expansion[] };

// Paying to place: the placed item itself counts as 1 toward its cost; the rest is matching
// items (sharing the placed tile's colour OR symbol) plus coins (wildcards).
export type Payment = {
  readonly tiles: readonly Tile[];
  readonly expansions: readonly Expansion[];
  // Coins are a non-negative count, bounded by the largest possible cost (symbolCost maxes at 6,
  // and the placed item counts as 1, so a payment never needs more than 5).
  readonly coins: 0 | 1 | 2 | 3 | 4 | 5;
};

// Place a expansion into an empty garden slot, choosing which direction its identity faces.
export type PlaceExpansionAction = {
  readonly type: typeof ActionType.PlaceExpansion;
  readonly expansion: Expansion;
  readonly slot: SlotId;
  readonly identityDir: Direction;
  readonly payment: Payment;
};

// Place a stored tile onto an empty space of a placed expansion.
export type PlaceTileAction = {
  readonly type: typeof ActionType.PlaceTile;
  readonly tile: Tile;
  readonly slot: SlotId;
  readonly dir: Direction;
  readonly payment: Payment;
};

export type PassAction = { readonly type: typeof ActionType.Pass };

export type Action =
  | DraftAction
  | ReorderAction
  | PlaceExpansionAction
  | PlaceTileAction
  | PassAction;
