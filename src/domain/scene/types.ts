export type ShapeKind = 'rectangle' | 'rounded-rectangle' | 'circle' | 'ellipse' | 'triangle' | 'diamond' | 'line' | 'arrow' | 'star';
export type FontId = 'sans' | 'serif';
export interface ElementBase { id: string; x: number; y: number; width: number; height: number; locked: boolean; }
export interface TextElement extends ElementBase { type: 'text'; text: string; fontFamily: FontId; fontSize: number; fontWeight: number; lineHeight: number; color: string; textAlign: 'left' | 'center' | 'right'; }
export interface ShapeElement extends ElementBase { type: 'shape'; shape: ShapeKind; fill: string; stroke: string; strokeWidth: number; radius: number; x2?: number; y2?: number; }
export type SceneElement = TextElement | ShapeElement;
export interface SceneDocument { schemaVersion: 2; documentId: string; name: string; revision: number; width: number; height: number; background: string; elements: SceneElement[]; updatedAt: string; }
export type DimensionKey = 'proximity' | 'repetition' | 'contrast' | 'alignment';
export interface RuleEvidence { ruleId: string; elementIds: string[]; severity: 'info' | 'suggestion' | 'warning'; measurements: Record<string, number | string>; explanation: string; suggestion?: string; }
export interface DimensionScore { score: number | null; status: 'valid' | 'limited' | 'not-applicable'; evaluatedIds: string[]; evaluatedVisualUnitCount: number; visibleForegroundCount: number; applicableSubmetrics: string[]; unavailableReasons: string[]; evidence: RuleEvidence[]; }
export interface ScoreReport { rubricVersion: '2.0'; sceneRevision: number; sceneFingerprint: string; layoutVersion: string; fontManifestVersion: string; dimensions: Record<DimensionKey, DimensionScore>; total: number | null; totalKind: 'four-dimension-reference' | 'partial-reference' | 'unavailable'; applicableDimensionCount: number; warnings: RuleEvidence[]; }
export interface Snapshot { id: string; name: string; scene: SceneDocument; report?: ScoreReport; createdAt: string; }
export const DIMENSIONS: { key: DimensionKey; label: string; english: string; color: string }[] = [
  { key: 'proximity', label: '亲密性', english: 'PROXIMITY', color: '#62745d' },
  { key: 'repetition', label: '重复', english: 'REPETITION', color: '#b4784d' },
  { key: 'contrast', label: '对比', english: 'CONTRAST', color: '#736795' },
  { key: 'alignment', label: '对齐', english: 'ALIGNMENT', color: '#507d91' },
];
export const SHAPES: { key: ShapeKind; label: string }[] = [{key:'rectangle',label:'矩形'},{key:'rounded-rectangle',label:'圆角矩形'},{key:'circle',label:'圆形'},{key:'ellipse',label:'椭圆'},{key:'triangle',label:'三角形'},{key:'diamond',label:'菱形'},{key:'line',label:'直线'},{key:'arrow',label:'箭头'},{key:'star',label:'五角星'}];
export function newScene(name = '未命名作品'): SceneDocument { return { schemaVersion: 2, documentId: crypto.randomUUID(), name, revision: 0, width: 960, height: 640, background: '#ffffff', elements: [], updatedAt: new Date().toISOString() }; }
export function createElement(kind: 'text' | ShapeKind, x = 360, y = 240): SceneElement { const base = { id: crypto.randomUUID(), x, y, width: kind === 'text' ? 280 : 140, height: kind === 'text' ? 40 : 140, locked: false }; return kind === 'text' ? { ...base, type: 'text', text: '输入文字', fontFamily: 'sans', fontSize: 24, fontWeight: 400, lineHeight: 1.4, color: '#25332e', textAlign: 'left' } : { ...base, type: 'shape', shape: kind, fill: ['line','arrow'].includes(kind) ? 'none' : '#a9bba4', stroke: ['line','arrow'].includes(kind) ? '#32483a' : 'none', strokeWidth: 3, radius: 20, ...(['line','arrow'].includes(kind) ? { x2: x + 160, y2: y + 80, width: 160, height: 80 } : {}) }; }
