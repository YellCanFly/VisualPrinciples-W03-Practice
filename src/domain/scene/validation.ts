import { SHAPES, type SceneDocument, type SceneElement } from './types';

export const SCENE_LIMITS = { maxFileBytes: 2 * 1024 * 1024, maxElements: 40, maxTextLength: 1000, maxTotalTextLength: 10000, minCanvasSize: 64, maxCanvasSize: 4096, maxCoordinate: 32768, maxElementSize: 8192, maxNameLength: 120 } as const;
export class SceneValidationError extends Error { constructor(message: string) { super(message); this.name = 'SceneValidationError'; } }
function fail(message: string): never { throw new SceneValidationError(message); }
function record(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} 必须是对象。`); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, allowed: string[], path: string) {
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) fail(`${path} 包含不支持的字段 ${unknown.join('、')}（首版不支持旋转、透明度或外链资源）。`);
}
function number(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isSafeInteger(value)) fail(`${path} 必须是 ${min}–${max} 范围内的${integer ? '整数' : '有限数值'}。`);
  return value;
}
function string(value: unknown, path: string, max: number, nonempty = false): string {
  if (typeof value !== 'string' || Array.from(value).length > max || nonempty && !value.trim()) fail(`${path} 必须是${nonempty ? '非空且' : ''}不超过 ${max} 字符的文字。`);
  return value;
}
function id(value: unknown, path: string) { const result = string(value, path, 128, true); if (!/^[A-Za-z0-9_-]+$/.test(result)) fail(`${path} 只能包含字母、数字、下划线和连字符。`); return result; }
export function isColor(value: unknown, allowNone = false): value is string { return typeof value === 'string' && (/^#[\da-f]{6}$/i.test(value) || /^#[\da-f]{3}$/i.test(value) || allowNone && value === 'none'); }
function color(value: unknown, path: string, allowNone = false): string { if (!isColor(value, allowNone)) fail(`${path} 仅支持不透明 HEX 色值${allowNone ? '或 none' : ''}。`); return value; }
const baseKeys = ['id', 'type', 'x', 'y', 'width', 'height', 'locked'];
export function validateScene(input: unknown): SceneDocument {
  const value = record(input, '作品');
  keys(value, ['schemaVersion', 'documentId', 'name', 'revision', 'width', 'height', 'background', 'elements', 'updatedAt'], '作品');
  if (value.schemaVersion !== 2) fail(`不支持作品格式版本 ${String(value.schemaVersion)}；当前仅支持 schemaVersion 2，已有作品未被覆盖。`);
  const documentId = id(value.documentId, '作品 ID');
  const name = string(value.name, '作品名', SCENE_LIMITS.maxNameLength, true);
  const revision = number(value.revision, '修订号', 0, Number.MAX_SAFE_INTEGER, true);
  const width = number(value.width, '画布宽度', SCENE_LIMITS.minCanvasSize, SCENE_LIMITS.maxCanvasSize);
  const height = number(value.height, '画布高度', SCENE_LIMITS.minCanvasSize, SCENE_LIMITS.maxCanvasSize);
  const background = color(value.background, '背景颜色');
  const updatedAt = string(value.updatedAt, '保存时间', 64, true);
  if (!Number.isFinite(Date.parse(updatedAt))) fail('保存时间不是有效的日期时间。');
  if (!Array.isArray(value.elements) || value.elements.length > SCENE_LIMITS.maxElements) fail(`作品必须包含元素数组，最多 ${SCENE_LIMITS.maxElements} 个对象。`);
  const ids = new Set<string>(); let characters = 0;
  const elements: SceneElement[] = value.elements.map((raw, index) => {
    const path = `元素 ${index + 1}`, item = record(raw, path);
    if (item.type !== 'text' && item.type !== 'shape') fail(`${path} 包含未知类型。`);
    keys(item, [...baseKeys, ...(item.type === 'text' ? ['text', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'textAlign'] : ['shape', 'fill', 'stroke', 'strokeWidth', 'radius', 'x2', 'y2'])], path);
    const elementId = id(item.id, `${path} ID`);
    if (ids.has(elementId)) fail(`对象 ID 重复：${elementId}。`); ids.add(elementId);
    if (typeof item.locked !== 'boolean') fail(`${path} locked 必须为布尔值。`);
    const linear = item.type === 'shape' && (item.shape === 'line' || item.shape === 'arrow');
    const base = {
      id: elementId, x: number(item.x, `${path} X`, -SCENE_LIMITS.maxCoordinate, SCENE_LIMITS.maxCoordinate), y: number(item.y, `${path} Y`, -SCENE_LIMITS.maxCoordinate, SCENE_LIMITS.maxCoordinate),
      width: number(item.width, `${path} 宽度`, linear ? 0 : 1, SCENE_LIMITS.maxElementSize), height: number(item.height, `${path} 高度`, linear ? 0 : 1, item.type === 'text' ? 240000 : SCENE_LIMITS.maxElementSize), locked: item.locked,
    };
    if (item.type === 'text') {
      const text = string(item.text, `${path} 内容`, SCENE_LIMITS.maxTextLength); characters += Array.from(text).length;
      if (item.fontFamily !== 'sans' && item.fontFamily !== 'serif') fail(`${path} 字体仅支持 sans / serif。`);
      if (item.fontWeight !== 400 && item.fontWeight !== 700) fail(`${path} 字重仅支持本地字体提供的 400 / 700。`);
      if (item.textAlign !== 'left' && item.textAlign !== 'center' && item.textAlign !== 'right') fail(`${path} 文字对齐值不合法。`);
      return { ...base, type: 'text', text, fontFamily: item.fontFamily, fontSize: number(item.fontSize, `${path} 字号`, 12, 120), fontWeight: item.fontWeight, lineHeight: number(item.lineHeight, `${path} 行距`, 1, 2), color: color(item.color, `${path} 文字颜色`), textAlign: item.textAlign };
    }
    if (!SHAPES.some(shape => shape.key === item.shape)) fail(`${path} 包含未知图形。`);
    const result: SceneElement = { ...base, type: 'shape', shape: item.shape as typeof SHAPES[number]['key'], fill: color(item.fill, `${path} 填充`, true), stroke: color(item.stroke, `${path} 描边`, true), strokeWidth: number(item.strokeWidth, `${path} 描边宽度`, 0, 128), radius: number(item.radius, `${path} 圆角`, 0, SCENE_LIMITS.maxElementSize) };
    if (linear) {
      result.x2 = number(item.x2, `${path} 端点 X`, -SCENE_LIMITS.maxCoordinate, SCENE_LIMITS.maxCoordinate);
      result.y2 = number(item.y2, `${path} 端点 Y`, -SCENE_LIMITS.maxCoordinate, SCENE_LIMITS.maxCoordinate);
      if (Math.hypot(result.x2 - result.x, result.y2 - result.y) < .01) fail(`${path} 线段长度不能为零。`);
    } else if ('x2' in item || 'y2' in item) fail(`${path} 只有直线和箭头支持端点属性。`);
    return result;
  });
  if (characters > SCENE_LIMITS.maxTotalTextLength) fail(`整幅作品最多 ${SCENE_LIMITS.maxTotalTextLength} 字符。`);
  return { schemaVersion: 2, documentId, name, revision, width, height, background, elements, updatedAt };
}
export const validateSceneDocument = validateScene;
export function validateJsonSize(json: string) { if (new TextEncoder().encode(json).byteLength > SCENE_LIMITS.maxFileBytes) fail('JSON 文件超过 2 MiB，请减少内容后重试。'); }
export function parseSceneJson(json: string): SceneDocument {
  validateJsonSize(json);
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { fail('文件不是有效的 JSON，已有作品未被覆盖。'); }
  const value = record(parsed, 'JSON');
  if ('scene' in value) {
    keys(value, ['format', 'schemaVersion', 'scene', 'report'], 'JSON');
    if (value.format !== 'w03-design-lab' || value.schemaVersion !== 2) fail('不支持此 JSON 文件格式或版本。');
    // Imported reports are deliberately ignored and never treated as current scores.
    return validateScene(value.scene);
  }
  return validateScene(value);
}
