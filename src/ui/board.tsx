// Presentation-only helpers for the Queen's Garden UI. No game logic lives here — that all
// stays in the engine (`src/queens-garden`). This file just maps the engine's abstract
// colours/symbols to pixels and lays the 7 hex expansions out on a grid.

import { DIR_AXIAL, SLOT_CENTRE } from '../queens-garden/garden';
import { symbolCost } from '../queens-garden/placement';
import type { Colour, Expansion, Symbol, Tile } from '../queens-garden/types';

// Board geometry is the engine's (the single source of truth shared with adjacency + scoring);
// re-exported so other UI modules can keep importing it from here.
export { DIR_AXIAL, SLOT_CENTRE };

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

// The 6 symbols → a Phosphor icon each (fill weight, MIT-licensed — phosphoricons.com). Each value
// is the `d` of a single path drawn in Phosphor's 256×256 viewBox; SymbolGlyph/SymbolIcon scale and
// centre it. Solid silhouettes read better than line art at tile size.
export const SYMBOL_VIEWBOX = 256;
export const SYMBOL_PATH: Record<Symbol, string> = {
  tree: 'M128,187.85a72.44,72.44,0,0,0,8,4.62V232a8,8,0,0,1-16,0V192.47A72.44,72.44,0,0,0,128,187.85ZM198.1,62.59a76,76,0,0,0-140.2,0A71.71,71.71,0,0,0,16,127.8C15.9,166,48,199,86.14,200A72.22,72.22,0,0,0,120,192.47V156.94L76.42,135.16a8,8,0,1,1,7.16-14.32L120,139.06V88a8,8,0,0,1,16,0v27.06l36.42-18.22a8,8,0,1,1,7.16,14.32L136,132.94v59.53A72.17,72.17,0,0,0,168,200l1.82,0C208,199,240.11,166,240,127.8A71.71,71.71,0,0,0,198.1,62.59Z',
  bird: 'M236.44,73.34,213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88A104.11,104.11,0,0,0,216,120V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12A12,12,0,0,1,164,80Z',
  butterflies: 'M128,100.17a108.42,108.42,0,0,0-8-12.64V56a8,8,0,0,1,16,0V87.53A108.42,108.42,0,0,0,128,100.17ZM232.7,50.48C229,45.7,221.84,40,209,40c-16.85,0-38.46,11.28-57.81,30.16A140.07,140.07,0,0,0,136,87.53V180a8,8,0,0,1-16,0V87.53a140.07,140.07,0,0,0-15.15-17.37C85.49,51.28,63.88,40,47,40,34.16,40,27,45.7,23.3,50.48c-6.82,8.77-12.18,24.08-.21,71.2,6.05,23.83,19.51,33,30.63,36.42A44,44,0,0,0,128,205.27a44,44,0,0,0,74.28-47.17c11.12-3.4,24.57-12.59,30.63-36.42C239.63,95.24,244.85,66.1,232.7,50.48Z',
  flower: 'M210.35,129.36c-.81-.47-1.7-.92-2.62-1.36.92-.44,1.81-.89,2.62-1.36a40,40,0,1,0-40-69.28c-.81.47-1.65,1-2.48,1.59.08-1,.13-2,.13-3a40,40,0,0,0-80,0c0,.94,0,1.94.13,3-.83-.57-1.67-1.12-2.48-1.59a40,40,0,1,0-40,69.28c.81.47,1.7.92,2.62,1.36-.92.44-1.81.89-2.62,1.36a40,40,0,1,0,40,69.28c.81-.47,1.65-1,2.48-1.59-.08,1-.13,2-.13,2.95a40,40,0,0,0,80,0c0-.94-.05-1.94-.13-2.95.83.57,1.67,1.12,2.48,1.59A39.79,39.79,0,0,0,190.29,204a40.43,40.43,0,0,0,10.42-1.38,40,40,0,0,0,9.64-73.28ZM128,156a28,28,0,1,1,28-28A28,28,0,0,1,128,156Z',
  herb: 'M223.45,40.07a8,8,0,0,0-7.52-7.52C139.8,28.08,78.82,51,52.82,94a87.09,87.09,0,0,0-12.76,49A101.72,101.72,0,0,0,46.7,175.2a4,4,0,0,0,6.61,1.43l85-86.3a8,8,0,0,1,11.32,11.32L56.74,195.94,42.55,210.13a8.2,8.2,0,0,0-.6,11.1,8,8,0,0,0,11.71.43l16.79-16.79c14.14,6.84,28.41,10.57,42.56,11.07q1.67.06,3.33.06A86.93,86.93,0,0,0,162,203.18C205,177.18,227.93,116.21,223.45,40.07Z',
  tulip: 'M208,48a87.48,87.48,0,0,0-35.36,7.43c-15.1-25.37-39.92-38-41.06-38.59a8,8,0,0,0-7.16,0c-1.14.58-26,13.22-41.06,38.59A87.48,87.48,0,0,0,48,48a8,8,0,0,0-8,8V96a88.11,88.11,0,0,0,80,87.63v35.43L83.58,200.84a8,8,0,1,0-7.16,14.32l48,24a8,8,0,0,0,7.16,0l48-24a8,8,0,0,0-7.16-14.32L136,219.06V183.63A88.11,88.11,0,0,0,216,96V56A8,8,0,0,0,208,48ZM56,96V64.44A72.1,72.1,0,0,1,120,136v31.56A72.1,72.1,0,0,1,56,96Zm144,0a72.1,72.1,0,0,1-64,71.56V136a72.1,72.1,0,0,1,64-71.56Z',
};

