import { describe, expect, it } from 'vitest';
import { parseSceneJson, SCENE_LIMITS, validateScene } from '../../src/domain/scene/validation';
import type { SceneDocument, ShapeElement, TextElement } from '../../src/domain/scene/types';
import { containsPoint, elementBounds, measureText, textLineRegions } from '../../src/domain/layout/layout';

const text: TextElement = { id: 'text-1', type: 'text', x: 20, y: 40, width: 200, height: 40, locked: false, text: '中文 English', fontFamily: 'sans', fontSize: 24, fontWeight: 400, lineHeight: 1.4, color: '#25332e', textAlign: 'left' };
const shape: ShapeElement = { id: 'shape-1', type: 'shape', shape: 'rectangle', x: 20, y: 40, width: 100, height: 80, locked: false, fill: '#fff', stroke: '#000', strokeWidth: 4, radius: 10 };
const scene = (elements = [text] as SceneDocument['elements']): SceneDocument => ({ schemaVersion: 2, documentId: 'test-scene', name: '中文作品', revision: 0, width: 960, height: 640, background: '#ffffff', elements, updatedAt: '2026-10-14T00:00:00.000Z' });

describe('strict scene import and validation', () => {
  it('accepts arbitrary text and all supported opaque HEX colours', () => { const result = validateScene(scene()); expect(result.elements[0]).toEqual(text); expect(result).not.toBe(scene()); });
  it('roundtrips scene and envelope while ignoring all imported report content', () => {
    const document = scene();
    expect(parseSceneJson(JSON.stringify(document))).toEqual(document);
    expect(parseSceneJson(JSON.stringify({ format: 'w03-design-lab', schemaVersion: 2, scene: document, report: { total: 100, script: '<script>bad()</script>' } }))).toEqual(document);
  });
  it.each([
    { schemaVersion: 3 }, { background: 'rgba(0,0,0,.5)' }, { background: 'url(https://evil.test)' }, { revision: -1 }, { width: Infinity }, { height: 0 }, { elements: [{ ...text, opacity: .5 }] }, { elements: [{ ...text, rotation: 12 }] }, { elements: [{ ...text, fontFamily: 'external' }] }, { elements: [{ ...text, fontWeight: 500 }] }, { elements: [{ ...text, fontSize: 121 }] }, { elements: [{ ...text, textAlign: 'justify' }] }, { elements: [{ ...shape, shape: 'svg' }] }, { elements: [{ ...shape, strokeWidth: -1 }] }, { elements: [{ ...shape, fill: '#000000ff' }] }, { elements: [{ ...text, x: NaN }] },
  ])('rejects incompatible or malformed data %j', (changes) => { expect(() => validateScene({ ...scene(), ...changes })).toThrow(); });
  it('rejects unknown external resources and duplicate IDs', () => {
    expect(() => validateScene({ ...scene(), url: 'https://example.test' })).toThrow(/不支持/);
    expect(() => validateScene(scene([text, { ...text }]))).toThrow(/重复/);
  });
  it('validates object and text limits without splitting Unicode surrogate pairs', () => {
    expect(() => validateScene(scene(Array.from({ length: 41 }, (_, i) => ({ ...shape, id: `shape-${i}` }))))).toThrow(/40/);
    expect(() => validateScene(scene([{ ...text, text: '字'.repeat(1001) }]))).toThrow(/1000/);
    expect(validateScene(scene([{ ...text, text: '😀'.repeat(1000) }])).elements).toHaveLength(1);
    expect(() => validateScene(scene(Array.from({ length: 11 }, (_, i) => ({ ...text, id: `text-${i}`, text: '字'.repeat(1000) }))))).toThrow(/10000/);
  });
  it('rejects oversize UTF8 JSON before parsing', () => { expect(() => parseSceneJson('中'.repeat(Math.ceil(SCENE_LIMITS.maxFileBytes / 3) + 1))).toThrow(/2 MiB/); });
  it('requires finite nonzero line endpoints while permitting vertical lines', () => {
    const line = { ...shape, shape: 'line' as const, width: 0, height: 100, x2: shape.x, y2: shape.y + 100 };
    expect(validateScene(scene([line])).elements).toHaveLength(1);
    expect(() => validateScene(scene([{ ...line, y2: shape.y }]))).toThrow(/零/);
    expect(() => validateScene(scene([{ ...line, x2: undefined }]))).toThrow(/端点/);
  });
});

describe('shared deterministic geometry and text layout', () => {
  it('keeps explicit newlines and wraps both CJK and Latin at the same logical width', () => {
    const value = { ...text, width: 60, text: '中文测试\nABCD EFGH' };
    const measured = measureText(value);
    expect(measured.lines.slice(0, 2)).toEqual(['中文', '测试']);
    expect(measured.lines.join('')).toBe('中文测试ABCD EFGH');
    expect(measured.height).toBeCloseTo(measured.lines.length * value.fontSize * value.lineHeight);
    expect(textLineRegions(value)).toHaveLength(measured.lines.length);
  });
  it('measures visible text rather than empty frame width, including alignment', () => {
    const value = { ...text, text: '字', textAlign: 'right' as const };
    const bounds = elementBounds(value);
    expect(bounds.width).toBeLessThan(value.width);
    expect(bounds.x + bounds.width).toBeCloseTo(value.x + value.width);
    expect(measureText({ ...text, text: ' \n' }).bounds.width).toBe(0);
  });
  it('uses actual nonrectangular fill and stroke regions', () => {
    expect(containsPoint({ ...shape, shape: 'ellipse' }, 20, 40)).toBe(false);
    expect(containsPoint({ ...shape, shape: 'ellipse' }, 70, 80)).toBe(true);
    expect(containsPoint({ ...shape, fill: 'none' }, 70, 80)).toBe(false);
    expect(containsPoint({ ...shape, fill: 'none' }, 20, 80)).toBe(true);
    expect(containsPoint({ ...shape, shape: 'triangle', stroke: 'none' }, 25, 45)).toBe(false);
    expect(containsPoint({ ...shape, shape: 'star', stroke: 'none' }, 25, 45)).toBe(false);
  });
  it('uses world-space line endpoints and includes arrow heads', () => {
    const arrow = { ...shape, shape: 'arrow' as const, x2: 120, y2: 140, strokeWidth: 4 };
    expect(containsPoint(arrow, 70, 90)).toBe(true);
    expect(containsPoint(arrow, 70, 40)).toBe(false);
    expect(elementBounds(arrow).height).toBeGreaterThanOrEqual(100);
  });
});
