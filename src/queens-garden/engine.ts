// Azul: Queen's Garden — engine (VERTICAL SLICE).
//
// Proves the round/turn skeleton end-to-end: 4 rounds, a pass-driven turn loop, the
// first-passer penalty + next-round lead, and game-over. Pure functions, a single
// `illegalReason` legality source, derived status.

import {
  ActionType,
  coinItem,
  COLOURS,
  Phase,
  ROUND_COUNT,
  STARTING_COINS,
  storageTiles,
  SYMBOLS,
  TILE_COPIES,
  type Action,
  type CentralArea,
  type Display,
  type PlayerCount,
  type PlayerState,
  type ReorderAction,
  type Expansion,
  type State,
  type StorageItem,
  type Supply,
  type Tile,
} from './types';
import { makeRng, type Rng } from './rng';
import { drawTiles } from './supply';
import { draftableAttributes, draftIllegalReason, resolveDraft } from './draft';
import { createStarterGarden } from './garden';
import {
  placeExpansionIllegalReason,
  placeTileIllegalReason,
  resolvePlaceExpansion,
  resolvePlaceTile,
} from './placement';

// The 108-tile supply: every colour×symbol combo, TILE_COPIES times.
function buildTileBag(): Tile[] {
  const tiles: Tile[] = [];
  for (const colour of COLOURS) {
    for (const symbol of SYMBOLS) {
      for (let copy = 0; copy < TILE_COPIES; copy++) {
        tiles.push({ colour, symbol });
      }
    }
  }
  return tiles;
}

// The 36-expansion pool: one expansion per colour×symbol combo (its immovable identity tile).
function buildExpansionPool(): Expansion[] {
  const expansions: Expansion[] = [];
  for (const colour of COLOURS) {
    for (const symbol of SYMBOLS) {
      expansions.push({ identity: { colour, symbol } });
    }
  }
  return expansions;
}

// Expansions in play per round.
export function expansionsPerRound(playerCount: PlayerCount): number {
  return {
    2: 5,
    3: 7,
    4: 8,
  }[playerCount];
}

// Deal a round's central area from the supply: n expansions into a pile, 4 tiles onto the top.
// Used at setup and at every round transition.
function dealRound(
  supply: Supply,
  rng: Rng,
  playerCount: PlayerCount,
): { central: CentralArea; supply: Supply } {
  const n = expansionsPerRound(playerCount);
  const roundExpansions = supply.expansions.slice(0, n);
  const draw = drawTiles(supply.bag, supply.discard, 4, rng);
  const top: Display = { expansion: roundExpansions[0]!, tiles: draw.drawn };
  const central: CentralArea = { top, open: [], pile: roundExpansions.slice(1) };
  return {
    central,
    supply: { bag: draw.bag, discard: draw.discard, expansions: supply.expansions.slice(n) },
  };
}

export function createInitialState(
  playerCount: PlayerCount,
  seed: number,
  firstPlayer = 0,
): State {

  const rng = makeRng(seed);
  const fullSupply: Supply = {
    bag: rng.shuffle(buildTileBag()),
    discard: [],
    expansions: rng.shuffle(buildExpansionPool()),
  };
  const { central, supply } = dealRound(fullSupply, rng, playerCount);

  const players: PlayerState[] = Array.from({ length: playerCount }, () => ({
    passed: false,
    score: 0,
    storage: { tileArea: Array.from({ length: STARTING_COINS }, () => coinItem), expansions: [] },
    garden: createStarterGarden(),
  }));

  return {
    rng: rng.state(),
    round: 1,
    players,
    currentPlayer: firstPlayer,
    firstPasser: null,
    supply,
    central,
  };
}

export function status(state: State): Phase {
  return state.round > ROUND_COUNT ? Phase.GameOver : Phase.Playing;
}

// The single source of legality truth.
export function illegalReason(state: State, action: Action): string | null {
  if (status(state) !== Phase.Playing) {
    return 'the game is over';
  }

  switch (action.type) {
    case ActionType.Draft:
      return draftIllegalReason(state, action);
    case ActionType.Reorder:
      return reorderIllegalReason(state, action);
    case ActionType.PlaceExpansion:
      return placeExpansionIllegalReason(state, action);
    case ActionType.PlaceTile:
      return placeTileIllegalReason(state, action);
    case ActionType.Pass:
      // The current player is always active (passed players are skipped), so pass is legal.
      return null;
  }
}

export function isLegal(state: State, action: Action): boolean {
  return illegalReason(state, action) === null;
}

