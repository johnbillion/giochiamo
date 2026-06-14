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
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  applyAction,
  availableActionTypes,
  createInitialState,
  expansionsPerRound,
  isLegal,
  status,
} from '../queens-garden/engine';
import { draftableAttributes, draftPlan } from '../queens-garden/draft';
import { symbolCost } from '../queens-garden/placement';
import {
  ActionType,
  Phase,
  ROUND_COUNT,
  STORAGE_EXPANSION_LIMIT,
  STORAGE_TILE_LIMIT,
  type Action,
  type Attribute,
  type Colour,
  type Symbol,
  type Direction,
  type DraftAction,
  type DraftSource,
  type TilePick,
  type Payment,
  type PlaceExpansionAction,
  type PlaceTileAction,
  type PlayerCount,
  type PlayerState,
  type Expansion,
  type SlotId,
  type State,
  type StorageItem,
  type Tile,
} from '../queens-garden/types';
import { submit, type GameDispatch } from '../transport/submit';
import {
  axialToPixel,
  cheeseSlicesFor,
  COLOUR_HEX,
  COLOUR_LABEL,
  colourLabel,
  CoinFace,
  DIR_AXIAL,
  EXPANSION_HEX_R,
  ExpansionFace,
  ExpansionOutline,
  HexFace,
  hexPoints,
  jitterDegrees,
  pileRotation,
  SLOT_CENTRE,
  SYMBOL_LABEL,
  SYMBOL_PATH,
  SymbolGlyph,
  SymbolIcon,
  symbolLabel,
  TILE_SIZE,
  TileFace,
  TileSlot,
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
  // Every applied action, in order — the seed + this log replay the game deterministically.
  const [log, setLog] = useState<readonly Action[]>([]);
  // A stack of full state snapshots, one per applied action — the top is restored on Undo.
  const [history, setHistory] = useState<readonly State[]>([]);
  const [copied, setCopied] = useState(false);
  const [loadText, setLoadText] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadDialog = useRef<HTMLDialogElement>(null);

  const dispatch: GameDispatch = (action) => setState((s) => applyAction(s, action));

  const resetSelection = () => {
    setSel({ mode: 'idle' });
    setPayTiles(new Set());
    setPaySecs(new Set());
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
    setHistory([]);
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
      setHistory([]);
      setLoadError(null);
      resetSelection();
      loadDialog.current?.close();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'invalid JSON');
    }
  };

  const act = (action: Action) => {
    setHistory((h) => [...h, state]);
    submit(dispatch, action);
    setLog((l) => [...l, action]);
    resetSelection();
  };

  // Pop the top state snapshot and restore it, rolling back the last applied action.
  const undo = () => {
    if (history.length === 0) return;
    setState(history[history.length - 1]!);
    setHistory((h) => h.slice(0, -1));
    setLog((l) => l.slice(0, -1));
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

  // The in-flight tile-placement fly-in (a chosen tile sailing from the dock into its garden cell),
  // or null when none is playing. `key` remounts the overlay so a rapid second placement replays.
  const [placeAnim, setPlaceAnim] = useState<PlaceAnim | null>(null);
  const animKey = useRef(0);

  // The drafted pieces currently flying from the central area into the (just-drafted) player's
  // storage. Each removes itself when its transition ends. `draftFlight` carries the source rects
  // captured at draft time over to the layout effect that measures the destinations after commit.
  const [draftAnim, setDraftAnim] = useState<readonly FlyPiece[]>([]);
  const draftFlight = useRef<{
    player: number;
    tiles: readonly { tile: Tile; from: DOMRect | null }[];
    expansions: readonly { identity: Expansion['identity']; from: DOMRect | null }[];
  } | null>(null);

  // After a draft commits, the taken pieces have appended to the drafting player's storage (the last
  // N tile items and M expansion items). Measure those landing slots now, pair each with the source
  // rect captured at draft time, and launch the fly-in. Tiles pair by order (they append in pick
  // order); expansions pair by identity (each is unique in the central area), sidestepping the
  // open-first/top-last ordering quirk in resolveDraft.
  useLayoutEffect(() => {
    const flight = draftFlight.current;
    draftFlight.current = null;
    if (!flight) return;
    const panel = document.querySelectorAll<HTMLElement>('.players .player')[flight.player];
    if (!panel) return;
    const flights: FlyPiece[] = [];

    // A landing slot's true resting rect. A freshly added `.item` is mid `storage-fade-in` (scaling
    // 0.8→1) right now, so measuring it raw would capture a shrunken box; cancel that animation first
    // — which also stops the item visibly scaling up *under* the clone, since the fly-in replaces it.
    // Measure the inner face, not the padded button, so both endpoints frame the same hexagon.
    const landingRect = (el: HTMLElement, faceSel: string): DOMRect => {
      el.style.animation = 'none';
      return (el.querySelector<HTMLElement>(faceSel) ?? el).getBoundingClientRect();
    };

    const tileItems = Array.from(panel.querySelectorAll<HTMLElement>('.tile-items .item'));
    const tileBase = tileItems.length - flight.tiles.length;
    flight.tiles.forEach((cap, k) => {
      const el = tileItems[tileBase + k];
      if (!cap.from || !el) return;
      flights.push({ kind: 'tile', tile: cap.tile, from: cap.from, to: landingRect(el, '.tile-face'), key: animKey.current++ });
    });

    const expItems = Array.from(panel.querySelectorAll<HTMLElement>('.expansion-items .item'));
    const storageExp = state.players[flight.player]?.storage.expansions ?? [];
    const expBase = storageExp.length - flight.expansions.length;
    expItems.slice(expBase).forEach((el, k) => {
      const ident = storageExp[expBase + k]?.identity ?? null;
      const cap = flight.expansions.find((e) => identityKey(e.identity) === identityKey(ident));
      if (!cap?.from) return;
      flights.push({ kind: 'expansion', expansion: { identity: cap.identity }, from: cap.from, to: landingRect(el, '.expansion-face'), key: animKey.current++ });
    });

    if (flights.length > 0) setDraftAnim((a) => [...a, ...flights]);
  }, [state]);

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
      }
      return;
    }
    if (sel.mode === 'expansion' && sel.idx === i) {
      resetSelection();
      return;
    }
    setPaySecs((p) => toggle(p, i));
  };

  const clickCell = (slot: SlotId, dir: Direction, cellEl?: SVGGElement) => {
    const action = candidateAt(slot, dir);
    if (!action) return;
    if (!isLegal(state, action)) return;
    // Fly the chosen tile from the payment dock into the cell it lands in. Both endpoints exist right
    // now (the dock is still on screen, the target cell is the one just clicked), so capture their
    // screen rects before the commit re-renders them away — the overlay then animates independently.
    if (placedTile && cellEl) {
      const source = document.querySelector('.player.active .dock-chosen .tile-face');
      if (source) {
        setPlaceAnim({
          tile: placedTile,
          from: source.getBoundingClientRect(),
          to: cellEl.getBoundingClientRect(),
          key: animKey.current++,
        });
      }
    }
    act(action);
  };

  // Capture where each taken piece sits in the central area right now — before the commit clears it
  // — so the post-commit layout effect can fly a clone from there into its storage slot. Tiles are
  // found by their `data-draft-src` key; expansions by the stable flip-key on their pile display. We
  // measure the inner face (the hexagon/rosette itself, not its padded frame) so the source endpoint
  // matches the face-based destination rect — otherwise an expansion would launch from its whole pile
  // frame rather than the rosette within it.
  const faceRect = (selector: string): DOMRect | null =>
    document.querySelector(selector)?.getBoundingClientRect() ?? null;
  const draft = (action: DraftAction) => {
    const tiles = action.picks.map((p) => ({
      tile: p.tile,
      from: faceRect(`.displays [data-draft-src="${draftSrcKey(p.source)}"] .tile-face`),
    }));
    const expansions = draftPlan(state, action.attribute).expansions.map((e) => ({
      identity: e.identity,
      from: faceRect(`.displays [data-flip-key="${displayFlipKey(e, 0)}"] .expansion-face`),
    }));
    draftFlight.current = { player: state.currentPlayer, tiles, expansions };
    act(action);
  };

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
        <button onClick={undo} disabled={history.length === 0}>
          Undo
        </button>
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
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && loadText.trim()) {
              e.preventDefault();
              loadState();
            }
          }}
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
          jitterSalt={seed}
        />
      </section>

      <section className="players">
        {state.players.map((player, i) => (
          <PlayerPanel
            key={i}
            id={i}
            jitterSalt={seed}
            player={player}
            active={phase === Phase.Playing && i === state.currentPlayer}
            sel={sel}
            payTiles={payTiles}
            paySecs={paySecs}
            placedTile={i === state.currentPlayer ? placedTile : null}
            placedExpansion={i === state.currentPlayer ? placedExpansion : null}
            need={i === state.currentPlayer ? need : 0}
            legalTargets={i === state.currentPlayer ? legalTargets : new Set()}
            onPass={() => act({ type: ActionType.Pass })}
            onTileItem={clickTileItem}
            onExpansionItem={clickExpansionItem}
            onCell={clickCell}
            onCancel={resetSelection}
          />
        ))}
      </section>

      {placeAnim && (
        <FlyingTile
          key={placeAnim.key}
          anim={placeAnim}
          onDone={() => setPlaceAnim((a) => (a?.key === placeAnim.key ? null : a))}
        />
      )}

      {draftAnim.map((flight) => (
        <FlyingPiece
          key={flight.key}
          flight={flight}
          onDone={() => setDraftAnim((a) => a.filter((f) => f.key !== flight.key))}
        />
      ))}
    </div>
  );
}

