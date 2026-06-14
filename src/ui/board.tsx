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

// Plural display names, hardcoded rather than naively suffixed with "s".
export const COLOUR_LABEL_PLURAL: Record<Colour, string> = {
  blue: 'Blues',
  green: 'Greens',
  orange: 'Oranges',
  pink: 'Magentas',
  red: 'Reds',
  yellow: 'Yellows',
};

// The 6 symbols → a glyph each.
export const SYMBOL_GLYPH: Record<Symbol, string> = {
  tree: '🌳',
  bird: '🐦',
  butterflies: '🦋',
  flower: '🌸',
  herb: '🌿',
  tulip: '🌷',
};

// The glyph shown on a coin (wildcard payment piece). Kept as a constant so it can be localised.
export const COIN_GLYPH = '€';

// The 6 symbols → display names shown in the UI.
export const SYMBOL_LABEL: Record<Symbol, string> = {
  tree: 'Tree',
  bird: 'Bird',
  butterflies: 'Butterflies',
  flower: 'Flower',
  herb: 'Herb',
  tulip: 'Tulip',
};

// Plural display names, hardcoded so irregulars read correctly.
export const SYMBOL_LABEL_PLURAL: Record<Symbol, string> = {
  tree: 'Trees',
  bird: 'Birds',
  butterflies: 'Butterflies',
  flower: 'Flowers',
  herb: 'Herbs',
  tulip: 'Tulips',
};

// Pick the singular or plural label for a colour/symbol based on how many are being referred to.
export function colourLabel(colour: Colour, count = 1): string {
  return count === 1 ? COLOUR_LABEL[colour] : COLOUR_LABEL_PLURAL[colour];
}