// What kinds of action are legal right now. A draft is parameterised (and can blow up
// combinatorially), so it isn't enumerated here — use draftableAttributes + the draft builder
// to construct a specific draft. The parameterless actions are simply listed.
export function availableActionTypes(state: State): ActionType[] {
  if (status(state) !== Phase.Playing) return [];
  const player = state.players[state.currentPlayer]!;
  const kinds: ActionType[] = [ActionType.Reorder, ActionType.Pass];
  if (draftableAttributes(state).length > 0) kinds.unshift(ActionType.Draft);
  // Necessary conditions only — you can only place what you hold. Whether a legal target +
  // affordable payment exists is left to illegalReason on a concrete action.
  if (player.storage.expansions.length > 0) kinds.push(ActionType.PlaceExpansion);
  if (storageTiles(player.storage).length > 0) kinds.push(ActionType.PlaceTile);
  return kinds;
}

export function applyAction(state: State, action: Action): State {
  const reason = illegalReason(state, action);
  if (reason !== null) {
    throw new Error(`Illegal action: ${reason}.`);
  }

  switch (action.type) {
    case ActionType.Draft:
      return advanceTurn(resolveDraft(state, action));
    case ActionType.Reorder:
      // Rearranging your tile area is free — it does not pass the turn.
      return resolveReorder(state, action);
    case ActionType.Pass:
      return resolvePass(state);
    case ActionType.PlaceExpansion:
      return advanceTurn(resolvePlaceExpansion(state, action));
    case ActionType.PlaceTile:
      return advanceTurn(resolvePlaceTile(state, action));
  }
}

// --- internal transitions ---

function resolvePass(state: State): State {
  const players = state.players.map((player, i) =>
    i === state.currentPlayer ? { ...player, passed: true } : player,
  );
  const firstPasser = state.firstPasser ?? state.currentPlayer;
  const passed: State = { ...state, players, firstPasser };

  return players.every((player) => player.passed) ? endRound(passed) : advanceTurn(passed);
}

function endRound(state: State): State {
  // Round scoring (slice stub): only the first-passer penalty. The scoring wheel and
  // per-tile scoring land in Pass 3.
  const scored = state.players.map((player, i) =>
    i === state.firstPasser ? { ...player, score: player.score - 1 } : player,
  );

  if (state.round >= ROUND_COUNT) {
    // Round 4 done → game over (round becomes the terminal sentinel).
    return { ...state, players: scored, round: ROUND_COUNT + 1 };
  }

  // Discard the central area's leftover tiles, then deal a fresh pile for the next round.
  const rng = makeRng(state.rng);
  const replenished: Supply = {
    ...state.supply,
    discard: [...state.supply.discard, ...centralTiles(state.central)],
  };
  // players.length is a valid PlayerCount by construction (createInitialState validated it).
  const { central, supply } = dealRound(replenished, rng, state.players.length as PlayerCount);

  // Start the next round: the first-passer leads, passes reset, marker cleared.
  return {
    ...state,
    rng: rng.state(),
    players: scored.map((player) => ({ ...player, passed: false })),
    round: state.round + 1,
    currentPlayer: state.firstPasser ?? 0,
    firstPasser: null,
    supply,
    central,
  };
}

// All tiles currently sitting in the central area (top batch + split-off leftovers), skipping the
// drafted-away holes.
function centralTiles(central: CentralArea): Tile[] {
  const top = central.top ? central.top.tiles : [];
  return [...top, ...central.open.flatMap((display) => display.tiles)].filter((t): t is Tile => t !== null);
}

function advanceTurn(state: State): State {
  const count = state.players.length;
  let next = (state.currentPlayer + 1) % count;
  while (state.players[next]?.passed) {
    next = (next + 1) % count;
  }
  return { ...state, currentPlayer: next };
}

// True when `b` is a permutation of `a` (same items by key, any order).
function isPermutation<T>(a: readonly T[], b: readonly T[], key: (item: T) => string): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const item of a) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  for (const item of b) {
    const remaining = counts.get(key(item)) ?? 0;
    if (remaining === 0) return false;
    counts.set(key(item), remaining - 1);
  }
  return true;
}

function storageItemKey(item: StorageItem): string {
  return item.kind === 'coin' ? 'coin' : `tile:${item.tile.colour}:${item.tile.symbol}`;
}

function expansionKey(expansion: Expansion): string {
  return expansion.identity ? `${expansion.identity.colour}:${expansion.identity.symbol}` : 'blank';
}

function reorderIllegalReason(state: State, action: ReorderAction): string | null {
  const { storage } = state.players[state.currentPlayer]!;
  const ok =
    action.area === 'tiles'
      ? isPermutation(storage.tileArea, action.order, storageItemKey)
      : isPermutation(storage.expansions, action.order, expansionKey);
  return ok ? null : `a reorder must be a permutation of your ${action.area}`;
}

function resolveReorder(state: State, action: ReorderAction): State {
  const players = state.players.map((p, i) => {
    if (i !== state.currentPlayer) return p;
    const storage =
      action.area === 'tiles'
        ? { ...p.storage, tileArea: action.order }
        : { ...p.storage, expansions: action.order };
    return { ...p, storage };
  });
  return { ...state, players };
}
