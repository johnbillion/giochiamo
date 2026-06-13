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

// The outer silhouette of an expansion rosette — the union of the six hexes with no internal
// borders — as an 18-gon. Used as a decorative frame behind a central pile's tiles. The shape is
// 6-fold symmetric: six "tip" pairs with a shallow valley between each pair.
const EXPANSION_OUTLINE_POINTS = (() => {
  const s = Math.sqrt(3);
  // Walks the boundary clockwise: each hex contributes three outer vertices, meeting at a valley.
  return [
    [s, -1], [1.5 * s, -0.5], [1.5 * s, 0.5], [s, 1], // right hex
    [s, 2], [0.5 * s, 2.5], [0, 2], //                   lower-right hex
    [-0.5 * s, 2.5], [-s, 2], [-s, 1], //                lower-left hex
    [-1.5 * s, 0.5], [-1.5 * s, -0.5], [-s, -1], //      left hex
    [-s, -2], [-0.5 * s, -2.5], [0, -2], //              upper-left hex
    [0.5 * s, -2.5], [s, -2], //                         upper-right hex
  ] as const;
})();

// A standalone SVG of the expansion-rosette outline, scaled to fill (and centre within) its box.
export function ExpansionOutline() {
  const R = 10;
  const s = Math.sqrt(3);
  const pad = 2;
  const points = EXPANSION_OUTLINE_POINTS.map(([x, y]) => `${(x * R).toFixed(2)},${(y * R).toFixed(2)}`).join(' ');
  const minX = -1.5 * s * R - pad;
  const minY = -2.5 * R - pad;
  const w = 3 * s * R + 2 * pad;
  const h = 5 * R + 2 * pad;
  return (
    <svg
      className="expansion-outline"
      viewBox={`${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <polygon points={points} fill="none" stroke="#cbd5e1" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
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

// An expansion piece, drawn as a miniature rosette — the same shape it takes on the board: six
// pointy-top hexes ringing a hollow centre. One slot holds the expansion's identity tile (its
// colour + symbol); the other five are empty. A starter expansion (no identity) has all six empty.
const EXPANSION_IDENTITY_SLOT = 2; // which ring slot shows the identity tile (top-left)

export function ExpansionFace({ expansion, size = 18 }: { expansion: Expansion; size?: number }) {
  const id = expansion.identity;
  const r = size; // circumradius of each hex in the rosette
  const cells = DIR_AXIAL.map(([q, rr], i) => {
    const [cx, cy] = axialToPixel(q, rr, r);
    return { cx, cy, i };
  });
  const halfW = (r * Math.sqrt(3)) / 2;
  const pad = 1.5;
  const minX = Math.min(...cells.map((c) => c.cx)) - halfW - pad;
  const maxX = Math.max(...cells.map((c) => c.cx)) + halfW + pad;
  const minY = Math.min(...cells.map((c) => c.cy)) - r - pad;
  const maxY = Math.max(...cells.map((c) => c.cy)) + r + pad;
  const w = maxX - minX;
  const h = maxY - minY;
  return (
    <svg
      className="expansion-face"
      viewBox={`${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`}
      width={w.toFixed(2)}
      height={h.toFixed(2)}
      role="img"
      aria-label={`${expansionLabel(expansion)} expansion`}
    >
      {cells.map((c) => {
        const isId = id !== null && c.i === EXPANSION_IDENTITY_SLOT;
        return (
          <g key={c.i}>
            <polygon
              points={hexPoints(c.cx, c.cy, r)}
              fill={isId ? COLOUR_HEX[id.colour] : '#e2e8f0'}
              stroke={isId ? 'rgba(0, 0, 0, 0.4)' : '#cbd5e1'}
              strokeWidth={1.5}
            />
            {isId && (
              <text x={c.cx} y={c.cy} textAnchor="middle" dominantBaseline="central" fontSize={r}>
                {SYMBOL_GLYPH[id.symbol]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
