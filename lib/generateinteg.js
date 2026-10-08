const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const INTEGRITY_FILE = path.join(process.cwd(), ".integrity.json");

const IGNORED = [
  "node_modules",
  ".git",
  ".integrity.json",
  "package-lock.json",
];

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function generate(rootDir = process.cwd()) {
  const files = walk(rootDir);
  const manifest = {};
  for (const file of files) {
    const relative = path.relative(rootDir, file);
    manifest[relative] = hashFile(file);
  }
  fs.writeFileSync(INTEGRITY_FILE, JSON.stringify(manifest, null, 2));
  return manifest;
}

module.exports = { generate, hashFile, walk, INTEGRITY_FILE };
