import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  access,
  readFile,
  readdir,
  stat
} from "node:fs/promises";
import path from "node:path";

const REQUIRED_APPLICATION_FILES = [
  "manifest.json",
  "background.js",
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js",
  "_locales/zh_CN/messages.json",
  "_locales/en/messages.json"
];

function normalizeArchiveEntry(entry) {
  return entry.replace(/^\.\//, "").replace(/\\/g, "/");
}

function isForbiddenReleasePath(relativePath) {
  const normalized = normalizeArchiveEntry(relativePath);
  const segments = normalized.split("/");
  return (
    segments.includes("src") ||
    segments.includes(".DS_Store") ||
    normalized.endsWith(".map")
  );
}

async function assertRegularFile(rootDir, relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  await access(absolutePath);
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) {
    throw new Error(`必需路径不是普通文件: ${relativePath}`);
  }
}

function collectManifestFiles(manifest) {
  const referenced = new Set(REQUIRED_APPLICATION_FILES);
  if (manifest.background?.service_worker) {
    referenced.add(manifest.background.service_worker);
  }
  if (manifest.side_panel?.default_path) {
    referenced.add(manifest.side_panel.default_path.split("?")[0]);
  }
  for (const iconPath of Object.values(manifest.icons || {})) {
    referenced.add(iconPath);
  }
  for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
    referenced.add(iconPath);
  }
  return [...referenced].map(normalizeArchiveEntry);
}

export async function validateExtensionDirectory(extensionDir) {
  const manifestPath = path.join(extensionDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (manifest.manifest_version !== 3) {
    throw new Error(`manifest_version 必须为 3，当前为 ${manifest.manifest_version}`);
  }

  const requiredFiles = collectManifestFiles(manifest);
  for (const relativePath of requiredFiles) {
    await assertRegularFile(extensionDir, relativePath);
  }

  if (!manifest.default_locale) {
    throw new Error("manifest.json 缺少 default_locale");
  }

  const localesDir = path.join(extensionDir, "_locales");
  const localeEntries = await readdir(localesDir, { withFileTypes: true });
  const locales = localeEntries.filter((entry) => entry.isDirectory());
  if (locales.length === 0) {
    throw new Error("_locales 下没有任何语言目录");
  }

  for (const locale of locales) {
    const messagesPath = `_locales/${locale.name}/messages.json`;
    await assertRegularFile(extensionDir, messagesPath);
    JSON.parse(await readFile(path.join(extensionDir, messagesPath), "utf8"));
    requiredFiles.push(messagesPath);
  }

  const defaultMessages = `_locales/${manifest.default_locale}/messages.json`;
  if (!requiredFiles.includes(defaultMessages)) {
    throw new Error(`默认语言文件不存在: ${defaultMessages}`);
  }

  const iconFiles = requiredFiles.filter((file) => file.startsWith("icons/"));
  if (iconFiles.length === 0) {
    throw new Error("manifest.json 未声明任何图标文件");
  }

  return {
    manifest,
    requiredFiles: [...new Set(requiredFiles)].sort()
  };
}

export function listArchiveEntries(archivePath) {
  const output = execFileSync("unzip", ["-Z1", archivePath], {
    encoding: "utf8"
  });
  return output
    .split(/\r?\n/)
    .map(normalizeArchiveEntry)
    .filter(Boolean);
}

export function readArchiveFile(archivePath, relativePath) {
  return execFileSync("unzip", ["-p", archivePath, relativePath], {
    encoding: "utf8"
  });
}

export function validateArchiveEntries(entries, requiredFiles) {
  const files = new Set(entries.filter((entry) => !entry.endsWith("/")));
  const forbidden = [...files].filter(isForbiddenReleasePath);
  if (forbidden.length > 0) {
    throw new Error(`ZIP 包含禁止发布的文件: ${forbidden.join(", ")}`);
  }

  const missing = requiredFiles.filter((file) => !files.has(file));
  if (missing.length > 0) {
    throw new Error(`ZIP 缺少必需文件: ${missing.join(", ")}`);
  }
}

export async function sha256File(filePath) {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

export { isForbiddenReleasePath };
