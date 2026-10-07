const fs = require("fs");
const path = require("path");
const {
  generateManifest,
  verifyManifest
} = require("./integrity");

const config = require("./config");

const targetFile = path.resolve(config.targetFile);
const integrityDir = path.resolve(config.integrityDir);

function log(message) {
  console.log(`[XT-INTEGRITY] ${message}`);
}

function main() {
  if (!fs.existsSync(targetFile)) {
    console.error(`[XT-INTEGRITY] Target tidak ditemukan: ${targetFile}`);
    process.exitCode = 1;
    return;
  }

  const result = generateManifest(targetFile, integrityDir);

  log(`Target : ${targetFile}`);
  log(`SHA256 : ${result.hash}`);
  log(`Manifest: ${result.manifestFile}`);
  log("Integrity berhasil dibuat.");
}

main();