// A tile-placement fly-in: the chosen `tile`, the dock rect it leaves `from`, and the garden-cell
// rect it lands in `to`, both in viewport coordinates. `key` distinguishes successive placements.
type PlaceAnim = { tile: Tile; from: DOMRect; to: DOMRect; key: number };

// The overlay that animates a chosen tile sailing from the payment dock into its garden cell. It's a
// fixed-position clone (the real cell has already filled underneath it), anchored at the destination
// and released from a transform that puts it back at the dock — so it eases from one spot to the
// other, then removes itself once the transition ends.
function FlyingTile({ anim, onDone }: { anim: PlaceAnim; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { from, to } = anim;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = to.height ? from.height / to.height : 1;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    const id = requestAnimationFrame(() => {
      el.style.transition = 'transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1)';
      el.style.transform = 'translate(0px, 0px) scale(1)';
    });
    return () => cancelAnimationFrame(id);
  }, [from, to]);
  return (
    <div
      ref={ref}
      className="flying-tile"
      style={{ left: to.left, top: to.top, width: to.width, height: to.height }}
      onTransitionEnd={onDone}
    >
      <TileFace tile={anim.tile} size={to.height} />
    </div>
  );
}

// A drafted piece sailing from the central area into its storage slot. Like FlyingTile, it's a
// fixed-position clone anchored at the destination (the real storage slot is already filled
// underneath) and released from a transform that puts it back at its central-area spot, so it eases
// across and removes itself once the transition ends. Tiles and expansions are the same size in both
// places, but the scale is still derived from the rects so a takeable expansion (which fills its
// larger pile frame) shrinks smoothly into its storage slot.
function FlyingPiece({ flight, onDone }: { flight: FlyPiece; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { from, to } = flight;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = to.height ? from.height / to.height : 1;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    const id = requestAnimationFrame(() => {
      el.style.transition = 'transform 1000ms cubic-bezier(0.2, 0.7, 0.2, 1)';
      el.style.transform = 'translate(0px, 0px) scale(1)';
    });
    return () => cancelAnimationFrame(id);
  }, [from, to]);
  return (
    <div
      ref={ref}
      className="flying-tile"
      style={{ left: to.left, top: to.top, width: to.width, height: to.height }}
      onTransitionEnd={onDone}
    >
      {flight.kind === 'tile' ? (
        <TileFace tile={flight.tile} size={to.height} />
      ) : (
        <ExpansionFace expansion={flight.expansion} fill />
      )}
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
  fill = false,
  draftable,
  onDraft,
  onPreview,
  countFor,
  revealOrder,
  srcKey,
}: {
  colour: Colour;
  symbol: Symbol;
  face: ReactNode; // the visual (a TileFace or ExpansionFace)
  dimmed: boolean;
  fill?: boolean; // stretch the piece to fill its pile frame (a takeable expansion)
  draftable: ReadonlySet<string>;
  onDraft: (attr: Attribute) => void;
  onPreview: (attr: Attribute | null) => void;
  // How many draftable pieces (tiles + takeable expansions) in the central area share an attribute.
  countFor: (attr: Attribute) => number;
  // Position (1–4) in the randomized tile-reveal stagger; drives animation-delay via CSS. Top only.
  revealOrder?: number | undefined;
  // The (area, slot) key a completed draft uses to find this tile and fly a clone into storage.
  srcKey?: string | undefined;
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
      data-reveal-order={revealOrder}
      data-draft-src={srcKey}
      className={`draft-tile${fill ? ' pile-fill' : ''}${dimmed ? ' dimmed' : ''}${open ? ' open' : ''}${
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
        className={`tile-popup${fill ? ' tile-popup-over' : ''}`}
        ref={popupRef}
        style={{
          transform: fill
            ? `translate(calc(-50% + ${shift}px), -50%)`
            : `translateX(calc(-50% + ${shift}px))`,
        }}
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
              {colourLabel(colour, colourCount)} ({colourCount})
            </button>
            <button
              className="draft-chip"
              disabled={!symbolEnabled}
              onClick={() => pick({ kind: 'symbol', symbol })}
              onMouseEnter={() => onPreview({ kind: 'symbol', symbol })}
              onMouseLeave={() => onPreview(null)}
            >
              <SymbolIcon symbol={symbol} /> {symbolLabel(symbol, symbolCount)} ({symbolCount})
            </button>
          </>
        )}
      </span>
    </span>
  );
}

const sameTile = (a: Tile, b: Tile): boolean => a.colour === b.colour && a.symbol === b.symbol;

// Display-level match, deliberately ignoring `slot`: used to highlight every copy of the active
// combo and to confirm a clicked source belongs to the combo, regardless of which slot it sits in.
const sameSource = (a: DraftSource, b: DraftSource): boolean =>
  a.area === 'top' ? b.area === 'top' : b.area === 'open' && a.index === b.index;

// Exact match including `slot`: identifies one physical tile, used to single out the hovered copy.
const sameExactSource = (a: DraftSource, b: DraftSource): boolean =>
  sameSource(a, b) && a.slot === b.slot;

// A fresh random permutation of [1, 2, 3, 4] — the stagger positions for the four top tiles, so a
// reveal isn't always left-to-right. Purely cosmetic, so Math.random (not the game RNG) is fine.
const randomStagger = (): number[] => {
  const order = [1, 2, 3, 4];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
};

// A stable identity for a pile display, used to track it across a draft for the FLIP slide
// animation. A pile's underlying expansion is unique within the central area, so its identity
// colour+symbol names the same pile even when it moves from the top slot into an open slot (and
// React swaps the DOM node). Spent piles (expansion taken) never move, so an index key suffices.
const displayFlipKey = (expansion: Expansion | null, index: number): string => {
  if (!expansion) return `spent:${index}`;
  const id = expansion.identity;
  return id ? `exp:${id.colour}:${id.symbol}` : `top:${index}`;
};

// The DOM key stamped on each central tile (`data-draft-src`) so a completed draft can find the
// exact tile that was taken and fly a clone of it into the storage slot it lands in. Mirrors the
// (area, index, slot) identity of the DraftSource the pick carries.
const draftSrcKey = (s: DraftSource): string =>
  s.area === 'top' ? `top:${s.slot}` : `open:${s.index}:${s.slot}`;

const identityKey = (id: Expansion['identity']): string =>
  id ? `${id.colour}:${id.symbol}` : '';

// One drafted piece in flight: a fixed-position clone easing from its central-area spot (`from`) to
// its storage slot (`to`), both in viewport coordinates. `key` distinguishes concurrent flights.
type FlyPiece =
  | { readonly kind: 'tile'; readonly tile: Tile; readonly from: DOMRect; readonly to: DOMRect; readonly key: number }
  | { readonly kind: 'expansion'; readonly expansion: Expansion; readonly from: DOMRect; readonly to: DOMRect; readonly key: number };

// A combo (a distinct matching tile) whose physical copy the player must still choose, plus the
// per-copy sources it can be taken from (one entry per matching tile, each carrying its slot).
type PendingPick = { readonly combo: Tile; readonly sources: readonly DraftSource[] };

// An in-progress draft awaiting the player's source choices: the chosen attribute, the picks already
// resolved (single-source combos, plus any the player has clicked), and the combos still to disambiguate.
type DraftSelection = {
  readonly attribute: Attribute;
  readonly picks: readonly TilePick[];
  readonly pending: readonly PendingPick[];
};

function CentralArea({
  state,
  draftable,
  onDraft,
  canDraft,
  jitterSalt,
}: {
  state: State;
  draftable: ReadonlySet<string>;
  onDraft: (action: DraftAction) => void;
  canDraft: boolean;
  jitterSalt: number;
}) {
  const { central } = state;
  // The round can expose up to `expansionsPerRound` expansion piles (the Top pile plus the opened
  // ones); size the grid to that maximum so every pile sits at an equal fraction of the width.
  const maxPiles = expansionsPerRound(state.players.length as PlayerCount);

  // Fan piles out from a central slot 0: odd slots go left (negative order), even slots go right, so
  // the visual run for five reads 3, 1, 0, 2, 4. The grid always renders `maxPiles` slots — real
  // piles first, empty fillers for the rest — so the centre stays fixed and piles grow outwards from
  // the inside instead of repacking (which would shift the whole row) as the round opens more piles.
  const displayOrder = (slot: number) => (slot % 2 === 1 ? -Math.ceil(slot / 2) : slot / 2);

  // Play the top's tile-reveal animation only when a NEW top is genuinely revealed — i.e. the
  // unrevealed-pile depth shrinks — not on the unrelated tile remounts that toggling the duplicate
  // selector causes. `revealing` gates the animation class (it starts true so the very first top
  // animates in, and a timer clears it once the stagger finishes); `revealOrder` is a fresh random
  // permutation of the four stagger positions, so the tiles don't always appear left-to-right.
  //
  // Both are refreshed during render (not in an effect): adjusting state mid-render re-runs render
  // before commit, so the new order is on the tiles when they mount — an effect would change the
  // animation-delay after the animation had already started, causing a visible jump.
  const [prevPileDepth, setPrevPileDepth] = useState(central.pile.length);
  const [revealing, setRevealing] = useState(true);
  const [revealOrder, setRevealOrder] = useState<readonly number[]>(randomStagger);
  if (central.pile.length !== prevPileDepth) {
    setPrevPileDepth(central.pile.length);
    if (central.pile.length < prevPileDepth) {
      setRevealing(true);
      setRevealOrder(randomStagger());
    }
  }
  useEffect(() => {
    if (!revealing) return;
    const timer = window.setTimeout(() => setRevealing(false), 1000);
    return () => window.clearTimeout(timer);
  }, [revealing]);

  // The attribute being previewed (a popup button is hovered): all tiles that DON'T match it fade
  // out, so the player can see exactly what a colour/symbol draft would pull from the area.
  const [preview, setPreview] = useState<Attribute | null>(null);
  const matchesPreview = (t: Tile): boolean =>
    preview === null ||
    (preview.kind === 'colour' ? t.colour === preview.colour : t.symbol === preview.symbol);

  // The per-attribute count shown in each popup must equal what a draft of that attribute would
  // actually take. A draft takes one of each DISTINCT matching tile (identical copies collapse to a
  // single combo) plus every matching takeable (emptied) expansion. Reuse the engine's draftPlan so
  // the displayed count never diverges from the real draft — e.g. two identical orange butterflies
  // count as one, not two.
  const countFor = (attr: Attribute): number => {
    const { combos, expansions } = draftPlan(state, attr);
    return combos.length + expansions.length;
  };

  // FLIP slide: when a draft splits the top pile, its leftover tiles + expansion move from the top
  // slot to an open slot (and React swaps the DOM node). We tag each `.display` with a stable
  // flip-key, record every display's position relative to this grid before each commit, and after
  // the commit translate any moved display back to its old spot, then transition it to its new one.
  // Positions are measured relative to the grid container so an unrelated shift above (e.g. the
  // duplicate-pick banner appearing) doesn't make every pile slide.
  const displaysRef = useRef<HTMLDivElement>(null);
  const flipRects = useRef<Map<string, { x: number; y: number }>>(new Map());
  useLayoutEffect(() => {
    const container = displaysRef.current;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-flip-key]'));
    // Clear any in-flight transform so we measure true layout positions.
    for (const node of nodes) {
      node.style.transition = '';
      node.style.transform = '';
      node.style.zIndex = '';
    }
    const base = container.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    for (const node of nodes) {
      const r = node.getBoundingClientRect();
      next.set(node.dataset.flipKey!, { x: r.left - base.left, y: r.top - base.top });
    }
    for (const node of nodes) {
      const key = node.dataset.flipKey!;
      const prev = flipRects.current.get(key);
      const now = next.get(key)!;
      if (!prev) continue;
      const dx = prev.x - now.x;
      const dy = prev.y - now.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      // Lift the sliding pile above every other display so its tiles never pass behind a
      // stationary pile; drop back to the natural stacking order once the slide finishes.
      node.style.zIndex = '10';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.addEventListener(
        'transitionend',
        () => {
          node.style.zIndex = '';
        },
        { once: true },
      );
      requestAnimationFrame(() => {
        node.style.transition = 'transform 500ms cubic-bezier(0.2, 0.7, 0.2, 1)';
        node.style.transform = '';
      });
    }
    flipRects.current = next;
  }, [central]);

  // A draft in progress whose duplicate tiles the player is choosing copies for, or null when not
  // mid-selection. Any change to the game state (a completed action, a new turn) abandons it.
  const [draftSel, setDraftSel] = useState<DraftSelection | null>(null);
  useEffect(() => setDraftSel(null), [state]);

  // The candidate copy currently under the cursor while choosing; hovering one fades the others so
  // it's clear which copy a click would take.
  const [hoverPick, setHoverPick] = useState<DraftSource | null>(null);

  // Starting a draft. `from`, when present, is the exact tile+source whose popover the player used —
  // so we can honour their click directly in the one case where it fully resolves the draft.
  //
  // A combo with a single matching tile resolves automatically; a combo with more than one (whether
  // on the same display or spread across several) normally queues for the player to choose a copy.
  // `sources` holds one entry per physical tile, so its length is that copy count.
  //
  // Exception: when the whole draft is a *single* combo of duplicates (e.g. "Tree" with nothing but
  // two red trees), the click already names the copy the player wants — take it, no prompt. A draft
  // spanning several combos (e.g. "Red" → red tree + red flower) still prompts for its duplicates,
  // because the attribute chip doesn't pin down which copy of the duplicated combo was meant.
  const beginDraft = (attribute: Attribute, from?: { tile: Tile; source: DraftSource }) => {
    const combos = draftPlan(state, attribute).combos;
    if (
      combos.length === 1 &&
      combos[0]!.sources.length > 1 &&
      from &&
      sameTile(from.tile, combos[0]!.combo) &&
      combos[0]!.sources.some((s) => sameSource(s, from.source))
    ) {
      onDraft({ type: ActionType.Draft, attribute, picks: [{ tile: from.tile, source: from.source }] });
      return;
    }

    const picks: TilePick[] = [];
    const pending: PendingPick[] = [];
    for (const { combo, sources } of combos) {
      if (sources.length <= 1) picks.push({ tile: combo, source: sources[0]! });
      else pending.push({ combo, sources });
    }
    if (pending.length === 0) {
      onDraft({ type: ActionType.Draft, attribute, picks });
      return;
    }
    setDraftSel({ attribute, picks, pending });
  };

  // Clicking a candidate tile during selection: lock in its source for the current pending combo,
  // then advance to the next combo — or submit the finished draft once none remain.
  const pickCopy = (source: DraftSource, tile: Tile) => {
    if (!draftSel) return;
    const [current, ...rest] = draftSel.pending;
    if (!current || !sameTile(tile, current.combo)) return;
    if (!current.sources.some((s) => sameSource(s, source))) return;
    setHoverPick(null); // the next combo's copies start un-faded
    const picks = [...draftSel.picks, { tile: current.combo, source }];
    if (rest.length === 0) {
      setDraftSel(null);
      onDraft({ type: ActionType.Draft, attribute: draftSel.attribute, picks });
      return;
    }
    setDraftSel({ ...draftSel, picks, pending: rest });
  };

  // During selection, the combo whose copy is currently being chosen. A tile is a clickable
  // candidate when it matches that combo and sits on one of its allowed source displays.
  const activePending = draftSel?.pending[0] ?? null;
  const isCandidate = (t: Tile, source: DraftSource): boolean =>
    activePending !== null &&
    sameTile(t, activePending.combo) &&
    activePending.sources.some((s) => sameSource(s, source));

  // A draft is only offered during play; otherwise pieces are plain (non-interactive) faces. A
  // null is a slot whose tile has been drafted away — rendered as an empty cell so the surviving
  // tiles keep their positions in the 2×2 grid. While a selection is in progress the popovers are
  // suppressed; instead, matching copies of the active combo become directly clickable.
  const renderTile = (t: Tile | null, key: number, source: DraftSource) => {
    if (t === null) return <span key={key} className="tile-blank" aria-hidden="true" />;
    // A per-position seed so two identical tiles in the area don't share the same placement tilt.
    const seed = source.area === 'top' ? `t${source.slot}` : `o${source.index}.${source.slot}`;
    if (draftSel) {
      const candidate = isCandidate(t, source);
      // Non-candidates are always dimmed; a candidate dims too when a *different* candidate is hovered.
      const faded = !candidate || (hoverPick !== null && !sameExactSource(source, hoverPick));
      return (
        <span
          key={key}
          data-draft-src={draftSrcKey(source)}
          className={`draft-tile draft-pick${candidate ? ' candidate clickable' : ''}${faded ? ' dimmed' : ''}`}
          onClick={candidate ? () => pickCopy(source, t) : undefined}
          onMouseEnter={candidate ? () => setHoverPick(source) : undefined}
          onMouseLeave={candidate ? () => setHoverPick(null) : undefined}
        >
          <TileFace tile={t} size={TILE_SIZE} seed={seed} />
        </span>
      );
    }
    return canDraft ? (
      <DraftablePiece
        key={key}
        colour={t.colour}
        symbol={t.symbol}
        face={<TileFace tile={t} size={TILE_SIZE} seed={seed} />}
        dimmed={!matchesPreview(t)}
        draftable={draftable}
        onDraft={(attr) => beginDraft(attr, { tile: t, source })}
        onPreview={setPreview}
        countFor={countFor}
        revealOrder={source.area === 'top' ? revealOrder[source.slot ?? key] : undefined}
        srcKey={draftSrcKey(source)}
      />
    ) : (
      <TileFace key={key} tile={t} size={TILE_SIZE} seed={seed} />
    );
  };

  // A takeable expansion is drafted the same way as a tile (by its identity's colour or symbol).
  // A spent pile (null expansion — its expansion already taken) renders empty, leaving only the
  // rosette outline so the pile keeps its slot.
  // Rendered as a direct child of `.display` (not inside `.tiles`) so the rosette can fill the frame.
  const renderExpansion = (expansion: Expansion | null, key: number, seed: string | number = key) => {
    if (expansion === null) return <span key={key} className="pile-spent" aria-label="empty pile" />;
    const face = <ExpansionFace expansion={expansion} fill seed={seed} />;
    const id = expansion.identity;
    if (!canDraft || !id) return <span key={key} className="pile-fill">{face}</span>;
    return (
      <DraftablePiece
        key={key}
        colour={id.colour}
        symbol={id.symbol}
        face={face}
        dimmed={!matchesPreview(id)}
        fill
        draftable={draftable}
        onDraft={beginDraft}
        onPreview={setPreview}
        countFor={countFor}
      />
    );
  };

  // A pile of tiles framed by its rosette outline. `rotationIndex` seeds the outline's jitter (0 for
  // the freshly revealed top pile, `i + 1` for each open pile); `sourceFor` maps a slot to the draft
  // source so the same markup serves both the top and open areas.
  const renderTilePile = (
    rotationIndex: number,
    tiles: readonly (Tile | null)[],
    sourceFor: (slot: number) => DraftSource,
  ) => (
    <>
      <ExpansionOutline rotate={pileRotation(`${jitterSalt}:${state.round}:${rotationIndex}`)} />
      <div className="tiles">{tiles.map((t, j) => renderTile(t, j, sourceFor(j)))}</div>
    </>
  );

  // TEMP debug: the pile's stable FLIP key + the colour/symbol of the expansion underneath each
  // display. The FLIP key is what tracks the pile across a draft, so it's what we want to eyeball.
  const debugDisplay = (index: number, expansion: Expansion | null) => {
    const flipKey = displayFlipKey(expansion, index);
    return (
      <div
        className="debug-pile"
        style={{
          position: 'absolute',
          bottom: -18,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 11,
          fontFamily: 'monospace',
          color: 'magenta',
          pointerEvents: 'none',
        }}
      >
        {flipKey}
      </div>
    );
  };

  return (
    <>
      {draftSel && activePending && (
        <div className="draft-banner">
          <span>
            Choose which{' '}
            <strong>
              {COLOUR_LABEL[activePending.combo.colour]} {SYMBOL_LABEL[activePending.combo.symbol]}
            </strong>{' '}
            to take
            {draftSel.pending.length > 1 ? ` — ${draftSel.pending.length} choices left` : ''}
          </span>
          <button className="draft-cancel" onClick={() => setDraftSel(null)}>
            Cancel
          </button>
        </div>
      )}
      <div className="displays" ref={displaysRef} style={{ '--displays': maxPiles } as CSSProperties}>
      {central.top && (
        // Keyed on the unrevealed-pile depth, which drops by one every time a new top is revealed
        // (and only then). A fresh key remounts this display so the tile fade-in replays; the
        // `display-reveal` class is only present while `revealing`, so toggling the duplicate
        // selector (which remounts the tiles too) does not retrigger the animation.
        <div
          className={`display${revealing ? ' display-reveal' : ''}`}
          key={`top-${central.pile.length}`}
          data-flip-key={displayFlipKey(central.top.expansion, 0)}
        >
          {/* With the pile exhausted the top dwindles in place: tiles, then takeable expansion,
              then spent placeholder — the open-pile lifecycle, without leaving the top slot. */}
          {central.top.tiles.some(Boolean)
            ? renderTilePile(0, central.top.tiles, (slot) => ({ area: 'top', slot }))
            : renderExpansion(central.top.expansion, 0, 'top')}
          {debugDisplay(0, central.top.expansion)}
        </div>
      )}
      {central.open.map((d, i) => {
        const hasTiles = d.tiles.some(Boolean);
        // The top occupies slot 0 (dead centre); open piles take slots 1, 2, … and fan out from it.
        // A tile pile draws its rosette outline; a takeable expansion fills the frame with its own
        // rosette (so the outline behind would be redundant), and a spent pile (expansion already
        // taken) should read as empty.
        return (
          <div className="display" key={i} style={{ order: displayOrder(i + 1) }} data-flip-key={displayFlipKey(d.expansion, i + 1)}>
            {hasTiles
              ? renderTilePile(i + 1, d.tiles, (slot) => ({ area: 'open', index: i, slot }))
              : renderExpansion(d.expansion, 0, `open${i}`)}
            {debugDisplay(i + 1, d.expansion)}
          </div>
        );
      })}
      {/* Pad the grid up to `maxPiles` with empty slots so the real piles keep their fixed columns:
          slot 0 when the top is gone, then every slot beyond the last open pile. */}
      {Array.from({ length: maxPiles }, (_, slot) => slot)
        .filter((slot) => (slot === 0 ? !central.top : slot > central.open.length))
        .map((slot) => (
          <div className="display display-empty" key={`filler-${slot}`} style={{ order: displayOrder(slot) }} />
        ))}
      </div>
    </>
  );
}

// The floating payment dock shown above a player's storage while they assemble a placement. It
// holds the chosen tile/expansion in its lead slot, followed by one slot per payment piece the cost
// requires (cost − 1; a cost-1 item shows no payment slots). Filled slots mirror the pieces the
// player has selected from storage; clicking a filled slot deselects that piece. The dock holds NO
// rules — the indices it reports map straight back to the storage selection in Game.
function PaymentDock({
  placedTile,
  placedExpansion,
  need,
  tileArea,
  expansions,
  payTiles,
  paySecs,
  onUnselectTile,
  onUnselectExpansion,
  onCancel,
}: {
  placedTile: Tile | null;
  placedExpansion: Expansion | null;
  need: number;
  tileArea: readonly StorageItem[];
  expansions: readonly Expansion[];
  payTiles: ReadonlySet<number>;
  paySecs: ReadonlySet<number>;
  onUnselectTile: (i: number) => void;
  onUnselectExpansion: (i: number) => void;
  onCancel: () => void;
}) {
  const tileIdxs = [...payTiles].sort((a, b) => a - b);
  const secIdxs = [...paySecs].sort((a, b) => a - b);
  const filled = tileIdxs.length + secIdxs.length;
  const empties = Math.max(0, need - filled);

  return (
    <div className="payment-dock">
      <span className="dock-chosen" aria-label="item being placed">
        {placedTile ? (
          <TileFace tile={placedTile} size={TILE_SIZE} />
        ) : (
          placedExpansion && <ExpansionFace expansion={placedExpansion} size={EXPANSION_HEX_R} />
        )}
      </span>
      {need > 0 && (
        <span className="dock-slots">
          {tileIdxs.map((i) => {
            const item = tileArea[i];
            if (!item) return null;
            return (
              <button key={`t${i}`} className="dock-slot filled" onClick={() => onUnselectTile(i)}>
                {item.kind === 'coin' ? (
                  <CoinFace size={TILE_SIZE} seed={i} />
                ) : (
                  <TileFace tile={item.tile} size={TILE_SIZE} seed={i} />
                )}
              </button>
            );
          })}
          {secIdxs.map((i) => {
            const expansion = expansions[i];
            if (!expansion) return null;
            return (
              <button
                key={`e${i}`}
                className="dock-slot filled"
                onClick={() => onUnselectExpansion(i)}
              >
                <ExpansionFace expansion={expansion} size={EXPANSION_HEX_R} />
              </button>
            );
          })}
          {Array.from({ length: empties }).map((_, k) => (
            <span key={`empty-${k}`} className="dock-slot empty" aria-hidden="true">
              <TileSlot size={TILE_SIZE} />
            </span>
          ))}
        </span>
      )}
      <button className="dock-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function PlayerPanel({
  id,
  jitterSalt,
  player,
  active,
  sel,
  payTiles,
  paySecs,
  placedTile,
  placedExpansion,
  need,
  legalTargets,
  onPass,
  onTileItem,
  onExpansionItem,
  onCell,
  onCancel,
}: {
  id: number;
  jitterSalt: number;
  player: PlayerState;
  active: boolean;
  sel: Selection;
  payTiles: ReadonlySet<number>;
  paySecs: ReadonlySet<number>;
  placedTile: Tile | null;
  placedExpansion: Expansion | null;
  need: number;
  legalTargets: ReadonlySet<string>;
  onPass: () => void;
  onTileItem: (i: number) => void;
  onExpansionItem: (i: number) => void;
  onCell: (slot: SlotId, dir: Direction, cellEl?: SVGGElement) => void;
  onCancel: () => void;
}) {
  const placing = active && sel.mode !== 'idle' && (placedTile !== null || placedExpansion !== null);
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

      {/* While placing, a floating dock above the storage holds the chosen item and one slot per
          payment piece. Selecting a piece moves it from the storage into a dock slot. */}
      <div className="storage-wrap">
        {placing && (
          <PaymentDock
            placedTile={placedTile}
            placedExpansion={placedExpansion}
            need={need}
            tileArea={player.storage.tileArea}
            expansions={player.storage.expansions}
            payTiles={payTiles}
            paySecs={paySecs}
            onUnselectTile={onTileItem}
            onUnselectExpansion={onExpansionItem}
            onCancel={onCancel}
          />
        )}
        <div className="storage">
          <div className="items tile-items">
            {player.storage.tileArea.map((item, i) => {
              // A selected item (the chosen tile, or a chosen payment) is "moved" to the dock: its
              // storage slot is ghosted to an empty placeholder but stays clickable to deselect.
              const isPlaced = active && sel.mode === 'tile' && sel.idx === i;
              const ghost = isPlaced || (active && payTiles.has(i));
              if (item.kind === 'coin') {
                // A coin is only actionable as payment, so it shows no hover state unless the player
                // is mid-placement (a tile or expansion is selected, awaiting its payment).
                const arranging = sel.mode !== 'idle';
                return (
                  <button
                    key={i}
                    className={`item coin${ghost ? ' ghost' : ''}${arranging ? '' : ' inert'}`}
                    disabled={!active}
                    onClick={() => onTileItem(i)}
                  >
                    {ghost ? <TileSlot size={TILE_SIZE} /> : <CoinFace size={TILE_SIZE} seed={`${jitterSalt}.${id}.${i}`} />}
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  className={`item${ghost ? ' ghost' : ''}`}
                  disabled={!active}
                  onClick={() => onTileItem(i)}
                >
                  {ghost ? (
                    <TileSlot size={TILE_SIZE} />
                  ) : (
                    <TileFace tile={item.tile} size={TILE_SIZE} seed={`${jitterSalt}.${id}.${i}`} />
                  )}
                </button>
              );
            })}
            {Array.from({ length: STORAGE_TILE_LIMIT - player.storage.tileArea.length }).map((_, k) => (
              <span className="slot" key={`slot-${k}`} aria-hidden="true">
                <TileSlot size={TILE_SIZE} />
              </span>
            ))}
          </div>
          <div className="items expansion-items">
            {player.storage.expansions.map((s, i) => {
              const isPlaced = active && sel.mode === 'expansion' && sel.idx === i;
              const ghost = isPlaced || (active && paySecs.has(i));
              return (
                <button
                  key={i}
                  className={`item expansion${ghost ? ' ghost' : ''}`}
                  disabled={!active}
                  onClick={() => onExpansionItem(i)}
                >
                  <ExpansionFace
                    expansion={ghost ? { identity: null } : s}
                    size={EXPANSION_HEX_R}
                    seed={`${jitterSalt}.${id}.${i}`}
                  />
                </button>
              );
            })}
            {Array.from({ length: STORAGE_EXPANSION_LIMIT - player.storage.expansions.length }).map(
              (_, k) => (
                <span className="slot" key={`slot-${k}`} aria-hidden="true">
                  <ExpansionFace expansion={{ identity: null }} size={EXPANSION_HEX_R} placeholder />
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      {active && (
        <button className="pass" onClick={onPass}>
          <PassHex />
        </button>
      )}
    </div>
  );
}

// The Pass action drawn as a pointy-top hexagon, matching the garden/storage tiles, so the button
// reads as a piece of the board rather than a generic chrome button. White fill, blue-ish border and
// label set it apart from the coloured tiles; the surrounding <button> is bare (see `.pass` CSS) so
// this SVG is the whole visible control.
function PassHex() {
  // Reuse the shared tile hexagon. Fill/stroke/label colours are left to the `.pass-hex` CSS so the
  // button can recolour on hover and when disabled.
  return <HexFace size={TILE_SIZE} glyph="Pass" fontSize={13} strokeWidth={2} className="pass-hex" />;
}

// A single garden cell: the hexagon plus its optional symbol glyph, and the placement click/hover
// wiring. Given the cell's own state and the current hover context (the previewed tile/identity,
// whether this is the hovered cell, and whether it's elsewhere in the hovered rosette) it resolves
// its own fill/stroke/glyph, so all per-cell rendering decisions live here. The colour and symbol
// *names* arrive via the tile objects; this component maps them to the display hex and glyph.
function GardenCell({
  cell,
  r,
  preview,
  isPreviewCell,
  inHoveredRosette,
  onCell,
  setHovered,
}: {
  cell: {
    slot: number;
    dir: number;
    cx: number;
    cy: number;
    tile: Tile | null;
    hasExpansion: boolean;
    legal: boolean;
  };
  r: number;
  preview: Tile | null;
  isPreviewCell: boolean;
  inHoveredRosette: boolean;
  onCell: (slot: SlotId, dir: Direction, cellEl?: SVGGElement) => void;
  setHovered: Dispatch<SetStateAction<string | null>>;
}) {
  const key = `${cell.slot}:${cell.dir}`;

  // Fill/stroke mirror the cell states: legal target, empty slot of a placed expansion, an
  // unplaced expansion slot, or a filled tile — with the hover preview layered on top.
  let fill: string;
  let stroke: string;
  let strokeWidth = 1.5;
  let iconPath: string | null = cell.tile ? SYMBOL_PATH[cell.tile.symbol] : null;
  let className = 'gcell';
  if (preview) {
    // Show the actual tile/identity that will be placed here.
    fill = COLOUR_HEX[preview.colour];
    stroke = '#15803d';
    strokeWidth = 2.5;
    iconPath = SYMBOL_PATH[preview.symbol];
    className = 'gcell legal';
  } else if (isPreviewCell) {
    // Hovered cell of a blank-identity expansion: an empty-frame preview, no glyph.
    fill = '#bfe0a8';
    stroke = '#15803d';
    strokeWidth = 2.5;
    className = 'gcell legal';
  } else if (inHoveredRosette) {
    // The rest of the rosette the expansion is about to drop into — drawn in the same soft
    // green an empty slot of a placed expansion takes, so the hover previews the placed result.
    fill = '#bfe0a8';
    stroke = '#15803d';
    strokeWidth = 2;
    className = cell.legal ? 'gcell legal' : 'gcell';
  } else if (cell.legal) {
    fill = '#86efac';
    stroke = '#15803d';
    strokeWidth = 2.5;
    className = 'gcell legal';
  } else if (!cell.hasExpansion) {
    fill = 'var(--empty-slot-fill)';
    stroke = 'var(--empty-slot-stroke)';
  } else if (!cell.tile) {
    fill = '#bfe0a8';
    stroke = '#7fb15f';
  } else {
    fill = COLOUR_HEX[cell.tile.colour];
    stroke = 'rgba(0, 0, 0, 0.4)';
  }

  return (
    <g
      className={className}
      // Placed tiles get a tiny fixed tilt (keyed by their permanent slot:dir) for a
      // hand-placed look; empty/preview cells stay square so the grid reads cleanly.
      transform={cell.tile ? `rotate(${jitterDegrees(key)} ${cell.cx} ${cell.cy})` : undefined}
      onClick={cell.legal ? (e) => onCell(cell.slot as SlotId, cell.dir as Direction, e.currentTarget) : undefined}
      onMouseEnter={cell.legal ? () => setHovered(key) : undefined}
      onMouseLeave={cell.legal ? () => setHovered((h) => (h === key ? null : h)) : undefined}
    >
      <polygon
        points={hexPoints(cell.cx, cell.cy, r)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {iconPath && (
        <SymbolGlyph className="gglyph" path={iconPath} cx={cell.cx} cy={cell.cy} R={r} />
      )}
    </g>
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
  onCell: (slot: SlotId, dir: Direction, cellEl?: SVGGElement) => void;
}) {
  const R = EXPANSION_HEX_R; // hex circumradius in px — the shared standard size
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

  // Cheese slices: each placed tile sends a triangular wedge into every adjacent hole (the rosette
  // centres and junction gaps between playable cells). Computed from the tile's axial position and
  // filled with the tile's own colour, so a wedge reads as that tile reaching into the empty gap.
  type Slice = { points: string; fill: string; key: string };
  const slices: Slice[] = [];
  SLOT_CENTRE.forEach((centre, slot) => {
    const expansion = player.garden[slot];
    if (!expansion) return;
    DIR_AXIAL.forEach(([dq, dr], dir) => {
      const tile = expansion.tiles[dir] ?? null;
      if (!tile) return;
      cheeseSlicesFor(centre[0] + dq, centre[1] + dr, R).forEach((points, i) => {
        slices.push({ points, fill: COLOUR_HEX[tile.colour], key: `${slot}:${dir}:${i}` });
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

  // Paint order: empty sections first, then placed expansions, then legal/preview cells on top — so
  // an expansion's stronger borders are never overdrawn by an adjacent empty section's lighter one.
  const renderPriority = (c: Cell): number => {
    const isPreviewCell = hoveredCell?.slot === c.slot && hoveredCell?.dir === c.dir;
    const inHoveredRosette = !!placedExpansion && !!hoveredCell && hoveredCell.slot === c.slot;
    if (c.legal || isPreviewCell || inHoveredRosette) return 2;
    return c.hasExpansion ? 1 : 0;
  };
  const renderCells = [...cells].sort((a, b) => renderPriority(a) - renderPriority(b));

  return (
    <svg
      className="garden"
      viewBox={viewBox}
      width={width.toFixed(2)}
      height={height.toFixed(2)}
      aria-label="garden board"
    >
      {slices.length > 0 && (
        // One translucent layer, drawn opaque within and composited as a whole, so abutting slices
        // of the same colour merge into a single shape with no seam between them.
        <g className="cheese-layer">
          {slices.map((s) => (
            <polygon key={s.key} className="cheese-slice" points={s.points} fill={s.fill} />
          ))}
        </g>
      )}
      {renderCells.map((c) => {
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

        return (
          <GardenCell
            key={key}
            cell={c}
            r={R}
            preview={preview}
            isPreviewCell={isPreviewCell}
            inHoveredRosette={inHoveredRosette}
            onCell={onCell}
            setHovered={setHovered}
          />
        );
      })}
    </svg>
  );
}
