import type { SceneDocument } from '../domain/scene/types';
let coverage: Promise<Record<string, number[]>> | undefined;
export async function ensureSceneFonts(scene: SceneDocument) {
  const texts = scene.elements.filter(e => e.type === 'text');
  await Promise.all(texts.map(e => document.fonts.load(`${e.fontWeight} ${e.fontSize}px "Lab ${e.fontFamily === 'serif' ? 'Serif' : 'Sans'}"`)));
  await document.fonts.ready;
  coverage ??= fetch(`${import.meta.env.BASE_URL}fonts/coverage.json`).then(r => { if (!r.ok) throw new Error('字体覆盖表加载失败'); return r.json(); });
  const sets = await coverage;
  for (const e of texts) {
    const supported = new Set(sets[e.fontFamily]);
    const missing = [...new Set([...e.text].filter(c => !/\s/.test(c) && !supported.has(c.codePointAt(0)!)))];
    if (missing.length) throw new Error(`字体暂不支持这些字符：${missing.slice(0,8).join(' ')}。请替换字符后分析或导出 PNG；作品仍可保存为 JSON。`);
    if (!document.fonts.check(`${e.fontWeight} ${e.fontSize}px "Lab ${e.fontFamily === 'serif' ? 'Serif' : 'Sans'}"`)) throw new Error('本地字体加载失败，请稍后重试。');
  }
}