// Render a symbol icon as a centred <path> inside an existing SVG, scaled to sit in a hex of
// circumradius R at (cx, cy). White with a faint dark outline (painted behind the fill) so it stays
// legible on every tile colour, from light yellow to dark blue.
export function SymbolGlyph({
  path,
  cx = 0,
  cy = 0,
  R,
  className,
}: {
  path: string;
  cx?: number;
  cy?: number;
  R: number;
  className?: string;
}) {
  const box = R * 1.3; // icon bounding-box side, a touch wider than the inscribed circle
  const scale = box / SYMBOL_VIEWBOX;
  return (
    <path
      className={className}
      d={path}
      transform={`translate(${(cx - box / 2).toFixed(2)} ${(cy - box / 2).toFixed(2)}) scale(${scale.toFixed(4)})`}
      fill="#fff"
      stroke="rgba(0, 0, 0, 0.4)"
      strokeWidth={9}
      strokeLinejoin="round"
      paintOrder="stroke"
    />
  );
}

// A standalone symbol icon for HTML flow (e.g. a draft-chip label), inheriting the surrounding text
// colour via currentColor.
export function SymbolIcon({ symbol, size = 16 }: { symbol: Symbol; size?: number }) {
  return (
    <svg
      className="symbol-icon"
      width={size}
      height={size}
      viewBox={`0 0 ${SYMBOL_VIEWBOX} ${SYMBOL_VIEWBOX}`}
      aria-hidden="true"
    >
      <path d={SYMBOL_PATH[symbol]} fill="currentColor" />
    </svg>
  );
}

// The currency stamped on a coin (wildcard payment piece). Each value is the verbatim `d` of a
// Phosphor regular-weight icon (currency-eur/-gbp/-dollar/-jpy) in the 256×256 viewBox; CoinFace
// scales and centres it at render time, so these stay byte-for-byte copies of the source SVGs.
export type Currency = 'eur' | 'gbp' | 'usd' | 'jpy';
export const CURRENCY_PATH: Record<Currency, string> = {
  eur: 'M190,192.33a8,8,0,0,1-.63,11.3A80,80,0,0,1,56.4,152H40a8,8,0,0,1,0-16H56V120H40a8,8,0,0,1,0-16H56.4A80,80,0,0,1,189.34,52.37,8,8,0,0,1,178.66,64.3,64,64,0,0,0,72.52,104H136a8,8,0,0,1,0,16H72v16h48a8,8,0,0,1,0,16H72.52a64,64,0,0,0,106.14,39.71A8,8,0,0,1,190,192.33Z',
  gbp: 'M192,208a8,8,0,0,1-8,8H56a8,8,0,0,1,0-16h4a28,28,0,0,0,28-28V136H56a8,8,0,0,1,0-16H88V84a52,52,0,0,1,85.08-40.12A8,8,0,1,1,162.9,56.22,36,36,0,0,0,104,84v36h32a8,8,0,0,1,0,16H104v36a43.82,43.82,0,0,1-10.08,28H184A8,8,0,0,1,192,208Z',
  usd: 'M152,120H136V56h8a32,32,0,0,1,32,32,8,8,0,0,0,16,0,48.05,48.05,0,0,0-48-48h-8V24a8,8,0,0,0-16,0V40h-8a48,48,0,0,0,0,96h8v64H104a32,32,0,0,1-32-32,8,8,0,0,0-16,0,48.05,48.05,0,0,0,48,48h16v16a8,8,0,0,0,16,0V216h16a48,48,0,0,0,0-96Zm-40,0a32,32,0,0,1,0-64h8v64Zm40,80H136V136h16a32,32,0,0,1,0,64Z',
  jpy: 'M206.19,53.07,144.88,128H176a8,8,0,0,1,0,16H136v16h40a8,8,0,0,1,0,16H136v40a8,8,0,0,1-16,0V176H80a8,8,0,0,1,0-16h40V144H80a8,8,0,0,1,0-16h31.12L49.81,53.07A8,8,0,0,1,62.19,42.93L128,123.37l65.81-80.44a8,8,0,1,1,12.38,10.14Z',
};
export const COIN_CURRENCY: Currency = 'usd';

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
// pointy-top hex grid (DIR_AXIAL + SLOT_CENTRE come from the engine), and projected to pixels by
// axialToPixel().

