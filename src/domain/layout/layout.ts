import type { SceneElement, ShapeElement, TextElement } from '../scene/types';

export const LAYOUT_VERSION = '2.0.0';
export interface Bounds { x: number; y: number; width: number; height: number }
export const fontFamily = (id: TextElement['fontFamily']) => id === 'serif' ? 'Lab Serif' : 'Lab Sans';
export const fontString = (e: TextElement) => `${e.fontWeight} ${e.fontSize}px "${fontFamily(e.fontFamily)}"`;
let context: CanvasRenderingContext2D | null | undefined;
function measurementContext() {
  if (context === undefined) context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  return context;
}
function metrics(value: string, e: TextElement) {
  const ctx = measurementContext();
  if (ctx) {
    ctx.font = fontString(e);
    const m = ctx.measureText(value);
    const reference = ctx.measureText('国Hg');
    return { width: m.width, ascent: reference.actualBoundingBoxAscent || e.fontSize * .84, descent: reference.actualBoundingBoxDescent || e.fontSize * .16 };
  }
  // Node-only deterministic fallback. Browser reports/exports wait for the real local fonts.
  const width = Array.from(value).reduce((sum, ch) => sum + (/\s/u.test(ch) ? .3 : /[\u0020-\u007e]/u.test(ch) ? .58 : 1) * e.fontSize, 0);
  return { width, ascent: e.fontSize * .84, descent: e.fontSize * .16 };
}
function wrap(e: TextElement): string[] {
  const result: string[] = [];
  for (const paragraph of e.text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph) { result.push(''); continue; }
    let remaining = Array.from(paragraph);
    while (remaining.length) {
      let count = 1;
      while (count < remaining.length && metrics(remaining.slice(0, count + 1).join(''), e).width <= e.width) count++;
      // Prefer Latin word boundaries; CJK remains freely breakable.
      if (count < remaining.length) {
        const candidate = remaining.slice(0, count).join('');
        const boundary = candidate.search(/\s+\S*$/u);
        if (boundary > 0 && /[A-Za-z0-9]$/.test(candidate)) count = boundary + 1;
      }
      result.push(remaining.splice(0, count).join(''));
    }
  }
  return result.length ? result : [''];
}
function layoutText(e: TextElement) {
  const lines = wrap(e);
  const measured = lines.map(line => metrics(line, e));
  const lineStep = e.fontSize * e.lineHeight;
  const regions = measured.map((m, i) => ({
    x: e.x + (e.textAlign === 'center' ? (e.width - m.width) / 2 : e.textAlign === 'right' ? e.width - m.width : 0),
    y: e.y + i * lineStep + (lineStep - m.ascent - m.descent) / 2,
    width: lines[i].trim() ? m.width : 0,
    height: lines[i].trim() ? m.ascent + m.descent : 0,
  }));
  const visible = regions.filter(r => r.width > 0 && r.height > 0);
  const bounds = visible.length ? unionBounds(visible) : { x: e.x, y: e.y, width: 0, height: 0 };
  const baselines = measured.map((m, i) => e.y + i * lineStep + (lineStep - m.ascent - m.descent) / 2 + m.ascent);
  return { lines, height: Math.max(lineStep, lines.length * lineStep), bounds, baselines, regions };
}
export function measureText(e: TextElement) { const { regions: _, ...result } = layoutText(e); return result; }
export function textLineRegions(e: TextElement): Bounds[] { return layoutText(e).regions; }
export function unionBounds(rects: Bounds[]): Bounds {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x, height: Math.max(...rects.map(r => r.y + r.height)) - y };
}
export type Point = { x: number; y: number };
const outlineCache = new WeakMap<ShapeElement, { key: string; values: Map<string, Point[]> }>();
function cachedPoints(e: ShapeElement, kind: string, create: () => Point[]): Point[] {
  const key = `${e.shape},${e.x},${e.y},${e.width},${e.height},${e.x2},${e.y2},${e.radius},${e.strokeWidth}`;
  let cached = outlineCache.get(e);
  if (!cached || cached.key !== key) { cached = { key, values: new Map() }; outlineCache.set(e, cached); }
  let points = cached.values.get(kind);
  if (!points) { points = create(); cached.values.set(kind, points); }
  return points;
}
export function linePoints(e: ShapeElement): [Point, Point] { return cachedPoints(e, 'line', () => [{ x: e.x, y: e.y }, { x: e.x2 ?? e.x + e.width, y: e.y2 ?? e.y + e.height }]) as [Point, Point]; }
export function arrowPoints(e: ShapeElement): Point[] {
  return cachedPoints(e, 'arrow', () => {
  const [a, b] = linePoints(e), angle = Math.atan2(b.y - a.y, b.x - a.x);
  const length = Math.max(10, e.strokeWidth * 4), half = Math.max(4, e.strokeWidth * 1.5);
  return [b, { x: b.x - length * Math.cos(angle) + half * Math.sin(angle), y: b.y - length * Math.sin(angle) - half * Math.cos(angle) }, { x: b.x - length * Math.cos(angle) - half * Math.sin(angle), y: b.y - length * Math.sin(angle) + half * Math.cos(angle) }];
  });
}
export function polygonPoints(e: ShapeElement): Point[] {
  return cachedPoints(e, 'polygon', () => {
  const { x, y, width: w, height: h } = e;
  if (e.shape === 'triangle') return [{ x: x + w / 2, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  if (e.shape === 'diamond') return [{ x: x + w / 2, y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }];
  if (e.shape === 'star') return Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .45 : 1; return { x: x + w / 2 + Math.cos(a) * w / 2 * r, y: y + h / 2 + Math.sin(a) * h / 2 * r }; });
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  });
}
export function polygonPath(points: Point[]) { return points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ') + ' Z'; }
export function shapePath(e: ShapeElement): string {
  const { x, y, width: w, height: h } = e;
  if (e.shape === 'line' || e.shape === 'arrow') { const [a, b] = linePoints(e); return `M${a.x} ${a.y} L${b.x} ${b.y}`; }
  if (e.shape === 'ellipse' || e.shape === 'circle') return `M${x} ${y + h / 2} A${w / 2} ${h / 2} 0 1 0 ${x + w} ${y + h / 2} A${w / 2} ${h / 2} 0 1 0 ${x} ${y + h / 2} Z`;
  if (e.shape === 'rounded-rectangle') {
    const r = Math.min(e.radius, w / 2, h / 2);
    if (!r) return polygonPath(polygonPoints(e));
    return `M${x + r} ${y} H${x + w - r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} H${x + r} A${r} ${r} 0 0 1 ${x} ${y + h - r} V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`;
  }
  return polygonPath(polygonPoints(e));
}
function pointBounds(points: Point[], pad = 0): Bounds {
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x: x - pad, y: y - pad, width: Math.max(...points.map(p => p.x)) - x + pad * 2, height: Math.max(...points.map(p => p.y)) - y + pad * 2 };
}
export function elementBounds(e: SceneElement): Bounds {
  if (e.type === 'text') return measureText(e).bounds;
  const pad = e.stroke !== 'none' ? e.strokeWidth / 2 : 0;
  if (e.shape === 'line' || e.shape === 'arrow') return pointBounds([...linePoints(e), ...(e.shape === 'arrow' ? arrowPoints(e) : [])], pad);
  if (['triangle', 'diamond', 'star'].includes(e.shape)) return pointBounds(polygonPoints(e), pad);
  return { x: e.x - pad, y: e.y - pad, width: e.width + pad * 2, height: e.height + pad * 2 };
}
export function pointInPolygon(points: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy;
  const t = square ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / square)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function onPolygon(points: Point[], x: number, y: number, stroke: number) { return points.some((a, i) => segmentDistance({ x, y }, a, points[(i + 1) % points.length]) <= stroke / 2); }
