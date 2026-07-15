/**
 * Side Note i18n 自动化测试
 *
 * 目标：
 * 1) 验证 manifest i18n 配置完整；
 * 2) 验证中文/英文 UI 文案随 locale 切换；
 * 3) 验证导出字段名保持英文协议字段（url/title/created_at）。
 */

const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const TEST_HARNESS_PATH = path.resolve(__dirname, "test-harness.html");
const MANIFEST_PATH = path.resolve(__dirname, "../extension/manifest.json");
const MOCK_TAB_ID = 12345;

function harnessUrl(locale = "zh_CN") {
  return `file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}&locale=${encodeURIComponent(locale)}`;
}

test.describe("i18n 配置验证", () => {
  test("manifest 使用 i18n 占位并设置 default_locale", async () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    expect(manifest.default_locale).toBe("zh_CN");
    expect(manifest.name).toBe("__MSG_app_name__");
    expect(manifest.description).toBe("__MSG_app_description__");
    expect(manifest.action?.default_title).toBe("__MSG_action_default_title__");
  });
});

test.describe("i18n 运行时文案", () => {
  test("中文 locale 显示中文文案", async ({ page }) => {
    await page.goto(harnessUrl("zh_CN"));
    await page.waitForSelector(".cm-editor", { timeout: 10000 });

    await expect(page.locator("#themeToggle")).toHaveAttribute("title", "切换主题");
    await expect(page.locator("#copyBtn")).toHaveAttribute("aria-label", "复制全部内容");
    await expect(page.locator("#closeBtn")).toHaveAttribute("aria-label", "关闭面板");
    await expect(page.locator("#emptyTitle")).toHaveText("还没有内容");
    await expect(page.locator("#emptyDesc")).toHaveText("在右侧开始记录你的灵感");
  });

  test("英文 locale 显示英文文案", async ({ page }) => {
    await page.goto(harnessUrl("en"));
    await page.waitForSelector(".cm-editor", { timeout: 10000 });

    await expect(page.locator("#themeToggle")).toHaveAttribute("title", "Switch theme");
    await expect(page.locator("#copyBtn")).toHaveAttribute("title", "Copy");
    await expect(page.locator("#copyBtn")).toHaveAttribute("aria-label", "Copy all content");
    await expect(page.locator("#closeBtn")).toHaveAttribute("aria-label", "Close panel");
    await expect(page.locator("#emptyTitle")).toHaveText("No content yet");
    await expect(page.locator("#emptyDesc")).toHaveText("Start capturing your ideas on the right");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  });

  test("导出字段名保持英文协议字段", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(harnessUrl("en"));
    await page.waitForSelector(".cm-editor", { timeout: 10000 });

    await page.evaluate(() => {
      window.__copiedText = "";
      const clipboardMock = {
        writeText: async (text) => {
          window.__copiedText = text;
        }
      };
      try {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: clipboardMock
        });
      } catch (error) {
        navigator.clipboard = clipboardMock;
      }
    });

    await page.locator("#copyBtn").click();
    await expect(page.locator("#toast")).toHaveClass(/visible/, { timeout: 3000 });

    const copied = await page.evaluate(() => window.__copiedText);
    expect(copied).toContain("url:");
    expect(copied).toContain("title:");
    expect(copied).toContain("created_at:");
  });

  test("英文 locale 的保存失败提示独立于复制提示", async ({ page }) => {
    await page.goto(harnessUrl("en"));
    await page.waitForSelector(".cm-editor", { timeout: 10000 });
    await page.evaluate(() => {
      chrome.storage.session.set = async () => {
        throw new Error("simulated storage failure");
      };
    });

    await page.locator(".cm-content").click();
    await page.keyboard.type("unsaved note");
    await page.locator("#closeBtn").click();

    await expect(page.locator("#toast")).toHaveText("Save failed. Please retry before closing");
    await expect(page.locator("#toast")).toHaveClass(/visible/);
    expect(await page.evaluate(() => chrome.sidePanel._closeCalls)).toEqual([]);
  });
});
