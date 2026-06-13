// Placing a section or a tile: pay its cost, satisfy the shared adjacency rule, and create no
// run with identical tiles. `place section` = drop a frame + place its identity tile; `place
// tile` = place a tile on a placed section's empty space. Both run through the same checks.

import {
  coinItem,
  storageCoins,
  storageTiles,
  STORAGE_TILE_LIMIT,
  SYMBOLS,
  type Direction,
  type Garden,
  type Payment,
  type PlaceSectionAction,
  type PlaceTileAction,
  type PlayerStorage,
  type Section,
  type SlotId,
  type State,
  type StorageItem,
  type Symbol,
  type Tile,
} from './types';
import { adjacentPositions, JUNCTION_GAPS, tileAt, tileAtPosition, type TilePosition } from './garden';

const tileKey = (t: Tile): string => `${t.colour}:${t.symbol}`;
const posKey = (p: TilePosition): string => `${p.slot}:${p.dir}`;
const sectionKey = (s: Section): string => (s.identity ? tileKey(s.identity) : 'blank');

// Cost = the placed tile's symbol index, 1–6 (the SYMBOLS order is game-relevant here).
export function symbolCost(symbol: Symbol): number {
  return SYMBOLS.indexOf(symbol) + 1;
}

// Two tiles "match" if they share a colour or a symbol. (For two non-identical tiles this is the
// same as sharing exactly one; identical tiles share both, but those are caught by the run rule.)
function sharesAttribute(a: Tile, b: Tile): boolean {
  return a.colour === b.colour || a.symbol === b.symbol;
}

function isMultisetSubset(needed: readonly string[], have: readonly string[]): boolean {
  const counts = new Map<string, number>();
  for (const k of have) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const k of needed) {
    const remaining = counts.get(k) ?? 0;
    if (remaining === 0) return false;
    counts.set(k, remaining - 1);
  }
  return true;
}

// Why a payment is structurally invalid for placing `ref`, or null. `ref` is the placed tile
// (for a section, its identity), which counts as 1 toward the cost.
function paymentStructureReason(ref: Tile, payment: Payment): string | null {
  const need = symbolCost(ref.symbol) - 1;
  if (payment.tiles.length + payment.sections.length + payment.coins !== need) {
    return `payment must total ${need}`;
  }
  const nonCoin: Tile[] = [
    ...payment.tiles,
    ...payment.sections.flatMap((s) => (s.identity ? [s.identity] : [])),
  ];
  if (nonCoin.length > 0) {
    const allColour = nonCoin.every((t) => t.colour === ref.colour);
    const allSymbol = nonCoin.every((t) => t.symbol === ref.symbol);
    if (!allColour && !allSymbol) {
      return "payment items must all share the placed item's colour or all share its symbol";
    }
  }
  const seen = new Set<string>([tileKey(ref)]); // the placed item is part of the matching group
  for (const t of nonCoin) {
    if (seen.has(tileKey(t))) return 'payment cannot repeat an item or the placed item';
    seen.add(tileKey(t));
  }
  return null;
}

// Why the storage lacks the required items, or null.
function storageAvailableReason(
  storage: PlayerStorage,
  neededTiles: readonly Tile[],
  neededSections: readonly Section[],
  neededCoins: number,
): string | null {
  if (storageCoins(storage) < neededCoins) return 'not enough coins in storage';
  if (!isMultisetSubset(neededTiles.map(tileKey), storageTiles(storage).map(tileKey))) {
    return 'a required tile is not in storage';
  }
  if (!isMultisetSubset(neededSections.map(sectionKey), storage.sections.map(sectionKey))) {
    return 'a required section is not in storage';
  }
  return null;
}

// Every occupied position reachable from `pos` through neighbours sharing `placed`'s value on
// `attr` — a *mono-run*: every tile the same colour (or the same symbol) as `placed`. Runs follow
// the adjacency graph freely (rounding corners, crossing section edges), not any fixed line. No
// depth cap is needed: a mono-run of 7+ must repeat a tile (only 6 of the other axis exist), and
// that repeat is exactly the violation `joinsIdenticalTiles` detects.
function monoRun(
  after: Garden,
  placed: Tile,
  pos: TilePosition,
  attr: 'colour' | 'symbol',
): TilePosition[] {
  const run: TilePosition[] = [];
  const seen = new Set<string>([posKey(pos)]);
  const queue: TilePosition[] = [pos];
  while (queue.length > 0) {
    const current = queue.shift()!;
    run.push(current);
    for (const next of adjacentPositions(current)) {
      if (seen.has(posKey(next))) continue;
      const tile = tileAtPosition(after, next);
      if (tile && tile[attr] === placed[attr]) {
        seen.add(posKey(next));
        queue.push(next);
      }
    }
  }
  return run;
}

