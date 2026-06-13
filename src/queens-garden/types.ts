// Azul: Queen's Garden — engine types.
//
// Covers the round/turn skeleton plus the component & central-area model ("the deal").
// Placement and scoring of a player's play area are still deferred — see
// docs/queens-garden/model.md.

export const ROUND_COUNT = 4;

export const Phase = { Playing: 'playing', GameOver: 'game-over' } as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

// Tiles and sections share the same 36-combo space: 6 colours × 6 symbols.
// (Names are arbitrary placeholders — only the 6×6 structure matters to the engine.)
export const COLOURS = ['blue', 'green', 'orange', 'pink', 'red', 'yellow'] as const;
export type Colour = (typeof COLOURS)[number];

export const SYMBOLS = ['acorn', 'bird', 'clover', 'flower', 'leaf', 'pinecone'] as const;
export type Symbol = (typeof SYMBOLS)[number];

export const TILE_COPIES = 3; // 36 combos × 3 = 108 tiles

export type Tile = { readonly colour: Colour; readonly symbol: Symbol };

// A garden section. `identity` is the colour+symbol shown as its immovable tile (one of the 36
// sections). The central starter section has `identity: null` — all 6 spaces free.
export type Section = { readonly identity: Tile | null };

// A revealed section in the central area, plus the draftable tiles sitting on it.
export type Display = { readonly section: Section; readonly tiles: readonly Tile[] };

export type CentralArea = {
  readonly top: Display | null; // current top of the pile (fresh = 4 tiles); null once exhausted
  readonly open: readonly Display[]; // split-off sections holding their leftover tiles
  readonly pile: readonly Section[]; // unrevealed sections beneath the top
};

export type Supply = {
  readonly bag: readonly Tile[]; // remaining drawable tiles
  readonly discard: readonly Tile[]; // spent tiles; reshuffled into the bag when it empties
  readonly sections: readonly Section[]; // remaining undealt sections
};

export const STORAGE_TILE_LIMIT = 12; // the tile area holds tiles AND coins, up to this total
export const STORAGE_SECTION_LIMIT = 2;
export const STARTING_COINS = 3;

// The tile-storage area is one ordered list of items — tiles and coins interleaved — so a
// player can rearrange it. The order has no gameplay effect; it's purely for human comfort.
export type StorageItem =
  | { readonly kind: 'tile'; readonly tile: Tile }
  | { readonly kind: 'coin' };

export type PlayerStorage = {
  readonly tileArea: readonly StorageItem[]; // tiles + coins; length ≤ STORAGE_TILE_LIMIT
  readonly sections: readonly Section[]; // ≤ STORAGE_SECTION_LIMIT
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

export type PlayerState = {
  readonly passed: boolean; // has this player passed this round?
  readonly score: number;
  readonly storage: PlayerStorage;
  // the play area (placed sections + tiles) lands when the `place` rules are modelled
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
  PlaceSection: 'place-section',
  PlaceTiles: 'place-tiles',
  Pass: 'pass',
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

// A draft is parameterised by a chosen colour OR symbol, plus — for each distinct matching
// tile — which physical copy to take (its location can change whether a section is revealed).
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

// Rearrange the current player's tile area (cosmetic — no gameplay effect). Free: it does not
// consume the turn. `order` must be a permutation of the player's current tile area.
export type ReorderAction = {
  readonly type: typeof ActionType.Reorder;
  readonly order: readonly StorageItem[];
};

// Placement effects are still stubbed (the placement rules come next).
export type PlaceSectionAction = { readonly type: typeof ActionType.PlaceSection };
export type PlaceTilesAction = { readonly type: typeof ActionType.PlaceTiles };
export type PassAction = { readonly type: typeof ActionType.Pass };

export type Action =
  | DraftAction
  | ReorderAction
  | PlaceSectionAction
  | PlaceTilesAction
  | PassAction;
