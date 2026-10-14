import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('JSON download roundtrips, imports independent IDs, and ignores old reports', async ({ page }) => {
  const downloading = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { newScene, createElement } = await import(String('/src/domain/scene/types.ts'));
    const { evaluate } = await import(String('/src/domain/scoring/evaluate.ts'));
    const { exportJson } = await import(String('/src/services/export/export.ts'));
    const scene = { ...newScene('中文回读'), background: '#e7efdf', elements: [{ ...createElement('text'), text: '任意文案\n第二行 English 123', fontFamily: 'serif', fontWeight: 700 }, createElement('arrow')] };
    const report = { ...evaluate(scene), total: 99 };
    exportJson(scene, report);
  });
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toBe('中文回读.design.json');
  const json = await readFile((await downloaded.path())!, 'utf8');
  const envelope = JSON.parse(json);
  expect(envelope.report.total).toBe(99);
  const result = await page.evaluate(async (json) => {
    const { parseSceneJson } = await import(String('/src/domain/scene/validation.ts'));
    const { importJson } = await import(String('/src/services/export/export.ts'));
    const original = parseSceneJson(json);
    const imported = await importJson(new File([json], 'download.design.json', { type: 'application/json' }));
    return { original, imported, hasReport: 'report' in imported };
  }, json);
  expect(result.original).toEqual(envelope.scene);
  expect(result.imported.documentId).not.toBe(result.original.documentId);
  expect(result.imported.elements.map((e: { id: string }) => e.id)).not.toEqual(result.original.elements.map((e: { id: string }) => e.id));
  expect(result.imported.elements[0].text).toBe('任意文案\n第二行 English 123');
  expect(result.imported.background).toBe('#e7efdf');
  expect(result.imported.revision).toBe(0);
  expect(result.hasReport).toBe(false);
});

test('IndexedDB preserves backup, snapshots are isolated, and stale writes fail', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { newScene, createElement } = await import(String('/src/domain/scene/types.ts'));
    const storage = await import(String('/src/services/storage/storage.ts'));
    let scene = { ...newScene('上一份有效记录'), elements: [createElement('circle')] };
    await storage.saveDocument(scene);
    const initial = structuredClone(scene);
    scene = { ...scene, revision: 1, name: '最新记录' };
    await storage.saveDocument(scene);
    const latest = await storage.loadLastDocument();
    let conflict = '';
    try { await storage.saveDocument({ ...scene, name: '来自另一标签页' }); } catch (error) { conflict = (error as Error).name; }
    const snapshot = { id: crypto.randomUUID(), name: '独立版本', scene: structuredClone(scene), createdAt: new Date().toISOString() };
    await storage.saveSnapshots(scene.documentId, [snapshot]);
    snapshot.scene.elements[0].fill = '#ff0000';
    snapshot.scene.name = '已在内存中改变';
    const snapshots = await storage.loadSnapshots(scene.documentId);
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(storage.STORAGE_NAMESPACE, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => { const tx = db.transaction('documents', 'readwrite'); tx.objectStore('documents').put({ ...scene, schemaVersion: 999 }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
    const restored = await storage.loadLastDocument();
    await storage.deleteDocument(scene.documentId);
    return { initial, latest, conflict, snapshot: snapshots[0], restored, deleted: !(await storage.listDocuments()).some((item: { documentId: string }) => item.documentId === scene.documentId), remainingSnapshots: await storage.loadSnapshots(scene.documentId) };
  });
  expect(result.latest.name).toBe('最新记录');
  expect(result.conflict).toBe('StorageConflictError');
  expect(result.snapshot.scene.name).toBe('最新记录');
  expect(result.snapshot.scene.elements[0].fill).toBe(result.initial.elements[0].fill);
  expect(result.restored).toEqual(result.initial);
  expect(result.deleted).toBe(true);
  expect(result.remainingSnapshots).toEqual([]);
});

