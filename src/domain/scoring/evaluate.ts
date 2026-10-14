import { LAYOUT_VERSION, linePoints, measureText } from '../layout/layout';
import type { DimensionKey, DimensionScore, RuleEvidence, SceneDocument, SceneElement, ScoreReport, ShapeElement } from '../scene/types';
import { clip, colorSimilarity, contrastRatio, linear, luminance, parseColor, relativeSimilarity, sameColor, type RGB } from './color';
import { areaSamples, boundarySamples, geometry, inBounds, isLine, rectanglesOverlap, regionGap, type Geometry } from './geometry';

export const FONT_MANIFEST_VERSION = 'local-lab-fonts-1';
export const SCORING_MEASUREMENT_VERSION = 'area-2px-line-regions-1';
type Unit = {
  element: SceneElement; ids: string[]; index: number; geometry: Geometry;
  samples: ReturnType<typeof areaSamples>; fill: RGB | null; stroke: RGB | null;
  visible: number; inside: number; damaged: number; occluded: number; worstContrast: number;
  visibility: number; area: number; plate: boolean;
};
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : 0; };
const allIds = (units: Unit[]) => units.flatMap(u => u.ids);
const round = (n: number) => Math.round(n * 1000) / 1000;
function evidence(ruleId: string, units: Unit[], explanation: string, measurements: Record<string, number | string> = {}, severity: RuleEvidence['severity'] = 'info', suggestion?: string): RuleEvidence {
  return { ruleId, elementIds: allIds(units), severity, measurements, explanation, ...(suggestion ? { suggestion } : {}) };
}
function dimension(foreground: Unit[], units: Unit[], score: number | null, submetrics: string[], reasons: string[] = [], items: RuleEvidence[] = [], limited = false): DimensionScore {
  return { score: score === null ? null : Math.max(0, Math.min(100, score)), status: score === null ? 'not-applicable' : limited || reasons.length > 0 || units.length < foreground.length ? 'limited' : 'valid',
    evaluatedIds: allIds(units), evaluatedVisualUnitCount: units.length, visibleForegroundCount: foreground.length,
    applicableSubmetrics: submetrics, unavailableReasons: reasons, evidence: items };
}
function assertScene(scene: SceneDocument): void {
  if (!scene || scene.schemaVersion !== 2 || !Array.isArray(scene.elements)) throw new Error('不支持的场景格式');
  if (![scene.width, scene.height].every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(scene.revision)) throw new Error('画布尺寸或版本非法');
  parseColor(scene.background);
  const ids = new Set<string>();
  for (const e of scene.elements) {
    if (!e.id || ids.has(e.id)) throw new Error(`对象 ID 重复或为空：${e.id}`);
    ids.add(e.id);
    if (![e.x, e.y, e.width, e.height].every(Number.isFinite) || e.width < 0 || e.height < 0 || (!isLine(e) && (!e.width || !e.height))) throw new Error(`对象 ${e.id} 坐标或尺寸非法`);
    const extra = e as unknown as Record<string, unknown>;
    if ('opacity' in extra || 'rotation' in extra || 'rotate' in extra) throw new Error(`对象 ${e.id} 含不支持的透明度或自由旋转属性`);
    if (e.type === 'text') {
      if (typeof e.text !== 'string' || !['sans', 'serif'].includes(e.fontFamily) || !['left', 'center', 'right'].includes(e.textAlign) || ![e.fontSize, e.fontWeight, e.lineHeight].every(v => Number.isFinite(v) && v > 0)) throw new Error(`文字 ${e.id} 属性非法`);
      parseColor(e.color);
    } else if (e.type === 'shape') {
      if (!['rectangle', 'rounded-rectangle', 'circle', 'ellipse', 'triangle', 'diamond', 'line', 'arrow', 'star'].includes(e.shape) || !Number.isFinite(e.radius) || e.radius < 0 || !Number.isFinite(e.strokeWidth) || e.strokeWidth < 0) throw new Error(`图形 ${e.id} 属性非法`);
      if (e.fill !== 'none') parseColor(e.fill);
      if (e.stroke !== 'none') parseColor(e.stroke);
      if (isLine(e) && ![e.x2 ?? e.x + e.width, e.y2 ?? e.y + e.height].every(Number.isFinite)) throw new Error(`线条 ${e.id} 端点非法`);
    } else throw new Error(`未知对象类型：${(e as SceneElement).id}`);
  }
}
const normalizedColor = (s: string) => s === 'none' ? s : parseColor(s).join(',');
function visualKey(e: SceneElement): string {
  const base = [e.type, e.x, e.y];
  return JSON.stringify(e.type === 'text' ? [...base, e.width, e.text, e.fontFamily, e.fontSize, e.fontWeight, e.lineHeight, normalizedColor(e.color), e.textAlign]
    : [...base, e.shape, e.width, e.height, e.shape === 'rounded-rectangle' ? e.radius : 0, normalizedColor(e.fill), normalizedColor(e.stroke), e.stroke === 'none' ? 0 : e.strokeWidth, ...(isLine(e) ? [e.x2 ?? e.x + e.width, e.y2 ?? e.y + e.height] : [])]);
}
/** Timestamp, name, document identity and revision are not visual input. Object IDs
 * and paint order remain in the content fingerprint because evidence refers to them. */
