import type { WrapTextDirection } from '../../layout-engine/types';
import type { WrapPolygonPoint } from '../../types/content/image';
import { clampFloatingWrapMargins } from './measureParagraph';

export interface FloatingExclusionRect {
  /** Which side the object is on for simple one-sided wrapping. */
  side: 'left' | 'right';
  /** X position relative to the content area. */
  x: number;
  /** Y position relative to the content area. */
  y: number;
  width: number;
  height: number;
  distTop: number;
  distBottom: number;
  distLeft: number;
  distRight: number;
  wrapText?: WrapTextDirection;
  wrapType?: string;
  /**
   * Tight/through wrap contour (`wp:wrapPolygon`), normalized to [0, 1]
   * fractions of the image extent. Rectangular polygons shrink the
   * exclusion box to the polygon bbox; non-rectangular ones produce a
   * per-line contour (see `WrapContour`).
   */
  wrapPolygon?: WrapPolygonPoint[];
}

/**
 * Per-line wrap contour for a tight/through image whose wrap polygon is
 * not rectangular. The polygon is evaluated at each text line's vertical
 * position, so text hugs the image shape (e.g. a triangle excludes a wide
 * band at the top and a narrow one at the bottom) instead of the full
 * bounding box.
 *
 * All coordinates share the zone's content-relative space.
 */
export interface WrapContour {
  /** Normalized polygon vertices (fractions of the image extent). */
  polygon: WrapPolygonPoint[];
  /** Image rect (without wrap distances). */
  imgX: number;
  imgY: number;
  imgW: number;
  imgH: number;
  distLeft: number;
  distRight: number;
  wrapText?: WrapTextDirection;
  side: 'left' | 'right';
  /** Content width the zone was built against (for right-side margins). */
  contentWidth: number;
}

export interface FloatingImageZone {
  leftMargin: number;
  rightMargin: number;
  topY: number;
  bottomY: number;
  segments?: FloatingLineSegmentZone[];
  /**
   * Full-width vertical band (OOXML `topAndBottom` wrap): no text fits beside
   * it, so any line overlapping `[topY, bottomY]` is pushed below the band.
   */
  fullWidthBlock?: boolean;
  /**
   * Tight/through wrap contour for non-rectangular polygons. The scalar
   * margins above stay as the bounding-box fallback (used by
   * `findClearLineY` range scans); `getFloatingMargins` refines them
   * per line from the contour.
   */
  contour?: WrapContour;
}

export interface FloatingLineSegmentZone {
  leftOffset: number;
  availableWidth: number;
}

export interface FloatingLineMargins {
  leftMargin: number;
  rightMargin: number;
  segments?: FloatingLineSegmentZone[];
}

export function rectsToFloatingZones(
  rects: FloatingExclusionRect[],
  contentWidth: number
): FloatingImageZone[] {
  return rects.map((rect) => {
    let rectLeft = rect.x - rect.distLeft;
    let rectRight = rect.x + rect.width + rect.distRight;
    let rectTop = rect.y - rect.distTop;
    let rectBottom = rect.y + rect.height + rect.distBottom;

    // Tight/through wrap polygon: rectangular polygons shrink the exclusion
    // box to the polygon bbox (an inset rectangle wraps tighter than the
    // image bounds); a full-bleed rectangle is identical to square. The
    // non-rectangular case attaches a per-line contour below.
    const polygon =
      rect.wrapType === 'tight' || rect.wrapType === 'through' ? rect.wrapPolygon : undefined;
    if (polygon && polygon.length >= 3) {
      const box = polygonBoundingBox(polygon);
      if (box) {
        if (isAxisAlignedRectangle(polygon, box)) {
          rectLeft = rect.x + box.minX * rect.width - rect.distLeft;
          rectRight = rect.x + box.maxX * rect.width + rect.distRight;
          rectTop = rect.y + box.minY * rect.height - rect.distTop;
          rectBottom = rect.y + box.maxY * rect.height + rect.distBottom;
        }
      }
    }

    // topAndBottom: full-width band, no side wrap. Lines overlapping the band
    // flow above/below it (handled in getFloatingMargins / findClearLineY).
    if (rect.wrapType === 'topAndBottom') {
      return {
        leftMargin: 0,
        rightMargin: 0,
        topY: rectTop,
        bottomY: rectBottom,
        fullWidthBlock: true,
      };
    }

    const wrapText = rect.wrapText ?? 'bothSides';

    const { leftMargin, rightMargin, segments } = marginsForSpan(
      rectLeft,
      rectRight,
      contentWidth,
      wrapText,
      rect.side
    );

    // Non-rectangular tight/through contour: keep the bounding-box margins
    // above as the fallback and attach the polygon for per-line refinement
    // in getFloatingMargins.
    let contour: WrapContour | undefined;
    if (
      polygon &&
      polygon.length >= 3 &&
      !isAxisAlignedRectangle(polygon, polygonBoundingBox(polygon))
    ) {
      contour = {
        polygon,
        imgX: rect.x,
        imgY: rect.y,
        imgW: rect.width,
        imgH: rect.height,
        distLeft: rect.distLeft,
        distRight: rect.distRight,
        wrapText,
        side: rect.side,
        contentWidth,
      };
    }

    // Clamp margins that exceed contentWidth (near-full-width floats whose
    // outer edge sits past the content area). Without this, body text after
    // the float collapses to ~1 glyph per line. Segments-based wrapping
    // (centered both-sides) already keeps leftMargin/rightMargin at 0, so
    // the clamp is a no-op there.
    const clamped = clampFloatingWrapMargins(leftMargin, rightMargin, contentWidth);
    return {
      leftMargin: clamped.leftMargin,
      rightMargin: clamped.rightMargin,
      topY: rectTop,
      bottomY: rectBottom,
      segments,
      contour,
    };
  });
}

