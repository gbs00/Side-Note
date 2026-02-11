# 技术方案设计（Tech Spec）

## 修订记录
| 日期 | 版本 | 变更内容 |
| --- | --- | --- |
| 2026-02-03 | v1.1 | 持久化锚点由 URL 改为 Tab 实例；统一清理：关闭 tab/窗口/退出浏览器即清空；UI 20260203 样式更新 |
| 2026-01-26 | v1.0 | Obsidian 风格列表编号 + 编辑器优化 |

> 版本：v1.1
> 更新日期：2026-02-03

## 1. 总体架构
- 采用 MV3 扩展结构：`background service worker` + `sidePanel UI`，不使用 content script（降低权限与兼容风险）。
- 数据仅存于 `chrome.storage.session`（按 tabId 隔离），满足“关闭标签页/关闭窗口/退出浏览器即清空”的需求；关闭面板（X）不清空。
- `sidePanel` 作为唯一 UI 面板，右侧停靠、全高、可调宽度（符合 sidePanel 限制）。
- 不支持浏览器重启后恢复 note（为确保“退出即清空”的统一口径）。

## 2. 关键流程（Mermaid）
```mermaid
flowchart TD
A[用户点击工具栏图标] --> B[background: action.onClicked(tab)]
B --> C[initNoteForTab(tabId) -> storage.session note:tabId]
B --> D[sidePanel.setOptions(path?tabId) + open(tabId)]
D --> E[sidePanel 加载 -> 读取 session -> 渲染头部与正文]
E --> F[用户输入 -> debounce 更新 session]
E --> G[用户点击复制 -> 生成导出文本 -> clipboard]
E --> H[用户点击 X -> 仅关闭面板（不清空）]
I[tabs.onRemoved(tabId)] --> J[清空 session note:tabId + disable sidePanel]
K[退出浏览器] --> L[storage.session 会话级清空]
```

## 3. 模块划分与职责
- `background/service_worker`
  - `action.onClicked(tab)`：创建 note 并打开 sidePanel。
  - `tabs.onRemoved`：清空对应 tab 的 note（统一覆盖“关闭 tab/窗口”场景）。
  - `sidePanel.setOptions/open`：为每个 tab 设置 `path?tabId`。
- `sidePanel UI`
  - 读取 `tabId` 参数与 session 数据，渲染头部字段 + 编辑区。
  - Markdown 实时渲染（标准语法），安全消毒。
  - 复制导出与提示。
  - 主题切换（跟随系统或手动覆盖）。
  - 点击 `x`：关闭面板（数据保留在 session，直到 tab/窗口/浏览器关闭）。

## 4. 数据结构与存储
- `NoteState`（存于 `chrome.storage.session`，key: `note:${tabId}`）
  - `tabId: number`
  - `url: string | "未获取到哦"`
  - `title: string | "未获取到哦"`
  - `createdAt: string`（本地时间）
  - `contentMd: string`
  - `updatedAt: string`
- `ThemeState`（存于 `chrome.storage.local`）
  - `theme: "auto" | "light" | "dark"`
  - 默认 `auto`，读取 `prefers-color-scheme`

## 5. 接口与消息定义
- `background -> storage.session`
  - `initNoteForTab(tabId)`：写入 `note:${tabId}`
  - `clearNote(tabId)`：移除 `note:${tabId}` 并 disable sidePanel
- `sidePanel -> storage.session`
  - `loadNote(tabId)`：读取 `note:${tabId}`
  - `persistNote(tabId, note)`：更新 `note:${tabId}`（建议 300ms debounce）
- `sidePanel -> storage.local`
  - `loadTheme()/saveTheme()`：主题偏好仅存 `local`，不随退出清空

## 6. Markdown 渲染与安全
- 使用 CodeMirror 6 的 Markdown 解析（默认 CommonMark），不渲染 HTML。
- 单层渲染：通过装饰隐藏/替换 Markdown 标记实现“所见即渲染”。
- 行内语法通过透明样式隐藏标记，保留原始宽度，避免光标偏移。
- 未启用 `==highlight==` 等扩展语法；代码块/围栏不作为渲染目标。
- 复制导出使用原始 Markdown 文本（不导出 HTML）。

## 7. 编辑器实现策略
- 单层编辑器（CodeMirror 6）+ 装饰渲染：
  - 触发条件：块级语法在“符号 + 空格”时立即渲染。
  - 块级语法（标题/列表/引用）：使用 `Decoration.replace` 隐藏标记并替换为样式符号。
  - 行内语法（加粗/斜体/代码）：使用 `Decoration.replace` 完全折叠标记（宽度为0）。
  - 行内语法（链接）：使用透明隐藏保留宽度，避免复杂链接语法的布局跳动。
  - 光标所在行显示原始 Markdown（列表除外），避免编辑障碍。
  - 点击前预切换原始态（`pendingLineField`），缓解点击位置与标记宽度变化的错位问题。
- 列表编号（Obsidian 风格）：
  - 按列表项在各嵌套级别内的实际位置编号，忽略原始 Markdown 数字。
  - 一级：数字（1. 2. 3.），二级：字母（a. b. c.），三级：罗马数字（i. ii. iii.）。
  - 使用 `listCounters` Map 追踪各级别计数，嵌套级别变化时自动重置。

## 8. 导出格式
```
--
url: <url>
title: <title>
created_at: <createdAt>
--
<markdown content>
```

## 9. 权限清单（最小化）
- `permissions`: `["sidePanel", "storage", "activeTab"]`
- `host_permissions`: 无
- 通过 `action.onClicked` + `activeTab` 获取当前 tab 的 url/title（无需常驻 `tabs` 权限）

## 10. 异常与降级
- 获取元信息失败：字段显示“未获取到哦，可手动输入”，可编辑。
- 复制失败：Toast 失败 + 提供“再次复制”入口；若仍失败，允许用户选中全文手动复制。

## 11. 非功能性约束
- 性能：输入更新需 debounce，避免频繁写 session。
- 稳定性：tab/窗口关闭时保证对应 tab 的 session 清空；浏览器退出时 `storage.session` 会话级清空。
- 安全：Markdown 渲染必须消毒。

## 12. 构建配置
- 开发构建：`npm run build`（含 sourcemap，约 3.6MB）
- 生产构建：`npm run build:prod`（启用 minify，约 1.9MB）
