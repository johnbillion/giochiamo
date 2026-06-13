import { describe, expect, it } from 'vitest';

import {
  adjacentPositions,
  createStarterGarden,
  JUNCTION_GAPS,
  neighbourSlot,
  tileAt,
  type TilePosition,
} from './garden';
import type { Direction, PlacedSection, SlotId, Tile } from './types';

const DIRECTIONS: Direction[] = [0, 1, 2, 3, 4, 5];
const SLOTS: SlotId[] = [0, 1, 2, 3, 4, 5, 6];
const RING: SlotId[] = [1, 2, 3, 4, 5, 6];

const key = (p: TilePosition): string => `${p.slot}:${p.dir}`;

describe('garden topology — section adjacency', () => {
  it('the centre is adjacent to all six ring slots', () => {
    const neighbours = DIRECTIONS.map((d) => neighbourSlot(0, d));
    expect(new Set(neighbours)).toEqual(new Set(RING));
  });

  it('each ring slot is adjacent to the centre + 2 ring-neighbours (degree 3)', () => {
    for (const slot of RING) {
      const neighbours = DIRECTIONS.map((d) => neighbourSlot(slot, d)).filter(
        (n): n is SlotId => n !== null,
      );
      expect(neighbours).toHaveLength(3);
      expect(neighbours).toContain(0); // the centre
    }
  });

  it('the neighbour table is symmetric', () => {
    for (const slot of SLOTS) {
      for (const dir of DIRECTIONS) {
        const t = neighbourSlot(slot, dir);
        if (t !== null) {
          expect(neighbourSlot(t, ((dir + 3) % 6) as Direction)).toBe(slot);
        }
      }
    }
  });
});

describe('garden topology — tile adjacency', () => {
  it('includes the two ring-neighbours within a section', () => {
    const adj = adjacentPositions({ slot: 0, dir: 2 });
    expect(adj).toContainEqual({ slot: 0, dir: 1 });
    expect(adj).toContainEqual({ slot: 0, dir: 3 });
  });

  it('crosses the shared edge to the opposite direction of the neighbour', () => {
    // The centre's tile at direction 0 touches ring slot 1's tile at direction 3.
    expect(adjacentPositions({ slot: 0, dir: 0 })).toContainEqual({ slot: 1, dir: 3 });
  });

  it('is symmetric across all 42 positions', () => {
    for (const slot of SLOTS) {
      for (const dir of DIRECTIONS) {
        const a: TilePosition = { slot, dir };
        for (const b of adjacentPositions(a)) {
          expect(adjacentPositions(b).map(key)).toContain(key(a));
        }
      }
    }
  });
});

describe('sections & the starter', () => {
  it('reads the tile on a section slot (the identity is just a placed tile)', () => {
    const id: Tile = { colour: 'red', symbol: 'bird' };
    const section: PlacedSection = { tiles: [null, null, id, null, null, null] };
    expect(tileAt(section, 2)).toEqual(id);
    expect(tileAt(section, 0)).toBeNull();
  });

  it('the starter garden has a blank centre section and an empty ring', () => {
    const g = createStarterGarden();
    expect(g[0]).toEqual({ tiles: [null, null, null, null, null, null] });
    expect(g.slice(1).every((slot) => slot === null)).toBe(true);
  });
});

describe('coin-scoring regions', () => {
  it('has 6 junction gaps, each 6 petals across the centre + 2 ring sections', () => {
    expect(JUNCTION_GAPS).toHaveLength(6);
    for (const gap of JUNCTION_GAPS) {
      expect(gap).toHaveLength(6);
      const perSlot = new Map<SlotId, number>();
      for (const p of gap) perSlot.set(p.slot, (perSlot.get(p.slot) ?? 0) + 1);
      expect(perSlot.size).toBe(3); // centre + two ring sections
      expect(perSlot.get(0)).toBe(2); // two centre petals
      expect([...perSlot.values()].every((c) => c === 2)).toBe(true); // 2 from each section
    }
  });

  it('every gap petal is adjacent to the next around its ring (a real 6-cycle)', () => {
    for (const gap of JUNCTION_GAPS) {
      // each petal shares an edge with at least two others in the gap (it's a ring)
      for (const p of gap) {
        const inGap = gap.filter(
          (q) => adjacentPositions(p).some((a) => a.slot === q.slot && a.dir === q.dir),
        );
        expect(inGap.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