// Pointy-top axial (q, r) → pixel centre, given the hexagon circumradius R.
export function axialToPixel(q: number, r: number, R: number): readonly [number, number] {
  return [R * Math.sqrt(3) * (q + r / 2), R * 1.5 * r];
}

// The six corners of a pointy-top hexagon (circumradius R, centred at cx,cy), as [x, y] pairs,
// starting at the top point and stepping 60° clockwise.
export function hexCorners(cx: number, cy: number, R: number): [number, number][] {
  const corners: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (90 + 60 * i); // start at the top point, step 60°
    corners.push([cx + R * Math.cos(a), cy - R * Math.sin(a)]);
  }
  return corners;
}

// The six corners of a pointy-top hexagon (circumradius R, centred at cx,cy) as an SVG points list.
export function hexPoints(cx: number, cy: number, R: number): string {
  return hexCorners(cx, cy, R)
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
}

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
  iconPath,
  size,
  stroke,
  strokeWidth = 1.5,
  fontSize,
  className = 'tile-face',
  jitter,
}: {
  fill?: string;
  glyph?: string;
  iconPath?: string; // a symbol icon (see SymbolGlyph); takes precedence over a text glyph
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
      {iconPath ? (
        <SymbolGlyph path={iconPath} R={R} />
      ) : (
        glyph && (
          <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={fontSize ?? R}>
            {glyph}
          </text>
        )
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
      iconPath={SYMBOL_PATH[tile.symbol]}
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

// A coin (wildcard payment piece):
export function CoinFace({ size = 34, seed = '' }: { size?: number; seed?: string | number }) {
  const d = size * 0.85; // coins read a touch smaller than the hex tiles beside them
  const r = d / 2;
  const pad = 0.5;
  const symBox = r * 1.1;
  const scale = symBox / 256;
  return (
    <svg
      className="coin-face"
      data-jitter={jitterBucket(`coin:${seed}`)}
      width={d.toFixed(2)}
      height={d.toFixed(2)}
      viewBox={`${(-r - pad).toFixed(2)} ${(-r - pad).toFixed(2)} ${(d + 2 * pad).toFixed(2)} ${(d + 2 * pad).toFixed(2)}`}
      aria-hidden="true"
    >
      <circle cx={0} cy={0} r={r} fill="#c08a2e" /> {/* rim */}
      <circle cx={0} cy={0} r={r * 0.82} fill="#f3c34e" /> {/* face */}
      <path
        d={CURRENCY_PATH[COIN_CURRENCY]}
        transform={`translate(${(-symBox / 2).toFixed(2)} ${(-symBox / 2).toFixed(2)}) scale(${scale.toFixed(4)})`}
        fill="#fff"
        stroke="rgba(0, 0, 0, 0.4)"
        strokeWidth={9}
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  );
}

// An expansion piece, drawn as a miniature rosette — the same shape it takes on the board: six
// pointy-top hexes ringing a hollow centre. One slot holds the expansion's identity tile (its
// colour + symbol); the other five are empty. A starter expansion (no identity) has all six empty.
//
// The identity tile sits in the ring slot that names its placement cost: the six slots are numbered
// 1–6 clockwise from the top-left, and an identity's cost (symbolCost: tree=1 … tulip=6) picks one.
// COST_SLOT_DIR maps a cost (1-based) to its DIR_AXIAL index — 2(top-left), 3(top-right), 4(right),
// 5(bottom-right), 0(bottom-left), 1(left). A starter (no identity) has nothing to place; it falls
// back to the top-left slot, but every hex is empty so the choice is invisible.
const COST_SLOT_DIR = [2, 3, 4, 5, 0, 1] as const;
const STARTER_SLOT_DIR = 2;

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
  const identitySlot = id ? COST_SLOT_DIR[symbolCost(id.symbol) - 1] : STARTER_SLOT_DIR;
  const jitter = jitterBucket(`${id ? `${id.colour}:${id.symbol}` : 'starter'}:${seed}`);
  const r = size; // circumradius of each hex in the rosette
  // Draw the identity hex last so its darker border is never overdrawn by an adjacent hex's lighter
  // one — it sits on top on all sides (same paint-order trick the board uses for placed expansions).
  const cells = DIR_AXIAL.map(([q, rr], i) => {
    const [cx, cy] = axialToPixel(q, rr, r);
    return { cx, cy, i };
  }).sort((a, b) => Number(a.i === identitySlot) - Number(b.i === identitySlot));
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
        const isId = id !== null && c.i === identitySlot;
        return (
          <g key={c.i}>
            <polygon
              points={hexPoints(c.cx, c.cy, r)}
              fill={isId ? COLOUR_HEX[id.colour] : emptyFill}
              stroke={isId ? 'rgba(0, 0, 0, 0.4)' : emptyStroke}
              strokeWidth={1.5}
            />
            {isId && <SymbolGlyph path={SYMBOL_PATH[id.symbol]} cx={c.cx} cy={c.cy} R={r} />}
          </g>
        );
      })}
    </svg>
  );
}
