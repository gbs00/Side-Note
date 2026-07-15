# Side Note 1.0.1 P0 发布测试报告

**测试日期**：2026-07-15

**版本号**：1.0.1

**结论**：通过发布门禁，可提交 Chrome Web Store 审核。

## 1. 本次范围

- 关闭面板前强制落盘，保存失败时阻止关闭并支持重试。
- 初始化期间的 `storage.session` 竞态、元信息补全与正文保护。
- 后台 Promise 拒绝、Side Panel API 边界与 Chrome 116 最低版本。
- 测试前构建、真实扩展冒烟、干净打包与发布制品校验。

## 2. 验证结果

| 门禁 | 结果 | 说明 |
| --- | --- | --- |
| 页面级自动回归 | 60/60 通过 | `npm test` 先自动构建开发 bundle |
| 真实 unpacked Chromium 冒烟 | 5 通过 / 1 跳过 / 0 失败 | 真实验证 MV3 Worker、action 监听、session storage、Side Panel 配置、tab 清理 |
| 生产构建 | 通过 | `sidepanel.js` 664.9KB |
| 发布制品校验 | 通过 | 11 个文件，237,129 bytes，版本三方一致 |
| 可重复打包 | 通过 | 连续两次生成的 SHA-256 一致 |
| 依赖审计 | 通过 | 0 个已知漏洞 |
| 补丁格式检查 | 通过 | `git diff --check` 无异常 |

## 3. 制品

- 路径：`dist/side-note-1.0.1.zip`
- SHA-256：`fdd448494965f87e2974b1bc1ee5d91f3d7b455a0d604243276fdf5fefe47748`
- ZIP 根目录直接包含扩展文件，不包含 `src`、source map 或 `.DS_Store`。

## 4. 明确限制

Playwright 无法可靠操作 Chromium 的浏览器工具栏外壳，因此“点击扩展图标后面板实际可见”被明确记为 1 个跳过项，未计为通过。其下游 API 能力已通过真实扩展 Service Worker 与按 tab 的 Side Panel 配置测试覆盖。

Manifest 的最低版本为 Chrome 116；`chrome.sidePanel.close()` 在 Chrome 141 起可用。116–140 使用 `window.close()` 降级路径，本次未在这些历史版本上逐版验证。当前本机 Chrome 150 使用原生 close API。

## 5. 测试环境

- macOS，Node.js 24.13.0，npm 11.6.2
- Playwright 1.58.0，Chromium 145.0.7632.6
