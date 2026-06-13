import { describe, expect, it } from 'vitest';

import { applyAction, availableActionTypes, createInitialState, isLegal, status } from './engine';
import { ActionType, Phase, ROUND_COUNT, type Action, type State } from './types';

const place: Action = { type: ActionType.PlaceSection };
const pass: Action = { type: ActionType.Pass };

function apply(state: State, ...actions: Action[]): State {
  return actions.reduce((s, a) => applyAction(s, a), state);
}

// Pass repeatedly until the current round ends (the round number advances or the game ends).
function passWholeRound(state: State): State {
  const round = state.round;
  let s = state;
  while (s.round === round && status(s) === Phase.Playing) {
    s = applyAction(s, pass);
  }
  return s;
}

describe('setup', () => {
  it('starts in round 1, playing, with the chosen first player', () => {
    const s = createInitialState(2, 1, 0);
    expect(s.round).toBe(1);
    expect(status(s)).toBe(Phase.Playing);
    expect(s.currentPlayer).toBe(0);
    expect(s.players).toHaveLength(2);
    expect(s.players.every((p) => !p.passed && p.score === 0)).toBe(true);
  });

  it('rejects an out-of-range player count', () => {
    expect(() => createInitialState(1, 1)).toThrow();
    expect(() => createInitialState(5, 1)).toThrow();
  });
});

describe('turn order', () => {
  it('a non-pass action passes the turn to the next player', () => {
    const s = apply(createInitialState(2, 1, 0), place);
    expect(s.currentPlayer).toBe(1);
    expect(s.round).toBe(1);
    expect(s.players.some((p) => p.passed)).toBe(false);
  });

  it('skips players who have already passed', () => {
    let s = createInitialState(3, 1, 0);
    s = applyAction(s, pass); // p0 passes → current p1
    expect(s.currentPlayer).toBe(1);
    s = applyAction(s, pass); // p1 passes → skip p0, current p2
    expect(s.currentPlayer).toBe(2);
    expect(s.firstPasser).toBe(0);
  });
});

describe('passing and round end', () => {
  it('records the first passer and ends the round when all have passed', () => {
    let s = createInitialState(2, 1, 0);

    s = applyAction(s, pass); // p0 is first to pass
    expect(s.firstPasser).toBe(0);
    expect(s.players[0]!.passed).toBe(true);
    expect(s.currentPlayer).toBe(1);
    expect(s.round).toBe(1); // not over yet

    s = applyAction(s, pass); // p1 passes → round ends
    expect(s.round).toBe(2);
    expect(s.firstPasser).toBeNull();
    expect(s.players.every((p) => !p.passed)).toBe(true); // passes reset
    expect(s.currentPlayer).toBe(0); // round 1's first-passer leads round 2
    expect(s.players[0]!.score).toBe(-1); // first-passer penalty
    expect(s.players[1]!.score).toBe(0);
  });
});

describe('game end', () => {
  it('is over after four rounds', () => {
    let s = createInitialState(2, 1, 0);
    for (let r = 1; r <= ROUND_COUNT; r++) {
      expect(status(s)).toBe(Phase.Playing);
      expect(s.round).toBe(r);
      s = passWholeRound(s);
    }
    expect(status(s)).toBe(Phase.GameOver);
  });
});

describe('legality', () => {
  it('offers action kinds while playing and none once over', () => {
    const playing = createInitialState(2, 1, 0);
    const kinds = availableActionTypes(playing);
    expect(kinds).toContain(ActionType.Draft);
    expect(kinds).toContain(ActionType.Pass);

    let over = playing;
    for (let r = 1; r <= ROUND_COUNT; r++) over = passWholeRound(over);
    expect(status(over)).toBe(Phase.GameOver);
    expect(availableActionTypes(over)).toHaveLength(0);
  });

  it('applyAction accepts exactly the legal actions (no divergence)', () => {
    let over = createInitialState(2, 1, 0);
    for (let r = 1; r <= ROUND_COUNT; r++) over = passWholeRound(over);

    const states: State[] = [createInitialState(2, 1, 0), createInitialState(4, 1, 2), over];
    for (const s of states) {
      for (const action of [place, pass]) {
        let throws = false;
        try {
          applyAction(s, action);
        } catch {
          throws = true;
        }
        expect(throws).toBe(!isLegal(s, action));
      }
    }
  });
});
