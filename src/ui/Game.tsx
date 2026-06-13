// The two-player hotseat UI for Azul: Queen's Garden.
//
// This component holds NO game rules. Every legal-move decision is delegated to the engine:
//   - which action *kinds* are open now      → availableActionTypes
//   - which colours/symbols can be drafted    → draftableAttributes
//   - whether a concrete placement is allowed  → isLegal / illegalReason
//   - the resulting state                      → applyAction
// The UI's only job is to build candidate Actions from clicks and hand them to the engine.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  applyAction,
  availableActionTypes,
  createInitialState,
  isLegal,
  status,
} from '../queens-garden/engine';
import { buildDraft, draftableAttributes } from '../queens-garden/draft';
import { placeTileCoins, symbolCost } from '../queens-garden/placement';
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
  type Direction,
  type Payment,
  type PlaceSectionAction,
  type PlaceTileAction,
  type PlayerState,
  type Section,
  type SlotId,
  type State,
  type Tile,
} from '../queens-garden/types';
import { submit, type GameDispatch } from '../transport/submit';
import {
  COLOUR_HEX,
  GRID_COLS,
  GRID_ROWS,
  sectionLabel,
  SLOT_LAYOUT,
  SYMBOL_GLYPH,
  TileFace,
} from './board';

const PLAYER_COUNT = 2;

// A `?seed=` URL param makes a hotseat game reproducible (handy for sharing or testing);
// otherwise each new game is random.
function initialSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed');
  const parsed = param === null ? NaN : Number(param);
  return Number.isFinite(parsed) ? parsed : makeSeed();
}

const makeSeed = (): number => Math.floor(Math.random() * 1_000_000_000);

// The in-progress placement the current player is assembling. The item to place is a storage
// index; payment is a set of *other* storage indices (tiles and coins live in one list, sections
// in another). Nothing here is validated by hand — it's only the raw material for an Action that
// the engine then judges.
type Selection =
  | { readonly mode: 'idle' }
  | { readonly mode: 'tile'; readonly idx: number } // index into the player's tileArea
  | { readonly mode: 'section'; readonly idx: number }; // index into the player's sections

const attrKey = (a: Attribute): string => (a.kind === 'colour' ? `c:${a.colour}` : `s:${a.symbol}`);

// Parse + lightly validate a pasted state JSON. This is the untyped boundary (see submit.ts), so
// we sanity-check the shape enough that the UI won't immediately crash; the engine still guards
// every subsequent action via illegalReason. Throws (with a human-readable reason) on bad input.
function parseLoadedState(text: string): State {
  const data: unknown = JSON.parse(text);
  if (typeof data !== 'object' || data === null) throw new Error('not a JSON object');
  const s = data as Record<string, unknown>;
  if (!Array.isArray(s.players) || s.players.length < 2) throw new Error('missing players[]');
  if (typeof s.round !== 'number') throw new Error('missing round');
  if (
    typeof s.currentPlayer !== 'number' ||
    s.currentPlayer < 0 ||
    s.currentPlayer >= s.players.length
  ) {
    throw new Error('invalid currentPlayer');
  }
  if (typeof s.central !== 'object' || s.central === null) throw new Error('missing central');
  if (typeof s.supply !== 'object' || s.supply === null) throw new Error('missing supply');
  return data as State;
}

