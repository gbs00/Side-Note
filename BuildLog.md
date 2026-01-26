## 2026-01-26
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
