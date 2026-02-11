const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ZH_LOCALE_PATH = path.join(ROOT, "extension/_locales/zh_CN/messages.json");
const EN_LOCALE_PATH = path.join(ROOT, "extension/_locales/en/messages.json");
const MANIFEST_PATH = path.join(ROOT, "extension/manifest.json");
const SIDEPANEL_SRC_PATH = path.join(ROOT, "extension/src/sidepanel.js");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test.describe("i18n 静态一致性校验", () => {
  test("中英文 locale key 集合一致", () => {
    const zh = readJson(ZH_LOCALE_PATH);
    const en = readJson(EN_LOCALE_PATH);
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();

    expect(enKeys).toEqual(zhKeys);
  });

  test("中英文 locale message 均为非空字符串", () => {
    const zh = readJson(ZH_LOCALE_PATH);
    const en = readJson(EN_LOCALE_PATH);

    for (const [key, value] of Object.entries(zh)) {
      expect(typeof value.message).toBe("string");
      expect(value.message.trim().length).toBeGreaterThan(0);
      expect(typeof en[key].message).toBe("string");
      expect(en[key].message.trim().length).toBeGreaterThan(0);
    }
  });

  test("manifest 中引用的 __MSG_ 字段在 locale 中存在", () => {
    const manifest = readJson(MANIFEST_PATH);
    const zh = readJson(ZH_LOCALE_PATH);
    const en = readJson(EN_LOCALE_PATH);
    const referencedKeys = [
      manifest.name,
      manifest.description,
      manifest.action?.default_title
    ]
      .filter(Boolean)
      .map((value) => value.replace(/^__MSG_/, "").replace(/__$/, ""));

    for (const key of referencedKeys) {
      expect(zh[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
    }
  });

  test("sidepanel.js 中 getI18nMessage 使用的 key 在 locale 中存在", () => {
    const source = fs.readFileSync(SIDEPANEL_SRC_PATH, "utf8");
    const zh = readJson(ZH_LOCALE_PATH);
    const en = readJson(EN_LOCALE_PATH);
    const keyRegex = /getI18nMessage\("([^"]+)"/g;
    const keySet = new Set();

    let match = keyRegex.exec(source);
    while (match) {
      keySet.add(match[1]);
      match = keyRegex.exec(source);
    }

    for (const key of keySet) {
      expect(zh[key]).toBeTruthy();
      expect(en[key]).toBeTruthy();
    }
  });

  test("导出字段协议维持英文字段名", () => {
    const source = fs.readFileSync(SIDEPANEL_SRC_PATH, "utf8");
    expect(source).toContain("url:");
    expect(source).toContain("title:");
    expect(source).toContain("created_at:");
  });
});