function ellipseBoundary(e: ShapeElement) { return cachedPoints(e, 'ellipse', () => Array.from({ length: 96 }, (_, i) => { const a = i * Math.PI / 48; return { x: e.x + e.width / 2 + Math.cos(a) * e.width / 2, y: e.y + e.height / 2 + Math.sin(a) * e.height / 2 }; })); }
export function shapeOutline(e: ShapeElement): Point[] {
  if (e.shape === 'ellipse' || e.shape === 'circle') return ellipseBoundary(e);
  if (e.shape === 'line') return linePoints(e);
  if (e.shape === 'arrow') return [...linePoints(e), ...arrowPoints(e)];
  if (e.shape === 'rounded-rectangle') {
    const r = Math.min(e.radius, e.width / 2, e.height / 2);
    const centers = [{ x: e.x + e.width - r, y: e.y + r }, { x: e.x + e.width - r, y: e.y + e.height - r }, { x: e.x + r, y: e.y + e.height - r }, { x: e.x + r, y: e.y + r }];
    return centers.flatMap((c, j) => Array.from({ length: 25 }, (_, i) => { const a = -Math.PI / 2 + j * Math.PI / 2 + i * Math.PI / 48; return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }; }));
  }
  return polygonPoints(e);
}
function roundedInside(e: ShapeElement, x: number, y: number, inset = 0) {
  const left = e.x + inset, top = e.y + inset, w = e.width - inset * 2, h = e.height - inset * 2;
  if (w < 0 || h < 0 || x < left || y < top || x > left + w || y > top + h) return false;
  const r = Math.max(0, Math.min(e.radius, e.width / 2, e.height / 2) - inset);
  const cx = Math.max(left + r, Math.min(x, left + w - r)), cy = Math.max(top + r, Math.min(y, top + h - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
export function containsPoint(e: SceneElement, x: number, y: number): boolean {
  if (e.type === 'text') return textLineRegions(e).some(r => r.width > 0 && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
  const stroke = e.stroke !== 'none' && e.strokeWidth > 0;
  if (e.shape === 'line' || e.shape === 'arrow') {
    if (!stroke) return false;
    return segmentDistance({ x, y }, ...linePoints(e)) <= e.strokeWidth / 2 || e.shape === 'arrow' && (pointInPolygon(arrowPoints(e), x, y) || onPolygon(arrowPoints(e), x, y, e.strokeWidth));
  }
  let inside = false, edge = false;
  if (e.shape === 'ellipse' || e.shape === 'circle') {
    inside = ((x - e.x - e.width / 2) / (e.width / 2)) ** 2 + ((y - e.y - e.height / 2) / (e.height / 2)) ** 2 <= 1;
    edge = stroke && onPolygon(ellipseBoundary(e), x, y, e.strokeWidth);
  } else if (e.shape === 'rounded-rectangle') {
    inside = roundedInside(e, x, y);
    edge = stroke && roundedInside(e, x, y, -e.strokeWidth / 2) && !roundedInside(e, x, y, e.strokeWidth / 2);
  } else { const points = polygonPoints(e); inside = pointInPolygon(points, x, y); edge = stroke && onPolygon(points, x, y, e.strokeWidth); }
  return e.fill !== 'none' && inside || edge;
}
