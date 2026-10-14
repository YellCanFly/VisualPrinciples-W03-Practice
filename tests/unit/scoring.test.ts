import { describe, expect, it } from 'vitest';
import type { SceneDocument, SceneElement, ShapeElement, TextElement } from '../../src/domain/scene/types';
import { colorSimilarity, contrastRatio, evaluate, parseColor, sceneFingerprint } from '../../src/domain/scoring';
import { geometry, regionGap } from '../../src/domain/scoring/geometry';

const rect = (id: string, x: number, y: number, extra: Partial<ShapeElement> = {}): ShapeElement => ({ id, type: 'shape', shape: 'rectangle', x, y, width: 24, height: 24, fill: '#000000', stroke: 'none', strokeWidth: 2, radius: 0, locked: false, ...extra });
const text = (id: string, x: number, y: number, extra: Partial<TextElement> = {}): TextElement => ({ id, type: 'text', text: '文字', x, y, width: 200, height: 40, fontFamily: 'sans', fontSize: 24, fontWeight: 400, lineHeight: 1.4, color: '#000000', textAlign: 'left', locked: false, ...extra });
const scene = (...elements: SceneElement[]): SceneDocument => ({ schemaVersion: 2, documentId: 'fixture', name: '测试画布', revision: 5, width: 960, height: 640, background: '#ffffff', elements, updatedAt: '2026-10-14T00:00:00Z' });
const groupScene = () => scene(...[20, 54, 88, 360, 394, 428].map((x, i) => rect(`r${i}`, x, 100)));

describe('rubric 2.0 coverage and denominator', () => {
  it('empty canvas has four N/A dimensions and no fabricated total', () => {
    const result = evaluate(scene());
    expect(result.total).toBeNull(); expect(result.applicableDimensionCount).toBe(0);
    expect(Object.values(result.dimensions).every(d => d.score === null && d.status === 'not-applicable')).toBe(true);
  });
  it('one text evaluates only visibility and reports 1/4 limited coverage', () => {
    const result = evaluate(scene(text('t', 20, 20)));
    expect(result.total).toBe(100); expect(result.applicableDimensionCount).toBe(1);
    expect(result.totalKind).toBe('partial-reference');
    expect(result.dimensions.contrast.status).toBe('limited');
    expect(result.dimensions.contrast.applicableSubmetrics).toEqual(['可见度 V']);
  });
  it('two circles evaluate contrast and alignment, with missing dimensions excluded from total', () => {
    const result = evaluate(scene(rect('a', 20, 20, { shape: 'circle' }), rect('b', 100, 20, { shape: 'circle' })));
    expect(result.dimensions.contrast.score).toBeCloseTo(70);
    expect(result.dimensions.alignment.score).toBe(100);
    expect(result.applicableDimensionCount).toBe(2); expect(result.total).toBe(85);
    expect(result.dimensions.proximity.score).toBeNull(); expect(result.dimensions.repetition.score).toBeNull();
  });
  it('all distinct types have no repetition family, with no deletion penalty', () => {
    const result = evaluate(scene(rect('a', 20, 20), rect('b', 100, 20, { shape: 'circle' }), text('c', 20, 100)));
    expect(result.dimensions.repetition.score).toBeNull();
    const after = evaluate(scene(text('c', 20, 100)));
    expect(after.total).toBe(100); expect(after.applicableDimensionCount).toBe(1);
  });
});

