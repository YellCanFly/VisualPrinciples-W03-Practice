import { describe, expect, it } from 'vitest';
import { COMBINED_STEPS, DEFAULT_COMPARISON_SETTINGS, copyExample, getCombinedScene, getComparisonScenes, type ComparisonSettings } from '../../src/data/comparisons/examples';
import { elementBounds } from '../../src/domain/layout/layout';
import { DIMENSIONS, type SceneDocument } from '../../src/domain/scene/types';
import { validateScene } from '../../src/domain/scene/validation';

const settings: ComparisonSettings[] = [
  DEFAULT_COMPARISON_SETTINGS,
  { proximity: 12, repetition: 0, contrast: 0, contrastShape: 0, contrastColor: 0, alignment: 'center' },
  { proximity: 72, repetition: 100, contrast: 100, contrastShape: 100, contrastColor: 100, alignment: 'columns' },
  { ...DEFAULT_COMPARISON_SETTINGS, repetition: 25 },
  { ...DEFAULT_COMPARISON_SETTINGS, repetition: 50 },
  { ...DEFAULT_COMPARISON_SETTINGS, repetition: 75 },
];

function checkScene(scene: SceneDocument) {
  expect(() => validateScene(scene)).not.toThrow();
  for (const element of scene.elements) {
    const bounds = elementBounds(element);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(scene.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(scene.height);
  }
}

function content(scene: SceneDocument) {
  return scene.elements.map(element => element.type === 'text' ? [element.id, element.type, element.text] : [element.id, element.type, element.shape]);
}

describe('original neutral comparison scenes', () => {
  for (const dimension of DIMENSIONS) {
    it(`${dimension.key} preserves content, element identities and canvas dimensions at every control boundary`, () => {
      for (const setting of settings) {
        const { before, after } = getComparisonScenes(dimension.key, setting);
        checkScene(before);
        checkScene(after);
        expect(content(after)).toEqual(content(before));
        expect(after.elements).toHaveLength(before.elements.length);
        expect([after.width, after.height]).toEqual([before.width, before.height]);
      }
    });
  }

  it('keeps the same neutral elements through all combined steps', () => {
    const initial = getCombinedScene(0);
    for (let index = 0; index < COMBINED_STEPS.length; index++) {
      const scene = getCombinedScene(index);
      checkScene(scene);
      expect(content(scene)).toEqual(content(initial));
    }
  });

  it('copies examples into independent editable documents with entirely new IDs', () => {
    const source = getComparisonScenes('proximity').after;
    const copy = copyExample(source, '亲密性 · 自由尝试');
    expect(() => validateScene(copy)).not.toThrow();
    expect(copy.documentId).not.toBe(source.documentId);
    expect(copy.elements).toHaveLength(source.elements.length);
    expect(new Set(copy.elements.map(element => element.id)).size).toBe(copy.elements.length);
    expect(copy.elements.every(element => !source.elements.some(original => original.id === element.id))).toBe(true);
    copy.elements[0].x = 0;
    expect(source.elements[0].x).not.toBe(0);
    expect(copy.elements.every(element => !element.locked)).toBe(true);
  });
});
