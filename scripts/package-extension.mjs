import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isForbiddenReleasePath,
  listArchiveEntries,
  sha256File,
  validateArchiveEntries,
  validateExtensionDirectory
} from "./release-validation.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const extensionDir = path.join(projectDir, "extension");
const packageJson = JSON.parse(
  await readFile(path.join(projectDir, "package.json"), "utf8")
);
const distDir = path.join(projectDir, "dist");
const archivePath = path.join(distDir, `side-note-${packageJson.version}.zip`);
const stagingParent = await mkdtemp(path.join(os.tmpdir(), "side-note-release-"));
const stagingDir = path.join(stagingParent, "extension");
const releaseTimestamp = new Date("2000-01-01T00:00:00.000Z");

async function normalizeReleaseTimestamps(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await normalizeReleaseTimestamps(entryPath);
    }
    await utimes(entryPath, releaseTimestamp, releaseTimestamp);
  }
}

try {
  const { manifest, requiredFiles } = await validateExtensionDirectory(extensionDir);
  if (manifest.version !== packageJson.version) {
    throw new Error(
      `manifest 版本 ${manifest.version} 与 package.json 版本 ${packageJson.version} 不一致`
    );
  }

  await cp(extensionDir, stagingDir, {
    recursive: true,
    preserveTimestamps: true,
    filter(sourcePath) {
      const relativePath = path.relative(extensionDir, sourcePath);
      return relativePath === "" || !isForbiddenReleasePath(relativePath);
    }
  });

  await validateExtensionDirectory(stagingDir);
  // 固定 ZIP 内文件时间戳，使相同源码可产生相同 SHA-256。
  await normalizeReleaseTimestamps(stagingDir);
  await mkdir(distDir, { recursive: true });
  // 每次只重建当前版本的制品，避免 zip 工具向旧包增量追加。
  await rm(archivePath, { force: true });

  const topLevelEntries = await readdir(stagingDir);
  if (topLevelEntries.length === 0) {
    throw new Error("发布暂存目录为空");
  }

  execFileSync("zip", ["-q", "-X", "-r", archivePath, ...topLevelEntries], {
    cwd: stagingDir,
    stdio: "inherit"
  });

  const archiveEntries = listArchiveEntries(archivePath);
  validateArchiveEntries(archiveEntries, requiredFiles);
  const sha256 = await sha256File(archivePath);

  console.log(`发布包已重新生成: ${archivePath}`);
  console.log(`发布文件数: ${archiveEntries.filter((entry) => !entry.endsWith("/")).length}`);
  console.log(`SHA-256: ${sha256}`);
} finally {
  await rm(stagingParent, { recursive: true, force: true });
}
