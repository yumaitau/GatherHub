/**
 * SVG path generators for each QR dot style.
 * Each function returns an SVG path string for a single module.
 *
 * neighbors: { top, right, bottom, left } - whether adjacent cells are filled
 */

export interface Neighbors {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

type DotRenderer = (
  x: number,
  y: number,
  cellSize: number,
  neighbors: Neighbors,
) => string;

/** Simple filled rectangle */
export const squareDot: DotRenderer = (x, y, cellSize) => {
  return `M${x},${y}h${cellSize}v${cellSize}h${-cellSize}z`;
};

/** Rectangle with rounded exposed corners (neighbor-aware) */
export const roundedDot: DotRenderer = (x, y, cellSize, neighbors) => {
  const r = cellSize * 0.4;
  const s = cellSize;

  // Which corners to round (round if no neighbor on both adjacent sides)
  const tl = !neighbors.top && !neighbors.left;
  const tr = !neighbors.top && !neighbors.right;
  const br = !neighbors.right && !neighbors.bottom;
  const bl = !neighbors.bottom && !neighbors.left;

  let d = `M${x + (tl ? r : 0)},${y}`;

  // Top edge
  if (tr) {
    d += `h${s - (tl ? r : 0) - r}a${r},${r},0,0,1,${r},${r}`;
  } else {
    d += `h${s - (tl ? r : 0)}`;
  }

  // Right edge
  if (br) {
    d += `v${s - (tr ? r : 0) - r}a${r},${r},0,0,1,${-r},${r}`;
  } else {
    d += `v${s - (tr ? r : 0)}`;
  }

  // Bottom edge
  if (bl) {
    d += `h${-(s - (br ? r : 0) - r)}a${r},${r},0,0,1,${-r},${-r}`;
  } else {
    d += `h${-(s - (br ? r : 0))}`;
  }

  // Left edge
  if (tl) {
    d += `v${-(s - (bl ? r : 0) - r)}a${r},${r},0,0,1,${r},${-r}`;
  } else {
    d += `v${-(s - (bl ? r : 0))}`;
  }

  d += "z";
  return d;
};

/** Circle centered in cell */
export const dotsDot: DotRenderer = (x, y, cellSize) => {
  const cx = x + cellSize / 2;
  const cy = y + cellSize / 2;
  const r = cellSize * 0.42;
  return (
    `M${cx - r},${cy}` +
    `a${r},${r},0,1,0,${r * 2},0` +
    `a${r},${r},0,1,0,${-(r * 2)},0z`
  );
};

/** Square with one rounded corner (bottom-right) */
export const classyDot: DotRenderer = (x, y, cellSize) => {
  const r = cellSize * 0.4;
  const s = cellSize;
  return (
    `M${x},${y}h${s}v${s - r}` + `a${r},${r},0,0,1,${-r},${r}` + `h${-(s - r)}z`
  );
};

/** Square with all corners variably rounded */
export const classyRoundedDot: DotRenderer = (x, y, cellSize, neighbors) => {
  const r = cellSize * 0.3;
  const s = cellSize;

  const tl = !neighbors.top && !neighbors.left ? r : 0;
  const tr = !neighbors.top && !neighbors.right ? r : 0;
  const br = !neighbors.right && !neighbors.bottom ? r : 0;
  const bl = !neighbors.bottom && !neighbors.left ? r : 0;

  let d = `M${x + tl},${y}`;
  d += `h${s - tl - tr}`;
  if (tr) d += `a${tr},${tr},0,0,1,${tr},${tr}`;
  d += `v${s - tr - br}`;
  if (br) d += `a${br},${br},0,0,1,${-br},${br}`;
  d += `h${-(s - br - bl)}`;
  if (bl) d += `a${bl},${bl},0,0,1,${-bl},${-bl}`;
  d += `v${-(s - bl - tl)}`;
  if (tl) d += `a${tl},${tl},0,0,1,${tl},${-tl}`;
  d += "z";

  return d;
};

export const DOT_RENDERERS: Record<string, DotRenderer> = {
  square: squareDot,
  rounded: roundedDot,
  dots: dotsDot,
  classy: classyDot,
  "classy-rounded": classyRoundedDot,
};
