// The garden's fixed topology — defined once and unit-tested, never recomputed at runtime (the
// same play as TTT's WIN_MASKS). Slots: 0 = centre, 1–6 = ring. Directions 0–5 are the six hex
// directions; opposite(d) = (d + 3) % 6.

import type { Direction, Garden, PlacedSection, SlotId, Tile } from './types';

// Axial unit vectors for the six directions; opposite(d) = (d + 3) % 6.
const DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

// Each slot's axial coordinate: centre at the origin, the ring one step out in each direction.
const SLOT_COORDS: readonly (readonly [number, number])[] = [
  [0, 0],
  ...DIRS.map(([q, r]): readonly [number, number] => [q, r]),
];

// neighbour[slot][dir] = the adjacent slot in that direction, or null (off the board).
// Derived once from the coordinates — this is the fixed "neighbour table".
const SLOT_NEIGHBOURS: readonly (readonly (SlotId | null)[])[] = SLOT_COORDS.map(([q, r]) =>
  DIRS.map(([dq, dr]): SlotId | null => {
    const found = SLOT_COORDS.findIndex(([cq, cr]) => cq === q + dq && cr === r + dr);
    return found === -1 ? null : (found as SlotId);
  }),
);

export function neighbourSlot(slot: SlotId, dir: Direction): SlotId | null {
  return SLOT_NEIGHBOURS[slot]?.[dir] ?? null;
}

export type TilePosition = { readonly slot: SlotId; readonly dir: Direction };

// Tiles adjacent to a position: the two ring-neighbours within the section, plus the tile across
// the shared edge in the neighbouring section (if there is one).
export function adjacentPositions(pos: TilePosition): TilePosition[] {
  const out: TilePosition[] = [
    { slot: pos.slot, dir: ((pos.dir + 5) % 6) as Direction },
    { slot: pos.slot, dir: ((pos.dir + 1) % 6) as Direction },
  ];
  const across = neighbourSlot(pos.slot, pos.dir);
  if (across !== null) {
    out.push({ slot: across, dir: ((pos.dir + 3) % 6) as Direction });
  }
  return out;
}

// The tile on a section's slot, if any. (The identity is just one of these tiles.)
export function tileAt(section: PlacedSection, dir: Direction): Tile | null {
  return section.tiles[dir] ?? null;
}

// A fresh garden: the blank starter section (a frame of 6 empty slots) in the centre, ring empty.
export function createStarterGarden(): Garden {
  const starter: PlacedSection = { tiles: Array.from({ length: 6 }, () => null) };
  return [starter, null, null, null, null, null, null];
}

export function tileAtPosition(garden: Garden, pos: TilePosition): Tile | null {
  const section = garden[pos.slot];
  return section ? tileAt(section, pos.dir) : null;
}

// --- coin-scoring regions ---
// Completing a 6-tile region with a placed tile earns coins (see placement.ts / rules.md). The
// regions are the 7 section frames — membership is trivial (a slot's 6 dirs), "full" = no nulls —
// and the 6 "junction gaps" below. Unlike the old run `LINES`, these need only set membership, not
// cyclic order, so no `orderCycle` is required.

const DIRECTIONS: readonly Direction[] = [0, 1, 2, 3, 4, 5];

// The petal pair straddling the shared edge between two adjacent sections, or null if they don't
// touch: `a`'s petal facing `b`, and `b`'s petal facing back (dir + 3).
function crossPair(a: SlotId, b: SlotId): readonly [TilePosition, TilePosition] | null {
  for (const d of DIRECTIONS) {
    if (neighbourSlot(a, d) === b) {
      return [
        { slot: a, dir: d },
        { slot: b, dir: ((d + 3) % 6) as Direction },
      ];
    }
  }
  return null;
}

// Adjacent ring-slot pairs around the centre (cyclic).
const RING_PAIRS: readonly (readonly [SlotId, SlotId])[] = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 1],
];

// The six junction gaps: each the set of 6 petals ringing the hole where the centre meets two
// adjacent ring sections — 2 petals from the centre + 2 from each of the two ring sections.
export const JUNCTION_GAPS: readonly TilePosition[][] = RING_PAIRS.map(([a, b]) => [
  ...crossPair(0, a)!,
  ...crossPair(0, b)!,
  ...crossPair(a, b)!,
]);
