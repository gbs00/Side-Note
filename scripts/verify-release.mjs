import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  listArchiveEntries,
  readArchiveFile,
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
const archivePath = path.join(
  projectDir,
  "dist",
  `side-note-${packageJson.version}.zip`
);
const { manifest, requiredFiles } = await validateExtensionDirectory(extensionDir);

const archiveManifest = JSON.parse(
  readArchiveFile(archivePath, "manifest.json")
);
if (archiveManifest.version !== manifest.version) {
  throw new Error(
    `ZIP manifest 版本 ${archiveManifest.version} 与源目录版本 ${manifest.version} 不一致`
  );
}
if (archiveManifest.version !== packageJson.version) {
  throw new Error(
    `ZIP manifest 版本 ${archiveManifest.version} 与 package.json 版本 ${packageJson.version} 不一致`
  );
}

const entries = listArchiveEntries(archivePath);
validateArchiveEntries(entries, requiredFiles);

const archiveStat = await stat(archivePath);
const sha256 = await sha256File(archivePath);
console.log("发布制品校验通过");
console.log(`版本: ${archiveManifest.version}`);
console.log(`大小: ${archiveStat.size} bytes`);
console.log(`文件数: ${entries.filter((entry) => !entry.endsWith("/")).length}`);
console.log(`SHA-256: ${sha256}`);
