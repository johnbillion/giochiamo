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

// The tile shown at a section's board direction — the identity at its rotation, else a placed tile.
export function tileAt(section: PlacedSection, dir: Direction): Tile | null {
  if (section.identity !== null && dir === section.rotation) return section.identity;
  return section.tiles[dir] ?? null;
}

// A fresh garden: the blank starter section in the centre, every ring slot empty.
export function createStarterGarden(): Garden {
  const starter: PlacedSection = {
    identity: null,
    rotation: 0,
    tiles: Array.from({ length: 6 }, () => null),
  };
  return [starter, null, null, null, null, null, null];
}
