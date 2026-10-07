const path = require("path");
const {
  verifyManifest
} = require("./lib/integrity");

const config = require("./config");

const targetFile = path.resolve(config.targetFile);
const integrityDir = path.resolve(config.integrityDir);

let shuttingDown = false;

function log(message) {
  console.log(`[XT-INTEGRITY] ${message}`);
}

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;

  log(`[PROTECT-INTEGRITY]: ${reason}`);
  process.exit(1);
}

function verify() {
  if (shuttingDown) return;

  const result = verifyManifest(targetFile, integrityDir);

  if (!result.ok) {
    shutdown(result.reason);
  }
}

// Cek langsung saat startup.
verify();

// Cek setiap 1 detik.
const timer = setInterval(verify, config.intervalMs);

process.once("exit", () => {
  clearInterval(timer);
});

log("Runtime integrity.");
