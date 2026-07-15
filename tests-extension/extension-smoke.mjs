import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const extensionDir = path.join(projectDir, "extension");
const profileDir = await mkdtemp(path.join(os.tmpdir(), "side-note-chromium-"));
const channel = process.env.EXTENSION_SMOKE_CHANNEL || "chromium";
const headless = process.env.EXTENSION_SMOKE_HEADLESS !== "0";
const strictAction = process.env.EXTENSION_SMOKE_STRICT_ACTION === "1";
const results = [];

function record(status, name, detail = "") {
  results.push({ status, name, detail });
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`[${status}] ${name}${suffix}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function pollUntil(callback, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await callback()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function runCheck(name, callback) {
  try {
    const detail = await callback();
    record("PASS", name, detail);
  } catch (error) {
    record("FAIL", name, error instanceof Error ? error.message : String(error));
  }
}

async function getActiveTabId(context, worker) {
  const page = await context.newPage();
  await page.goto("data:text/html,<title>Side Note extension smoke tab</title>");
  await page.bringToFront();
  const tabId = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.id;
  });
  assert(Number.isInteger(tabId), "无法获取真实 Chromium 标签页 ID");
  return { page, tabId };
}

let context;
try {
  console.log(
    `启动真实扩展冒烟：channel=${channel}, headless=${headless}, profile=${profileDir}`
  );
  context = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`
    ]
  });

  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent("serviceworker", { timeout: 10000 });
  }

  await runCheck("Manifest V3 与 Service Worker 真实加载", async () => {
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    assert(manifest.manifest_version === 3, "manifest_version 不是 3");
    assert(
      manifest.background?.service_worker === "background.js",
      "Service Worker 入口不是 background.js"
    );
    assert(
      worker.url().startsWith("chrome-extension://"),
      `Worker 不是扩展协议: ${worker.url()}`
    );
    return `${manifest.name}, ${worker.url()}`;
  });

  await runCheck("action 点击监听器已注册", async () => {
    const hasListener = await worker.evaluate(() =>
      chrome.action.onClicked.hasListeners()
    );
    assert(hasListener, "chrome.action.onClicked 没有已注册监听器");
    return "由真实扩展 Service Worker 回报";
  });

  await runCheck("storage.session 真实读写", async () => {
    const key = `smoke:${Date.now()}`;
    const value = { contentMd: "real-extension-storage", updatedAt: Date.now() };
    const stored = await worker.evaluate(
      async ({ key, value }) => {
        await chrome.storage.session.set({ [key]: value });
        const result = await chrome.storage.session.get(key);
        await chrome.storage.session.remove(key);
        return result[key];
      },
      { key, value }
    );
    assert(stored?.contentMd === value.contentMd, "storage.session 读回数据不一致");
    return "写入、读取、删除均通过真实 Chrome API";
  });

  let actionTab;
  await runCheck("Side Panel 按 tab 配置", async () => {
    actionTab = await getActiveTabId(context, worker);
    const options = await worker.evaluate(async (tabId) => {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: true,
        path: `sidepanel.html?tabId=${tabId}`
      });
      return chrome.sidePanel.getOptions({ tabId });
    }, actionTab.tabId);
    assert(options.enabled === true, "Side Panel 未对目标 tab 启用");
    assert(
      options.path === `sidepanel.html?tabId=${actionTab.tabId}`,
      `Side Panel 路径错误: ${options.path}`
    );
    return `tabId=${actionTab.tabId}, path=${options.path}`;
  });

  const actionSkipDetail =
    "Playwright 只控制网页内容，不能可靠点击 Chromium 工具栏扩展图标；需在真实 Chrome 中人工确认图标点击后面板可见";
  record(strictAction ? "FAIL" : "SKIP", "工具栏 action → 面板可见", actionSkipDetail);

  if (actionTab?.page) {
    await actionTab.page.close();
  }

  await runCheck("tabs.onRemoved 清理会话笔记", async () => {
    const { page, tabId } = await getActiveTabId(context, worker);
    const key = `note:${tabId}`;
    await worker.evaluate(
      async ({ key, tabId }) => {
        await chrome.storage.session.set({
          [key]: {
            tabId,
            url: "https://example.test/smoke",
            title: "smoke",
            createdAt: "2026-07-15 00:00:00",
            contentMd: "must be removed",
            updatedAt: "2026-07-15 00:00:00"
          }
        });
      },
      { key, tabId }
    );

    const existed = await worker.evaluate(
      async (key) => Boolean((await chrome.storage.session.get(key))[key]),
      key
    );
    assert(existed, "关闭 tab 前的测试笔记未写入");
    await page.close();

    const removed = await pollUntil(() =>
      worker.evaluate(
        async (key) => !Boolean((await chrome.storage.session.get(key))[key]),
        key
      )
    );
    assert(removed, `tabId=${tabId} 关闭后 note 未在 5 秒内清理`);
    return `tabId=${tabId} 的 ${key} 已被真实 onRemoved 监听器清理`;
  });
} catch (error) {
  record(
    "FAIL",
    "启动真实 unpacked 扩展",
    error instanceof Error ? error.message : String(error)
  );
} finally {
  if (context) {
    await context.close();
  }
  await rm(profileDir, { recursive: true, force: true });
}

const summary = results.reduce(
  (counts, result) => {
    counts[result.status] += 1;
    return counts;
  },
  { PASS: 0, SKIP: 0, FAIL: 0 }
);
console.log(
  `真实扩展冒烟结果: PASS=${summary.PASS}, SKIP=${summary.SKIP}, FAIL=${summary.FAIL}`
);

if (summary.FAIL > 0) {
  process.exitCode = 1;
}
