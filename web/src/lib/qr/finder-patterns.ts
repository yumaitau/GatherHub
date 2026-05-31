/**
 * SVG renderers for the three 7x7 finder patterns in QR codes.
 * Each pattern has an outer ring (7x7), a gap, and an inner square (3x3).
 */

import type { CornerSquareStyle } from "./types";

function renderSquareFinder(
  x: number,
  y: number,
  cellSize: number,
  fgColor: string,
  bgColor: string,
): string {
  const outer = cellSize * 7;
  const inner = cellSize * 3;
  const gap = cellSize * 5;
  const gapOffset = cellSize;

  return (
    `<rect x="${x}" y="${y}" width="${outer}" height="${outer}" fill="${fgColor}"/>` +
    `<rect x="${x + gapOffset}" y="${y + gapOffset}" width="${gap}" height="${gap}" fill="${bgColor}"/>` +
    `<rect x="${x + cellSize * 2}" y="${y + cellSize * 2}" width="${inner}" height="${inner}" fill="${fgColor}"/>`
  );
}

function renderRoundedFinder(
  x: number,
  y: number,
  cellSize: number,
  fgColor: string,
  bgColor: string,
): string {
  const outer = cellSize * 7;
  const inner = cellSize * 3;
  const gap = cellSize * 5;
  const gapOffset = cellSize;
  const outerR = cellSize * 1.4;
  const gapR = cellSize * 0.8;
  const innerR = cellSize * 0.6;

  return (
    `<rect x="${x}" y="${y}" width="${outer}" height="${outer}" rx="${outerR}" fill="${fgColor}"/>` +
    `<rect x="${x + gapOffset}" y="${y + gapOffset}" width="${gap}" height="${gap}" rx="${gapR}" fill="${bgColor}"/>` +
    `<rect x="${x + cellSize * 2}" y="${y + cellSize * 2}" width="${inner}" height="${inner}" rx="${innerR}" fill="${fgColor}"/>`
  );
}

function renderDotsFinder(
  x: number,
  y: number,
  cellSize: number,
  fgColor: string,
  bgColor: string,
): string {
  const parts: string[] = [];

  // Outer ring: circles around the perimeter (7x7 grid, only border cells)
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const isOuter = row === 0 || row === 6 || col === 0 || col === 6;
      const isInner = row >= 2 && row <= 4 && col >= 2 && col <= 4;

      if (isOuter || isInner) {
        const cx = x + col * cellSize + cellSize / 2;
        const cy = y + row * cellSize + cellSize / 2;
        const r = cellSize * 0.42;
        const color = isOuter || isInner ? fgColor : bgColor;
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`);
      }
    }
  }

  // White gap circles (row 1-5, col 1-5 minus inner)
  for (let row = 1; row < 6; row++) {
    for (let col = 1; col < 6; col++) {
      const isInner = row >= 2 && row <= 4 && col >= 2 && col <= 4;
      if (!isInner) {
        const cx = x + col * cellSize + cellSize / 2;
        const cy = y + row * cellSize + cellSize / 2;
        const r = cellSize * 0.42;
        parts.push(
          `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${bgColor}"/>`,
        );
      }
    }
  }

  return parts.join("");
}

export function renderFinderPattern(
  x: number,
  y: number,
  cellSize: number,
  style: CornerSquareStyle,
  fgColor: string,
  bgColor: string,
): string {
  switch (style) {
    case "rounded":
      return renderRoundedFinder(x, y, cellSize, fgColor, bgColor);
    case "dots":
      return renderDotsFinder(x, y, cellSize, fgColor, bgColor);
    case "square":
    default:
      return renderSquareFinder(x, y, cellSize, fgColor, bgColor);
  }
}
