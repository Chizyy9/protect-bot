const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(file);
  hash.update(data);
  return hash.digest("hex");
}

function normalize(file) {
  return path.resolve(file);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function generateManifest(targetFile, integrityDir) {
  targetFile = normalize(targetFile);
  integrityDir = normalize(integrityDir);

  if (!fs.existsSync(targetFile)) {
    throw new Error(`Target tidak ditemukan: ${targetFile}`);
  }

  ensureDir(integrityDir);

  const hash = sha256File(targetFile);

  const manifest = {
    version: 1,
    algorithm: "sha256",
    target: path.basename(targetFile),
    hash,
    generatedAt: new Date().toISOString()
  };

  const manifestFile = path.join(integrityDir, "manifest.json");
  fs.writeFileSync(
    manifestFile,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  // File terpisah berisi hash.
  fs.writeFileSync(
    path.join(integrityDir, "hash"),
    hash + "\n",
    "utf8"
  );

  return { manifestFile, hash };
}

function verifyManifest(targetFile, integrityDir) {
  targetFile = normalize(targetFile);
  integrityDir = normalize(integrityDir);

  const manifestFile = path.join(integrityDir, "manifest.json");

  if (!fs.existsSync(targetFile)) {
    return { ok: false, reason: "target_missing" };
  }

  if (!fs.existsSync(manifestFile)) {
    return { ok: false, reason: "manifest_missing" };
  }

  let manifest;

  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  } catch {
    return { ok: false, reason: "manifest_invalid" };
  }

  if (
    manifest.version !== 1 ||
    manifest.algorithm !== "sha256" ||
    typeof manifest.hash !== "string"
  ) {
    return { ok: false, reason: "manifest_invalid" };
  }

  let currentHash;

  try {
    currentHash = sha256File(targetFile);
  } catch {
    return { ok: false, reason: "hash_failed" };
  }

  const ok =
    currentHash.length === manifest.hash.length &&
    crypto.timingSafeEqual(
      Buffer.from(currentHash, "utf8"),
      Buffer.from(manifest.hash, "utf8")
    );

  return {
    ok,
    reason: ok ? "ok" : "hash_mismatch",
    expected: manifest.hash,
    actual: currentHash
  };
}

module.exports = {
  sha256File,
  generateManifest,
  verifyManifest
};
