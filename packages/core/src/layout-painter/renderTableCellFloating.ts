/**
 * Floating-image extraction for table cells.
 *
 * Pulls anchored/floating images out of a cell's paragraphs and computes their
 * positions relative to the cell content area. Split out of renderTable.ts so
 * that file stays focused on row/cell/fragment painting.
 */

import type {
  ImageRun,
  ParagraphBlock,
  ParagraphMeasure,
  TableCell,
  TableCellMeasure,
  TableMeasure,
} from '../layout-engine/types';
import { emuToPixels } from '../utils/units';
import { imageWrapTextFromCssFloat, isFloatingImageRun } from './floatingImageFlow';

/** Info about a floating image extracted from a cell paragraph */
export interface CellFloatingImage {
  src: string;
  width: number;
  height: number;
  alt?: string;
  transform?: string;
  x: number;
  y: number;
  side: 'left' | 'right';
  distTop: number;
  distBottom: number;
  distLeft: number;
  distRight: number;
  /** OOXML wrapText: which side(s) TEXT flows on */
  wrapText?: 'bothSides' | 'left' | 'right' | 'largest';
  /** Wrap type (square, tight, through, behind, inFront) */
  wrapType?: string;
  /**
   * Tight/through wrap contour (`wp:wrapPolygon`), normalized to [0, 1]
   * fractions of the image extent.
   */
  wrapPolygon?: { x: number; y: number }[];
  pmStart?: number;
  pmEnd?: number;
}

/**
 * Extract floating images from cell paragraphs and compute their positions
 * relative to the cell content area.
 *
 * NOTE: The horizontal/vertical position logic here mirrors
 * extractFloatingImagesFromParagraph() in renderPage.ts. Kept separate
 * because the coordinate systems differ (cell-relative vs page-relative).
 */
export function extractCellFloatingImages(
  cell: TableCell,
  cellMeasure: TableCellMeasure,
  contentWidth: number
): CellFloatingImage[] {
  const result: CellFloatingImage[] = [];
  let paragraphY = 0;

  for (let blockIndex = 0; blockIndex < cell.blocks.length; blockIndex++) {
    const block = cell.blocks[blockIndex];
    if (block?.kind !== 'paragraph') {
      // Use actual measured height for Y tracking
      const blockMeasure = cellMeasure.blocks[blockIndex];
      if (blockMeasure && blockMeasure.kind === 'table') {
        paragraphY += (blockMeasure as TableMeasure).totalHeight ?? 0;
      }
      continue;
    }
    const pBlock = block as ParagraphBlock;

    for (const run of pBlock.runs) {
      if (run.kind !== 'image') continue;
      const imgRun = run as ImageRun;
      if (!isFloatingImageRun(imgRun)) continue;

      const position = imgRun.position;
      const distTop = imgRun.distTop ?? 0;
      const distBottom = imgRun.distBottom ?? 0;
      const distLeft = imgRun.distLeft ?? 12;
      const distRight = imgRun.distRight ?? 12;

      // Horizontal position within cell
      let side: 'left' | 'right' = 'left';
      let x = 0;

      if (position?.horizontal) {
        const h = position.horizontal;
        if (h.align === 'right') {
          side = 'right';
          x = contentWidth - imgRun.width;
        } else if (h.align === 'left') {
          x = 0;
        } else if (h.align === 'center') {
          x = (contentWidth - imgRun.width) / 2;
        } else if (h.posOffset !== undefined) {
          x = emuToPixels(h.posOffset);
          side = x > contentWidth / 2 ? 'right' : 'left';
        }
      } else if (imgRun.cssFloat === 'right') {
        side = 'right';
        x = contentWidth - imgRun.width;
      }

      // Vertical position within cell
      let y = paragraphY;
      if (position?.vertical) {
        const v = position.vertical;
        if (v.posOffset !== undefined) {
          y = paragraphY + emuToPixels(v.posOffset);
        } else if (v.align === 'top') {
          y = 0;
        }
      }

      // Clamp within cell bounds (content area). Multiple images in the same
      // cell keep their own anchor offsets; clamping only prevents escape.
      // Y is clamped to >= 0 so a negative paragraph-relative offset cannot
      // place the image above the cell content.
      x = Math.max(0, Math.min(x, Math.max(0, contentWidth - imgRun.width)));
      y = Math.max(0, y);

      result.push({
        src: imgRun.src,
        width: imgRun.width,
        height: imgRun.height,
        alt: imgRun.alt,
        transform: imgRun.transform,
        x,
        y,
        side,
        distTop,
        distBottom,
        distLeft,
        distRight,
        // Prefer the OOXML wrapText carried on the run; fall back to the
        // cssFloat-derived direction for runs that predate the plumbing.
        wrapText: imgRun.wrapText ?? imageWrapTextFromCssFloat(imgRun.cssFloat),
        wrapType: imgRun.wrapType,
        wrapPolygon: imgRun.wrapPolygon,
        pmStart: imgRun.pmStart,
        pmEnd: imgRun.pmEnd,
      });
    }

    // Use actual measured height for Y tracking
    const blockMeasure = cellMeasure.blocks[blockIndex];
    if (blockMeasure && blockMeasure.kind === 'paragraph') {
      paragraphY += (blockMeasure as ParagraphMeasure).totalHeight;
    }
  }

  cascadeOverlappingFloats(result);

  return result;
}

/**
 * Push overlapping same-cell floats apart vertically so they never paint on
 * top of each other. Word repositions colliding anchored objects when
 * `allowOverlap="0"`; inside a table cell the author's explicit offsets are
 * frequently identical (e.g. duplicated anchors), so without this the
 * images stack exactly and only the top one is visible.
 *
 * Iterates in anchor order (stable): each float keeps its X and moves down
 * only as far as needed to clear every earlier float it intersects
 * (including wrap distances). Paint and zone building both consume the
 * cascaded list, so text wrapping agrees with the painted positions.
 */
function cascadeOverlappingFloats(images: CellFloatingImage[]): void {
  for (let i = 1; i < images.length; i++) {
    const current = images[i];
    if (!current) continue;
    const currentLeft = current.x - current.distLeft;
    const currentRight = current.x + current.width + current.distRight;
    let y = current.y;
    for (let j = 0; j < i; j++) {
      const placed = images[j];
      if (!placed) continue;
      const placedLeft = placed.x - placed.distLeft;
      const placedRight = placed.x + placed.width + placed.distRight;
      const overlapsX = currentLeft < placedRight && currentRight > placedLeft;
      if (!overlapsX) continue;
      const placedBottom = placed.y + placed.height + placed.distBottom;
      if (y - current.distTop < placedBottom) {
        y = placedBottom + current.distTop;
      }
    }
    current.y = y;
  }
}
