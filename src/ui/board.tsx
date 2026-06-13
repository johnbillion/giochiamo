// Presentation-only helpers for the Queen's Garden UI. No game logic lives here — that all
// stays in the engine (`src/queens-garden`). This file just maps the engine's abstract
// colours/symbols to pixels and lays the 7 hex sections out on a grid.

import type { Colour, Section, Symbol, Tile } from '../queens-garden/types';

// The 6 colours → CSS fills. (The engine's colour names are arbitrary labels; these are ours.)
export const COLOUR_HEX: Record<Colour, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  orange: '#f97316',
  pink: '#ec4899',
  red: '#ef4444',
  yellow: '#eab308',
};

// The 6 symbols → a glyph each.
export const SYMBOL_GLYPH: Record<Symbol, string> = {
  acorn: '🌰',
  bird: '🐦',
  clover: '🍀',
  flower: '🌸',
  leaf: '🍃',
  pinecone: '🌲',
};

// Grid position [grid-row, grid-column] of every tile slot, indexed [slot][dir]. Lifted from
// the playground's ASCII layout (which was derived from the true board geometry), so the picture
// mirrors real adjacency: the centre section in the middle, the six ring sections around it.
export const SLOT_LAYOUT: readonly (readonly (readonly [number, number])[])[] = [
  [[8, 5], [7, 4], [6, 4], [5, 5], [6, 6], [7, 6]], // slot 0 (centre)
  [[12, 5], [11, 4], [10, 4], [9, 5], [10, 6], [11, 6]], // slot 1
  [[10, 2], [9, 1], [8, 1], [7, 2], [8, 3], [9, 3]], // slot 2
  [[6, 2], [5, 1], [4, 1], [3, 2], [4, 3], [5, 3]], // slot 3
  [[4, 5], [3, 4], [2, 4], [1, 5], [2, 6], [3, 6]], // slot 4
  [[6, 8], [5, 7], [4, 7], [3, 8], [4, 9], [5, 9]], // slot 5
  [[10, 8], [9, 7], [8, 7], [7, 8], [8, 9], [9, 9]], // slot 6
];

export const GRID_ROWS = 12;
export const GRID_COLS = 9;

export function tileLabel(tile: Tile): string {
  return `${tile.colour} ${tile.symbol}`;
}

export function sectionLabel(section: Section): string {
  return section.identity ? `${section.identity.colour} ${section.identity.symbol}` : 'blank';
}

// A single tile face: a coloured square with its symbol glyph. `size` is the side length in px.
export function TileFace({ tile, size = 34 }: { tile: Tile; size?: number }) {
  return (
    <span
      className="tile-face"
      title={tileLabel(tile)}
      style={{
        background: COLOUR_HEX[tile.colour],
        width: size,
        height: size,
        fontSize: size * 0.55,
      }}
    >
      {SYMBOL_GLYPH[tile.symbol]}
    </span>
  );
}