export function symbolLabel(symbol: Symbol, count = 1): string {
  return count === 1 ? SYMBOL_LABEL[symbol] : SYMBOL_LABEL_PLURAL[symbol];
}

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
// `rotate` spins the (origin-centred, 6-fold-symmetric) silhouette in place by a few degrees for a
// hand-laid look. The viewBox is sized for the unrotated shape, so keep rotations modest.
export function ExpansionOutline({ rotate = 0 }: { rotate?: number }) {
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
      <polygon
        points={points}
        fill="#ede4d3"
        stroke="#d8c9ad"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        transform={rotate ? `rotate(${rotate})` : undefined}
      />
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

// The one hex dimension every piece is drawn at, so a tile is the same size wherever it appears and
// a rosette hex matches a tile. TILE_SIZE is a tile's height; EXPANSION_HEX_R is the rosette-hex
// circumradius (half the height), and the garden draws its cells at this radius too.
export const TILE_SIZE = 56;
export const EXPANSION_HEX_R = TILE_SIZE / 2;

// Each tile/expansion gets a tiny, fixed "imperfect placement" tilt. The bucket is a deterministic
// hash of a key, so it's stable across re-renders (a tile never jiggles in place) yet varies between
// pieces. Pass a per-position `seed` so two identical tiles in the same pile/row don't tilt alike.
// Purely cosmetic — the CSS in index.css maps each bucket to a small rotation/offset.
// FNV-1a with an avalanche finalizer → an unsigned 32-bit hash. The finalizer matters: the low bits
// are all the callers below use, and a plain polynomial hash mixes those poorly (the last character
// dominates), so a mid-key salt would wash out. Avalanching spreads every bit down into the low bits.
function hash32(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 16;
  return h >>> 0;
}

export const JITTER_BUCKETS = 8;
export function jitterBucket(key: string): number {
  return hash32(key) % JITTER_BUCKETS;
}

// A stable pseudo-random angle in [0, 50) degrees for a pile's background rosette. Key it however the
// caller wants stability to hold — e.g. round + pile index: steady within a round, fresh each round.
export function pileRotation(key: string): number {
  return (hash32(key) % 5000) / 100;
}
// Degrees for a board cell, derived from the same buckets, centred on 0 (≈ ±1.2°). The packed
// rosette can't use the HTML offsets (they'd gap the grid), so board cells only rotate, a little.
export function jitterDegrees(key: string): number {
  const span = 2.4;
  return (jitterBucket(key) - (JITTER_BUCKETS - 1) / 2) * (span / (JITTER_BUCKETS - 1));
}

// The shared face primitive: a standalone SVG of a single pointy-top hexagon with an optional centred
// label. Unlike the old CSS clip-path span this replaced, an SVG <polygon> carries a real stroke, so
// storage tiles can outline exactly like the ones placed in the garden (which is itself one big SVG),
// and a flying clone can morph between the two without a tech seam. `size` is the hex height in px;
// the box keeps the √3/2 width proportion and the viewBox hugs the hexagon with a little padding so
// the stroke isn't clipped. `fill`/`stroke` are optional: omit them to drive the colours from CSS
// (e.g. for buttons with hover/disabled states), or pass them inline as the coloured tiles do.
export function HexFace({
  fill,
  glyph,
  size,
  stroke,
  strokeWidth = 1.5,
  fontSize,
  className = 'tile-face',
  jitter,
}: {
  fill?: string;
  glyph?: string;
  size: number;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  className?: string;
  jitter?: number;
}) {
  const R = size / 2; // circumradius; a pointy-top hexagon is 2R tall
  const halfW = (R * Math.sqrt(3)) / 2;
  const pad = strokeWidth / 2 + 0.5;
  return (
    <svg
      className={className}
      data-jitter={jitter}
      width={(size * HEX_RATIO).toFixed(2)}
      height={size}
      viewBox={`${(-halfW - pad).toFixed(2)} ${(-R - pad).toFixed(2)} ${(2 * halfW + 2 * pad).toFixed(2)} ${(2 * R + 2 * pad).toFixed(2)}`}
      aria-hidden="true"
    >
      <polygon points={hexPoints(0, 0, R)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      {glyph && (
        <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={fontSize ?? R}>
          {glyph}
        </text>
      )}
    </svg>
  );
}

export function TileFace({
  tile,
  size = 34,
  seed = '',
}: {
  tile: Tile;
  size?: number;
  seed?: string | number;
}) {
  return (
    <HexFace
      fill={COLOUR_HEX[tile.colour]}
      glyph={SYMBOL_GLYPH[tile.symbol]}
      size={size}
      // Match the stroke the garden gives a placed tile, so the two read as the same piece.
      stroke="rgba(0, 0, 0, 0.4)"
      jitter={jitterBucket(`${tile.colour}:${tile.symbol}:${seed}`)}
    />
  );
}

// An empty tile slot: a faint hexagon placeholder marking unused storage capacity.
export function TileSlot({ size = 34 }: { size?: number }) {
  return <HexFace fill="#e7f1e0" size={size} stroke="none" className="tile-face tile-slot" />;
}

// A coin (wildcard payment piece): a round disc — a lighter face inside a darker rim — bearing the
// coin glyph. Drawn as an SVG to sit alongside the tiles, though its shape is a circle, not a hex.
export function CoinFace({ size = 34, seed = '' }: { size?: number; seed?: string | number }) {
  const d = size * 0.85; // coins read a touch smaller than the hex tiles beside them
  const r = d / 2;
  const pad = 0.5;
  return (
    <svg
      className="coin-face"
      data-jitter={jitterBucket(`coin:${seed}`)}
      width={d.toFixed(2)}
      height={d.toFixed(2)}
      viewBox={`${(-r - pad).toFixed(2)} ${(-r - pad).toFixed(2)} ${(d + 2 * pad).toFixed(2)} ${(d + 2 * pad).toFixed(2)}`}
      aria-hidden="true"
    >
      <circle cx={0} cy={0} r={r} fill="#c08a2e" />
      <circle cx={0} cy={0} r={r * 0.82} fill="#f3c34e" />
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={d * 0.5}
        fontWeight={700}
        fill="#7c5310"
      >
        {COIN_GLYPH}
      </text>
    </svg>
  );
}

// An expansion piece, drawn as a miniature rosette — the same shape it takes on the board: six
// pointy-top hexes ringing a hollow centre. One slot holds the expansion's identity tile (its
// colour + symbol); the other five are empty. A starter expansion (no identity) has all six empty.
const EXPANSION_IDENTITY_SLOT = 2; // which ring slot shows the identity tile (top-left)

// A real expansion's empty hexes take the saturated placed-but-empty green; a `placeholder` rosette
// (an empty storage slot) takes the muted --empty-slot-* green an unoccupied garden slot uses.
const EMPTY_HEX_FILL = '#bfe0a8';
const EMPTY_HEX_STROKE = '#7fb15f';
const PLACEHOLDER_HEX_FILL = 'var(--empty-slot-fill)';
const PLACEHOLDER_HEX_STROKE = 'var(--empty-slot-stroke)';

// `fill` makes the SVG stretch to fill its container (matching ExpansionOutline) instead of
// rendering at a fixed pixel size — used for a central pile, where the rosette should fill the frame.
export function ExpansionFace({
  expansion,
  size = 18,
  fill = false,
  placeholder = false,
  seed = '',
}: {
  expansion: Expansion;
  size?: number;
  fill?: boolean;
  placeholder?: boolean;
  seed?: string | number;
}) {
  const emptyFill = placeholder ? PLACEHOLDER_HEX_FILL : EMPTY_HEX_FILL;
  const emptyStroke = placeholder ? PLACEHOLDER_HEX_STROKE : EMPTY_HEX_STROKE;
  const id = expansion.identity;
  const jitter = jitterBucket(`${id ? `${id.colour}:${id.symbol}` : 'starter'}:${seed}`);
  const r = size; // circumradius of each hex in the rosette
  // Draw the identity hex last so its darker border is never overdrawn by an adjacent hex's lighter
  // one — it sits on top on all sides (same paint-order trick the board uses for placed expansions).
  const cells = DIR_AXIAL.map(([q, rr], i) => {
    const [cx, cy] = axialToPixel(q, rr, r);
    return { cx, cy, i };
  }).sort((a, b) => Number(a.i === EXPANSION_IDENTITY_SLOT) - Number(b.i === EXPANSION_IDENTITY_SLOT));
  const halfW = (r * Math.sqrt(3)) / 2;
  // Match ExpansionOutline's relative padding (0.2·R) so the rosette overlays the frame exactly.
  const pad = fill ? r * 0.2 : 1.5;
  const minX = Math.min(...cells.map((c) => c.cx)) - halfW - pad;
  const maxX = Math.max(...cells.map((c) => c.cx)) + halfW + pad;
  const minY = Math.min(...cells.map((c) => c.cy)) - r - pad;
  const maxY = Math.max(...cells.map((c) => c.cy)) + r + pad;
  const w = maxX - minX;
  const h = maxY - minY;
  return (
    <svg
      className={fill ? 'expansion-face expansion-face-fill' : 'expansion-face'}
      data-jitter={jitter}
      viewBox={`${minX.toFixed(2)} ${minY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`}
      {...(fill ? { preserveAspectRatio: 'xMidYMid meet' } : { width: w.toFixed(2), height: h.toFixed(2) })}
      role="img"
      aria-label={`${expansionLabel(expansion)} expansion`}
    >
      {cells.map((c) => {
        const isId = id !== null && c.i === EXPANSION_IDENTITY_SLOT;
        return (
          <g key={c.i}>
            <polygon
              points={hexPoints(c.cx, c.cy, r)}
              fill={isId ? COLOUR_HEX[id.colour] : emptyFill}
              stroke={isId ? 'rgba(0, 0, 0, 0.4)' : emptyStroke}
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
