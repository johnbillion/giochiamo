// Presentation-only helpers for the Queen's Garden UI. No game logic lives here — that all
// stays in the engine (`src/queens-garden`). This file just maps the engine's abstract
// colours/symbols to pixels and lays the 7 hex expansions out on a grid.

import type { Colour, Expansion, Symbol, Tile } from '../queens-garden/types';

// The 6 colours → CSS fills. (The engine's colour names are arbitrary labels; these are ours.)
export const COLOUR_HEX: Record<Colour, string> = {
  blue: '#1f6fff',
  green: '#13c43a',
  orange: '#ff8c00',
  pink: '#cf52ff',
  red: '#e00b2d',
  yellow: '#ffd000',
};

// The 6 colours → display names shown in the UI.
export const COLOUR_LABEL: Record<Colour, string> = {
  blue: 'Blue',
  green: 'Green',
  orange: 'Orange',
  pink: 'Magenta',
  red: 'Red',
  yellow: 'Yellow',
};

// The 6 symbols → a glyph each.
export const SYMBOL_GLYPH: Record<Symbol, string> = {
  tree: '🌳',
  bird: '🐦',
  butterflies: '🦋',
  flower: '🌸',
  herb: '🌿',
  lily: '🌷',
};

// The 6 symbols → display names shown in the UI.
export const SYMBOL_LABEL: Record<Symbol, string> = {
  tree: 'Tree',
  bird: 'Bird',
  butterflies: 'Butterflies',
  flower: 'Flower',
  herb: 'Herb',
  lily: 'Lily',
};

// --- garden board geometry (pointy-top hexagons, in a flower-of-flowers) ---
// Each expansion is a ring of six tiles around a hollow centre; the seven expansion centres are
// themselves arranged as a flower. Everything is expressed in axial (q, r) coordinates for a
// pointy-top hex grid, and projected to pixels by axialToPixel().

// Axial offset of each tile slot (dir 0..5) from its expansion's centre hole, ordered clockwise
// from the top-right. (The engine cares only about the dir index; this just decides where we draw
// it.)
export const DIR_AXIAL: readonly (readonly [number, number])[] = [
  [-1, 1], // 0 — SW
  [-1, 0], // 1 — W
  [0, -1], // 2 — NW
  [1, -1], // 3 — NE
  [1, 0], //  4 — E
  [0, 1], //  5 — SE
];

// Axial centre of each expansion's hole: slot 0 in the middle, slots 1..6 around it at hex-distance
// 3 in the six cardinal axial directions (per queens-garden-board-layout.md / AQG-min.svg). The
// seven rosettes of 6 stay distinct — they don't share hexes — and form a flat-top hex-of-hexes.
export const SLOT_CENTRE: readonly (readonly [number, number])[] = [
  [0, 0], //   centre
  [3, 0], //   right
  [3, -3], //  upper-right
  [0, -3], //  upper-left
  [-3, 0], //  left
  [-3, 3], //  lower-left
  [0, 3], //   lower-right
];

// Pointy-top axial (q, r) → pixel centre, given the hexagon circumradius R.
export function axialToPixel(q: number, r: number, R: number): readonly [number, number] {
  return [R * Math.sqrt(3) * (q + r / 2), R * 1.5 * r];
}

// The six corners of a pointy-top hexagon (circumradius R, centred at cx,cy) as an SVG points list.
export function hexPoints(cx: number, cy: number, R: number): string {
  const corners: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (90 + 60 * i); // start at the top point, step 60°
    corners.push(`${(cx + R * Math.cos(a)).toFixed(2)},${(cy - R * Math.sin(a)).toFixed(2)}`);
  }
  return corners.join(' ');
}

export function tileLabel(tile: Tile): string {
  return `${COLOUR_LABEL[tile.colour]} ${SYMBOL_LABEL[tile.symbol]}`;
}

export function expansionLabel(expansion: Expansion): string {
  return expansion.identity
    ? `${COLOUR_LABEL[expansion.identity.colour]} ${SYMBOL_LABEL[expansion.identity.symbol]}`
    : 'blank';
}

// A regular pointy-top hexagon is √3/2 as wide as it is tall, so the box width is scaled to keep
// the proportions correct (the CSS clip-path then fills it exactly). `size` is the height in px.
const HEX_RATIO = Math.sqrt(3) / 2; // ≈ 0.866, width ÷ height of a regular pointy-top hexagon

// The shared face primitive: a coloured pointy-top hexagon with an optional centred glyph.
function HexFace({
  fill,
  glyph,
  size,
  title,
}: {
  fill: string;
  glyph?: string;
  size: number;
  title?: string;
}) {
  return (
    <span
      className="tile-face"
      title={title}
      style={{ background: fill, width: size * HEX_RATIO, height: size, fontSize: size * 0.5 }}
    >
      {glyph}
    </span>
  );
}

export function TileFace({ tile, size = 34 }: { tile: Tile; size?: number }) {
  return <HexFace fill={COLOUR_HEX[tile.colour]} glyph={SYMBOL_GLYPH[tile.symbol]} size={size} />;
}

// A coin, drawn as a plain silver hexagon (a wildcard payment piece).
export function CoinFace({ size = 34 }: { size?: number }) {
  return <HexFace fill="#c7ccd4" size={size} title="coin (wildcard payment)" />;
}
