import type { DimensionKey, SceneDocument, SceneElement, ShapeElement, TextElement } from '../../domain/scene/types';

export interface ComparisonSettings {
  proximity: number;
  repetition: number;
  contrast: number;
  contrastShape: number;
  contrastColor: number;
  alignment: 'left' | 'center' | 'columns';
}

export const DEFAULT_COMPARISON_SETTINGS: ComparisonSettings = {
  proximity: 28,
  repetition: 100,
  contrast: 72,
  contrastShape: 72,
  contrastColor: 90,
  alignment: 'left',
};

export const COMPARISON_COPY: Record<DimensionKey, { title: string; intro: string; before: string; after: string; takeaway: string; note: string }> = {
  proximity: {
    title: '让距离，表达关系。',
    intro: '相近的元素更容易被看作一组。试着改变间距，观察视线如何重新组织画面。',
    before: '元素等距散开，关联不够清楚',
    after: '组内靠近，组与组之间留出空间',
    takeaway: '组内的距离小一点，组间的留白大一点。',
    note: '这里观察的是位置形成的视觉关系，不判断文字的语义。',
  },
  repetition: {
    title: '让相似，建立节奏。',
    intro: '反复出现的视觉特征带来连续感。统一一部分样式，看看画面如何形成自己的规则。',
    before: '相似元素使用了不同的视觉样式',
    after: '颜色、字号和形状处理有规律地复现',
    takeaway: '重复一个明确的特征，就能把元素联系起来。',
    note: '重复不等于所有元素相同；保留变化，也可以建立一致性。',
  },
  contrast: {
    title: '让差异，带来层次。',
    intro: '大小、粗细与明暗共同影响注意力。分别调整它们，观察哪一种差异最先被你看见。',
    before: '大小和明暗相近，视觉重点不明确',
    after: '差异拉开，阅读顺序变得更清楚',
    takeaway: '需要形成差别时，让差异足够清晰。',
    note: '层级差异与文字可读性是两件事：醒目的文字也需要清楚的背景对比。',
  },
  alignment: {
    title: '让边缘，建立秩序。',
    intro: '对齐线不必真的画出来，也能让元素产生联系。切换不同轴线，观察画面的整体结构。',
    before: '边缘零散偏移，视线反复寻找起点',
    after: '沿共享轴线排列，元素之间产生联系',
    takeaway: '为元素找到可共享的边缘、中心或基线。',
    note: '左对齐、居中与多列都可以成立；选择适合当前画面的关系。',
  },
};

const text = (id: string, value: string, x: number, y: number, fontSize = 32, width = 250, color = '#34483a'): TextElement => ({
  id, type: 'text', text: value, x, y, width, height: fontSize * 1.5,
  fontFamily: 'sans', fontSize, fontWeight: 400, lineHeight: 1.4,
  color, textAlign: 'left', locked: false,
});
const shape = (id: string, x: number, y: number, width = 68, height = 68, fill = '#899b7f'): ShapeElement => ({
  id, type: 'shape', shape: 'rounded-rectangle', x, y, width, height,
  fill, stroke: 'none', strokeWidth: 0, radius: 12, locked: false,
});
const document = (name: string, elements: SceneElement[]): SceneDocument => ({
  schemaVersion: 2, documentId: `example-${Array.from(name).reduce((hash, character) => (Math.imul(hash, 31) + character.codePointAt(0)!) >>> 0, 0).toString(16)}`, name, revision: 0,
  width: 960, height: 640, background: '#fcfcf8', elements,
  updatedAt: '2026-10-14T00:00:00.000Z',
});
const mix = (from: string, to: string, amount: number): string => {
  const p = Math.max(0, Math.min(1, amount / 100));
  return '#' + [0, 2, 4].map(offset => Math.round(parseInt(from.slice(offset + 1, offset + 3), 16) * (1 - p) + parseInt(to.slice(offset + 1, offset + 3), 16) * p).toString(16).padStart(2, '0')).join('');
};