/**
 * Resolve side margins (or centered split segments) for a horizontal
 * exclusion span `[spanLeft, spanRight]` under a wrap direction. Shared by
 * the bounding-box path (`rectsToFloatingZones`) and the per-line contour
 * path (`contourMarginsForLine`) so both agree on wrapText semantics.
 */
function marginsForSpan(
  spanLeft: number,
  spanRight: number,
  contentWidth: number,
  wrapText: WrapTextDirection,
  side: 'left' | 'right'
): { leftMargin: number; rightMargin: number; segments?: FloatingLineSegmentZone[] } {
  if (wrapText === 'right') {
    return { leftMargin: leftObjectMargin(spanRight), rightMargin: 0 };
  }
  if (wrapText === 'left') {
    return { leftMargin: 0, rightMargin: rightObjectMargin(spanLeft, contentWidth) };
  }
  if (wrapText === 'largest') {
    const { leftMargin, rightMargin } = largestSideMargins(spanLeft, spanRight, contentWidth);
    return { leftMargin, rightMargin };
  }
  if (canSplitCenteredBothSidesWrap(spanLeft, spanRight, contentWidth)) {
    return {
      leftMargin: 0,
      rightMargin: 0,
      segments: centeredWrapSegments(spanLeft, spanRight, contentWidth),
    };
  }
  if (side === 'left') {
    return { leftMargin: leftObjectMargin(spanRight), rightMargin: 0 };
  }
  return { leftMargin: 0, rightMargin: rightObjectMargin(spanLeft, contentWidth) };
}

/** Normalized bbox of a wrap polygon, or null when it has no extent. */
function polygonBoundingBox(
  polygon: WrapPolygonPoint[]
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
  return { minX, maxX, minY, maxY };
}

/**
 * True when every polygon vertex is a bbox corner — i.e. the polygon is an
 * axis-aligned rectangle (possibly with extra collinear vertices or a
 * closing duplicate point, possibly inset from the image bounds). A vertex
 * merely sitting on a bbox edge (e.g. a triangle apex at mid-width) does
 * not qualify: it needs the per-line contour path.
 */
function isAxisAlignedRectangle(
  polygon: WrapPolygonPoint[],
  box: { minX: number; maxX: number; minY: number; maxY: number } | null
): boolean {
  if (!box) return false;
  const eps = 1e-6;
  for (const p of polygon) {
    const onVerticalEdge = Math.abs(p.x - box.minX) < eps || Math.abs(p.x - box.maxX) < eps;
    const onHorizontalEdge = Math.abs(p.y - box.minY) < eps || Math.abs(p.y - box.maxY) < eps;
    if (!onVerticalEdge || !onHorizontalEdge) return false;
  }
  return true;
}

