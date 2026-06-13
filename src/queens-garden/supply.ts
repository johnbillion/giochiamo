import type { Rng } from './rng';
import type { Tile } from './types';

// Draw `count` tiles from the bag, reshuffling the discard back in (seed-driven) when the bag
// runs dry. Returns the drawn tiles plus the updated bag and discard.
export function drawTiles(
  bag: readonly Tile[],
  discard: readonly Tile[],
  count: number,
  rng: Rng,
): { drawn: Tile[]; bag: Tile[]; discard: Tile[] } {
  let b = [...bag];
  let d = [...discard];
  const drawn: Tile[] = [];
  for (let k = 0; k < count; k++) {
    if (b.length === 0) {
      if (d.length === 0) break; // nothing left anywhere
      b = rng.shuffle(d);
      d = [];
    }
    drawn.push(b.pop()!);
  }
  return { drawn, bag: b, discard: d };
}