export function getComparisonScenes(key: DimensionKey, settings = DEFAULT_COMPARISON_SETTINGS): { before: SceneDocument; after: SceneDocument } {
  let before: SceneElement[] = [];
  let after: SceneElement[] = [];
  if (key === 'proximity') {
    const colors = ['#8a9c80', '#c29a78', '#a3b0a6'];
    for (let i = 0; i < 3; i++) {
      const x = 122 + i * 282;
      const symbol = shape(`p-shape-${i}`, x, 138, 68, 68, colors[i]);
      const heading = { ...text(`p-title-${i}`, `文字 ${String.fromCharCode(65 + i)}`, x, 306, 34, 210), fontWeight: 700 };
      const description = text(`p-description-${i}`, '一段说明文字', x, 474, 24, 230, '#7b8175');
      before.push(symbol, heading, description);
      const gap = settings.proximity;
      after.push(symbol, { ...heading, y: 206 + gap }, { ...description, y: 257 + gap * 2 });
    }
  }
  if (key === 'repetition') {
    const colors = ['#738b78', '#bb9778', '#9290a1', '#5c7c84'];
    const sizes = [31, 27, 35, 29];
    for (let i = 0; i < 4; i++) {
      const y = 96 + i * 124;
      const symbol = { ...shape(`r-shape-${i}`, 132, y + 4, 62, 62, colors[i]), radius: [8, 22, 0, 14][i], stroke: i === 1 ? '#805e46' : 'none', strokeWidth: i === 1 ? 3 : 0 };
      const heading = { ...text(`r-title-${i}`, `文字 ${String.fromCharCode(65 + i)}`, 242, y - 1, sizes[i], 540, colors[i]), fontWeight: i === 2 ? 700 : 400 };
      const description = text(`r-description-${i}`, '一段说明文字', 242, y + 49, 22, 540, '#7b8175');
      before.push(symbol, heading, description);
      const unify = i < Math.round(settings.repetition / 25);
      after.push(unify ? { ...symbol, fill: '#81977b', radius: 12, stroke: 'none', strokeWidth: 0 } : symbol,
        unify ? { ...heading, color: '#34483a', fontSize: 31, height: 46.5, fontWeight: 700 } : heading, description);
    }
  }
  if (key === 'contrast') {
    const a = text('c-a', '文字 A', 132, 102, 38, 680, '#92988b');
    const b = text('c-b', '文字 B', 132, 222, 35, 680, '#92988b');
    const description = text('c-description', '一段说明文字', 132, 305, 30, 680, '#92988b');
    const circle = { ...shape('c-circle', 132, 439, 96, 96, '#a5ad9c'), shape: 'circle' as const };
    const rectangle = shape('c-square', 431, 439, 96, 96, '#a5ad9c');
    const smallCircle = { ...shape('c-small-circle', 730, 439, 96, 96, '#a5ad9c'), shape: 'circle' as const };
    before = [a, b, description, circle, rectangle, smallCircle];
    const contrast = settings.contrast / 100;
    const size = settings.contrastShape / 100;
    after = [
      { ...a, fontSize: 38 + contrast * 48, height: 140, fontWeight: contrast >= .35 ? 700 : 400, color: mix('#92988b', '#304333', settings.contrastColor) },
      { ...b, fontSize: 35 - contrast * 3, color: mix('#92988b', '#50624c', settings.contrastColor) },
      { ...description, fontSize: 30 - contrast * 6, color: mix('#92988b', '#68765e', settings.contrastColor) },
      { ...circle, width: 96 + size * 67, height: 96 + size * 67, y: 439 - size * 34, fill: mix('#a5ad9c', '#536d4b', settings.contrastColor) },
      { ...rectangle, width: 96 - size * 12, height: 96 - size * 12, y: 439 + size * 6, fill: mix('#a5ad9c', '#a3b28c', settings.contrastColor) },
      { ...smallCircle, width: 96 - size * 44, height: 96 - size * 44, y: 439 + size * 22, fill: mix('#a5ad9c', '#cbd5bb', settings.contrastColor) },
    ];
  }
  if (key === 'alignment') {
    const positions = [[165, 221], [310, 180], [229, 369]];
    for (let i = 0; i < 3; i++) {
      const y = 114 + i * 164;
      const heading = { ...text(`a-title-${i}`, `文字 ${String.fromCharCode(65 + i)}`, positions[i][0], y, 36, 580), fontWeight: 700 };
      const description = text(`a-description-${i}`, '一段说明文字', positions[i][1], y + 58, 24, 580, '#7b8175');
      before.push(heading, description);
      if (settings.alignment === 'center') after.push({ ...heading, x: 160, width: 640, textAlign: 'center' }, { ...description, x: 160, width: 640, textAlign: 'center' });
      else if (settings.alignment === 'columns') after.push({ ...heading, x: 150, width: 310 }, { ...description, x: 530, y: y + 10, width: 310 });
      else after.push({ ...heading, x: 160 }, { ...description, x: 160 });
    }
  }
  return { before: document(`${key}-调整前`, before), after: document(`${key}-调整后`, after) };
}

export const COMBINED_STEPS = [
  { label: '初始排布', principle: '从同一组元素出发', description: '先观察这些文字与图形的位置、样式和大小。' },
  { label: '建立分组', principle: '亲密性', description: '把距离收紧，让每组元素先形成联系。' },
  { label: '统一特征', principle: '重复', description: '让相同的字形、颜色与图形处理重复出现。' },
  { label: '拉开层次', principle: '对比', description: '放大字号与图形的差异，建立清晰的视觉层次。' },
  { label: '整理边缘', principle: '对齐', description: '把每组元素放在共享的轴线上，形成完整的秩序。' },
];

export function getCombinedScene(step: number): SceneDocument {
  const elements: SceneElement[] = [];
  const starts = [128, 405, 682];
  for (let i = 0; i < 3; i++) {
    const x = starts[i];
    const groupY = step === 0 ? [127, 176, 105][i] : 150;
    const symbol = { ...shape(`m-shape-${i}`, x + (step < 4 ? [0, 18, -12][i] : 0), groupY, 72, 72, step >= 2 ? '#81977b' : ['#81977b', '#c49c7c', '#a49aaf'][i]), radius: step >= 2 ? 12 : [12, 0, 28][i] };
    const heading = { ...text(`m-title-${i}`, `文字 ${String.fromCharCode(65 + i)}`, x + (step < 4 ? [8, -12, 17][i] : 0), step === 0 ? [328, 300, 350][i] : groupY + 112, step >= 3 ? 42 : 31, 230, step >= 2 ? '#34483a' : ['#738b78', '#bb9778', '#9290a1'][i]), fontWeight: step >= 3 ? 700 : 400 };
    const description = text(`m-description-${i}`, '一段说明文字', x + (step < 4 ? [-7, 15, -5][i] : 0), step === 0 ? [466, 489, 440][i] : groupY + 183, step >= 3 ? 22 : 26, 240, '#7b8175');
    elements.push(symbol, heading, description);
  }
  return document(`综合对比-${COMBINED_STEPS[step].label}`, elements);
}

export function copyExample(scene: SceneDocument, name: string): SceneDocument {
  return {
    ...structuredClone(scene), documentId: crypto.randomUUID(), name, revision: 0,
    elements: scene.elements.map(element => ({ ...element, id: crypto.randomUUID() })),
    updatedAt: new Date().toISOString(),
  };
}