describe('visible visual units and true occupied regions', () => {
  it('folds identical overlapping copies and retains every source ID', () => {
    const baseline = scene(rect('a', 20, 20), rect('b', 80, 20), rect('c', 140, 20));
    const duplicate = scene(...baseline.elements, { ...baseline.elements[0], id: 'a-copy' });
    const one = evaluate(baseline), two = evaluate(duplicate);
    expect(two.total).toBe(one.total);
    expect(two.dimensions.repetition.evaluatedVisualUnitCount).toBe(3);
    expect(two.dimensions.repetition.evaluatedIds).toContain('a-copy');
    expect(two.warnings.some(w => w.ruleId === 'visibility.duplicate' && w.elementIds.includes('a'))).toBe(true);
  });
  it('excludes blank, off-canvas, color-invisible and fully covered objects', () => {
    const result = evaluate(scene(text('blank', 0, 0, { text: '   ' }), rect('outside', -100, -100), rect('white', 100, 100, { fill: '#fff' }), rect('under', 200, 200), rect('cover', 200, 200, { fill: '#ff0000' })));
    expect(result.dimensions.contrast.visibleForegroundCount).toBe(1);
    expect(result.warnings.filter(w => w.ruleId === 'visibility.excluded').flatMap(w => w.elementIds)).toEqual(expect.arrayContaining(['blank', 'outside', 'white', 'under']));
  });
  it('infers only filled lower plates, and resolves upper plates as occlusion', () => {
    const plate = rect('plate', 0, 0, { width: 300, height: 200, fill: '#000000' });
    const children = [text('one', 20, 20, { color: '#fff' }), text('two', 20, 90, { color: '#fff' })];
    const behind = evaluate(scene(plate, ...children));
    expect(behind.dimensions.contrast.visibleForegroundCount).toBe(2);
    expect(behind.warnings.some(w => w.ruleId === 'visibility.backplate')).toBe(true);
    expect(behind.dimensions.contrast.evaluatedIds).not.toContain('plate');
    const ahead = evaluate(scene(...children, plate));
    expect(ahead.dimensions.contrast.visibleForegroundCount).toBe(1);
    expect(ahead.dimensions.contrast.evaluatedIds).toEqual(['plate']);
  });
  it('does not turn an unfilled frame into a background or hide its interior text', () => {
    const result = evaluate(scene(rect('frame', 0, 0, { width: 300, height: 200, fill: 'none', stroke: '#000' }), text('one', 20, 20), text('two', 20, 90)));
    expect(result.dimensions.contrast.visibleForegroundCount).toBe(3);
    expect(result.warnings.some(w => w.ruleId === 'visibility.backplate')).toBe(false);
  });
  it.each(['circle', 'star', 'diamond'] as const)('does not replace %s occupancy by its enclosing box', shape => {
    const result = evaluate(scene(text('corner', 0, 0, { text: 'A', fontSize: 12 }), rect('shape', 0, 0, { shape, width: 100, height: 100 })));
    expect(result.dimensions.contrast.evaluatedIds).toContain('corner');
    expect(result.warnings.some(w => w.ruleId === 'visibility.excluded' && w.elementIds.includes('corner'))).toBe(false);
  });
  it('a thin diagonal covers only its actual stroke rather than a whole text box', () => {
    const result = evaluate(scene(text('t', 0, 0), rect('line', 0, 0, { shape: 'line', x2: 100, y2: 100, width: 100, height: 100, fill: 'none', stroke: '#f00', strokeWidth: 2 })));
    expect(result.dimensions.contrast.evaluatedIds).toContain('t');
    const warning = result.warnings.find(w => w.ruleId === 'visibility.text-damage');
    expect(Number(warning?.measurements.effectiveAreaRatio)).toBeGreaterThan(.8);
  });
  it('uses real circle outline distance, including open interiors', () => {
    const circle = geometry(rect('circle', 0, 0, { shape: 'circle', width: 100, height: 100 }));
    const corner = geometry(rect('corner', 0, 0, { width: 8, height: 8 }));
    expect(regionGap(circle, corner)).toBeGreaterThan(9);
    const frame = geometry(rect('frame', 0, 0, { width: 100, height: 100, fill: 'none', stroke: '#000', strokeWidth: 2 }));
    const center = geometry(rect('center', 40, 40, { width: 20, height: 20 }));
    expect(regionGap(frame, center)).toBeCloseTo(39);
  });
});