export function Game() {
  const [seed, setSeed] = useState(initialSeed);
  const [state, setState] = useState<State>(() => createInitialState(PLAYER_COUNT, seed));
  const [sel, setSel] = useState<Selection>({ mode: 'idle' });
  const [payTiles, setPayTiles] = useState<ReadonlySet<number>>(new Set());
  const [paySecs, setPaySecs] = useState<ReadonlySet<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  // Every applied action, in order — the seed + this log replay the game deterministically.
  const [log, setLog] = useState<readonly Action[]>([]);
  const [copied, setCopied] = useState(false);
  const [loadText, setLoadText] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadDialog = useRef<HTMLDialogElement>(null);

  const dispatch: GameDispatch = (action) => setState((s) => applyAction(s, action));

  const resetSelection = () => {
    setSel({ mode: 'idle' });
    setPayTiles(new Set());
    setPaySecs(new Set());
    setNote(null);
  };

  // A new turn (or a new game) wipes any half-built placement — it belonged to the prior player.
  useEffect(resetSelection, [state.currentPlayer, state.round]);

  const phase = status(state);
  const current = state.players[state.currentPlayer]!;
  const available = useMemo(() => availableActionTypes(state), [state]);
  const draftable = useMemo(
    () => new Set(draftableAttributes(state).map(attrKey)),
    [state],
  );

  const newGame = () => {
    const next = makeSeed();
    setSeed(next);
    setState(createInitialState(PLAYER_COUNT, next));
    setLog([]);
    resetSelection();
  };

  const copyState = () => {
    void navigator.clipboard.writeText(JSON.stringify(state, null, 2)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  const openLoadDialog = () => {
    setLoadText('');
    setLoadError(null);
    loadDialog.current?.showModal();
  };

  // Load a pasted state JSON, replacing the current game. The log resets (a loaded snapshot has no
  // action history to replay). On bad input we keep the dialog open and show why.
  const loadState = () => {
    try {
      const parsed = parseLoadedState(loadText);
      setState(parsed);
      setLog([]);
      setLoadError(null);
      resetSelection();
      loadDialog.current?.close();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'invalid JSON');
    }
  };

  const act = (action: Action) => {
    submit(dispatch, action);
    setLog((l) => [...l, action]);
    resetSelection();
  };

  // Dev-only: expose the live UI game on `window.game` for console debugging. `game.state` is the
  // current snapshot; `game.log` is the action sequence; `game.replay()` re-derives the state from
  // seed + log (so you can confirm a bug reproduces, or bisect the log). Distinct from the headless
  // `window.qg` playground (see main.tsx). Stripped from production builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as typeof window & { game?: unknown }).game = {
      seed,
      state,
      log,
      replay: (actions: readonly Action[] = log) =>
        actions.reduce((s, a) => applyAction(s, a), createInitialState(PLAYER_COUNT, seed)),
    };
  }, [seed, state, log]);

  // --- assemble the current player's payment from the selected storage indices ---
  const tileArea = current.storage.tileArea;
  const sections = current.storage.sections;

  const payment: Payment = useMemo(() => {
    const tiles: Tile[] = [];
    let coins = 0;
    for (const i of payTiles) {
      const item = tileArea[i];
      if (!item) continue;
      if (item.kind === 'tile') tiles.push(item.tile);
      else coins += 1;
    }
    const paySections: Section[] = [];
    for (const i of paySecs) {
      const s = sections[i];
      if (s) paySections.push(s);
    }
    return { tiles, sections: paySections, coins: Math.min(coins, 5) as Payment['coins'] };
  }, [payTiles, paySecs, tileArea, sections]);

  // The item being placed (a tile, or a section's identity tile) drives the cost display.
  const placedItem = sel.mode === 'tile' ? tileArea[sel.idx] : undefined;
  const placedTile: Tile | null =
    placedItem && placedItem.kind === 'tile' ? placedItem.tile : null;
  const placedSection: Section | null = sel.mode === 'section' ? (sections[sel.idx] ?? null) : null;
  const placedRef: Tile | null = placedTile ?? placedSection?.identity ?? null;
  const cost = placedRef ? symbolCost(placedRef.symbol) : 0;
  const need = Math.max(0, cost - 1);
  const paid = payment.tiles.length + payment.sections.length + payment.coins;

  // Build the candidate Action for placing the selected item at (slot, dir) with the chosen
  // payment. Returns null if nothing is selected.
  const candidateAt = (slot: SlotId, dir: Direction): PlaceTileAction | PlaceSectionAction | null => {
    if (sel.mode === 'tile' && placedTile) {
      return { type: ActionType.PlaceTile, tile: placedTile, slot, dir, payment };
    }
    if (sel.mode === 'section' && placedSection) {
      return { type: ActionType.PlaceSection, section: placedSection, slot, identityDir: dir, payment };
    }
    return null;
  };

  // Which (slot, dir) cells the engine would accept right now — asked one candidate at a time.
  const legalTargets = useMemo(() => {
    const set = new Set<string>();
    if (sel.mode === 'idle') return set;
    for (let slot = 0; slot < 7; slot++) {
      for (let dir = 0; dir < 6; dir++) {
        const action = candidateAt(slot as SlotId, dir as Direction);
        if (action && isLegal(state, action)) set.add(`${slot}:${dir}`);
      }
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, sel, payment]);

  // --- click handlers (storage → selection / payment, garden → place) ---

  const toggle = (set: ReadonlySet<number>, i: number): Set<number> => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  };

  const clickTileItem = (i: number) => {
    const item = tileArea[i];
    if (!item) return;
    if (sel.mode === 'idle') {
      if (item.kind === 'tile' && available.includes(ActionType.PlaceTile)) {
        setSel({ mode: 'tile', idx: i });
        setPayTiles(new Set());
        setPaySecs(new Set());
        setNote(null);
      }
      return;
    }
    if (sel.mode === 'tile' && sel.idx === i) {
      resetSelection();
      return;
    }
    setPayTiles((p) => toggle(p, i));
  };

  const clickSectionItem = (i: number) => {
    if (!sections[i]) return;
    if (sel.mode === 'idle') {
      if (available.includes(ActionType.PlaceSection)) {
        setSel({ mode: 'section', idx: i });
        setPayTiles(new Set());
        setPaySecs(new Set());
        setNote(null);
      }
      return;
    }
    if (sel.mode === 'section' && sel.idx === i) {
      resetSelection();
      return;
    }
    setPaySecs((p) => toggle(p, i));
  };

  const clickCell = (slot: SlotId, dir: Direction) => {
    const action = candidateAt(slot, dir);
    if (!action) return;
    if (!isLegal(state, action)) return;
    // For a tile placement, warn if completion-bonus coins will overflow storage and be lost.
    if (action.type === ActionType.PlaceTile) {
      const { max, actual } = placeTileCoins(state, action);
      if (max > actual) setNote(`Heads up: ${max - actual} earned coin(s) won't fit and will be lost.`);
    }
    act(action);
  };

  const draft = (attr: Attribute) => act(buildDraft(state, attr));

  // --- render ---

  return (
    <div className="game">
      <header className="topbar">
        <h1>Queen's Garden</h1>
        <div className="status">
          {phase === Phase.GameOver ? (
            <strong>Game over</strong>
          ) : (
            <>
              Round {state.round}/{ROUND_COUNT} —{' '}
              <strong>Player {state.currentPlayer + 1}'s turn</strong>
            </>
          )}
        </div>
        <button onClick={copyState}>{copied ? 'Copied!' : 'Copy state'}</button>
        <button onClick={openLoadDialog}>Load state</button>
        <button onClick={newGame}>New game</button>
      </header>

      <dialog ref={loadDialog} className="load-dialog">
        <h2>Load state</h2>
        <p className="hint">Paste a game-state JSON (from “Copy state”) to load it.</p>
        <textarea
          className="load-textarea"
          value={loadText}
          onChange={(e) => setLoadText(e.target.value)}
          placeholder="{ …game state JSON… }"
        />
        {loadError && <p className="note">⚠ {loadError}</p>}
        <div className="modal-actions">
          <button onClick={() => loadDialog.current?.close()}>Cancel</button>
          <button onClick={loadState} disabled={!loadText.trim()}>
            Load
          </button>
        </div>
      </dialog>

      {phase === Phase.GameOver && <GameOver players={state.players} />}

      <section className="central">
        <h2>Central area</h2>
        <CentralArea state={state} />
        <div className="draft">
          <h3>Draft {phase === Phase.Playing && `— Player ${state.currentPlayer + 1}`}</h3>
          <div className="chips">
            <span className="chips-label">Colour:</span>
            {COLOURS.map((colour) => {
              const enabled = phase === Phase.Playing && draftable.has(`c:${colour}`);
              return (
                <button
                  key={colour}
                  className="draft-chip"
                  disabled={!enabled}
                  onClick={() => draft({ kind: 'colour', colour })}
                  style={{ background: enabled ? COLOUR_HEX[colour] : undefined }}
                >
                  {colour}
                </button>
              );
            })}
          </div>
          <div className="chips">
            <span className="chips-label">Symbol:</span>
            {SYMBOLS.map((symbol) => {
              const enabled = phase === Phase.Playing && draftable.has(`s:${symbol}`);
              return (
                <button
                  key={symbol}
                  className="draft-chip"
                  disabled={!enabled}
                  onClick={() => draft({ kind: 'symbol', symbol })}
                >
                  {SYMBOL_GLYPH[symbol]} {symbol}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* The current player's action bar: payment status + pass. */}
      {phase === Phase.Playing && (
        <section className="actionbar">
          {sel.mode === 'idle' ? (
            <span className="hint">
              Click a stored tile or section to start placing it, draft above, or pass.
            </span>
          ) : (
            <span className="placing">
              Placing{' '}
              {placedTile ? (
                <TileFace tile={placedTile} size={22} />
              ) : (
                placedSection && <em>{sectionLabel(placedSection)} section</em>
              )}{' '}
              — cost {cost}: pay {need} more ({paid}/{need} selected). Then click a highlighted
              cell.{' '}
              <button onClick={resetSelection}>Cancel</button>
            </span>
          )}
          <button
            className="pass"
            disabled={!available.includes(ActionType.Pass)}
            onClick={() => act({ type: ActionType.Pass })}
          >
            Pass
          </button>
        </section>
      )}

      {note && <p className="note">{note}</p>}

      <section className="players">
        {state.players.map((player, i) => (
          <PlayerPanel
            key={i}
            id={i}
            player={player}
            active={phase === Phase.Playing && i === state.currentPlayer}
            sel={sel}
            payTiles={payTiles}
            paySecs={paySecs}
            legalTargets={i === state.currentPlayer ? legalTargets : new Set()}
            onTileItem={clickTileItem}
            onSectionItem={clickSectionItem}
            onCell={clickCell}
          />
        ))}
      </section>
    </div>
  );
}

function GameOver({ players }: { players: readonly PlayerState[] }) {
  const best = Math.max(...players.map((p) => p.score));
  return (
    <section className="gameover">
      <h2>Final scores</h2>
      <ul>
        {players.map((p, i) => (
          <li key={i}>
            Player {i + 1}: <strong>{p.score}</strong>
            {p.score === best ? ' 🏆' : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CentralArea({ state }: { state: State }) {
  const { central } = state;
  return (
    <div className="displays">
      <div className="display">
        <span className="display-label">Top{central.top ? ` (${central.top.tiles.length})` : ''}</span>
        <div className="tiles">
          {central.top
            ? central.top.tiles.map((t, i) => <TileFace key={i} tile={t} size={28} />)
            : <em>empty</em>}
        </div>
      </div>
      {central.open.map((d, i) => (
        <div className="display" key={i}>
          <span className="display-label">
            Open {i + 1}
            {d.tiles.length === 0 && d.section.identity
              ? ` — ${sectionLabel(d.section)} section (takeable)`
              : ''}
          </span>
          <div className="tiles">
            {d.tiles.length
              ? d.tiles.map((t, j) => <TileFace key={j} tile={t} size={28} />)
              : <em>{d.section.identity ? sectionLabel(d.section) : 'starter'} section</em>}
          </div>
        </div>
      ))}
      <div className="pile">Pile: {central.pile.length} face-down</div>
    </div>
  );
}

function PlayerPanel({
  id,
  player,
  active,
  sel,
  payTiles,
  paySecs,
  legalTargets,
  onTileItem,
  onSectionItem,
  onCell,
}: {
  id: number;
  player: PlayerState;
  active: boolean;
  sel: Selection;
  payTiles: ReadonlySet<number>;
  paySecs: ReadonlySet<number>;
  legalTargets: ReadonlySet<string>;
  onTileItem: (i: number) => void;
  onSectionItem: (i: number) => void;
  onCell: (slot: SlotId, dir: Direction) => void;
}) {
  const tiles = storageTiles(player.storage);
  return (
    <div className={`player${active ? ' active' : ''}`}>
      <h2>
        Player {id + 1} {active && <span className="turn-badge">your turn</span>}
        {player.passed && <span className="passed-badge">passed</span>}
      </h2>
      <div className="score">
        Score {player.score} · {storageCoins(player.storage)} coins · {tiles.length} tiles ·{' '}
        {player.storage.sections.length} sections
      </div>

      <Garden
        player={player}
        active={active}
        legalTargets={legalTargets}
        placing={sel.mode !== 'idle'}
        onCell={onCell}
      />

      <div className="storage">
        <div className="storage-row">
          <span className="storage-label">Tiles</span>
          <div className="items">
            {player.storage.tileArea.length === 0 && <em>empty</em>}
            {player.storage.tileArea.map((item, i) => {
              const isPlaced = active && sel.mode === 'tile' && sel.idx === i;
              const isPay = active && payTiles.has(i);
              const cls = `item${isPlaced ? ' placed' : ''}${isPay ? ' pay' : ''}`;
              if (item.kind === 'coin') {
                return (
                  <button
                    key={i}
                    className={`${cls} coin`}
                    disabled={!active}
                    onClick={() => onTileItem(i)}
                    title="coin (wildcard payment)"
                  >
                    🪙
                  </button>
                );
              }
              return (
                <button key={i} className={cls} disabled={!active} onClick={() => onTileItem(i)}>
                  <TileFace tile={item.tile} size={30} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="storage-row">
          <span className="storage-label">Sections</span>
          <div className="items">
            {player.storage.sections.length === 0 && <em>empty</em>}
            {player.storage.sections.map((s, i) => {
              const isPlaced = active && sel.mode === 'section' && sel.idx === i;
              const isPay = active && paySecs.has(i);
              const cls = `item section${isPlaced ? ' placed' : ''}${isPay ? ' pay' : ''}`;
              return (
                <button key={i} className={cls} disabled={!active} onClick={() => onSectionItem(i)}>
                  {s.identity ? <TileFace tile={s.identity} size={30} /> : <em>blank</em>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Garden({
  player,
  active,
  legalTargets,
  placing,
  onCell,
}: {
  player: PlayerState;
  active: boolean;
  legalTargets: ReadonlySet<string>;
  placing: boolean;
  onCell: (slot: SlotId, dir: Direction) => void;
}) {
  const cells: ReactNode[] = [];
  SLOT_LAYOUT.forEach((dirs, slot) => {
    const section = player.garden[slot];
    dirs.forEach(([row, col], dir) => {
      const tile = section ? section.tiles[dir] ?? null : null;
      const isLegalTarget = active && placing && legalTargets.has(`${slot}:${dir}`);
      const empty = section ? !tile : false;
      const cls = [
        'cell',
        section ? (tile ? 'filled' : 'empty-space') : 'no-section',
        isLegalTarget ? 'legal' : '',
      ]
        .filter(Boolean)
        .join(' ');
      cells.push(
        <button
          key={`${slot}:${dir}`}
          className={cls}
          style={{ gridRow: row, gridColumn: col }}
          disabled={!isLegalTarget}
          onClick={() => isLegalTarget && onCell(slot as SlotId, dir as Direction)}
          title={section ? (tile ? undefined : `slot ${slot}, dir ${dir}`) : `empty slot ${slot}`}
        >
          {tile ? <TileFace tile={tile} size={30} /> : empty ? '·' : ''}
        </button>,
      );
    });
  });
  return (
    <div
      className="garden"
      style={{
        gridTemplateRows: `repeat(${GRID_ROWS}, 34px)`,
        gridTemplateColumns: `repeat(${GRID_COLS}, 34px)`,
      }}
    >
      {cells}
    </div>
  );
}
