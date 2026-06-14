// The garden's fixed topology — defined once and unit-tested, never recomputed at runtime (the
// same play as TTT's WIN_MASKS). Slots: 0 = centre, 1–6 = ring. Directions 0–5 are the six hex
// directions; opposite(d) = (d + 3) % 6.
//
// The board is the real game's: seven rosettes of six petals, the rosette centres a flat-top
// hex-of-hexes at hex-distance 3 (see queens-garden-board-layout.md / the rulebook). Every tile
// slot has a true axial coordinate, and two slots are adjacent exactly when those coordinates are
// one hex step apart — so adjacency, junction gaps, everything, derive from this one geometry.
// (An earlier model placed the ring one step out and joined a single petal pair across each edge:
// internally consistent, but a *different* topology from the real board, so it mis-judged which
// petals actually touch — e.g. it thought a ring rosette's far petals touched the centre.)

import type { Direction, Garden, PlacedExpansion, SlotId, Tile } from './types';

// Axial unit vectors for the six hex steps; opposite(d) = (d + 3) % 6.
const HEX_STEPS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

// Axial offset of each tile slot (dir 0..5) from its rosette's centre hole, clockwise from SW.
// (The engine cares only about the dir index; the UI reads this to decide where to draw each tile.)
export const DIR_AXIAL: readonly (readonly [number, number])[] = [
  [-1, 1], // 0 — SW
  [-1, 0], // 1 — W
  [0, -1], // 2 — NW
  [1, -1], // 3 — NE
  [1, 0], //  4 — E
  [0, 1], //  5 — SE
];

// Axial centre of each rosette's hollow: slot 0 in the middle, slots 1..6 around it at hex-distance
// 3 in the six directions. The seven rosettes stay distinct — they never share a hex.
export const SLOT_CENTRE: readonly (readonly [number, number])[] = [
  [0, 0], //   centre
  [3, 0], //   right
  [3, -3], //  upper-right
  [0, -3], //  upper-left
  [-3, 0], //  left
  [-3, 3], //  lower-left
  [0, 3], //   lower-right
];

const ALL_SLOTS = [0, 1, 2, 3, 4, 5, 6] as const;
const ALL_DIRS = [0, 1, 2, 3, 4, 5] as const;
const axialKey = (q: number, r: number): string => `${q},${r}`;

// The true axial coordinate of a tile slot: its rosette's centre plus its direction offset.
function tileAxial(slot: SlotId, dir: Direction): readonly [number, number] {
  const [cq, cr] = SLOT_CENTRE[slot]!;
  const [dq, dr] = DIR_AXIAL[dir]!;
  return [cq + dq, cr + dr];
}

// axial "q,r" → the tile slot living there. Lets adjacency be a coordinate lookup, not a table.
const POSITION_AT: ReadonlyMap<string, TilePosition> = (() => {
  const map = new Map<string, TilePosition>();
  for (const slot of ALL_SLOTS) {
    for (const dir of ALL_DIRS) {
      const [q, r] = tileAxial(slot, dir);
      map.set(axialKey(q, r), { slot, dir });
    }
  }
  return map;
})();

// The rosette adjacent to `slot` across hex direction `dir`, or null. Rosette centres sit three hex
// steps apart, so a centre three steps away in that direction is the rosette sharing that junction.
export function neighbourSlot(slot: SlotId, dir: Direction): SlotId | null {
  const [cq, cr] = SLOT_CENTRE[slot]!;
  const [dq, dr] = HEX_STEPS[dir]!;
  const found = SLOT_CENTRE.findIndex(([q, r]) => q === cq + dq * 3 && r === cr + dr * 3);
  return found === -1 ? null : (found as SlotId);
}

export type TilePosition = { readonly slot: SlotId; readonly dir: Direction };

// Tiles adjacent to a position: every tile slot one hex step away on the real board. That's the two
// ring-neighbours within the rosette, plus any petals of neighbouring rosettes touching across a
// junction (a rosette's outward-facing petals have none, and are correctly treated as isolated).
export function adjacentPositions(pos: TilePosition): TilePosition[] {
  const [q, r] = tileAxial(pos.slot, pos.dir);
  const out: TilePosition[] = [];
  for (const [dq, dr] of HEX_STEPS) {
    const neighbour = POSITION_AT.get(axialKey(q + dq, r + dr));
    if (neighbour) out.push(neighbour);
  }
  return out;
}

// The tile on a expansion's slot, if any. (The identity is just one of these tiles.)
export function tileAt(expansion: PlacedExpansion, dir: Direction): Tile | null {
  return expansion.tiles[dir] ?? null;
}

// A fresh garden: the blank starter expansion (a frame of 6 empty slots) in the centre, ring empty.
export function createStarterGarden(): Garden {
  const starter: PlacedExpansion = { tiles: Array.from({ length: 6 }, () => null) };
  return [starter, null, null, null, null, null, null];
}

export function tileAtPosition(garden: Garden, pos: TilePosition): Tile | null {
  const expansion = garden[pos.slot];
  return expansion ? tileAt(expansion, pos.dir) : null;
}

// --- coin-scoring regions ---
// Completing a 6-tile region with a placed tile earns coins (see placement.ts / rules.md). The
// regions are the 7 expansion frames — membership is trivial (a slot's 6 dirs), "full" = no nulls —
// and the 6 "junction gaps" below. Unlike the old run `LINES`, these need only set membership, not
// cyclic order, so no `orderCycle` is required.

// A junction gap is a hole in the board that is NOT a rosette centre: the little hollow where the
// centre rosette meets two adjacent ring rosettes. A hole is any non-slot position all six of whose
// neighbours are tile slots — exactly what rings every rosette centre and every junction gap, but
// never the open space outside the flower. Derived from the geometry, not hardcoded.
const ROSETTE_CENTRE_KEYS: ReadonlySet<string> = new Set(
  SLOT_CENTRE.map(([q, r]) => axialKey(q, r)),
);

// The six junction gaps: each the 6 petals ringing a junction hole, in hex order around it (so they
// form a real 6-cycle) — 2 petals from the centre + 2 from each of the two adjacent ring rosettes.
export const JUNCTION_GAPS: readonly TilePosition[][] = (() => {
  const seen = new Set<string>();
  const gaps: TilePosition[][] = [];
  for (const pos of POSITION_AT.values()) {
    const [tq, tr] = tileAxial(pos.slot, pos.dir);
    for (const [dq, dr] of HEX_STEPS) {
      const hq = tq + dq;
      const hr = tr + dr;
      const holeKey = axialKey(hq, hr);
      if (seen.has(holeKey) || POSITION_AT.has(holeKey) || ROSETTE_CENTRE_KEYS.has(holeKey)) continue;
      const ring = HEX_STEPS.map(([eq, er]) => POSITION_AT.get(axialKey(hq + eq, hr + er)));
      if (ring.every((p): p is TilePosition => p !== undefined)) {
        seen.add(holeKey);
        gaps.push(ring);
      }
    }
  }
  return gaps;
})();
