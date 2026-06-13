// A headless harness for driving the Queen's Garden round loop by hand — no UI.
//
// In the browser console (via the dev hook in main.tsx):
//   const g = qg.newGame(2)        // 2–4 players
//   g.takeTiles(); g.pass()        // each call prints the state
//   g.legal()                      // the actions currently allowed
//   g.state                        // the raw, serializable state
//
// The action effects are still stubbed (this is the vertical slice) — take/place just
// pass the turn — so what you're exercising here is the round/turn machine itself.

import { applyAction, createInitialState, legalActions, status } from './engine';
import { ActionType, Phase, ROUND_COUNT, type Action, type State } from './types';

export function render(state: State): string {
  const phase = status(state);
  const lines: string[] = [
    phase === Phase.GameOver
      ? `Game over after ${ROUND_COUNT} rounds`
      : `Round ${state.round}/${ROUND_COUNT} (${phase})`,
  ];

  state.players.forEach((player, i) => {
    const turn = phase === Phase.Playing && i === state.currentPlayer ? '>' : ' ';
    const passed = player.passed ? '  [passed]' : '';
    lines.push(`${turn} P${i}  score ${player.score}${passed}`);
  });

  lines.push(`first to pass this round: ${state.firstPasser === null ? '—' : `P${state.firstPasser}`}`);
  return lines.join('\n');
}

// A small mutable session so you don't thread state by hand. The engine underneath
// stays pure — each call is just `state = applyAction(state, action)`.
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

  return {
    takeTiles: (): State => act({ type: ActionType.TakeTiles }),
    takeSections: (): State => act({ type: ActionType.TakeSections }),
    placeSection: (): State => act({ type: ActionType.PlaceSection }),
    placeTiles: (): State => act({ type: ActionType.PlaceTiles }),
    pass: (): State => act({ type: ActionType.Pass }),
    legal: (): Action[] => legalActions(state),
    show,
    get state(): State {
      return state;
    },
  };
}
