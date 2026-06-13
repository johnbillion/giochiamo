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
  Phase,
  ROUND_COUNT,
  storageCoins,
  storageTiles,
  type Action,
  type Attribute,
  type Colour,
  type State,
  type Symbol,
  type Tile,
} from './types';

const tileStr = (t: Tile): string => `${t.colour}/${t.symbol}`;
const attrStr = (a: Attribute): string => (a.kind === 'colour' ? a.colour : a.symbol);

export function render(state: State): string {
  const phase = status(state);
  const lines: string[] = [
    phase === Phase.GameOver ? 'Game over' : `Round ${state.round}/${ROUND_COUNT} (${phase})`,
  ];

  state.players.forEach((p, i) => {
    const turn = phase === Phase.Playing && i === state.currentPlayer ? '>' : ' ';
    const passed = p.passed ? ' [passed]' : '';
    lines.push(
      `${turn} P${i}  score ${p.score}  storage ${storageTiles(p.storage).length}t/${p.storage.sections.length}s/${storageCoins(p.storage)}c${passed}`,
    );
  });

  lines.push('central:');
  lines.push(`  top: ${state.central.top ? state.central.top.tiles.map(tileStr).join(', ') : '(empty)'}`);
  state.central.open.forEach((d, i) => {
    const body = d.tiles.length
      ? d.tiles.map(tileStr).join(', ')
      : `(section ${d.section.identity ? tileStr(d.section.identity) : 'starter'})`;
    lines.push(`  open[${i}]: ${body}`);
  });
  lines.push(`  pile: ${state.central.pile.length} face-down`);
  lines.push(`draftable: ${draftableAttributes(state).map(attrStr).join(', ') || '—'}`);

  return lines.join('\n');
}

export function newGame(playerCount = 2, seed = 1, firstPlayer = 0) {
  let state = createInitialState(playerCount, seed, firstPlayer);

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
        '  g.draftColour(c)   take every draftable tile/section of colour c',
        '  g.draftSymbol(s)   take every draftable tile/section of symbol s',
        '  g.draft(attr)      draft by { kind: "colour" | "symbol", ... }',
        '  g.placeSection()   (stubbed) place a section, ends your turn',
        '  g.placeTiles()     (stubbed) place tiles, ends your turn',
        '  g.pass()           pass for the rest of the round',
        '  g.move(from, to)   rearrange your tile storage (free, no turn cost)',
        '  g.moveSection(f,t) rearrange your section storage (free)',
        '  g.draftable()      attributes you could draft right now',
        '  g.actions()        action kinds available right now',
        '  g.show()           reprint the current board',
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
    moveSection: (from: number, to: number): State => {
      const order = [...state.players[state.currentPlayer]!.storage.sections];
      const [item] = order.splice(from, 1);
      if (item) order.splice(to, 0, item);
      return act({ type: ActionType.Reorder, area: 'sections', order });
    },
    placeSection: (): State => act({ type: ActionType.PlaceSection }),
    placeTiles: (): State => act({ type: ActionType.PlaceTiles }),
    pass: (): State => act({ type: ActionType.Pass }),
    actions: (): ActionType[] => availableActionTypes(state),
    draftable: (): Attribute[] => draftableAttributes(state),
    show,
    help,
    get state(): State {
      return state;
    },
  };
}