// Would placing `placed` at `pos` join two identical tiles into one run? Only runs *through* the
// placed tile can newly violate the rule (the prior board was already legal), so we walk just the
// colour-run and the symbol-run rooted at `pos` and look for a repeated tile in either.
function joinsIdenticalTiles(after: Garden, placed: Tile, pos: TilePosition): boolean {
  for (const attr of ['colour', 'symbol'] as const) {
    const seen = new Set<string>();
    for (const rp of monoRun(after, placed, pos, attr)) {
      const key = tileKey(tileAtPosition(after, rp)!);
      if (seen.has(key)) return true;
      seen.add(key);
    }
  }
  return false;
}

// Adjacency + run checks on the garden as it would be *after* placing `placed` at `pos`.
function placementGeometryReason(after: Garden, placed: Tile, pos: TilePosition): string | null {
  // A placed tile must MATCH (share a colour or symbol with) at least one of its occupied
  // neighbours. A non-matching neighbour is tolerated as long as *some* neighbour matches — only a
  // tile that matches NONE of its neighbours is illegal. (An isolated tile, with no occupied
  // neighbour, is fine.) Identical-tile adjacencies are handled separately by the run rule below.
  const neighbours = adjacentPositions(pos)
    .map((neighbour) => tileAtPosition(after, neighbour))
    .filter((occupant): occupant is Tile => occupant !== null);
  if (neighbours.length > 0 && !neighbours.some((occupant) => sharesAttribute(placed, occupant))) {
    return 'must share a colour or symbol with at least one adjacent tile';
  }
  if (joinsIdenticalTiles(after, placed, pos)) {
    return 'would join two identical tiles in a run';
  }
  return null;
}

// Put a tile on a garden slot's direction (creating a fresh frame if the slot was empty).
function placeTileOn(garden: Garden, slot: SlotId, dir: Direction, tile: Tile): Garden {
  const current = garden[slot];
  const tiles: (Tile | null)[] = current
    ? [...current.tiles]
    : [null, null, null, null, null, null];
  tiles[dir] = tile;
  return garden.map((section, i) => (i === slot ? { tiles } : section));
}

// Remove the given tiles, coins, and sections from storage (one instance each).
function spend(
  storage: PlayerStorage,
  removeTiles: readonly Tile[],
  removeSections: readonly Section[],
  removeCoins: number,
): PlayerStorage {
  const tileRemovals = new Map<string, number>();
  for (const t of removeTiles) tileRemovals.set(tileKey(t), (tileRemovals.get(tileKey(t)) ?? 0) + 1);
  let coinsLeft = removeCoins;

  const tileArea: StorageItem[] = [];
  for (const item of storage.tileArea) {
    if (item.kind === 'coin') {
      if (coinsLeft > 0) coinsLeft -= 1;
      else tileArea.push(item);
      continue;
    }
    const remaining = tileRemovals.get(tileKey(item.tile)) ?? 0;
    if (remaining > 0) tileRemovals.set(tileKey(item.tile), remaining - 1);
    else tileArea.push(item);
  }

  const sectionRemovals = new Map<string, number>();
  for (const s of removeSections) {
    sectionRemovals.set(sectionKey(s), (sectionRemovals.get(sectionKey(s)) ?? 0) + 1);
  }
  const sections: Section[] = [];
  for (const s of storage.sections) {
    const remaining = sectionRemovals.get(sectionKey(s)) ?? 0;
    if (remaining > 0) sectionRemovals.set(sectionKey(s), remaining - 1);
    else sections.push(s);
  }

  return { tileArea, sections };
}

// --- coin earning (completion bonuses) ---

const CENTRE_COIN = 1;
const RING_COIN = 3;
const GAP_COIN = 2;

