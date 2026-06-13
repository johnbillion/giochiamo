// The two-player hotseat UI for Azul: Queen's Garden.
//
// This component holds NO game rules. Every legal-move decision is delegated to the engine:
//   - which action *kinds* are open now      → availableActionTypes
//   - which colours/symbols can be drafted    → draftableAttributes
//   - whether a concrete placement is allowed  → isLegal / illegalReason
//   - the resulting state                      → applyAction
// The UI's only job is to build candidate Actions from clicks and hand them to the engine.

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  applyAction,
  availableActionTypes,
  createInitialState,
  expansionsPerRound,
  isLegal,
  status,
} from '../queens-garden/engine';
import { buildDraft, draftableAttributes } from '../queens-garden/draft';
import { placeTileCoins, symbolCost } from '../queens-garden/placement';
import {
  ActionType,
  Phase,
  ROUND_COUNT,
  storageCoins,
  storageTiles,
  type Action,
  type Attribute,
  type Colour,
  type Symbol,
  type Direction,
  type Payment,
  type PlaceExpansionAction,
  type PlaceTileAction,
  type PlayerCount,
  type PlayerState,
  type Expansion,
  type SlotId,
  type State,
  type Tile,
} from '../queens-garden/types';
import { submit, type GameDispatch } from '../transport/submit';
import {
  axialToPixel,
  COLOUR_HEX,
  COLOUR_LABEL,
  CoinFace,
  DIR_AXIAL,
  expansionLabel,
  ExpansionFace,
  ExpansionOutline,
  hexPoints,
  SLOT_CENTRE,
  SYMBOL_GLYPH,
  SYMBOL_LABEL,
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
// index; payment is a set of *other* storage indices (tiles and coins live in one list, expansions
// in another). Nothing here is validated by hand — it's only the raw material for an Action that
// the engine then judges.
type Selection =
  | { readonly mode: 'idle' }
  | { readonly mode: 'tile'; readonly idx: number } // index into the player's tileArea
  | { readonly mode: 'expansion'; readonly idx: number }; // index into the player's expansions

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
  const expansions = current.storage.expansions;

  const payment: Payment = useMemo(() => {
    const tiles: Tile[] = [];
    let coins = 0;
    for (const i of payTiles) {
      const item = tileArea[i];
      if (!item) continue;
      if (item.kind === 'tile') tiles.push(item.tile);
      else coins += 1;
    }
    const payExpansions: Expansion[] = [];
    for (const i of paySecs) {
      const s = expansions[i];
      if (s) payExpansions.push(s);
    }
    return { tiles, expansions: payExpansions, coins: Math.min(coins, 5) as Payment['coins'] };
  }, [payTiles, paySecs, tileArea, expansions]);

  // The item being placed (a tile, or a expansion's identity tile) drives the cost display.
  const placedItem = sel.mode === 'tile' ? tileArea[sel.idx] : undefined;
  const placedTile: Tile | null =
    placedItem && placedItem.kind === 'tile' ? placedItem.tile : null;
  const placedExpansion: Expansion | null = sel.mode === 'expansion' ? (expansions[sel.idx] ?? null) : null;
  const placedRef: Tile | null = placedTile ?? placedExpansion?.identity ?? null;
  const cost = placedRef ? symbolCost(placedRef.symbol) : 0;
  const need = Math.max(0, cost - 1);
  const paid = payment.tiles.length + payment.expansions.length + payment.coins;

  // Build the candidate Action for placing the selected item at (slot, dir) with the chosen
  // payment. Returns null if nothing is selected.
  const candidateAt = (slot: SlotId, dir: Direction): PlaceTileAction | PlaceExpansionAction | null => {
    if (sel.mode === 'tile' && placedTile) {
      return { type: ActionType.PlaceTile, tile: placedTile, slot, dir, payment };
    }
    if (sel.mode === 'expansion' && placedExpansion) {
      return { type: ActionType.PlaceExpansion, expansion: placedExpansion, slot, identityDir: dir, payment };
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

  const clickExpansionItem = (i: number) => {
    if (!expansions[i]) return;
    if (sel.mode === 'idle') {
      if (available.includes(ActionType.PlaceExpansion)) {
        setSel({ mode: 'expansion', idx: i });
        setPayTiles(new Set());
        setPaySecs(new Set());
        setNote(null);
      }
      return;
    }
    if (sel.mode === 'expansion' && sel.idx === i) {
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
              Round {state.round}/{ROUND_COUNT}
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
        <h2 className="visually-hidden">Central area</h2>
        <CentralArea
          state={state}
          draftable={draftable}
          onDraft={draft}
          canDraft={phase === Phase.Playing}
        />
      </section>

      {/* The current player's action bar: payment status + pass. */}
      {phase === Phase.Playing && (
        <section className="actionbar">
          {sel.mode === 'idle' ? (
            <span className="hint">
              Click a stored tile or garden expansion to start placing it, draft above, or pass.
            </span>
          ) : (
            <span className="placing">
              Placing{' '}
              {placedTile ? (
                <TileFace tile={placedTile} size={22} />
              ) : (
                placedExpansion && <em>{expansionLabel(placedExpansion)} expansion</em>
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
            placedTile={i === state.currentPlayer ? placedTile : null}
            placedExpansion={i === state.currentPlayer ? placedExpansion : null}
            legalTargets={i === state.currentPlayer ? legalTargets : new Set()}
            onTileItem={clickTileItem}
            onExpansionItem={clickExpansionItem}
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

// A central-area tile that, on hover, offers to draft by its colour or its symbol. Each button
// shows how many tiles across the whole central area share that attribute, e.g. "Blue (3)".
function DraftablePiece({
  colour,
  symbol,
  face,
  dimmed,
  draftable,
  onDraft,
  onPreview,
  countFor,
}: {
  colour: Colour;
  symbol: Symbol;
  face: ReactNode; // the visual (a TileFace or ExpansionFace)
  dimmed: boolean;
  draftable: ReadonlySet<string>;
  onDraft: (attr: Attribute) => void;
  onPreview: (attr: Attribute | null) => void;
  // How many draftable pieces (tiles + takeable expansions) in the central area share an attribute.
  countFor: (attr: Attribute) => number;
}) {
  const colourCount = countFor({ kind: 'colour', colour });
  const symbolCount = countFor({ kind: 'symbol', symbol });
  const colourEnabled = draftable.has(`c:${colour}`);
  const symbolEnabled = draftable.has(`s:${symbol}`);

  // When this piece is the only one of its colour AND the only one of its symbol, a colour draft and
  // a symbol draft would both take exactly this single piece. Collapse the two-button popup into one
  // "Select …" affordance, and let the player click the piece itself as well as the popup message.
  const solo = colourCount === 1 && symbolCount === 1;
  const soloAttr: Attribute = { kind: 'colour', colour };
  const soloEnabled = colourEnabled; // identical to symbolEnabled for a solo piece

  // The popup is hover-driven, but a click must dismiss it even though the cursor is still over the
  // piece. So we gate it on React state: open on hover, and force closed on click until the pointer
  // leaves and returns.
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onPreview(null);
  };
  const pick = (attr: Attribute) => {
    onDraft(attr);
    close();
  };

  // The popup is centred under the piece, which can run off the left/right edge of the viewport for
  // pieces near a screen edge. Once it's shown, measure it and nudge it horizontally back into view.
  const popupRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!open || !popupRef.current) {
      setShift(0);
      return;
    }
    const rect = popupRef.current.getBoundingClientRect();
    const margin = 8;
    if (rect.left < margin) setShift(margin - rect.left);
    else if (rect.right > window.innerWidth - margin) setShift(window.innerWidth - margin - rect.right);
    else setShift(0);
  }, [open]);

  return (
    <span
      className={`draft-tile${dimmed ? ' dimmed' : ''}${open ? ' open' : ''}${
        solo && soloEnabled ? ' clickable' : ''
      }`}
      onMouseEnter={() => {
        setOpen(true);
        if (solo) onPreview(soloAttr);
      }}
      onMouseLeave={close}
      onClick={solo && soloEnabled ? () => pick(soloAttr) : undefined}
    >
      {face}
      <span
        className="tile-popup"
        ref={popupRef}
        style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
      >
        {solo ? (
          <button
            className="draft-chip"
            disabled={!soloEnabled}
            onClick={(e) => {
              e.stopPropagation();
              pick(soloAttr);
            }}
          >
            {COLOUR_LABEL[colour]} {SYMBOL_LABEL[symbol]} (1)
          </button>
        ) : (
          <>
            <button
              className="draft-chip draft-chip-colour"
              data-colour={colour}
              disabled={!colourEnabled}
              onClick={() => pick({ kind: 'colour', colour })}
              onMouseEnter={() => onPreview({ kind: 'colour', colour })}
              onMouseLeave={() => onPreview(null)}
              style={{ background: colourEnabled ? COLOUR_HEX[colour] : undefined }}
            >
              {COLOUR_LABEL[colour]} ({colourCount})
            </button>
            <button
              className="draft-chip"
              disabled={!symbolEnabled}
              onClick={() => pick({ kind: 'symbol', symbol })}
              onMouseEnter={() => onPreview({ kind: 'symbol', symbol })}
              onMouseLeave={() => onPreview(null)}
            >
              {SYMBOL_GLYPH[symbol]} {SYMBOL_LABEL[symbol]} ({symbolCount})
            </button>
          </>
        )}
      </span>
    </span>
  );
}

function CentralArea({
  state,
  draftable,
  onDraft,
  canDraft,
}: {
  state: State;
  draftable: ReadonlySet<string>;
  onDraft: (attr: Attribute) => void;
  canDraft: boolean;
}) {
  const { central } = state;
  // The round can expose up to `expansionsPerRound` expansion piles (the Top pile plus the opened
  // ones); size the grid to that maximum so every pile sits at an equal fraction of the width.
  const maxPiles = expansionsPerRound(state.players.length as PlayerCount);

  // The attribute being previewed (a popup button is hovered): all tiles that DON'T match it fade
  // out, so the player can see exactly what a colour/symbol draft would pull from the area.
  const [preview, setPreview] = useState<Attribute | null>(null);
  const matchesPreview = (t: Tile): boolean =>
    preview === null ||
    (preview.kind === 'colour' ? t.colour === preview.colour : t.symbol === preview.symbol);

  // Every tile currently in the central area, plus the takeable (emptied) expansions — the pool a
  // draft draws from, and the basis for the per-attribute counts shown in each popup. Drafting an
  // attribute sweeps up BOTH the matching tiles and the matching takeable expansions, so the count
  // must include expansions too.
  const allTiles: Tile[] = [];
  if (central.top) for (const t of central.top.tiles) if (t) allTiles.push(t);
  for (const d of central.open) for (const t of d.tiles) if (t) allTiles.push(t);
  const takeableExpansions: Tile[] = central.open
    .filter((d) => !d.tiles.some(Boolean) && d.expansion?.identity)
    .map((d) => d.expansion!.identity!);

  const countFor = (attr: Attribute): number => {
    const match = (t: Tile) =>
      attr.kind === 'colour' ? t.colour === attr.colour : t.symbol === attr.symbol;
    return allTiles.filter(match).length + takeableExpansions.filter(match).length;
  };

  // A draft is only offered during play; otherwise pieces are plain (non-interactive) faces. A
  // null is a slot whose tile has been drafted away — rendered as an empty cell so the surviving
  // tiles keep their positions in the 2×2 grid.
  const renderTile = (t: Tile | null, key: number) =>
    t === null ? (
      <span key={key} className="tile-blank" aria-hidden="true" />
    ) : canDraft ? (
      <DraftablePiece
        key={key}
        colour={t.colour}
        symbol={t.symbol}
        face={<TileFace tile={t} size={56} />}
        dimmed={!matchesPreview(t)}
        draftable={draftable}
        onDraft={onDraft}
        onPreview={setPreview}
        countFor={countFor}
      />
    ) : (
      <TileFace key={key} tile={t} size={56} />
    );

  // A takeable expansion is drafted the same way as a tile (by its identity's colour or symbol).
  // A spent pile (null expansion — its expansion already taken) renders empty, leaving only the
  // rosette outline so the pile keeps its slot.
  const renderExpansion = (expansion: Expansion | null, key: number) => {
    if (expansion === null) return <span key={key} className="pile-spent" aria-label="empty pile" />;
    const face = <ExpansionFace expansion={expansion} size={20} />;
    const id = expansion.identity;
    if (!canDraft || !id) return <span key={key}>{face}</span>;
    return (
      <DraftablePiece
        key={key}
        colour={id.colour}
        symbol={id.symbol}
        face={face}
        dimmed={!matchesPreview(id)}
        draftable={draftable}
        onDraft={onDraft}
        onPreview={setPreview}
        countFor={countFor}
      />
    );
  };

  return (
    <div className="displays" style={{ '--displays': maxPiles } as CSSProperties}>
      <div className="display">
        <ExpansionOutline />
        <div className="tiles">
          {central.top
            ? central.top.tiles.map((t, i) => renderTile(t, i))
            : <em>empty</em>}
        </div>
      </div>
      {central.open.map((d, i) => (
        <div className="display" key={i}>
          <ExpansionOutline />
          <div className="tiles">
            {d.tiles.some(Boolean)
              ? d.tiles.map((t, j) => renderTile(t, j))
              : renderExpansion(d.expansion, 0)}
          </div>
        </div>
      ))}
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
  placedTile,
  placedExpansion,
  legalTargets,
  onTileItem,
  onExpansionItem,
  onCell,
}: {
  id: number;
  player: PlayerState;
  active: boolean;
  sel: Selection;
  payTiles: ReadonlySet<number>;
  paySecs: ReadonlySet<number>;
  placedTile: Tile | null;
  placedExpansion: Expansion | null;
  legalTargets: ReadonlySet<string>;
  onTileItem: (i: number) => void;
  onExpansionItem: (i: number) => void;
  onCell: (slot: SlotId, dir: Direction) => void;
}) {
  return (
    <div className={`player${active ? ' active' : ''}`}>
      <div className="player-header">
        <h2>
          Player {id + 1} {active && <span className="turn-badge">your turn</span>}
          {player.passed && <span className="passed-badge">passed</span>}
        </h2>
        <div className="score">
          Score: {player.score}
        </div>
      </div>

      <Garden
        player={player}
        active={active}
        legalTargets={legalTargets}
        placedTile={placedTile}
        placedExpansion={placedExpansion}
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
                  >
                    <CoinFace size={60} />
                  </button>
                );
              }
              return (
                <button key={i} className={cls} disabled={!active} onClick={() => onTileItem(i)}>
                  <TileFace tile={item.tile} size={60} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="storage-row">
          <span className="storage-label">Expansions</span>
          <div className="items">
            {player.storage.expansions.length === 0 && <em>empty</em>}
            {player.storage.expansions.map((s, i) => {
              const isPlaced = active && sel.mode === 'expansion' && sel.idx === i;
              const isPay = active && paySecs.has(i);
              const cls = `item expansion${isPlaced ? ' placed' : ''}${isPay ? ' pay' : ''}`;
              return (
                <button key={i} className={cls} disabled={!active} onClick={() => onExpansionItem(i)}>
                  <ExpansionFace expansion={s} size={18} />
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
  placedTile,
  placedExpansion,
  onCell,
}: {
  player: PlayerState;
  active: boolean;
  legalTargets: ReadonlySet<string>;
  // What the current player is about to place (drives the hover preview). Exactly one is non-null
  // while a placement is in progress; both null when idle.
  placedTile: Tile | null;
  placedExpansion: Expansion | null;
  onCell: (slot: SlotId, dir: Direction) => void;
}) {
  const R = 18; // hex circumradius in px
  const placing = placedTile !== null || placedExpansion !== null;

  // The (slot, dir) cell the cursor is over, as a "slot:dir" key. Only legal cells set it, so a
  // non-null value always names a cell the engine would accept — the basis for the live preview.
  const [hovered, setHovered] = useState<string | null>(null);

  // Project every (slot, dir) tile slot to a pixel centre and capture its state, tracking the
  // bounding box so the SVG viewBox hugs the whole flower-of-flowers.
  type Cell = {
    slot: number;
    dir: number;
    cx: number;
    cy: number;
    tile: Tile | null;
    hasExpansion: boolean;
    legal: boolean;
  };
  const cells: Cell[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  SLOT_CENTRE.forEach((centre, slot) => {
    const expansion = player.garden[slot];
    DIR_AXIAL.forEach(([dq, dr], dir) => {
      const [cx, cy] = axialToPixel(centre[0] + dq, centre[1] + dr, R);
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
      cells.push({
        slot,
        dir,
        cx,
        cy,
        tile: expansion ? expansion.tiles[dir] ?? null : null,
        hasExpansion: !!expansion,
        legal: active && placing && legalTargets.has(`${slot}:${dir}`),
      });
    });
  });

  const padX = (R * Math.sqrt(3)) / 2 + 2;
  const padY = R + 2;
  const width = maxX - minX + 2 * padX;
  const height = maxY - minY + 2 * padY;
  const viewBox = `${(minX - padX).toFixed(2)} ${(minY - padY).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`;

  // The hovered cell, if the cursor is over a legal target. For a tile placement this is the single
  // cell the tile lands in; for an expansion it's where the identity tile faces, and the whole
  // rosette (its slot) gets highlighted.
  const hoveredCell = hovered ? cells.find((c) => `${c.slot}:${c.dir}` === hovered && c.legal) : undefined;

  return (
    <svg className="garden" viewBox={viewBox} aria-label="garden board">
      {cells.map((c) => {
        const key = `${c.slot}:${c.dir}`;
        // Where the about-to-place item would land: the exact cell under the cursor, and — for an
        // expansion — every cell of that rosette's slot.
        const isPreviewCell = hoveredCell?.slot === c.slot && hoveredCell?.dir === c.dir;
        const inHoveredRosette = !!placedExpansion && !!hoveredCell && hoveredCell.slot === c.slot;

        // The tile to draw in this cell as a preview: the placed tile, or the expansion's identity
        // (which faces the hovered direction). A blank-identity expansion previews no glyph.
        const preview: Tile | null = isPreviewCell
          ? placedTile ?? placedExpansion?.identity ?? null
          : null;

        // Fill/stroke mirror the old cell states: legal target, empty slot of a placed expansion,
        // an unplaced expansion slot, or a filled tile — with the hover preview layered on top.
        let fill: string;
        let stroke: string;
        let strokeWidth = 1.5;
        let glyph: string | null = c.tile ? SYMBOL_GLYPH[c.tile.symbol] : null;
        let className = 'gcell';
        if (preview) {
          // Show the actual tile/identity that will be placed here.
          fill = COLOUR_HEX[preview.colour];
          stroke = '#15803d';
          strokeWidth = 2.5;
          glyph = SYMBOL_GLYPH[preview.symbol];
          className = 'gcell legal';
        } else if (isPreviewCell) {
          // Hovered cell of a blank-identity expansion: an empty-frame preview, no glyph.
          fill = '#a5b4fc';
          stroke = '#15803d';
          strokeWidth = 2.5;
          className = 'gcell legal';
        } else if (inHoveredRosette) {
          // The rest of the rosette the expansion is about to drop into — drawn in the same
          // purpley-blue an empty slot of a placed expansion takes, so the hover previews the
          // placed result.
          fill = '#a5b4fc';
          stroke = '#15803d';
          strokeWidth = 2;
          className = c.legal ? 'gcell legal' : 'gcell';
        } else if (c.legal) {
          fill = '#86efac';
          stroke = '#15803d';
          strokeWidth = 2.5;
          className = 'gcell legal';
        } else if (!c.hasExpansion) {
          fill = '#cbd5e1';
          stroke = '#94a3b8';
        } else if (!c.tile) {
          fill = '#a5b4fc';
          stroke = '#6366f1';
        } else {
          fill = COLOUR_HEX[c.tile.colour];
          stroke = 'rgba(0, 0, 0, 0.4)';
        }
        return (
          <g
            key={key}
            className={className}
            onClick={c.legal ? () => onCell(c.slot as SlotId, c.dir as Direction) : undefined}
            onMouseEnter={c.legal ? () => setHovered(key) : undefined}
            onMouseLeave={c.legal ? () => setHovered((h) => (h === key ? null : h)) : undefined}
          >
            <polygon
              points={hexPoints(c.cx, c.cy, R)}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
            {glyph && (
              <text
                className="gglyph"
                x={c.cx}
                y={c.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={R}
              >
                {glyph}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
