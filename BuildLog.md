## 2026-02-03

### 生命周期口径统一：关闭标签页/关闭窗口/退出浏览器即清空
- 说明：为保证“退出即清空”的一致性，本版本不支持浏览器重启后恢复 note；note 仅存于 `chrome.storage.session`。
- `extension/background.js`
  - 移除基于 `activeNotes` 的清理门槛：`tabs.onRemoved` 无条件 `clearNote(tabId)`，避免“快速关 tab、sidepanel 尚未 connect”导致的 session 孤儿数据。
  - 移除 `tabs.onUpdated`（刷新/跳转不再清空，确保同一 tab 内内容不丢）。
  - `initNoteForTab(tabId)` 优先使用 `action.onClicked(tab)` 入参的 url/title；缺失时再尝试 `tabs.get`，全部带 try/catch。

核心代码片段（统一清理）：
```js
chrome.tabs.onRemoved.addListener((tabId) => {
  clearNote(tabId).catch((error) => {
    console.warn("Failed to clear note:", error);
  });
});
```

### UI&UX：落地 ui20260203.pen 侧边栏样式 + CSS 隔离
- `extension/sidepanel.html`
  - Header 去除 emoji，替换为 lucide 风格 SVG 图标（18x18）。
  - Meta 区域替换为图标 + 输入框结构；新增空状态（✦/标题/描述）。
- `extension/sidepanel.css`
  - 以设计稿色板重建变量：Light `#F7F4EF/#F1ECE4/#2E2A26`，Dark `#0B0A0A/#151719/#EDEDED`。
  - Editor Surface：圆角 12 + Light 渐变背景（`#FBF9F5 -> #FFFFFF`）/ Dark `#1E1E1E`。
  - Toast：140x32 胶囊（Success/Fail 两套色板）。
  - 引用块竖线：`cm-quote-line` + `::before` 4px bar（Light `#D1C7BA` / Dark `#3C3F44`）。
  - CSS 隔离：CodeMirror 样式全部限定在 `.panel` 下，避免误影响页面其它区域（虽然 extension page 本身也天然隔离）。

### sidePanel 逻辑增强：storage 监听与空状态
- `extension/src/sidepanel.js`
  - storage 监听改为 `chrome.storage.onChanged` 并按 `areaName === "session"` 过滤（兼容 test-harness）。
  - 新增 `blockquoteLinePlugin`：按行对 BlockQuote 应用 `cm-quote-line`，实现设计稿引用竖线。
  - 新增空状态渲染：当 `contentMd` 为空时显示 `#emptyState`。
  - 增强防御性编程：`storage.*` set/get 增加 try/catch，失败时降级不阻塞编辑体验。

核心代码片段（session 变更监听）：
```js
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "session") return;
  // ...根据 note:tabId 更新 UI
});
```

### 测试 harness 修正
- `tests/test-harness.html`
  - 增加 `chrome.storage.onChanged` mock，并在 session/local 的 set/remove 时触发，避免 UI 监听报错。
  - 同步更新测试页面 DOM 结构以匹配最新 `sidepanel.html`。

### 待测试 Edge Cases
- 用户点击图标后立刻关闭 tab：应触发 `tabs.onRemoved` 清理，避免 session 残留。
- Service Worker 被回收/重启：再次打开同 tab 应读取到 session 的 note（仍在的话）。
- `chrome.tabs.get` 因权限/异常失败：url/title 显示“未获取到哦，可手动输入”，且可手改。
- file:// 下 clipboard API 权限不足：应走 `execCommand('copy')` 降级或提示失败 Toast。
- 主题为 `auto` 时系统主题切换：图标与色板切换是否符合预期（浅色显示月亮、深色显示太阳）。

### 本地验证
- `npm run build`：通过（更新 `extension/sidepanel.js` bundle）。

## 2026-01-26

### 自动化测试框架
- 新增 Playwright E2E 测试框架（`tests/sidepanel.spec.js`），18 条用例全部通过。
- 新增 `tests/test-harness.html` 测试页面，mock Chrome API 支持离线测试。
- `package.json` 新增 `test` 和 `test:ui` 脚本，支持命令行和可视化测试。

### BUG-001 修复：主题未跟随系统深色模式
- `sidepanel.css` 新增 `@media (prefers-color-scheme: dark)` 媒体查询。
- 使用 `:root:not([data-theme="light"])` 选择器实现自动深色模式。
- 补充 `.panel::after`、滚动条、Toast 的深色模式媒体查询样式。

### 插件图标
- 新增 `extension/icons/icon.svg` 图标模板，待导出 PNG。

### 权限与构建优化
- 移除 `manifest.json` 中冗余的 `tabs` 权限，仅保留 `activeTab`，降低用户安装敏感度。
- `package.json` 新增 `build:prod` 脚本启用 `--minify`，生产构建体积从 3.6MB 降至 1.9MB。

### 导出格式
- `buildExportText()` 添加 `--` 分隔符包裹头部元信息，格式与 PRD 定义一致。

### Markdown 编辑器架构重构
- 移除 `Tag.prototype[Symbol.iterator]` hack（CodeMirror 6 不需要）。
- 移除正则二次遍历，完全依赖语法树处理标记，提升性能。
- `buildMarkdownDecorations()` 添加显式装饰排序，防止 `RangeError: Ranges are not sorted`。
- `pendingLineField` 整合选区追踪到 `StateField.update`，简化代码逻辑。
- 添加 `decoratedRanges` 追踪已装饰范围，处理嵌套 Markdown 语法。
- 添加 try-catch 错误边界，语法树解析异常时返回空装饰而非崩溃。

### 行内标记渲染修复
- 恢复 `INLINE_COLLAPSE_MARK_NAMES` 常量，加粗/斜体/代码标记使用 `Decoration.replace({})` 完全折叠。
- 修复行内元素渲染后出现空格占位的问题。

### Obsidian 风格列表编号
- 新增 `numberToLetter()` 和 `numberToRoman()` 数字转换函数。
- 新增 `getListNestingLevel()` 通过缩进计算列表嵌套深度。
- 新增 `listCounters` Map + `getListPosition()` 追踪各嵌套级别的列表位置。
- 重构 `normalizeListMarker(raw, nestingLevel, position)` 按实际位置编号（忽略原始数字）。
- 有序列表：一级用数字（1.），二级用字母（a.），三级用罗马数字（i.）。

### 后台服务优化
- 新增 `syncActiveNotesWithStorage()` 确保 `activeNotes` Set 与 `storage.session` 同步，防止内存泄漏。

### CSS 精简
- 移除重复的 `.cm-content .cm-h*` 选择器，仅保留 `.cm-line.cm-h*`。

---

## 2026-01-25
- 同步 PRD 的 Markdown 语法分类（块级/行内）与渲染触发条件（符号+空格）。
- 渲染方案改为单层 CodeMirror 6 装饰渲染，移除叠层方案。
- 块级标记使用替换装饰，行内标记使用透明隐藏，避免光标与点击偏移。
- 光标行显示原始 Markdown（列表除外），并加入点击前预切换逻辑以缓解定位偏差。
- 取消 `==highlight==` 需求；代码块/围栏不作为渲染目标，仅保留行内代码样式。
