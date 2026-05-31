/**
 * Isomorphic QR code SVG renderer.
 * Takes raw QR matrix data and settings, returns a complete SVG string.
 * Works in both browser and Node.js (no DOM dependencies).
 */

import type { QRMatrix, QRSettings } from "./types";
import { LOGO_SIZE_PERCENT } from "./types";
import { DOT_RENDERERS, type Neighbors } from "./dot-styles";
import { renderFinderPattern } from "./finder-patterns";

function isFinderZone(row: number, col: number, matrixSize: number): boolean {
  // Top-left 7x7
  if (row < 7 && col < 7) return true;
  // Top-right 7x7
  if (row < 7 && col >= matrixSize - 7) return true;
  // Bottom-left 7x7
  if (row >= matrixSize - 7 && col < 7) return true;
  return false;
}

export function renderQRCodeSVG(
  matrix: QRMatrix,
  settings: QRSettings,
  logoUrl?: string | null,
): string {
  const {
    fgColor,
    bgColor,
    dotStyle,
    cornerSquareStyle,
    margin,
    borderEnabled,
    borderColor,
    borderWidth,
    borderRadius,
    logoSize,
  } = settings;
  const moduleCount = matrix.size;
  const totalModules = moduleCount + margin * 2;
  const cellSize = settings.size / totalModules;
  const svgSize = settings.size;

  const dotRenderer = (DOT_RENDERERS[dotStyle] ?? DOT_RENDERERS.square)!;

  const parts: string[] = [];

  // SVG open
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="${svgSize}" height="${svgSize}" shape-rendering="crispEdges">`,
  );

  // Background
  parts.push(
    `<rect width="${svgSize}" height="${svgSize}" fill="${bgColor}"/>`,
  );

  // Helper to check if a module is filled
  const isFilled = (row: number, col: number): boolean => {
    if (row < 0 || row >= moduleCount || col < 0 || col >= moduleCount)
      return false;
    return matrix.data[row * moduleCount + col] === 1;
  };

  // Data modules path
  const pathParts: string[] = [];
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!isFilled(row, col)) continue;
      if (isFinderZone(row, col, moduleCount)) continue;

      const x = (col + margin) * cellSize;
      const y = (row + margin) * cellSize;

      const neighbors: Neighbors = {
        top: isFilled(row - 1, col),
        right: isFilled(row, col + 1),
        bottom: isFilled(row + 1, col),
        left: isFilled(row, col - 1),
      };

      pathParts.push(dotRenderer(x, y, cellSize, neighbors));
    }
  }

  if (pathParts.length > 0) {
    parts.push(`<path d="${pathParts.join("")}" fill="${fgColor}"/>`);
  }

  // Finder patterns
  const finderPositions = [
    { row: 0, col: 0 }, // top-left
    { row: 0, col: moduleCount - 7 }, // top-right
    { row: moduleCount - 7, col: 0 }, // bottom-left
  ];

  for (const pos of finderPositions) {
    const fx = (pos.col + margin) * cellSize;
    const fy = (pos.row + margin) * cellSize;
    parts.push(
      renderFinderPattern(
        fx,
        fy,
        cellSize,
        cornerSquareStyle,
        fgColor,
        bgColor,
      ),
    );
  }

  // Logo
  if (logoUrl) {
    const logoPct = LOGO_SIZE_PERCENT[logoSize] || LOGO_SIZE_PERCENT.medium;
    const logoPixelSize = Math.round(svgSize * logoPct);
    const padding = Math.round(logoPixelSize * 0.12);
    const boxSize = logoPixelSize + padding * 2;
    const boxPos = Math.round((svgSize - boxSize) / 2);
    const logoPos = boxPos + padding;
    const rx = Math.round(boxSize * 0.06);

    parts.push(
      `<rect x="${boxPos}" y="${boxPos}" width="${boxSize}" height="${boxSize}" fill="${bgColor}" rx="${rx}"/>` +
        `<image href="${logoUrl}" x="${logoPos}" y="${logoPos}" width="${logoPixelSize}" height="${logoPixelSize}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }

  // Border
  if (borderEnabled && borderWidth > 0) {
    const half = borderWidth / 2;
    parts.push(
      `<rect x="${half}" y="${half}" width="${svgSize - borderWidth}" height="${svgSize - borderWidth}" fill="none" stroke="${borderColor}" stroke-width="${borderWidth}" rx="${borderRadius}"/>`,
    );
  }

  parts.push("</svg>");
  return parts.join("");
}