/**
 * Horizontal span of a polygon at normalized height `fy` (even-odd scanline:
 * collect edge crossings, take min/max). Returns null when the scanline
 * misses the polygon (degenerate input) — callers fall back to the
 * bounding-box margins.
 */
export function polygonSpanAtY(
  polygon: WrapPolygonPoint[],
  fy: number
): { minX: number; maxX: number } | null {
  // Clamp off the exact bottom edge: with half-open edge intervals a scanline
  // exactly at maxY crosses nothing.
  const y = Math.min(0.999999, Math.max(0, fy));
  const crossings: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if (a.y === b.y) continue;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo || y >= hi) continue;
    const t = (y - a.y) / (b.y - a.y);
    crossings.push(a.x + t * (b.x - a.x));
  }
  if (crossings.length < 2) return null;
  return { minX: Math.min(...crossings), maxX: Math.max(...crossings) };
}

export function getFloatingAvailableWidth(margins: FloatingLineMargins, baseWidth: number): number {
  const segmentWidth = margins.segments?.reduce((sum, segment) => sum + segment.availableWidth, 0);
  return segmentWidth ?? baseWidth - margins.leftMargin - margins.rightMargin;
}

export function getFloatingMargins(
  lineY: number,
  lineHeight: number,
  zones: FloatingImageZone[] | undefined,
  paragraphYOffset: number
): FloatingLineMargins {
  if (!zones || zones.length === 0) {
    return { leftMargin: 0, rightMargin: 0 };
  }

  let leftMargin = 0;
  let rightMargin = 0;
  let segments: FloatingLineSegmentZone[] | undefined;

  const absoluteLineTop = paragraphYOffset + lineY;
  const absoluteLineBottom = absoluteLineTop + lineHeight;

  for (const zone of zones) {
    if (absoluteLineBottom <= zone.topY || absoluteLineTop >= zone.bottomY) continue;
    if (zone.fullWidthBlock) {
      // No room beside a full-width band: a zero-width segment forces the
      // available width to 0, which findClearLineY uses to push the line below.
      return { leftMargin: 0, rightMargin: 0, segments: [{ leftOffset: 0, availableWidth: 0 }] };
    }
    // Non-rectangular tight/through contour: refine the bounding-box margins
    // per line from the polygon. Falls back to the scalar margins when the
    // line misses the polygon (degenerate input).
    if (zone.contour) {
      const refined = contourMarginsForLine(zone.contour, absoluteLineTop, absoluteLineBottom);
      if (refined) {
        if (refined.segments?.length) {
          segments = segments ? intersectSegments(segments, refined.segments) : refined.segments;
        } else {
          leftMargin = Math.max(leftMargin, refined.leftMargin);
          rightMargin = Math.max(rightMargin, refined.rightMargin);
        }
        continue;
      }
    }
    if (zone.segments?.length) {
      segments = segments ? intersectSegments(segments, zone.segments) : zone.segments;
      continue;
    }
    leftMargin = Math.max(leftMargin, zone.leftMargin);
    rightMargin = Math.max(rightMargin, zone.rightMargin);
  }

  return { leftMargin, rightMargin, segments };
}

/**
 * Per-line margins for a wrap-contour zone: intersect the polygon at the
 * line's vertical middle and resolve side margins for that span. Returns
 * null when the scanline misses the polygon so the caller falls back to
 * the zone's bounding-box margins.
 */
function contourMarginsForLine(
  contour: WrapContour,
  absoluteLineTop: number,
  absoluteLineBottom: number
): FloatingLineMargins | null {
  if (contour.imgH <= 0 || contour.imgW <= 0) return null;
  const midY = (absoluteLineTop + absoluteLineBottom) / 2;
  const fy = (midY - contour.imgY) / contour.imgH;
  const span = polygonSpanAtY(contour.polygon, fy);
  if (!span) return null;
  const spanLeft = contour.imgX + span.minX * contour.imgW - contour.distLeft;
  const spanRight = contour.imgX + span.maxX * contour.imgW + contour.distRight;
  const margins = marginsForSpan(
    spanLeft,
    spanRight,
    contour.contentWidth,
    contour.wrapText ?? 'bothSides',
    contour.side
  );
  const clamped = clampFloatingWrapMargins(
    margins.leftMargin,
    margins.rightMargin,
    contour.contentWidth
  );
  return {
    leftMargin: clamped.leftMargin,
    rightMargin: clamped.rightMargin,
    segments: margins.segments,
  };
}

