// Headless harness for the Queen's Garden engine — drive a game from the browser console:
//   const g = qg.newGame(2)
//   g.draftColour('red')   // or g.draftSymbol('bird'), or g.draft({ kind: 'colour', colour: 'red' })
//   g.pass()
//   g.draftable()          // attributes you could draft right now
//   g.actions()            // action kinds available
//   g.state                // raw serializable state
//
// The draft takes the first available copy of each matching tile; placement is still stubbed.

import { applyAction, availableActionTypes, createInitialState, status } from './engine';
import { buildDraft, draftableAttributes } from './draft';
import {
  ActionType,
  COLOURS,
  Phase,
  ROUND_COUNT,
  storageCoins,
  storageTiles,
  SYMBOLS,
  type Action,
  type Attribute,
  type Colour,
  type Direction,
  type Garden,
  type Payment,
  type PlayerCount,
  type Expansion,
  type SlotId,
  type State,
  type Symbol,
  type Tile,
} from './types';

const tileStr = (t: Tile): string => `${t.colour}/${t.symbol}`;
const expansionStr = (s: Expansion): string => (s.identity ? tileStr(s.identity) : 'blank');
const attrStr = (a: Attribute): string => (a.kind === 'colour' ? a.colour : a.symbol);

// --- garden ASCII rendering ---
// Each of the 36 tiles (6 colours × 6 symbols) gets one character, 0-9 then A-Z. The index is
// colour-major: blue/tree = 0 … yellow/lily = 35.
const TILE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const tileChar = (t: Tile): string =>
  TILE_CHARS[COLOURS.indexOf(t.colour) * SYMBOLS.length + SYMBOLS.indexOf(t.symbol)] ?? '?';

// The (line, c) grid position of every tile slot, indexed [slot][dir], derived from the board
// geometry so the picture mirrors true adjacency. `line` is 1-based (1–12); the character column
// is `2*c - 1`. The gaps left in the grid are the 7 decorative expansion-centre holes.
const SLOT_LAYOUT: readonly (readonly (readonly [number, number])[])[] = [
  [[8, 5], [7, 4], [6, 4], [5, 5], [6, 6], [7, 6]], // slot 0 (centre)
  [[12, 5], [11, 4], [10, 4], [9, 5], [10, 6], [11, 6]], // slot 1
  [[10, 2], [9, 1], [8, 1], [7, 2], [8, 3], [9, 3]], // slot 2
  [[6, 2], [5, 1], [4, 1], [3, 2], [4, 3], [5, 3]], // slot 3
  [[4, 5], [3, 4], [2, 4], [1, 5], [2, 6], [3, 6]], // slot 4
  [[6, 8], [5, 7], [4, 7], [3, 8], [4, 9], [5, 9]], // slot 5
  [[10, 8], [9, 7], [8, 7], [7, 8], [8, 9], [9, 9]], // slot 6
];

// One player's garden as 12 lines: a tile shows its character, an empty space of a placed expansion
// shows '.', and a slot with no expansion yet shows 'o' (so the empty board is the bare skeleton).
function renderGarden(garden: Garden): string {
  const rows: string[][] = Array.from({ length: 12 }, () => Array<string>(17).fill(' '));
  SLOT_LAYOUT.forEach((dirs, slot) => {
    const expansion = garden[slot];
    dirs.forEach(([line, c], dir) => {
      const tile = expansion ? expansion.tiles[dir] ?? null : null;
      rows[line - 1]![2 * c - 2] = expansion ? (tile ? tileChar(tile) : '.') : 'o';
    });
  });
  return rows.map((r) => r.join('').replace(/ +$/, '')).join('\n');
}

// The tile → character key, as a 6×6 grid (rows = colour, cols = symbol).
function legendText(): string {
  const head = ' '.repeat(8) + SYMBOLS.map((s) => s.slice(0, 3).padStart(3)).join(' ');
  const rows = COLOURS.map(
    (colour, ci) =>
      colour.padEnd(7) +
      ' ' +
      SYMBOLS.map((_, si) => (TILE_CHARS[ci * SYMBOLS.length + si] ?? '?').padStart(3)).join(' '),
  );
  return ['tile key (row = colour, col = symbol):', head, ...rows].join('\n');
}

// Console ergonomics: accept a partial payment (e.g. `{ coins: 2 }`) and fill in the rest, so the
// untyped browser boundary doesn't crash the typed engine on a missing `tiles`/`expansions`.
const toPayment = (p: Partial<Payment> = {}): Payment => ({ tiles: [], expansions: [], coins: 0, ...p });

