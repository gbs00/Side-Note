const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const BACKGROUND_PATH = path.join(ROOT, "extension/background.js");
const MANIFEST_PATH = path.join(ROOT, "extension/manifest.json");

function createChromeEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    }
  };
}

function createBackgroundEnvironment(overrides = {}) {
  const notes = {};
  const warnings = [];
  const sidePanelCalls = {
    setOptions: [],
    open: []
  };
  const events = {
    actionClicked: createChromeEvent(),
    tabRemoved: createChromeEvent(),
    installed: createChromeEvent()
  };

  const session = {
    async get(key) {
      if (overrides.sessionGet) {
        return overrides.sessionGet(key, notes);
      }
      return { [key]: notes[key] };
    },
    async set(items) {
      if (overrides.sessionSet) {
        return overrides.sessionSet(items, notes);
      }
      Object.assign(notes, items);
    },
    async remove(key) {
      delete notes[key];
    }
  };

  const sidePanel = {
    setOptions(options) {
      sidePanelCalls.setOptions.push(options);
      if (overrides.setOptions) {
        return overrides.setOptions(options);
      }
      return Promise.resolve();
    },
    open(options) {
      sidePanelCalls.open.push(options);
      if (overrides.open) {
        return overrides.open(options);
      }
      return Promise.resolve();
    }
  };
  if (overrides.withoutOpen) {
    delete sidePanel.open;
  }

  const chrome = {
    i18n: {
      getMessage() {
        return "";
      }
    },
    storage: { session },
    tabs: {
      get(tabId) {
        if (overrides.tabsGet) {
          return overrides.tabsGet(tabId);
        }
        return Promise.resolve({
          id: tabId,
          url: "https://example.com/video",
          title: "测试标题"
        });
      },
      onRemoved: events.tabRemoved
    },
    sidePanel,
    action: { onClicked: events.actionClicked },
    runtime: { onInstalled: events.installed }
  };

  const source = fs.readFileSync(BACKGROUND_PATH, "utf8");
  vm.runInNewContext(source, {
    chrome,
    console: {
      warn(...args) {
        warnings.push(args.map(String).join(" "));
      }
    }
  });

  return { notes, warnings, sidePanelCalls, events };
}

async function settleAsyncOperations(rounds = 5) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test.describe("background 可靠性", () => {
  test("manifest 声明 sidePanel.open 所需的最低 Chrome 116", () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    expect(Number(manifest.minimum_chrome_version)).toBeGreaterThanOrEqual(116);
  });

  test("sidePanel.open 不可用时安全拒绝打开", () => {
    const environment = createBackgroundEnvironment({ withoutOpen: true });
    expect(() => {
      environment.events.actionClicked.listeners[0]({ id: 42 });
    }).not.toThrow();
    expect(environment.sidePanelCalls.open).toEqual([]);
    expect(environment.warnings.join("\n")).toContain("Chrome 116 or newer is required");
  });

  test("启动与安装时 setOptions 的 Promise 拒绝会被捕获", async () => {
    const environment = createBackgroundEnvironment({
      setOptions() {
        return Promise.reject(new Error("模拟禁用面板失败"));
      }
    });
    environment.events.installed.listeners[0]();

    await settleAsyncOperations();

    const warningText = environment.warnings.join("\n");
    expect(warningText).toContain("Failed to disable side panel on startup");
    expect(warningText).toContain("Failed to disable side panel after installation");
  });

  test("初始化写入会合并同期产生的本地正文", async () => {
    let resolveTab;
    const tabPromise = new Promise((resolve) => {
      resolveTab = resolve;
    });
    const environment = createBackgroundEnvironment({
      tabsGet() {
        return tabPromise;
      }
    });

    environment.events.actionClicked.listeners[0]({ id: 42 });
    await settleAsyncOperations(2);

    environment.notes["note:42"] = {
      tabId: 42,
      url: "未获取到哦，可手动输入",
      title: "未获取到哦，可手动输入",
      createdAt: "2026-07-15 09:00:00",
      contentMd: "用户在初始化期间输入的内容",
      updatedAt: "2026-07-15 09:00:01"
    };
    resolveTab({
      id: 42,
      url: "https://www.bilibili.com/video/BV1merge",
      title: "真实视频标题"
    });
    await settleAsyncOperations();

    expect(environment.notes["note:42"]).toMatchObject({
      url: "https://www.bilibili.com/video/BV1merge",
      title: "真实视频标题",
      contentMd: "用户在初始化期间输入的内容"
    });
    expect(environment.sidePanelCalls.open).toEqual([{ tabId: 42 }]);
  });

  test("未完成初始化不会在 tab 关闭后留下孤儿笔记", async () => {
    let resolveInitialRead;
    let getCallCount = 0;
    const environment = createBackgroundEnvironment({
      sessionGet(key, notes) {
        getCallCount += 1;
        if (getCallCount === 1) {
          return new Promise((resolve) => {
            resolveInitialRead = () => resolve({ [key]: undefined });
          });
        }
        return { [key]: notes[key] };
      }
    });

    environment.events.actionClicked.listeners[0]({
      id: 42,
      url: "https://www.bilibili.com/video/BV1closed",
      title: "即将关闭的标签页"
    });
    await settleAsyncOperations(2);
    environment.events.tabRemoved.listeners[0](42);

    resolveInitialRead();
    await settleAsyncOperations(10);

    expect(environment.notes["note:42"]).toBeUndefined();
    expect(environment.sidePanelCalls.setOptions).toContainEqual({
      tabId: 42,
      enabled: false
    });
  });
});
