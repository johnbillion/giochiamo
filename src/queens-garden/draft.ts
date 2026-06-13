// The draft action: choose a colour or symbol, then take one of each distinct matching tile
// (the player picks which physical copy when a combo is draftable from more than one display)
// plus every matching takeable (emptied) section — all gated by storage. See model.md.

import { makeRng } from './rng';
import { drawTiles } from './supply';
import {
  ActionType,
  COLOURS,
  STORAGE_SECTION_LIMIT,
  STORAGE_TILE_LIMIT,
  SYMBOLS,
  tileItem,
  type Attribute,
  type CentralArea,
  type Display,
  type DraftAction,
  type DraftSource,
  type Section,
  type State,
  type Tile,
  type TilePick,
} from './types';

function sameTile(a: Tile, b: Tile): boolean {
  return a.colour === b.colour && a.symbol === b.symbol;
}

function matchesAttribute(tile: Tile, attr: Attribute): boolean {
  return attr.kind === 'colour' ? tile.colour === attr.colour : tile.symbol === attr.symbol;
}

// Every draftable tile in the central area, tagged with the display it sits on.
function draftableTiles(central: CentralArea): { tile: Tile; source: DraftSource }[] {
  const out: { tile: Tile; source: DraftSource }[] = [];
  if (central.top) {
    for (const tile of central.top.tiles) out.push({ tile, source: { area: 'top' } });
  }
  central.open.forEach((display, index) => {
    for (const tile of display.tiles) out.push({ tile, source: { area: 'open', index } });
  });
  return out;
}

// Distinct matching combos (dedup by colour+symbol).
function matchingCombos(central: CentralArea, attr: Attribute): Tile[] {
  const seen = new Set<string>();
  const combos: Tile[] = [];
  for (const { tile } of draftableTiles(central)) {
    if (!matchesAttribute(tile, attr)) continue;
    const key = `${tile.colour}:${tile.symbol}`;
    if (!seen.has(key)) {
      seen.add(key);
      combos.push(tile);
    }
  }
  return combos;
}

// Emptied (takeable) open sections matching the attribute.
function matchingSections(central: CentralArea, attr: Attribute): Section[] {
  return central.open
    .filter((d) => d.tiles.length === 0 && d.section.identity !== null && matchesAttribute(d.section.identity, attr))
    .map((d) => d.section);
}

function displayAt(central: CentralArea, source: DraftSource): Display | null {
  return source.area === 'top' ? central.top : (central.open[source.index] ?? null);
}

function sourceHasTile(central: CentralArea, source: DraftSource, combo: Tile): boolean {
  const display = displayAt(central, source);
  return display !== null && display.tiles.some((t) => sameTile(t, combo));
}

function removeOne(tiles: Tile[], combo: Tile): void {
  const i = tiles.findIndex((t) => sameTile(t, combo));
  if (i >= 0) tiles.splice(i, 1);
}

// --- public API ---

// Why a draft of `attribute` is illegal right now, or null if it's legal.
export function draftIllegalReason(state: State, action: DraftAction): string | null {
  const { central } = state;
  const player = state.players[state.currentPlayer]!;
  const combos = matchingCombos(central, action.attribute);
  const sections = matchingSections(central, action.attribute);

  if (combos.length === 0 && sections.length === 0) {
    return 'nothing draftable matches that choice';
  }
  if (action.picks.length !== combos.length) {
    return 'a draft must take exactly one of each matching tile';
  }
  for (const combo of combos) {
    const picks = action.picks.filter((p) => sameTile(p.tile, combo));
    if (picks.length !== 1) return 'a draft must take exactly one of each matching tile';
    if (!sourceHasTile(central, picks[0]!.source, combo)) {
      return 'a chosen source does not hold that tile';
    }
  }
  if (combos.length > STORAGE_TILE_LIMIT - player.storage.tileArea.length) {
    return 'not enough tile storage for that draft';
  }
  if (sections.length > STORAGE_SECTION_LIMIT - player.storage.sections.length) {
    return 'not enough section storage for that draft';
  }
  return null;
}