test('PNG shares Chinese wrapping, all nine shape paths, paint order and background', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { newScene, createElement, SHAPES } = await import(String('/src/domain/scene/types.ts'));
    const { renderSceneCanvas } = await import(String('/src/services/export/export.ts'));
    const { measureText, textLineRegions } = await import(String('/src/domain/layout/layout.ts'));
    const scene = { ...newScene('九种图形导出'), background: '#d9e4cf', elements: SHAPES.map(({ key }: { key: string }, index: number) => ({ ...createElement(key, 30 + index % 5 * 180, 50 + Math.floor(index / 5) * 180), width: 110, height: 100, ...(key === 'arrow' || key === 'line' ? { x2: 30 + index % 5 * 180 + 110, y2: 50 + Math.floor(index / 5) * 180 + 100, stroke: '#20342a', fill: 'none' } : { fill: '#687e57', stroke: '#20342a' }) })) };
    const text = { ...createElement('text', 50, 460), text: '中文换行测试\n第二行 English 123', width: 350, fontFamily: 'serif', fontWeight: 700, color: '#20342a' };
    scene.elements.push(text);
    const canvas = await renderSceneCanvas(scene);
    const ctx = canvas.getContext('2d')!;
    const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x * 2, y * 2, 1, 1).data);
    const background = pixel(955, 635);
    const bounds = textLineRegions(text);
    const textRegions = bounds.map((r: { x: number; y: number; width: number; height: number }) => {
      const data = ctx.getImageData(Math.floor(r.x * 2), Math.floor(r.y * 2), Math.ceil(r.width * 2), Math.ceil(r.height * 2)).data;
      let dark = 0; for (let i = 0; i < data.length; i += 4) if (data[i] < 100 && data[i + 1] < 120 && data[i + 2] < 100) dark++;
      return dark;
    });
    const shapeSamples = scene.elements.slice(0, 9).map((e: { x: number; y: number; shape: string }) => ({ shape: e.shape, center: pixel(e.x + 55, e.y + 50) }));
    // Paint-order check: the last solid shape must cover the earlier one.
    const stacked = { ...newScene(), elements: [{ ...createElement('rectangle', 10, 10), fill: '#ff0000', stroke: 'none' }, { ...createElement('circle', 10, 10), fill: '#0000ff', stroke: 'none' }] };
    const stackCanvas = await renderSceneCanvas(stacked, 1);
    return { width: canvas.width, height: canvas.height, background, textRegions, lines: measureText(text).lines, shapeSamples, topPixel: Array.from(stackCanvas.getContext('2d')!.getImageData(80, 80, 1, 1).data), pngPrefix: canvas.toDataURL('image/png').slice(0, 22) };
  });
  expect(result.width).toBe(1920);
  expect(result.height).toBe(1280);
  expect(result.background).toEqual([217, 228, 207, 255]);
  expect(result.lines).toEqual(['中文换行测试', '第二行 English 123']);
  expect(result.textRegions.every((count: number) => count > 100)).toBe(true);
  expect(result.shapeSamples).toHaveLength(9);
  expect(result.shapeSamples.every((sample: { center: number[] }) => sample.center[0] < 150)).toBe(true);
  expect(result.topPixel).toEqual([0, 0, 255, 255]);
  expect(result.pngPrefix).toBe('data:image/png;base64,');
});

test('HTML export escapes user content and binds current scene/report', async ({ page }) => {
  const downloading = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { newScene, createElement } = await import(String('/src/domain/scene/types.ts'));
    const { evaluate } = await import(String('/src/domain/scoring/evaluate.ts'));
    const { exportReport } = await import(String('/src/services/export/export.ts'));
    const { ensureSceneFonts } = await import(String('/src/services/fonts.ts'));
    const scene = { ...newScene('作品<script>alert(1)</script>'), elements: [{ ...createElement('text'), text: '中文 <b>任意内容</b>' }] };
    await ensureSceneFonts(scene);
    const report = evaluate(scene);
    await exportReport(scene, report);
  });
  const downloaded = await downloading;
  const html = await readFile((await downloaded.path())!, 'utf8');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('data:image/png;base64,');
  expect(html).toContain('Content-Security-Policy');
  const stale = await page.evaluate(async () => {
    const { newScene, createElement } = await import(String('/src/domain/scene/types.ts'));
    const { evaluate } = await import(String('/src/domain/scoring/evaluate.ts'));
    const { exportReport } = await import(String('/src/services/export/export.ts'));
    const scene = { ...newScene(), elements: [createElement('circle')] };
    try { await exportReport({ ...scene, elements: [] }, evaluate(scene)); return ''; } catch (error) { return (error as Error).message; }
  });
  expect(stale).toContain('不一致');
});

test('unsupported glyphs block PNG while JSON remains available', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { newScene, createElement } = await import(String('/src/domain/scene/types.ts'));
    const { renderSceneCanvas } = await import(String('/src/services/export/export.ts'));
    const { validateScene } = await import(String('/src/domain/scene/validation.ts'));
    const scene = { ...newScene(), elements: [{ ...createElement('text'), text: '😀' }] };
    let error = ''; try { await renderSceneCanvas(scene); } catch (reason) { error = (reason as Error).message; }
    return { error, savedText: validateScene(scene).elements[0].text };
  });
  expect(result.error).toContain('不支持');
  expect(result.savedText).toBe('😀');
});
