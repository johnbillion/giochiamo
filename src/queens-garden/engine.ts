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
  SYMBOLS,
  TILE_COPIES,
  type Action,
  type CentralArea,
  type Display,
  type PlayerState,
  type ReorderAction,
  type Section,
  type State,
  type StorageItem,
  type Supply,
  type Tile,
} from './types';
import { makeRng } from './rng';
import { draftableAttributes, draftIllegalReason, resolveDraft } from './draft';

const PLAYER_COUNT_MIN = 2;
const PLAYER_COUNT_MAX = 4;

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

// The 36-section pool: one section per colour×symbol combo (its immovable identity tile).
function buildSectionPool(): Section[] {
  const sections: Section[] = [];
  for (const colour of COLOURS) {
    for (const symbol of SYMBOLS) {
      sections.push({ identity: { colour, symbol } });
    }
  }
  return sections;
}

// Sections in play per round: 2→5, 3→6, 4→7.
function sectionsPerRound(playerCount: number): number {
  return playerCount + 3;
}

export function createInitialState(
  playerCount: number,
  seed: number,
  firstPlayer = 0,
): State {
  if (playerCount < PLAYER_COUNT_MIN || playerCount > PLAYER_COUNT_MAX) {
    throw new Error(`Player count must be ${PLAYER_COUNT_MIN}–${PLAYER_COUNT_MAX}.`);
  }

  const rng = makeRng(seed);
  const bag = rng.shuffle(buildTileBag());
  const sectionPool = rng.shuffle(buildSectionPool());

  // Deal this round's sections into a pile; the top section gets 4 tiles, the rest stay
  // face-down beneath it.
  const n = sectionsPerRound(playerCount);
  const roundSections = sectionPool.slice(0, n);
  const top: Display = { section: roundSections[0]!, tiles: bag.slice(0, 4) };
  const central: CentralArea = { top, open: [], pile: roundSections.slice(1) };
  const supply: Supply = { bag: bag.slice(4), discard: [], sections: sectionPool.slice(n) };

  const players: PlayerState[] = Array.from({ length: playerCount }, () => ({
    passed: false,
    score: 0,
    storage: { tileArea: Array.from({ length: STARTING_COINS }, () => coinItem), sections: [] },
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
    case ActionType.PlaceSection:
    case ActionType.PlaceTiles:
      // Placement preconditions arrive with the placement rules.
      return null;
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
  const kinds: ActionType[] = [
    ActionType.Reorder,
    ActionType.PlaceSection,
    ActionType.PlaceTiles,
    ActionType.Pass,
  ];
  if (draftableAttributes(state).length > 0) kinds.unshift(ActionType.Draft);
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
    case ActionType.PlaceSection:
    case ActionType.PlaceTiles:
      // Placement effects arrive with the placement rules — for now the turn just passes.
      return advanceTurn(state);
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

  // TODO(next slice): discard the central area's leftover tiles and deal a fresh pile here.
  // For now supply/central simply carry over unchanged (no action consumes them yet).
  // Start the next round: the first-passer leads, passes reset, marker cleared.
  return {
    ...state,
    players: scored.map((player) => ({ ...player, passed: false })),
    round: state.round + 1,
    currentPlayer: state.firstPasser ?? 0,
    firstPasser: null,
  };
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

function sectionKey(section: Section): string {
  return section.identity ? `${section.identity.colour}:${section.identity.symbol}` : 'blank';
}

function reorderIllegalReason(state: State, action: ReorderAction): string | null {
  const { storage } = state.players[state.currentPlayer]!;
  const ok =
    action.area === 'tiles'
      ? isPermutation(storage.tileArea, action.order, storageItemKey)
      : isPermutation(storage.sections, action.order, sectionKey);
  return ok ? null : `a reorder must be a permutation of your ${action.area}`;
}

function resolveReorder(state: State, action: ReorderAction): State {
  const players = state.players.map((p, i) => {
    if (i !== state.currentPlayer) return p;
    const storage =
      action.area === 'tiles'
        ? { ...p.storage, tileArea: action.order }
        : { ...p.storage, sections: action.order };
    return { ...p, storage };
  });
  return { ...state, players };
}