// Apply a (validated) draft: move tiles + matching sections to the player, then split/reveal
// the top if it dropped below 4. Does NOT advance the turn — the engine does that.
export function resolveDraft(state: State, action: DraftAction): State {
  const rng = makeRng(state.rng);
  const attr = action.attribute;
  const source = state.central;

  const topTiles = source.top ? [...source.top.tiles] : null;
  const openTiles = source.open.map((d) => [...d.tiles]);

  // 1. Remove each picked tile from its source.
  const takenTiles: Tile[] = [];
  for (const pick of action.picks) {
    if (pick.source.area === 'top') {
      if (topTiles) removeOne(topTiles, pick.tile);
    } else {
      const arr = openTiles[pick.source.index];
      if (arr) removeOne(arr, pick.tile);
    }
    takenTiles.push(pick.tile);
  }

  // 2. Take matching sections that were already emptied (before this draft's removals).
  const takenSections: Section[] = [];
  const takenIndices = new Set<number>();
  source.open.forEach((d, index) => {
    if (d.tiles.length === 0 && d.section.identity !== null && matchesAttribute(d.section.identity, attr)) {
      takenSections.push(d.section);
      takenIndices.add(index);
    }
  });

  // 3. Rebuild the open displays (drop taken sections, keep leftover tiles).
  const open: Display[] = [];
  source.open.forEach((d, index) => {
    if (!takenIndices.has(index)) open.push({ section: d.section, tiles: openTiles[index]! });
  });

  // 4. Split the top if it dropped below 4, revealing the next section with 4 fresh tiles.
  let top: Display | null = source.top && topTiles ? { section: source.top.section, tiles: topTiles } : null;
  const pile = [...source.pile];
  let bag = [...state.supply.bag];
  let discard = [...state.supply.discard];

  if (top !== null && top.tiles.length < 4) {
    open.push(top); // splits off, carrying its leftover tiles
    if (pile.length > 0) {
      const nextSection = pile.shift()!;
      const draw = drawTiles(bag, discard, 4, rng);
      bag = draw.bag;
      discard = draw.discard;
      top = { section: nextSection, tiles: draw.drawn };
    } else {
      top = null;
    }
  }

  // 5. Move the taken items into the current player's storage.
  const players = state.players.map((p, i) =>
    i === state.currentPlayer
      ? {
          ...p,
          storage: {
            ...p.storage,
            tileArea: [...p.storage.tileArea, ...takenTiles.map(tileItem)],
            sections: [...p.storage.sections, ...takenSections],
          },
        }
      : p,
  );

  return {
    ...state,
    rng: rng.state(),
    players,
    supply: { bag, discard, sections: state.supply.sections },
    central: { top, open, pile },
  };
}

// The attributes (colours/symbols) a player could legally start a draft with right now.
export function draftableAttributes(state: State): Attribute[] {
  const all: Attribute[] = [
    ...COLOURS.map((colour): Attribute => ({ kind: 'colour', colour })),
    ...SYMBOLS.map((symbol): Attribute => ({ kind: 'symbol', symbol })),
  ];
  return all.filter((attr) => {
    const built = buildDraft(state, attr);
    return draftIllegalReason(state, built) === null;
  });
}

// For each distinct matching combo, the display(s) it can be taken from — the choices the UI
// step machine walks. Plus the matching sections that would come along.
export function draftPlan(
  state: State,
  attribute: Attribute,
): { combos: { combo: Tile; sources: DraftSource[] }[]; sections: Section[] } {
  const all = draftableTiles(state.central);
  const combos = matchingCombos(state.central, attribute).map((combo) => ({
    combo,
    sources: all.filter((c) => sameTile(c.tile, combo)).map((c) => c.source),
  }));
  return { combos, sections: matchingSections(state.central, attribute) };
}

// Convenience: build a complete draft, taking each combo from its first available source.
// (The UI/AI can choose sources deliberately via draftPlan; this is the default.)
export function buildDraft(state: State, attribute: Attribute): DraftAction {
  const all = draftableTiles(state.central);
  const picks: TilePick[] = matchingCombos(state.central, attribute).map((combo) => ({
    tile: combo,
    source: all.find((c) => sameTile(c.tile, combo))!.source,
  }));
  return { type: ActionType.Draft, attribute, picks };
}
