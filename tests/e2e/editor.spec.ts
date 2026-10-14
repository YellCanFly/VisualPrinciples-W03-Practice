import { test, expect } from '@playwright/test';

test('four principles, adjustable examples, desktop and mobile layout',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:'好的排布，有迹可循。'})).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  for(const name of ['重复','对比','对齐','亲密性']){await page.getByRole('navigation',{name:'四原则'}).getByRole('button',{name:new RegExp(name)}).click();await expect(page.locator('.comparison-canvas > svg')).toHaveCount(2);}
  await page.getByLabel('显示分析线').check();await expect(page.locator('.comparison-pair svg g[stroke-dasharray]')).not.toHaveCount(0);
  await page.screenshot({path:'test-results/compare-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.comparison-version:visible')).toHaveCount(1);
  await page.getByRole('button',{name:'调整前',exact:true}).click();await expect(page.locator('.comparison-before')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:'test-results/compare-mobile.png',fullPage:true});expect(errors).toEqual([]);
});

test('blank canvas, text, drag, undo, score coverage and persisted background',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#/practice');await expect(page.locator('.editor-svg')).toBeVisible();
  await expect(page.locator('.editor-svg [data-element-id]')).toHaveCount(0);
  await page.getByRole('button',{name:'分析画面',exact:true}).click();await expect(page.getByText('已评估 0 / 4 项')).toBeVisible();
  await page.getByRole('button',{name:/添加文字 写下你的内容/}).click();
  await page.getByLabel('编辑文字内容').fill('你好，视觉关系\nDesign is a relationship');
  await page.getByLabel('编辑文字内容').press('Control+Enter');await expect(page.locator('.editor-svg text')).toContainText('你好，视觉关系');
  await page.getByRole('button',{name:'分析画面',exact:true}).click();await expect(page.getByText('已评估 1 / 4 项')).toBeVisible();
  await page.getByRole('button',{name:'▭ 矩形',exact:true}).click();
  const before=await page.locator('.editor-svg').boundingBox();expect(before).toBeTruthy();
  const path=page.locator('.editor-svg g[data-element-id] path').first();const b=await path.boundingBox();expect(b).toBeTruthy();
  await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2);await page.mouse.down();await page.mouse.move(b!.x+b!.width/2+70,b!.y+b!.height/2+40,{steps:8});await page.mouse.up();
  const after=await path.boundingBox();expect(after!.x-b!.x).toBeGreaterThan(50);
  await page.getByRole('button',{name:'撤销',exact:true}).click();const undone=await path.boundingBox();expect(Math.abs(undone!.x-b!.x)).toBeLessThan(2);
  await page.getByRole('button',{name:'重做',exact:true}).click();
  await page.getByRole('button',{name:'分析画面',exact:true}).click();await expect(page.getByText('已评估 2 / 4 项')).toBeVisible();
  for(const score of await page.locator('.dimension-item summary strong').allTextContents())expect(score).toMatch(/^(—|\d{1,3})$/);
  await page.screenshot({path:'test-results/analysis-desktop.png',fullPage:true});
  await page.locator('.editor-svg').focus();await page.keyboard.press('Escape');await page.getByRole('button',{name:'属性',exact:true}).click();
  const hex=page.getByLabel('背景颜色 HEX');await hex.fill('#e8dfcf');await hex.press('Enter');
  await expect(page.locator('.editor-svg > rect').first()).toHaveAttribute('fill','#e8dfcf');
  await expect(page.getByText('已保存到此浏览器',{exact:true})).toBeVisible();await page.waitForTimeout(1000);await page.reload();
  await expect(page.locator('.editor-svg > rect').first()).toHaveAttribute('fill','#e8dfcf');await expect(page.locator('.editor-svg text')).toContainText('你好，视觉关系');
  await page.screenshot({path:'test-results/editor-desktop.png',fullPage:true});expect(errors).toEqual([]);
});