// Coins earned by completing 6-tile regions with a tile at `pos`, given the garden *after* the
// placement. A region pays out iff it contains `pos` and is now full — it was necessarily one
// short before, since `pos` was empty. The placed tile's own section pays (centre 1, ring 3); each
// completed junction gap pays 2. Bonuses stack across overlapping regions.
function regionCoins(after: Garden, pos: TilePosition): number {
  let coins = 0;
  const section = after[pos.slot];
  if (section && section.tiles.every((t) => t !== null)) {
    coins += pos.slot === 0 ? CENTRE_COIN : RING_COIN;
  }
  for (const gap of JUNCTION_GAPS) {
    if (!gap.some((p) => posKey(p) === posKey(pos))) continue;
    if (gap.every((p) => tileAtPosition(after, p) !== null)) coins += GAP_COIN;
  }
  return coins;
}

// --- public API ---

// The coin reward for placing `action`'s tile: `max` is what the completed regions are worth;
// `actual` is how many fit once the placed tile and payment have left the tile area (which is
// capped at STORAGE_TILE_LIMIT). When `actual < max` the excess is forfeited — the UI uses this to
// warn before committing. Assumes the placement is legal (callers gate on `placeTileIllegalReason`).
export function placeTileCoins(state: State, action: PlaceTileAction): { max: number; actual: number } {
  const player = state.players[state.currentPlayer]!;
  const { tile, slot, dir, payment } = action;
  const after = placeTileOn(player.garden, slot, dir, tile);
  const storage = spend(player.storage, [tile, ...payment.tiles], payment.sections, payment.coins);
  const max = regionCoins(after, { slot, dir });
  const room = Math.max(0, STORAGE_TILE_LIMIT - storage.tileArea.length);
  return { max, actual: Math.min(max, room) };
}

export function placeTileIllegalReason(state: State, action: PlaceTileAction): string | null {
  const player = state.players[state.currentPlayer]!;
  const { tile, slot, dir, payment } = action;

  const section = player.garden[slot];
  if (!section) return 'no section in that slot';
  if (tileAt(section, dir) !== null) return 'that space is already occupied';

  const payReason = paymentStructureReason(tile, payment);
  if (payReason) return payReason;
  const availReason = storageAvailableReason(
    player.storage,
    [tile, ...payment.tiles],
    payment.sections,
    payment.coins,
  );
  if (availReason) return availReason;

  return placementGeometryReason(placeTileOn(player.garden, slot, dir, tile), tile, { slot, dir });
}

export function placeSectionIllegalReason(state: State, action: PlaceSectionAction): string | null {
  const player = state.players[state.currentPlayer]!;
  const { section, slot, identityDir, payment } = action;

  if (section.identity === null) return 'cannot place the blank starter section';
  if (player.garden[slot] !== null) return 'that garden slot is not empty';
  const identity = section.identity;

  const payReason = paymentStructureReason(identity, payment);
  if (payReason) return payReason;
  const availReason = storageAvailableReason(
    player.storage,
    payment.tiles,
    [section, ...payment.sections],
    payment.coins,
  );
  if (availReason) return availReason;

  const after = placeTileOn(player.garden, slot, identityDir, identity);
  return placementGeometryReason(after, identity, { slot, dir: identityDir });
}

export function resolvePlaceTile(state: State, action: PlaceTileAction): State {
  const { tile, slot, dir, payment } = action;
  const { actual } = placeTileCoins(state, action); // coins earned, already capped to storage room
  const players = state.players.map((p, i) => {
    if (i !== state.currentPlayer) return p;
    const spent = spend(p.storage, [tile, ...payment.tiles], payment.sections, payment.coins);
    return {
      ...p,
      storage: {
        ...spent,
        tileArea: [...spent.tileArea, ...Array.from({ length: actual }, () => coinItem)],
      },
      garden: placeTileOn(p.garden, slot, dir, tile),
    };
  });
  return { ...state, players, supply: discardPaymentTiles(state, payment) };
}

export function resolvePlaceSection(state: State, action: PlaceSectionAction): State {
  const { section, slot, identityDir, payment } = action;
  const players = state.players.map((p, i) =>
    i === state.currentPlayer
      ? {
          ...p,
          storage: spend(p.storage, payment.tiles, [section, ...payment.sections], payment.coins),
          garden: placeTileOn(p.garden, slot, identityDir, section.identity!),
        }
      : p,
  );
  return { ...state, players, supply: discardPaymentTiles(state, payment) };
}

// Payment tiles go to the discard pile (reshuffleable); payment sections and coins leave play.
function discardPaymentTiles(state: State, payment: Payment): State['supply'] {
  return { ...state.supply, discard: [...state.supply.discard, ...payment.tiles] };
}