export function sceneFingerprint(scene: SceneDocument): string {
  const content = JSON.stringify([scene.width, scene.height, normalizedColor(scene.background), scene.elements.map(e => [e.id, visualKey(e)])]);
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++) hash = Math.imul(hash ^ content.charCodeAt(i), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
function prepare(scene: SceneDocument, warnings: RuleEvidence[]): Unit[] {
  const byAppearance = new Map<string, Unit>();
  scene.elements.forEach((element, index) => {
    const key = visualKey(element), duplicate = byAppearance.get(key);
    if (duplicate) { duplicate.ids.push(element.id); duplicate.index = index; return; }
    const g = geometry(element), samples = areaSamples(g, element);
    const fill = element.type === 'text' ? parseColor(element.color) : element.fill === 'none' || isLine(element) ? null : parseColor(element.fill);
    const stroke = element.type === 'shape' && element.stroke !== 'none' && element.strokeWidth > 0 ? parseColor(element.stroke) : null;
    byAppearance.set(key, { element, ids: [element.id], index, geometry: g, samples, fill, stroke, visible: 0, inside: 0, damaged: 0, occluded: 0, worstContrast: Infinity, visibility: 0, area: samples.points.length * samples.cellArea, plate: false });
  });
  const units = [...byAppearance.values()].sort((a, b) => a.index - b.index);
  for (const unit of units) if (unit.ids.length > 1) warnings.push(evidence('visibility.duplicate', [unit], '完全重合且外观相同的副本已合并为一个视觉单位。', { originalCount: unit.ids.length, visualUnitCount: 1 }));
  const bg = parseColor(scene.background);
  for (const unit of units) {
    const otherText = units.filter(other => other !== unit && other.element.type === 'text' && rectanglesOverlap(unit.geometry.bounds, other.geometry.bounds));
    const lower = units.filter(other => other.index < unit.index && other.element.type !== 'text' && rectanglesOverlap(unit.geometry.bounds, other.geometry.bounds));
    const upper = units.filter(other => other.index > unit.index && rectanglesOverlap(unit.geometry.bounds, other.geometry.bounds));
    for (const p of unit.samples.points) {
      const inside = p.x >= 0 && p.y >= 0 && p.x < scene.width && p.y < scene.height;
      if (!inside) { unit.damaged++; continue; }
      unit.inside++;
      let background = bg;
      for (const other of lower) background = paintAt(other, p.x, p.y) ?? background;
      const color = paintAt(unit, p.x, p.y);
      const covered = upper.some(other => paintAt(other, p.x, p.y) !== null);
      const collided = unit.element.type === 'text' && otherText.some(other => other.geometry.contains(p.x, p.y));
      if (covered) unit.occluded++;
      if (covered || collided) unit.damaged++;
      if (!covered && color) {
        // Text crossing an identical background must retain CR=1 in its worst
        // region. Otherwise a readable sliver would conceal an unreadable line.
        if (unit.element.type === 'text' || !sameColor(color, background)) unit.worstContrast = Math.min(unit.worstContrast, contrastRatio(color, background));
        if (!sameColor(color, background)) unit.visible++;
      }
    }
    const count = unit.samples.points.length;
    if (!unit.visible) {
      warnings.push(evidence('visibility.excluded', [unit], '未参与：不可见（空内容、完全出界、完全遮挡或与实际背景同色）。', { sampledArea: round(unit.area) }));
      continue;
    }
    const target = unit.element.type === 'text' ? unit.element.fontSize >= 24 || unit.element.fontSize >= 18.67 && unit.element.fontWeight >= 700 ? 3 : 4.5 : 3;
    const fraction = unit.element.type === 'text' ? 1 - unit.damaged / count : unit.inside / count;
    unit.visibility = clip((unit.worstContrast - 1) / (target - 1)) * fraction;
    if (unit.inside < count) warnings.push(evidence('visibility.clipping', [unit], '对象有一部分超出画布，可见度已计入裁切。', { clippedRatio: round(1 - unit.inside / count) }, 'warning', '可把需要完整显示的内容移回画布。'));
    if (unit.element.type === 'text' && unit.damaged > count - unit.inside) warnings.push(evidence('visibility.text-damage', [unit], '文字与上层对象或其他文字发生区域重叠；受损区域按并集扣减一次。', { effectiveAreaRatio: round(1 - unit.damaged / count) }, 'warning', '可移动文字或调整图层，保留清楚的阅读区域。'));
    else if (unit.occluded > 0) warnings.push(evidence('visibility.shape-overlap', [unit], '图形部分叠加；已解析真实占据区域，未因图形部分重叠直接扣减。', { occludedRatio: round(unit.occluded / count) }));
    if (unit.visibility < .6) warnings.push(evidence('contrast.visibility', [unit], '该对象与实际背景较难分辨，或有效可见区域较少。', { worstContrastRatio: round(unit.worstContrast), referenceTarget: target, visibility: round(unit.visibility) }, 'warning', '可调整明暗差或减少裁切、遮挡。'));
  }
  const visible = units.filter(u => u.visible > 0);
  for (const unit of visible) {
    if (unit.element.type !== 'shape' || isLine(unit.element) || !unit.fill) continue;
    const contained = visible.filter(other => other !== unit && other.index > unit.index &&
      // Bounds are only a rejection shortcut. Containment is tested against the
      // true filled region with every occupied area sample and sampled contour.
      other.samples.points.length > 0 && [...other.samples.points, ...boundarySamples(other.geometry)].every(p => unit.geometry.fillContains(p.x, p.y)));
    if (contained.length >= 2) {
      unit.plate = true;
      warnings.push(evidence('visibility.backplate', [unit, ...contained], '此下层填充图形完整包含至少两个可见对象，推断为底板；参与背景与遮挡，不参与前景结构。', { containedVisualUnitCount: contained.length }, 'info'));
    }
  }
  return visible.filter(u => !u.plate);
}
function paintAt(unit: Unit, x: number, y: number): RGB | null {
  if (!inBounds(unit.geometry.bounds, x, y)) return null;
  if (unit.stroke && unit.geometry.strokeContains(x, y)) return unit.stroke;
  return unit.fill && unit.geometry.fillContains(x, y) ? unit.fill : null;
}

type Edge = { a: number; b: number; gap: number; normalized: number };
function treeEdges(units: Unit[], u: number): { tree: Edge[]; matrix: number[][] } {
  const matrix = units.map(() => units.map(() => 0));
  const edges: Edge[] = [];
  for (let a = 0; a < units.length; a++) for (let b = a + 1; b < units.length; b++) {
    const gap = regionGap(units[a].geometry, units[b].geometry);
    matrix[a][b] = matrix[b][a] = gap;
    edges.push({ a, b, gap, normalized: gap / u });
  }
  edges.sort((a, b) => a.gap - b.gap || a.a - b.a || a.b - b.b);
  const parent = units.map((_, i) => i);
  const find = (a: number): number => parent[a] === a ? a : parent[a] = find(parent[a]);
  const tree: Edge[] = [];
  for (const edge of edges) if (find(edge.a) !== find(edge.b)) { parent[find(edge.a)] = find(edge.b); tree.push(edge); }
  return { tree, matrix };
}
function components(count: number, edges: Edge[], threshold: number): number[][] {
  const visited = new Set<number>(), result: number[][] = [];
  for (let first = 0; first < count; first++) {
    if (visited.has(first)) continue;
    const queue = [first], group: number[] = []; visited.add(first);
    while (queue.length) {
      const current = queue.shift()!; group.push(current);
      for (const edge of edges) if (edge.normalized <= threshold && (edge.a === current || edge.b === current)) {
        const next = edge.a === current ? edge.b : edge.a;
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    result.push(group.sort((a, b) => a - b));
  }
  return result;
}
function proximity(foreground: Unit[]): DimensionScore {
  const units = foreground.filter(u => !isLine(u.element));
  const unavailable = '未发现可比较的组内与组间关系。';
  if (units.length < 3) return dimension(foreground, [], null, [], ['至少需要三个可分组对象。']);
  const u = Math.max(16, median(units.map(unit => Math.min(unit.geometry.bounds.width, unit.geometry.bounds.height))));
  const { tree, matrix } = treeEdges(units, u);
  let threshold: number | null = null, largest = -Infinity;
  for (let i = 1; i < tree.length; i++) {
    const smaller = tree[i - 1].normalized, larger = tree[i].normalized;
    if (larger / Math.max(smaller, .05) >= 1.8 && larger - smaller >= .5 && larger - smaller > largest) {
      largest = larger - smaller; threshold = (larger + smaller) / 2;
    }
  }
  if (threshold === null) return dimension(foreground, [], null, [], [unavailable], [evidence('proximity.unavailable', units, '树边长度未出现稳定的显著跳变；均匀排列和单组布局可以没有亲密性分。', { scale: round(u) })]);
  const groups = components(units.length, tree, threshold);
  const signature = JSON.stringify(groups);
  if (signature !== JSON.stringify(components(units.length, tree, threshold * .9)) || signature !== JSON.stringify(components(units.length, tree, threshold * 1.1)) || groups.length < 2 || !groups.some(g => g.length > 1)) return dimension(foreground, [], null, [], [unavailable]);
  const compact: number[] = [], separated: number[] = [], covered: Unit[] = [], items: RuleEvidence[] = [];
  for (const group of groups) {
    if (group.length < 2) continue;
    const internal = tree.filter(edge => group.includes(edge.a) && group.includes(edge.b));
    const a = average(internal.map(edge => edge.gap));
    const b = Math.min(...group.flatMap(i => units.map((_, j) => group.includes(j) ? Infinity : matrix[i][j])));
    const members = group.map(i => units[i]);
    const collision = members.some((unit, i) => unit.element.type === 'text' && members.slice(i + 1).some(other => other.element.type === 'text' && textCollisionRatio(unit, other) >= .02));
    const tightness = collision ? 0 : 1 - linear(a / u, .5, 2);
    const distinction = clip((b - a) / Math.max(b, .1 * u));
    compact.push(tightness); separated.push(distinction); covered.push(...members);
    items.push(evidence('proximity.group', members, collision ? '该几何组含明显文字行区域碰撞，组内紧凑子项为零。' : '已识别一个稳定几何组；此证据仅描述可见聚合，不推断语义归属。', { groupSize: group.length, internalGap: round(a), nearestExternalGap: round(b), scale: round(u), splitThreshold: round(threshold * u), compactness: round(tightness), separation: round(distinction) }, collision ? 'warning' : 'info'));
  }
  const reasons = [...(covered.length < units.length ? ['孤立对象仅作为外部邻居，未覆盖组内紧凑。'] : []), ...(units.length < foreground.length ? ['直线与箭头不参与几何分组。'] : [])];
  return dimension(foreground, covered, 100 * (.4 * average(compact) + .6 * average(separated)), ['组内紧凑', '组间区分'], reasons, items);
}
function textCollisionRatio(a: Unit, b: Unit): number {
  if (!rectanglesOverlap(a.geometry.bounds, b.geometry.bounds)) return 0;
  const intersection = a.geometry.regions.reduce((sum, x) => sum + b.geometry.regions.reduce((sub, y) => sub + Math.max(0, Math.min(x.x + x.width, y.x + y.width) - Math.max(x.x, y.x)) * Math.max(0, Math.min(x.y + x.height, y.y + y.height) - Math.max(x.y, y.y)), 0), 0);
  return intersection / Math.max(1, Math.min(a.area, b.area));
}

type Anchor = { unit: Unit; value: number; kind: string; coordinate: 'x' | 'y' };
type Axis = { anchors: Anchor[]; kind: string; coordinate: 'x' | 'y' };
function anchorsFor(unit: Unit): Anchor[] {
  const b = unit.geometry.bounds;
  const result: Anchor[] = [];
  const add = (coordinate: 'x' | 'y', kind: string, value: number) => result.push({ unit, value, kind: `${coordinate}:${kind}`, coordinate });
  if (isLine(unit.element)) {
    const [a, z] = linePoints(unit.element);
    // Endpoints are actual line anchors, not the corners of an imaginary box.
    // Endpoint-to-endpoint relations are their own anchor kind. The real midpoint
    // can share center axes with other objects.
    add('x', 'endpoint', a.x); add('x', 'endpoint', z.x); add('x', 'center', (a.x + z.x) / 2);
    add('y', 'endpoint', a.y); add('y', 'endpoint', z.y); add('y', 'center', (a.y + z.y) / 2);
  } else {
    add('x', 'left', b.x); add('x', 'center', b.x + b.width / 2); add('x', 'right', b.x + b.width);
    add('y', 'top', b.y); add('y', 'center', b.y + b.height / 2); add('y', 'bottom', b.y + b.height);
  }
  if (unit.element.type === 'text') for (const baseline of measureText(unit.element).baselines) add('y', 'baseline', baseline);
  return result;
}
function separatedOnOtherAxis(a: Unit, b: Unit, coordinate: 'x' | 'y'): boolean {
  const x = a.geometry.bounds, y = b.geometry.bounds;
  return coordinate === 'x' ? x.y + x.height <= y.y + 1e-8 || y.y + y.height <= x.y + 1e-8
    : x.x + x.width <= y.x + 1e-8 || y.x + y.width <= x.x + 1e-8;
}
function findAxes(units: Unit[]): Axis[] {
  const families = new Map<string, Anchor[]>();
  for (const unit of units) for (const anchor of anchorsFor(unit)) families.set(anchor.kind, [...(families.get(anchor.kind) ?? []), anchor]);
  const axes: Axis[] = [];
  for (const [kind, unsorted] of families) {
    const sorted = [...unsorted].sort((a, b) => a.value - b.value || a.unit.index - b.unit.index);
    const seen = new Set<string>();
    for (let start = 0; start < sorted.length; start++) {
      const cluster: Anchor[] = [];
      for (let end = start; end < sorted.length && sorted[end].value - sorted[start].value <= 20; end++) cluster.push(sorted[end]);
      const related = cluster.filter(a => cluster.some(b => a.unit !== b.unit && separatedOnOtherAxis(a.unit, b.unit, a.coordinate)));
      const key = related.map(a => `${a.unit.index}:${a.value}`).join('|');
      if (new Set(related.map(a => a.unit)).size < 2 || seen.has(key)) continue;
      seen.add(key);
      axes.push({ anchors: related, kind, coordinate: related[0].coordinate });
    }
  }
  // Retain maximal clusters; smaller windows of the same anchor kind do not
  // constitute extra evidence. Multiple genuinely different axes remain.
  return axes.filter((axis, i) => !axes.some((other, j) => i !== j && other.kind === axis.kind && other.anchors.length > axis.anchors.length && axis.anchors.every(a => other.anchors.includes(a))));
}
function alignment(foreground: Unit[], axes: Axis[]): DimensionScore {
  if (foreground.length < 2) return dimension(foreground, [], null, [], ['至少需要两个可见前景对象。']);
  const support = new Map(foreground.map(u => [u, 0]));
  for (const axis of axes) for (const anchor of axis.anchors) for (const other of axis.anchors) {
    if (anchor.unit === other.unit || !separatedOnOtherAxis(anchor.unit, other.unit, axis.coordinate)) continue;
    const value = 1 - linear(Math.abs(anchor.value - other.value), 2, 20);
    support.set(anchor.unit, Math.max(support.get(anchor.unit)!, value));
  }
  const items = axes.map(axis => {
    const units = [...new Set(axis.anchors.map(a => a.unit))];
    return evidence('alignment.axis', units, `发现${axis.coordinate === 'x' ? '垂直' : '水平'}共同轴线（${axis.kind}）；另一方向的分离已核验。`, {
      axis: axis.kind, position: round(average(axis.anchors.map(a => a.value))), span: round(Math.max(...axis.anchors.map(a => a.value)) - Math.min(...axis.anchors.map(a => a.value))), unitCount: units.length,
    });
  });
  const unsupported = foreground.filter(u => support.get(u) === 0);
  if (unsupported.length) items.push(evidence('alignment.unsupported', unsupported, '这些对象未发现稳定轴线；本项只检查水平、垂直与文字基线。', { unsupportedCount: unsupported.length }, 'suggestion', '可根据构图意图尝试共同边缘、中心或基线。'));
  return dimension(foreground, foreground, 100 * average([...support.values()]), ['水平／垂直轴线', ...(foreground.some(u => u.element.type === 'text') ? ['文字基线'] : [])], [], items);
}
const family = (e: SceneElement) => e.type === 'text' ? 'text' : e.shape;
function strokeSimilarity(a: ShapeElement, b: ShapeElement): number {
  const aNone = a.stroke === 'none' || a.strokeWidth === 0, bNone = b.stroke === 'none' || b.strokeWidth === 0;
  if (aNone || bNone) return aNone === bNone ? 1 : 0;
  return (colorSimilarity(a.stroke, b.stroke) + relativeSimilarity(a.strokeWidth, b.strokeWidth)) / 2;
}
function styleSimilarity(a: SceneElement, b: SceneElement): number {
  if (a.type === 'text' && b.type === 'text') {
    return .25 * relativeSimilarity(a.fontSize, b.fontSize) + .20 * Number(a.fontFamily === b.fontFamily) + .20 * (1 - linear(Math.abs(a.fontWeight - b.fontWeight), 50, 300)) + .25 * colorSimilarity(a.color, b.color) + .10 * Number(a.textAlign === b.textAlign);
  }
  if (a.type !== 'shape' || b.type !== 'shape') return 0;
  if (isLine(a) && isLine(b)) {
    const length = (e: ShapeElement) => { const [p, q] = linePoints(e); return Math.hypot(q.x - p.x, q.y - p.y); };
    return .40 * colorSimilarity(a.stroke, b.stroke) + .30 * relativeSimilarity(a.strokeWidth, b.strokeWidth) + .30 * relativeSimilarity(length(a), length(b));
  }
  return .35 * colorSimilarity(a.fill, b.fill) + .25 * strokeSimilarity(a, b) + .20 * relativeSimilarity(a.width / a.height, b.width / b.height) + .20 * relativeSimilarity(Math.sqrt(a.width * a.height), Math.sqrt(b.width * b.height));
}
function repetition(foreground: Unit[], axes: Axis[]): DimensionScore {
  if (foreground.length < 3) return dimension(foreground, [], null, [], ['至少需要三个可见前景视觉单位。']);
  const families = new Map<string, Unit[]>();
  for (const unit of foreground) families.set(family(unit.element), [...(families.get(family(unit.element)) ?? []), unit]);
  const comparable = [...families.values()].filter(units => units.length > 1);
  if (!comparable.length) return dimension(foreground, [], null, [], ['所有元素类型各异，没有同类型比较族。']);
  const scores: number[] = [], items: RuleEvidence[] = [], covered = comparable.flat();
  for (const units of comparable) {
    const values = units.map(unit => Math.max(...units.filter(other => other !== unit).map(other => styleSimilarity(unit.element, other.element))));
    const mean = average(values); scores.push(mean);
    items.push(evidence('repetition.style-family', units, `同类型比较族（${family(units[0].element)}）的最近样式支持；类型族等权计入。`, { family: family(units[0].element), styleSupport: round(mean), unitCount: units.length }));
    const unique = units.filter((_, i) => values[i] < .5);
    if (unique.length) items.push(evidence('repetition.unmatched', unique, '未找到相似样式；独特元素也可能承担强调作用。', {}, 'suggestion'));
  }
  const candidates: { units: Unit[]; direction: 'x' | 'y'; axis: string }[] = [];
  for (const axis of axes) {
    const groups = new Map<string, Unit[]>();
    for (const unit of new Set(axis.anchors.map(a => a.unit))) groups.set(family(unit.element), [...(groups.get(family(unit.element)) ?? []), unit]);
    for (const units of groups.values()) if (units.length >= 3) candidates.push({ units, direction: axis.coordinate === 'x' ? 'y' : 'x', axis: axis.kind });
  }
  candidates.sort((a, b) => b.units.length - a.units.length || a.direction.localeCompare(b.direction) || a.axis.localeCompare(b.axis) || a.units[0].index - b.units[0].index);
  const assigned = { x: new Set<Unit>(), y: new Set<Unit>() }, rhythms: { value: number; count: number }[] = [];
  for (const candidate of candidates) {
    const dir = candidate.direction;
    const position = (unit: Unit) => dir === 'x' ? unit.geometry.bounds.x : unit.geometry.bounds.y;
    const size = (unit: Unit) => dir === 'x' ? unit.geometry.bounds.width : unit.geometry.bounds.height;
    const sorted = candidate.units.filter(unit => !assigned[dir].has(unit)).sort((a, b) => position(a) - position(b) || a.index - b.index);
    // Separate overlapping objects into uninterrupted non-overlapping runs.
    const runs: Unit[][] = [[]];
    for (const unit of sorted) {
      const run = runs[runs.length - 1], previous = run.at(-1);
      if (previous && position(unit) < position(previous) + size(previous) - 1e-8) runs.push([unit]); else run.push(unit);
    }
    for (const units of runs) {
      if (units.length < 3) continue;
      const gaps = units.slice(1).map((unit, i) => Math.max(0, position(unit) - position(units[i]) - size(units[i])));
      if (gaps.every(gap => gap < 1e-8)) continue;
      const middle = median(gaps), mad = median(gaps.map(gap => Math.abs(gap - middle)));
      const ratio = mad / Math.max(middle, 4), value = 1 - linear(ratio, .05, .40);
      rhythms.push({ value, count: units.length }); units.forEach(unit => assigned[dir].add(unit));
      items.push(evidence('repetition.rhythm', units, `发现${dir === 'x' ? '水平' : '垂直'}的同类型非重叠序列，已比较连续边缘空隙。`, { direction: dir, gaps: gaps.map(round).join(', '), medianGap: round(middle), mad: round(mad), normalizedMad: round(ratio), rhythm: round(value) }));
    }
  }
  const t = average(scores), e = rhythms.length ? rhythms.reduce((sum, item) => sum + item.value * item.count, 0) / rhythms.reduce((sum, item) => sum + item.count, 0) : null;
  const reasons = [...(e === null ? ['未发现至少三个对象组成的有效空间节奏，仅评样式支持。'] : []), ...(covered.length < foreground.length ? ['仅有一个对象的类型族未参与样式比较。'] : [])];
  return dimension(foreground, covered, 100 * (e === null ? t : .70 * t + .30 * e), ['样式支持', ...(e === null ? [] : ['空间节奏'])], reasons, items);
}
function primaryColor(unit: Unit): RGB { return unit.fill ?? unit.stroke!; }
function contrast(foreground: Unit[]): DimensionScore {
  if (!foreground.length) return dimension(foreground, [], null, [], ['当前没有可评的可见内容。']);
  const categories = ['text', 'shape'].map(type => foreground.filter(u => u.element.type === type)).filter(units => units.length);
  const v = average(categories.map(units => average(units.map(u => u.visibility))));
  const dValues: number[] = [], dUnits: Unit[] = [];
  for (const unit of foreground) {
    const differences: number[] = [];
    for (const other of foreground) {
      if (unit === other) continue;
      const channels = [linear(Math.abs(luminance(primaryColor(unit)) - luminance(primaryColor(other))), 0, .35)];
      if (unit.element.type === other.element.type) {
        const size = (u: Unit) => u.element.type === 'text' ? u.element.fontSize : Math.sqrt(u.area);
        const smaller = Math.min(size(unit), size(other)), larger = Math.max(size(unit), size(other));
        channels.push(linear(smaller > 0 ? larger / smaller : 1, 1, 1.8));
      }
      if (unit.element.type === 'text' && other.element.type === 'text') channels.push(linear(Math.abs(unit.element.fontWeight - other.element.fontWeight), 0, 300));
      if (channels.length) differences.push(Math.max(...channels));
    }
    if (differences.length) { dValues.push(Math.max(...differences)); dUnits.push(unit); }
  }
  const d = dValues.length ? median(dValues) : null;
  const items = [evidence('contrast.visibility', foreground, '文字与图形先分别求可见度均值，再对存在的类别等权平均；仅作为参考，非可访问性认证。', { visibility: round(v), textCount: foreground.filter(u => u.element.type === 'text').length, shapeCount: foreground.filter(u => u.element.type === 'shape').length, areaMeasurement: SCORING_MEASUREMENT_VERSION })];
  if (d !== null) items.push(evidence('contrast.difference', dUnits, '视觉差异取每个对象最大差异的中位数，只说明差异存在，不判断强调是否正确。', { difference: round(d) }));
  return dimension(foreground, foreground, 100 * (d === null ? v : .70 * v + .30 * d), ['可见度 V', ...(d === null ? [] : ['视觉差异 D'])], d === null ? ['仅一个前景对象，未评视觉差异。'] : [], items);
}

/** Pure rubric 2.0 evaluation. The caller must await document.fonts.ready before
 * invoking this in a browser and discard results whose sceneRevision is stale.
 * No clock, random number, persistence or mutation is used here. */
export function evaluate(scene: SceneDocument): ScoreReport {
  assertScene(scene);
  const warnings: RuleEvidence[] = [];
  const foreground = prepare(scene, warnings), axes = findAxes(foreground);
  const dimensions: Record<DimensionKey, DimensionScore> = { proximity: proximity(foreground), repetition: repetition(foreground, axes), contrast: contrast(foreground), alignment: alignment(foreground, axes) };
  const valid = Object.values(dimensions).filter(d => d.score !== null && d.status !== 'not-applicable');
  if (foreground.some(u => u.element.type === 'text')) warnings.push(evidence('measurement.text-regions', foreground.filter(u => u.element.type === 'text'), '文字区域按实际换行与字体行矩形近似；字腔、行内空格及抗锯齿不逐像素解析。浏览器测量须等待本地字体就绪。', { layoutVersion: LAYOUT_VERSION, fontManifestVersion: FONT_MANIFEST_VERSION, measurementVersion: SCORING_MEASUREMENT_VERSION }));
  warnings.push(evidence('measurement.area', [], '颜色、裁切、遮挡与底板包含以逻辑坐标区域采样计算；曲线距离使用采样轮廓，细小边界变化可能有微小误差。', { areaResolution: '通常 2 逻辑单位；大对象自适应至约 24000 个采样单元', measurementVersion: SCORING_MEASUREMENT_VERSION }));
  const fontMeasurement = typeof document === 'undefined' ? 'node-fallback' : 'canvas-fonts';
  return { rubricVersion: '2.0', sceneRevision: scene.revision, sceneFingerprint: sceneFingerprint(scene), layoutVersion: `${LAYOUT_VERSION}/${SCORING_MEASUREMENT_VERSION}/${fontMeasurement}`, fontManifestVersion: FONT_MANIFEST_VERSION,
    dimensions, total: valid.length ? Math.round(average(valid.map(d => d.score!))) : null, totalKind: valid.length === 4 ? 'four-dimension-reference' : valid.length ? 'partial-reference' : 'unavailable', applicableDimensionCount: valid.length, warnings };
}