test('all shapes, keyboard duplication/delete, snapshots and gallery',async({page})=>{
  await page.goto('/#/practice');await expect(page.locator('.editor-svg')).toBeVisible();
  for(const name of ['▭ 矩形','▢ 圆角矩形','○ 圆形','⬭ 椭圆','△ 三角形','◇ 菱形','╱ 直线','↗ 箭头','☆ 五角星']) await page.getByRole('button',{name,exact:true}).click();
  await expect(page.locator('.editor-svg g[data-element-id]')).toHaveCount(9);
  await page.locator('.editor-svg').focus();await page.keyboard.press('Control+d');await expect(page.locator('.editor-svg g[data-element-id]')).toHaveCount(10);
  await page.keyboard.press('Delete');await expect(page.locator('.editor-svg g[data-element-id]')).toHaveCount(9);
  await page.getByRole('button',{name:'版本',exact:true}).click();page.once('dialog',d=>d.accept('尝试一'));
  await page.getByRole('button',{name:'保存当前版本'}).click();await expect(page.locator('.snapshot-list').getByText(/尝试一/)).toBeVisible();
  await page.getByLabel('关闭版本').click();await page.getByLabel('作品名称').fill('我的排布实验');await page.getByLabel('作品名称').press('Tab');await page.waitForTimeout(1300);
  await page.getByRole('link',{name:/我的作品/}).click();await expect(page.getByText('我的排布实验',{exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  await page.screenshot({path:'test-results/gallery-mobile.png',fullPage:true});
});

test('mixed multiselection preserves relative positions and valid line endpoints',async({page})=>{
  await page.goto('/#/practice');await expect(page.locator('.editor-svg')).toBeVisible();
  await page.getByRole('button',{name:'▭ 矩形',exact:true}).click();await page.getByRole('button',{name:'↗ 箭头',exact:true}).click();
  await page.waitForTimeout(1000);
  const read=()=>page.evaluate(async()=>{const s=await import(String('/src/services/storage/storage.ts'));return (await s.loadLastDocument()).elements;});
  const before=await read();
  await page.locator('.editor-svg').focus();await page.keyboard.press('Control+a');await page.getByRole('spinbutton',{name:'X',exact:true}).fill('100');await page.getByRole('spinbutton',{name:'X',exact:true}).press('Tab');await page.waitForTimeout(1100);
  const after=await read();expect(after[1].x-after[0].x).toBe(before[1].x-before[0].x);expect(after[1].x2-after[1].x).toBe(before[1].x2-before[1].x);expect('x2' in after[0]).toBe(false);
});

test('switching documents clears compared snapshots and failed saves preserve current work',async({page})=>{
  await page.goto('/#/practice');await expect(page.locator('.editor-svg')).toBeVisible();
  await page.getByRole('button',{name:'▭ 矩形',exact:true}).click();await page.getByRole('button',{name:'版本',exact:true}).click();
  for(const name of ['版本甲','版本乙']){page.once('dialog',d=>d.accept(name));await page.getByRole('button',{name:'保存当前版本'}).click();}
  await page.locator('.snapshot-list input').nth(0).check();await page.locator('.snapshot-list input').nth(1).check();await expect(page.locator('.snapshot-comparison svg')).toHaveCount(2);await page.getByLabel('关闭版本').click();
  await page.getByRole('button',{name:'新建',exact:true}).click();await expect(page.locator('.editor-svg g[data-element-id]')).toHaveCount(0);await page.getByRole('button',{name:'版本',exact:true}).click();await expect(page.locator('.snapshot-comparison')).toHaveCount(0);await page.getByLabel('关闭版本').click();
  await page.getByRole('button',{name:'△ 三角形',exact:true}).click();
  await page.evaluate(()=>{IDBDatabase.prototype.transaction=()=>{throw new Error('simulated disk failure');};});
  await page.getByRole('button',{name:'新建',exact:true}).click();await expect(page.getByText(/当前作品保存失败，已保留在画布中/)).toBeVisible();await expect(page.locator('.editor-svg g[data-element-id]')).toHaveCount(1);
});
