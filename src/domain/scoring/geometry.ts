import { arrowPoints, containsPoint, elementBounds, linePoints, segmentDistance, shapeOutline, textLineRegions, type Bounds, type Point } from '../layout/layout';
import type { SceneElement, ShapeElement } from '../scene/types';
export interface Geometry {
  bounds: Bounds;
  regions: Bounds[];
  paths: { points: Point[]; closed: boolean }[];
  segments: [Point, Point][];
  strokeRadius: number;
  contains: (x: number, y: number) => boolean;
  fillContains: (x: number, y: number) => boolean;
  strokeContains: (x: number, y: number) => boolean;
}
export const isLine = (e: SceneElement): e is ShapeElement & { shape: 'line' | 'arrow' } => e.type === 'shape' && (e.shape === 'line' || e.shape === 'arrow');
export function inBounds(b: Bounds, x: number, y: number): boolean { return x >= b.x && y >= b.y && x <= b.x + b.width && y <= b.y + b.height; }
export function rectanglesOverlap(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
const rectanglePoints = (r: Bounds): Point[] => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];
export function geometry(e: SceneElement): Geometry {
  const bounds = elementBounds(e);
  const regions = e.type === 'text' ? textLineRegions(e).filter(r => r.width > 0 && r.height > 0) : [];
  const paths = e.type === 'text' ? regions.map(r => ({ points: rectanglePoints(r), closed: true }))
    : e.shape === 'arrow' ? [{ points: linePoints(e), closed: false }, { points: arrowPoints(e), closed: true }]
      : [{ points: shapeOutline(e), closed: !isLine(e) }];
  const segments: [Point, Point][] = paths.flatMap(path => path.points.slice(0, path.closed ? undefined : -1).map((p, i) => [p, path.points[(i + 1) % path.points.length]] as [Point, Point]));
  const filled = e.type === 'shape' ? { ...e, stroke: 'none' } : null;
  const stroked = e.type === 'shape' ? { ...e, fill: 'none' } : null;
  const fillContains = (x: number, y: number) => e.type === 'text' ? regions.some(r => inBounds(r, x, y))
    : e.fill !== 'none' && !isLine(e) && containsPoint(filled!, x, y);
  const strokeContains = (x: number, y: number) => e.type === 'shape' && e.stroke !== 'none' && e.strokeWidth > 0 && containsPoint(stroked!, x, y);
  const contains = (x: number, y: number) => inBounds(bounds, x, y) && (fillContains(x, y) || strokeContains(x, y));
  return { bounds, regions, paths, segments, strokeRadius: e.type === 'shape' && e.stroke !== 'none' ? e.strokeWidth / 2 : 0, contains, fillContains, strokeContains };
}
function cross(a: Point, b: Point, p: Point): number { return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); }
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const ab1 = cross(a, b, c), ab2 = cross(a, b, d), cd1 = cross(c, d, a), cd2 = cross(c, d, b);
  if (ab1 * ab2 < 0 && cd1 * cd2 < 0) return true;
  return Math.min(segmentDistance(a, c, d), segmentDistance(b, c, d), segmentDistance(c, a, b), segmentDistance(d, a, b)) < 1e-9;
}
/** Polygon/segment distances use actual outlines, never their enclosing rectangles.
 * Curves use the layout module's 96-segment ellipse / sampled rounded outline;
 * this subpixel curve approximation is separate from the area sampling below. */
export function regionGap(a: Geometry, b: Geometry): number {
  for (const path of a.paths) if (path.points.some(p => b.contains(p.x, p.y))) return 0;
  for (const path of b.paths) if (path.points.some(p => a.contains(p.x, p.y))) return 0;
  let minimum = Infinity;
  for (const [p, q] of a.segments) for (const [r, s] of b.segments) {
    if (segmentsIntersect(p, q, r, s)) return 0;
    minimum = Math.min(minimum, segmentDistance(p, r, s), segmentDistance(q, r, s), segmentDistance(r, p, q), segmentDistance(s, p, q));
  }
  return Math.max(0, minimum - a.strokeRadius - b.strokeRadius);
}
export function boundarySamples(g: Geometry): Point[] {
  return g.segments.flatMap(([a, b]) => {
    const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
    return Array.from({ length: count + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / count, y: a.y + (b.y - a.y) * i / count }));
  });
}
/** Object-relative samples keep clipping/visibility stable during free translation.
 * Resolution is 2 logical px, relaxed only for large objects to cap work at ~24k
 * cells/object. Thin strokes get a narrower step. No device pixels or zoom enter.
 * Text uses actual laid-out line rectangles, not individual glyph silhouettes;
 * spaces inside a line and glyph counters are therefore an explicit approximation. */
export function areaSamples(g: Geometry, e: SceneElement): { points: Point[]; cellArea: number; step: number } {
  const b = g.bounds;
  if (!b.width || !b.height) return { points: [], cellArea: 0, step: 2 };
  const thin = e.type === 'shape' && (isLine(e) || e.fill === 'none') ? Math.min(2, Math.max(.25, e.strokeWidth / 2)) : 2;
  const step = Math.max(thin, Math.sqrt(b.width * b.height / 24000));
  const nx = Math.max(1, Math.ceil(b.width / step)), ny = Math.max(1, Math.ceil(b.height / step));
  const dx = b.width / nx, dy = b.height / ny;
  const points: Point[] = [];
  for (let row = 0; row < ny; row++) for (let column = 0; column < nx; column++) {
    const x = b.x + (column + .5) * dx, y = b.y + (row + .5) * dy;
    if (g.contains(x, y)) points.push({ x, y });
  }
  // A very thin diagonal can pass between the regular cells. These additional
  // centerline samples prevent falsely calling a visible stroke empty.
  if (!points.length && e.type === 'shape' && e.stroke !== 'none' && e.strokeWidth > 0) {
    points.push(...boundarySamples(g).filter(p => g.contains(p.x, p.y)));
  }
  return { points, cellArea: dx * dy, step };
}
