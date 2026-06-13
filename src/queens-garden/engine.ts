// Azul: Queen's Garden — engine (VERTICAL SLICE).
//
// Proves the round/turn skeleton end-to-end: 4 rounds, a pass-driven turn loop, the
// first-passer penalty + next-round lead, and game-over. Same architecture as the TTT
// engine: pure functions, a single `illegalReason` legality source, derived status.

import {
  ActionType,
  COLOURS,
  Phase,
  ROUND_COUNT,
  SYMBOLS,
  TILE_COPIES,
  type Action,
  type CentralArea,
  type Display,
  type PlayerState,
  type Section,
  type State,
  type Supply,
  type Tile,
} from './types';
import { makeRng } from './rng';

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
    storage: { tiles: [], sections: [] },
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

// The single source of legality truth (same pattern as the TTT engine).
export function illegalReason(state: State, action: Action): string | null {
  if (status(state) !== Phase.Playing) {
    return 'the game is over';
  }

  switch (action.type) {
    case ActionType.Pass:
      // The current player is always active (passed players are skipped), so pass is legal.
      return null;
    case ActionType.TakeTiles:
    case ActionType.TakeSections:
    case ActionType.PlaceSection:
    case ActionType.PlaceTiles:
      // No per-action preconditions yet — Pass 2 fills these in (e.g. storage limits).
      return null;
  }
}

export function isLegal(state: State, action: Action): boolean {
  return illegalReason(state, action) === null;
}

const ALL_ACTIONS: readonly Action[] = [
  { type: ActionType.TakeTiles },
  { type: ActionType.TakeSections },
  { type: ActionType.PlaceSection },
  { type: ActionType.PlaceTiles },
  { type: ActionType.Pass },
];

export function legalActions(state: State): Action[] {
  return ALL_ACTIONS.filter((action) => isLegal(state, action));
}

export function applyAction(state: State, action: Action): State {
  const reason = illegalReason(state, action);
  if (reason !== null) {
    throw new Error(`Illegal action: ${reason}.`);
  }

  if (action.type === ActionType.Pass) {
    return resolvePass(state);
  }

  // take / place actions: stubbed for the slice — the player acts and the turn passes.
  // Real effects on storage and the board arrive in Pass 2.
  return advanceTurn(state);
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