export function render(state: State): string {
  const phase = status(state);
  const lines: string[] = [
    phase === Phase.GameOver ? 'Game over' : `Round ${state.round}/${ROUND_COUNT} (${phase})`,
  ];

  state.players.forEach((p, i) => {
    const turn = phase === Phase.Playing && i === state.currentPlayer ? '>' : ' ';
    const passed = p.passed ? ' [passed]' : '';
    const tiles = storageTiles(p.storage);
    const expansions = p.storage.expansions;
    lines.push(`${turn} P${i}  score ${p.score}  ${storageCoins(p.storage)}c${passed}`);
    lines.push(`    tiles (${tiles.length}): ${tiles.map(tileStr).join(', ') || '—'}`);
    lines.push(`    expansions (${expansions.length}): ${expansions.map(expansionStr).join(', ') || '—'}`);
    lines.push(renderGarden(p.garden));
  });

  lines.push('central:');
  lines.push(`  top: ${state.central.top ? state.central.top.tiles.map(tileStr).join(', ') : '(empty)'}`);
  state.central.open.forEach((d, i) => {
    const body = d.tiles.length
      ? d.tiles.map(tileStr).join(', ')
      : `(expansion ${d.expansion.identity ? tileStr(d.expansion.identity) : 'starter'})`;
    lines.push(`  open[${i}]: ${body}`);
  });
  lines.push(`  pile: ${state.central.pile.length} face-down`);
  lines.push(`draftable: ${draftableAttributes(state).map(attrStr).join(', ') || '—'}`);

  return lines.join('\n');
}

export function newGame(playerCount: PlayerCount = 2, seed = 1, firstPlayer = 0) {
  let state = createInitialState(playerCount, seed, firstPlayer);
  console.log(legendText()); // print the tile → character key once at the start

  const show = (): State => {
    console.log(render(state));
    return state;
  };
  const act = (action: Action): State => {
    state = applyAction(state, action);
    return show();
  };

  const help = (): void => {
    console.log(
      [
        "Queen's Garden playground — commands:",
        '  g.draftColour(c)   take every draftable tile/expansion of colour c',
        '  g.draftSymbol(s)   take every draftable tile/expansion of symbol s',
        '  g.draft(attr)      draft by { kind: "colour" | "symbol", ... }',
        '  g.placeExpansion(expansion, slot, dir, payment?)  place a expansion (identity faces dir)',
        '  g.placeTile(tile, slot, dir, payment?)        place a tile on a expansion space',
        '  g.pass()           pass for the rest of the round',
        '  g.move(from, to)   rearrange your tile storage (free, no turn cost)',
        '  g.moveExpansion(f,t) rearrange your expansion storage (free)',
        '  g.draftable()      attributes you could draft right now',
        '  g.actions()        action kinds available right now',
        '  g.show()           reprint the current board',
        '  g.legend()         the tile → character key for the garden render',
        '  g.state            the raw, serializable game state',
        '  g.help()           this message',
      ].join('\n'),
    );
  };

  return {
    draft: (attribute: Attribute): State => act(buildDraft(state, attribute)),
    draftColour: (colour: Colour): State => act(buildDraft(state, { kind: 'colour', colour })),
    draftSymbol: (symbol: Symbol): State => act(buildDraft(state, { kind: 'symbol', symbol })),
    move: (from: number, to: number): State => {
      const order = [...state.players[state.currentPlayer]!.storage.tileArea];
      const [item] = order.splice(from, 1);
      if (item) order.splice(to, 0, item);
      return act({ type: ActionType.Reorder, area: 'tiles', order });
    },
    moveExpansion: (from: number, to: number): State => {
      const order = [...state.players[state.currentPlayer]!.storage.expansions];
      const [item] = order.splice(from, 1);
      if (item) order.splice(to, 0, item);
      return act({ type: ActionType.Reorder, area: 'expansions', order });
    },
    placeExpansion: (expansion: Expansion, slot: SlotId, identityDir: Direction, payment?: Partial<Payment>): State =>
      act({ type: ActionType.PlaceExpansion, expansion, slot, identityDir, payment: toPayment(payment) }),
    placeTile: (tile: Tile, slot: SlotId, dir: Direction, payment?: Partial<Payment>): State =>
      act({ type: ActionType.PlaceTile, tile, slot, dir, payment: toPayment(payment) }),
    pass: (): State => act({ type: ActionType.Pass }),
    actions: (): ActionType[] => availableActionTypes(state),
    draftable: (): Attribute[] => draftableAttributes(state),
    show,
    legend: (): void => console.log(legendText()),
    help,
    get state(): State {
      return state;
    },
  };
}
