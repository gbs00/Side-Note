# Side Note 多语言上线前全流程测试 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在发布前完成 Side Note 多语言适配的自动化与回归验证，输出可上线/不可上线结论与风险证据。

**Architecture:** 采用“静态一致性 + 运行时行为 + 全量回归”三层验证。先验证 locale 与 manifest 协议一致性，再验证 UI 文案切换与导出字段协议，最后跑完整 Playwright 套件确认无回归。

**Tech Stack:** Node.js, npm, Playwright, Chrome Extension test harness。

### Task 1: 环境与依赖基线确认

**Files:**
- Modify: `docs/plans/2026-02-10-i18n-pre-release-testing.md`
- Test: `package.json`

**Step 1: 验证 Node/npm 与依赖可用**

Run: `node -v && npm -v && npm ls --depth=0`
Expected: Node/npm 可用，依赖解析无致命错误。

**Step 2: 校验 Playwright 浏览器运行前置**

Run: `npm run test:install:browsers`
Expected: Chromium 安装成功，或明确网络/权限失败原因。

### Task 2: 多语言主路径验证（静态 + 运行时）

**Files:**
- Test: `tests/i18n.static.spec.js`
- Test: `tests/i18n.spec.js`

**Step 1: 运行静态 i18n 一致性测试**

Run: `npm run test:run:i18n-static`
Expected: `5 passed`，包含 locale key、manifest 引用、导出协议字段检查。

**Step 2: 运行 i18n 运行时行为测试**

Run: `npx playwright test tests/i18n.spec.js --workers=1`
Expected: 中文/英文文案断言通过，导出字段维持 `url/title/created_at`。

### Task 3: 全量回归验证

**Files:**
- Test: `tests/sidepanel.spec.js`
- Test: `tests/sidepanel_v0.1.1.spec.js`
- Test: `tests/generate-icons.spec.js`
- Test: `tests/generate-store-assets.spec.js`

**Step 1: 执行完整测试套件**

Run: `npm test`
Expected: 所有套件通过；若失败，生成 HTML 报告和失败截图。

**Step 2: 汇总失败并分类**

Run: `npx playwright show-report --host 127.0.0.1 --port 9323`（如需人工查看）
Expected: 能定位到失败断言、错误栈、截图/trace。

### Task 4: 发布门禁结论

**Files:**
- Modify: `TestReport_v1.0.0.md`（若需要追加）

**Step 1: 产出上线建议**

规则：
- i18n 静态/运行时全部通过 + 全量回归无 P0/P1 失败 => 建议上线。
- 存在阻断级失败 => 不建议上线，并附最小修复与复测顺序。

**Step 2: 记录风险与复测清单**

输出：失败用例、风险等级、影响范围、复测命令。

