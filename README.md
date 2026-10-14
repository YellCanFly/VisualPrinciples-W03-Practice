# 视觉排布实验室

视觉原理 W03 的设计四原则交互实践页面。支持观察对比、无主题自由画布、四维参考分析和本地作品管理。纯前端应用，无需账号或服务器。

## 本地运行

使用 Node **22.14.0**（`.nvmrc`），在本目录执行：

```powershell
npm ci
npm run dev
```

打开终端显示的 [本地页面](http://127.0.0.1:5173/)。默认进入观察对比，直接进入画布使用 `/#/practice`。项目已有依赖时只需 `npm run dev`。

## 检查与构建

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run preview
```

浏览器测试默认使用本机 Microsoft Edge。其他环境先安装 Playwright Chromium，再设置浏览器：

```powershell
npx playwright install chromium
$env:PLAYWRIGHT_CHANNEL = 'chromium'
npm run test:e2e
```

`dist/` 是可静态托管的构建结果，Vite 使用相对资源路径，页面通过 HashRouter 导航。使用 HTTP 服务器访问，不能直接双击 `dist/index.html`。

## 使用

- 观察四原则的前后对比，调整参数或将示例复制到独立画布。
- 点击或拖入文字及九种图形；双击文字编辑，右侧设置位置、尺寸、颜色与样式。
- Shift 点击多选、空白拖动框选；方向键微移，Shift 方向键移动 10 单位。
- Ctrl/Cmd+D 复制；Delete 删除；Ctrl/Cmd+Z 撤销；Ctrl+Y 或 Ctrl/Cmd+Shift+Z 重做。
- 空格拖动画布，底部设置缩放、网格与吸附，Alt 拖动暂时关闭吸附。
- “分析画面”查看四维分数、覆盖范围及依据；“版本”保存、恢复或比较两个快照。
- “导出”下载可继续编辑的 JSON、2 倍 PNG 或自包含 HTML 报告。

作品编辑约 800 毫秒后自动写入 IndexedDB。清理浏览器数据会删除本地作品；JSON 用于跨设备备份。字体未覆盖的字符可以继续编辑、保存 JSON，但会阻止分析和 PNG 导出。

## 项目结构

`src/app` 路由与全局样式；`features` 页面与编辑交互；`domain` 场景、测量与独立评分；`services` 字体、存储和导出；`tests` 单元及浏览器验收。开发方案、进度和接续记忆都保存在 [docs](./docs/README.md)。

本地包含 Noto Sans SC / Noto Serif SC 的常规与粗体字体（对应思源黑体 / 思源宋体体系），许可随 `public/licenses/` 保存。`scripts/prepare_fonts.py` 可重新下载字体并生成字符覆盖表，需要 Python 与 fontTools。

## 发布

本目录作为独立仓库根目录，提交到 [VisualPrinciples-W03-Practice](https://github.com/YellCanFly/VisualPrinciples-W03-Practice)。站点地址：[视觉排布实验室](https://yellcanfly.github.io/VisualPrinciples-W03-Practice/)，[直接打开自由画布](https://yellcanfly.github.io/VisualPrinciples-W03-Practice/#/practice)。

实际工作流位于 [.github/workflows/pages.yml](./.github/workflows/pages.yml)，Pages 发布源为 **GitHub Actions**。推送到 `main` 后自动安装锁定依赖、运行类型检查、65 项单元测试及 Chromium 浏览器测试，构建并部署 `dist/`；也可在 [Actions](https://github.com/YellCanFly/VisualPrinciples-W03-Practice/actions) 手动触发。只有检查与构建全部通过才会发布。Vite 保留相对资源路径与 HashRouter，适配仓库子路径及深层链接刷新。

后续更新在本目录执行 `git add`、`git commit`、`git push origin main`。`node_modules/`、`dist/` 和临时测试结果不会提交；字体、许可证、源代码及文档随仓库保存。`deployment/pages.yml.example` 保留为模板。

尚未完成的性能、触控及可访问性验收见 [开发进度](./docs/开发进度.md)，评分的采样近似见 [开发记忆](./docs/开发记忆.md)。
