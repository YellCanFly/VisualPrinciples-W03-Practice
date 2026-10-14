import { DIMENSIONS, type SceneDocument, type ScoreReport } from '../../domain/scene/types';
import { parseSceneJson, SCENE_LIMITS, validateJsonSize, validateScene } from '../../domain/scene/validation';
import { arrowPoints, fontString, measureText, polygonPath, shapePath } from '../../domain/layout/layout';
import { sceneFingerprint } from '../../domain/scoring/evaluate';
import { ensureSceneFonts } from '../fonts';

function safeName(value: string) { return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/g, '').slice(0, 100) || '未命名作品'; }
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function checkReport(scene: SceneDocument, report: ScoreReport) {
  if (report.sceneRevision !== scene.revision || report.sceneFingerprint !== sceneFingerprint(scene) || report.rubricVersion !== '2.0') throw new Error('分析报告与当前作品版本不一致，请重新分析后导出。');
}
export function exportJson(input: SceneDocument, report?: ScoreReport): void {
  const scene = validateScene(input);
  const current = report?.sceneRevision === scene.revision && report.sceneFingerprint === sceneFingerprint(scene) ? report : undefined;
  const json = JSON.stringify({ format: 'w03-design-lab', schemaVersion: 2, scene, ...(current ? { report: current } : {}) }, null, 2);
  validateJsonSize(json); parseSceneJson(json);
  download(new Blob([json], { type: 'application/json;charset=utf-8' }), `${safeName(scene.name)}.design.json`);
}
export async function importJson(file: File): Promise<SceneDocument> {
  if (file.size > SCENE_LIMITS.maxFileBytes) throw new Error('JSON 文件超过 2 MiB，已有作品未被覆盖。');
  const parsed = parseSceneJson(await file.text());
  return { ...parsed, documentId: crypto.randomUUID(), name: `${parsed.name.slice(0, 114)}（导入）`, revision: 0, updatedAt: new Date().toISOString(), elements: parsed.elements.map(element => ({ ...element, id: crypto.randomUUID() })) };
}
/** Canvas and SVG use the same paths, font settings, line breaks and logical baselines. */
export async function renderSceneCanvas(input: SceneDocument, scale = 2): Promise<HTMLCanvasElement> {
  const scene = validateScene(input);
  await ensureSceneFonts(scene);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 2) throw new Error('导出比例不合法。');
  const canvas = document.createElement('canvas'); canvas.width = Math.round(scene.width * scale); canvas.height = Math.round(scene.height * scale);
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('浏览器无法创建导出画布。');
  ctx.scale(scale, scale); ctx.fillStyle = scene.background; ctx.fillRect(0, 0, scene.width, scene.height);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const e of scene.elements) {
    if (e.type === 'text') {
      const layout = measureText(e);
      ctx.font = fontString(e); ctx.fillStyle = e.color; ctx.textBaseline = 'alphabetic'; ctx.textAlign = e.textAlign;
      const x = e.x + (e.textAlign === 'center' ? e.width / 2 : e.textAlign === 'right' ? e.width : 0);
      layout.lines.forEach((line, i) => ctx.fillText(line, x, layout.baselines[i]));
    } else {
      const path = new Path2D(shapePath(e)), linear = e.shape === 'line' || e.shape === 'arrow';
      ctx.lineWidth = e.strokeWidth;
      if (!linear && e.fill !== 'none') { ctx.fillStyle = e.fill; ctx.fill(path); }
      if (e.stroke !== 'none' && e.strokeWidth > 0) {
        ctx.strokeStyle = e.stroke; ctx.stroke(path);
        if (e.shape === 'arrow') { const head = new Path2D(polygonPath(arrowPoints(e))); ctx.fillStyle = e.stroke; ctx.fill(head); ctx.stroke(head); }
      }
    }
  }
  return canvas;
}
export async function exportPng(scene: SceneDocument): Promise<void> {
  const canvas = await renderSceneCanvas(scene);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG 编码失败，请重试。')), 'image/png'));
  download(blob, `${safeName(scene.name)}.png`);
}
export function escapeHtml(value: unknown): string { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
export async function exportReport(input: SceneDocument, report: ScoreReport): Promise<void> {
  const scene = validateScene(input); checkReport(scene, report);
  const preview = (await renderSceneCanvas(scene)).toDataURL('image/png');
  const status = { valid: '可评', limited: '证据有限', 'not-applicable': '缺少依据' };
  const title = report.totalKind === 'four-dimension-reference' ? '四维综合参考分' : report.totalKind === 'partial-reference' ? '部分维度参考分' : '当前没有可评的可见内容';
  const sections = DIMENSIONS.map(({ key, label }) => {
    const dimension = report.dimensions[key];
    return `<section><h2>${label} <b>${dimension.score === null ? '—' : Math.round(dimension.score) + '/100'}</b></h2><p>${status[dimension.status]} · 参与 ${dimension.evaluatedVisualUnitCount}/${dimension.visibleForegroundCount} 个可见前景视觉单位</p><p>已评：${dimension.applicableSubmetrics.map(escapeHtml).join('、') || '无'}</p>${dimension.unavailableReasons.length ? `<p>未评内容：${dimension.unavailableReasons.map(escapeHtml).join('；')}</p>` : ''}<ul>${dimension.evidence.map(e => `<li><strong>${escapeHtml(e.explanation)}</strong>${e.suggestion ? `<br>${escapeHtml(e.suggestion)}` : ''}<small>规则 ${escapeHtml(e.ruleId)} · 对象 ${e.elementIds.map(escapeHtml).join('、') || '无'}<br>${Object.entries(e.measurements).map(([key, value]) => `${escapeHtml(key)}: ${escapeHtml(value)}`).join(' · ')}</small></li>`).join('')}</ul></section>`;
  }).join('');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escapeHtml(scene.name)} · 分析报告</title><style>body{margin:0;background:#f6f5f1;color:#25332e;font:16px/1.65 system-ui,sans-serif}main{max-width:960px;margin:auto;padding:40px 24px}h1{font-size:32px}h2{font-size:22px;display:flex;justify-content:space-between}h2 b{font-variant-numeric:tabular-nums}p,small{color:#526057}img{width:100%;height:auto;border:1px solid #d9ded5;background:white}section{background:white;border:1px solid #d9ded5;padding:20px 24px;margin:16px 0;border-radius:8px}li{margin:14px 0}small{display:block;font-size:12px;overflow-wrap:anywhere}.score{font-size:30px;font-weight:700}footer{font-size:13px;color:#526057}</style></head><body><main><h1>${escapeHtml(scene.name)}</h1><p>视觉排布实验室 · ${scene.width} × ${scene.height} · ${scene.elements.length} 个对象 · 修订 ${scene.revision}</p><img src="${preview}" alt="${escapeHtml(scene.name)}的作品预览"><p class="score">${title}${report.total === null ? '' : `：${report.total}/100`}</p><p>已评估 ${report.applicableDimensionCount}/4 项。分数描述算法识别到的视觉结构，不代表客观审美质量；不同覆盖范围不直接比较升降。</p>${report.warnings.length ? `<section><h2>画面检查</h2><ul>${report.warnings.map(w => `<li>${escapeHtml(w.explanation)}${w.suggestion ? `<br>${escapeHtml(w.suggestion)}` : ''}</li>`).join('')}</ul></section>` : ''}${sections}<footer>规则 ${escapeHtml(report.rubricVersion)} · 布局 ${escapeHtml(report.layoutVersion)} · 字体 ${escapeHtml(report.fontManifestVersion)}<br>场景指纹 ${escapeHtml(report.sceneFingerprint)}<br>作品保存时间 ${escapeHtml(scene.updatedAt)}。本文件包含独立预览与报告，可离线打开。</footer></main></body></html>`;
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName(scene.name)}-分析报告.html`);
}