describe('geometric grouping, repetition and axes', () => {
  it('finds two stable pure-shape groups without semantic declarations', () => {
    const result = evaluate(groupScene());
    expect(result.applicableDimensionCount).toBe(4);
    expect(result.dimensions.proximity.score).toBeGreaterThan(95);
    expect(result.dimensions.proximity.evidence.filter(e => e.ruleId === 'proximity.group')).toHaveLength(2);
    expect(result.dimensions.repetition.score).toBe(100);
    expect(result.dimensions.alignment.score).toBe(100);
  });
  it('uniform grid has no proximity jump and retains strong repetition/alignment', () => {
    const result = evaluate(scene(...[20, 80, 140].flatMap((x, i) => [20, 80].map((y, j) => rect(`${i}-${j}`, x, y)))));
    expect(result.dimensions.proximity.score).toBeNull();
    expect(result.dimensions.repetition.score).toBe(100); expect(result.dimensions.alignment.score).toBe(100);
  });
  it('isolated group neighbors reduce object coverage instead of imposing a fixed penalty', () => {
    const result = evaluate(scene(rect('a', 20, 20), rect('b', 54, 20), rect('isolated', 400, 20)));
    expect(result.dimensions.proximity.status).toBe('limited');
    expect(result.dimensions.proximity.evaluatedVisualUnitCount).toBe(2);
    expect(result.dimensions.proximity.visibleForegroundCount).toBe(3);
  });
  it('same styles without a 3-object axis evaluate style support only', () => {
    const result = evaluate(scene(rect('a', 20, 20), rect('b', 137, 113), rect('c', 320, 245)));
    expect(result.dimensions.repetition.score).toBe(100);
    expect(result.dimensions.repetition.status).toBe('limited');
    expect(result.dimensions.repetition.applicableSubmetrics).toEqual(['样式支持']);
    expect(result.dimensions.alignment.score).toBe(0);
  });
  it('accepts separate axes of a two-column composition', () => {
    const result = evaluate(scene(rect('a', 20, 20), rect('b', 20, 120), rect('c', 300, 20), rect('d', 300, 120)));
    expect(result.dimensions.alignment.score).toBe(100);
    expect(result.dimensions.alignment.evidence.filter(e => e.ruleId === 'alignment.axis' && e.measurements.axis === 'x:left')).toHaveLength(2);
  });
  it('deviations score continuously and overlapping piles receive no axis reward', () => {
    const slightly = evaluate(scene(rect('a', 20, 20), rect('b', 30, 120)));
    expect(slightly.dimensions.alignment.score).toBeCloseTo(100 * (1 - 8 / 18));
    const pile = evaluate(scene(text('a', 20, 20, { text: '一二三四五六' }), text('b', 25, 25, { text: '一二三四五' }), text('c', 30, 30, { text: '一二三四' })));
    expect(pile.dimensions.alignment.score).toBe(0);
  });
  it('structure scores remain invariant after an interior translation', () => {
    const before = groupScene();
    const after = { ...before, elements: before.elements.map(e => ({ ...e, x: e.x + 11.3, y: e.y + 7.7 })) };
    const a = evaluate(before), b = evaluate(after);
    for (const key of ['proximity', 'repetition', 'alignment'] as const) expect(b.dimensions[key].score).toBeCloseTo(a.dimensions[key].score!, 8);
  });
  it('an evenly spaced single column has rhythm and alignment but no fabricated group split', () => {
    const result = evaluate(scene(...[20, 80, 140, 200].map((y, i) => rect(`column-${i}`, 100, y))));
    expect(result.dimensions.proximity.score).toBeNull();
    expect(result.dimensions.repetition.score).toBe(100);
    expect(result.dimensions.repetition.evidence.some(e => e.ruleId === 'repetition.rhythm' && e.measurements.direction === 'y')).toBe(true);
    expect(result.dimensions.alignment.score).toBe(100);
  });
  it('a fully overlapping stack resolves paint order and cannot gain structural evidence', () => {
    const result = evaluate(scene(rect('under', 20, 20), rect('middle', 20, 20, { fill: '#f00' }), rect('top', 20, 20, { fill: '#00f' })));
    expect(result.dimensions.contrast.evaluatedIds).toEqual(['top']);
    expect(result.dimensions.alignment.score).toBeNull();
    expect(result.applicableDimensionCount).toBe(1);
  });
  it('evaluates a representative 40-element canvas within the interactive analysis budget', () => {
    const kinds = ['rectangle', 'circle', 'diamond', 'star'] as const;
    const value = scene(...Array.from({ length: 40 }, (_, i) => rect(`perf-${i}`, 20 + (i % 8) * 110, 20 + Math.floor(i / 8) * 110, { shape: kinds[i % kinds.length], width: 52, height: 52 })));
    const started = performance.now();
    const result = evaluate(value);
    const elapsed = performance.now() - started;
    expect(result.dimensions.contrast.visibleForegroundCount).toBe(40);
    expect(result.total).not.toBeNull();
    // A generous regression ceiling avoids machine-dependent flaky assertions.
    // The measured run time is printed by Vitest's slow-test report when >300ms.
    expect(elapsed).toBeLessThan(1500);
  });
});