/**
 * Find the next vertical position at or below `startY` where the available
 * text width is at least `minWidth`. Used to skip lines past stacked floats
 * when there is no horizontal room for meaningful text at the current Y.
 *
 * Returns `startY` if the current position already has enough room, otherwise
 * the lowest `bottomY` of any zone currently obstructing the line. The caller
 * is expected to re-query margins at the returned Y.
 */
export function findClearLineY(
  startY: number,
  lineHeight: number,
  zones: FloatingImageZone[] | undefined,
  contentWidth: number,
  minWidth: number
): number {
  if (!zones || zones.length === 0) return startY;

  let y = startY;
  // Bounded loop — at most one step per zone the line currently overlaps,
  // plus a safety cushion. Prevents pathological re-entry while keeping the
  // happy path O(zones).
  for (let i = 0; i < zones.length + 2; i++) {
    const margins = getFloatingMargins(y, lineHeight, zones, 0);
    const width = getFloatingAvailableWidth(margins, contentWidth);
    if (width >= minWidth) return y;

    const lineBottom = y + lineHeight;
    let nextY = Infinity;
    for (const zone of zones) {
      if (lineBottom <= zone.topY || y >= zone.bottomY) continue;
      if (zone.bottomY > y && zone.bottomY < nextY) {
        nextY = zone.bottomY;
      }
    }
    if (!Number.isFinite(nextY) || nextY <= y) return y;
    y = nextY;
  }
  return y;
}

function intersectSegments(
  a: FloatingLineSegmentZone[],
  b: FloatingLineSegmentZone[]
): FloatingLineSegmentZone[] {
  const result: FloatingLineSegmentZone[] = [];
  for (const left of a) {
    for (const right of b) {
      const start = Math.max(left.leftOffset, right.leftOffset);
      const end = Math.min(
        left.leftOffset + left.availableWidth,
        right.leftOffset + right.availableWidth
      );
      if (end > start) {
        result.push({ leftOffset: start, availableWidth: end - start });
      }
    }
  }
  return result;
}

/**
 * Minimum horizontal room a side must offer before we treat it as usable for
 * text wrapping. Below this, the would-be segment is treated as a no-go and
 * the float falls back to single-side wrap. Without this guard, an image
 * flush with the right margin produces a 2-px right segment that the painter
 * cannot fit text into, and the segments path then bypasses leftMargin /
 * rightMargin composition with co-occurring floats — text overlaps the image.
 *
 * Reused by `layoutFloatingTable` (decide if a floating table is effectively
 * block-like) and by `measureParagraph` (decide if a line should be bumped
 * past obstructing floats). Keep these usages in sync.
 */
export const MIN_WRAP_SEGMENT_WIDTH = 24;

function canSplitCenteredBothSidesWrap(
  rectLeft: number,
  rectRight: number,
  contentWidth: number
): boolean {
  return rectLeft > MIN_WRAP_SEGMENT_WIDTH && rectRight + MIN_WRAP_SEGMENT_WIDTH < contentWidth;
}

function centeredWrapSegments(
  rectLeft: number,
  rectRight: number,
  contentWidth: number
): FloatingLineSegmentZone[] {
  return [
    { leftOffset: 0, availableWidth: Math.max(0, rectLeft) },
    {
      leftOffset: Math.max(0, rectRight),
      availableWidth: Math.max(0, contentWidth - rectRight),
    },
  ].filter((segment) => segment.availableWidth > 1);
}

function largestSideMargins(
  rectLeft: number,
  rectRight: number,
  contentWidth: number
): Pick<FloatingLineMargins, 'leftMargin' | 'rightMargin'> {
  const leftWidth = Math.max(0, rectLeft);
  const rightWidth = Math.max(0, contentWidth - rectRight);
  return rightWidth >= leftWidth
    ? { leftMargin: leftObjectMargin(rectRight), rightMargin: 0 }
    : { leftMargin: 0, rightMargin: rightObjectMargin(rectLeft, contentWidth) };
}

function leftObjectMargin(rectRight: number): number {
  return Math.max(0, rectRight);
}

function rightObjectMargin(rectLeft: number, contentWidth: number): number {
  return Math.max(0, contentWidth - rectLeft);
}