describe('contrast and reproducibility', () => {
  it('uses sRGB contrast and perceptual OKLab similarity', () => {
    expect(contrastRatio(parseColor('#000'), parseColor('#fff'))).toBe(21);
    expect(colorSimilarity('#112233', 'rgb(17, 34, 51)')).toBe(1);
    expect(colorSimilarity('#000', '#fff')).toBe(0);
    expect(colorSimilarity('none', '#fff')).toBe(0);
  });
  it('keeps the worst text background region, including same-color unreadable regions', () => {
    const result = evaluate(scene(rect('dark', 0, 0, { width: 40, height: 80 }), text('t', 0, 0, { text: '文字文字', color: '#fff' })));
    const warning = result.warnings.find(w => w.ruleId === 'contrast.visibility' && w.elementIds.includes('t'));
    expect(warning?.measurements.worstContrastRatio).toBe(1);
    expect(warning?.measurements.visibility).toBe(0);
  });
  it('combines overlapping clipping/occlusion/text collision as a union once', () => {
    const base = text('t', -24, 0, { text: '文字文字' });
    const clipOnly = evaluate(scene(base));
    const repeatedOcclusion = evaluate(scene(base, rect('cover', -100, 0, { width: 100, height: 100, fill: '#f00' })));
    expect(clipOnly.dimensions.contrast.score).toBeCloseTo(75, 1);
    const warning = repeatedOcclusion.warnings.find(w => w.ruleId === 'visibility.clipping' && w.elementIds.includes('t'));
    expect(warning?.measurements.clippedRatio).toBeCloseTo(.25, 2);
  });
  it('does not let many high-contrast decorations erase a weak text category', () => {
    const base = [text('t', 20, 20, { color: '#dddddd' }), rect('a', 20, 100)];
    const decorated = [...base, ...Array.from({ length: 12 }, (_, i) => rect(`d${i}`, 80 + i * 30, 100))];
    const v = (elements: SceneElement[]) => Number(evaluate(scene(...elements)).dimensions.contrast.evidence.find(e => e.ruleId === 'contrast.visibility')?.measurements.visibility);
    expect(v(decorated)).toBe(v(base));
  });
  it('is deterministic, does not mutate input, and changes fingerprints with visual edits', () => {
    const value = groupScene(), original = JSON.stringify(value), a = evaluate(value), b = evaluate(value);
    expect(a).toEqual(b); expect(JSON.stringify(value)).toBe(original);
    expect(sceneFingerprint({ ...value, revision: 200, name: '改名', updatedAt: 'later' })).toBe(a.sceneFingerprint);
    expect(sceneFingerprint({ ...value, background: '#eeeeee' })).not.toBe(a.sceneFingerprint);
  });
  it.each([
    () => scene(rect('a', 0, 0), rect('a', 100, 0)),
    () => scene(rect('bad', NaN, 0)),
    () => scene(rect('bad', 0, 0, { width: -1 })),
    () => scene(rect('bad', 0, 0, { fill: 'rgba(0,0,0,.5)' })),
    () => scene({ ...rect('bad', 0, 0), opacity: .5 } as ShapeElement),
  ])('rejects invalid or unsupported input rather than scoring it', make => { expect(() => evaluate(make())).toThrow(); });
});
