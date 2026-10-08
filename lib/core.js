const fs = require("fs");
const path = require("path");
const { generate, hashFile, INTEGRITY_FILE } = require("./generateinteg");

function loadManifest() {
  if (!fs.existsSync(INTEGRITY_FILE)) {
    return generate();
  }
  return JSON.parse(fs.readFileSync(INTEGRITY_FILE, "utf8"));
}

function check(rootDir = process.cwd()) {
  const manifest = loadManifest();
  for (const [relative, expectedHash] of Object.entries(manifest)) {
    const fullPath = path.join(rootDir, relative);
    if (!fs.existsSync(fullPath)) {
      return { ok: false, file: relative, reason: "missing" };
    }
    const actualHash = hashFile(fullPath);
    if (actualHash !== expectedHash) {
      return { ok: false, file: relative, reason: "modified" };
    }
  }
  return { ok: true };
}

function startMonitor({ intervalMs = 60 * 1000, onViolation } = {}) {
  loadManifest();
  console.log(`
   ██╗  ██╗████████╗      ███████╗██╗  ██╗██╗███████╗██╗     ██████╗
   ╚██╗██╔╝╚══██╔══╝      ██╔════╝██║  ██║██║██╔════╝██║     ██╔══██╗
    ╚███╔╝c     ██║   █████╗███████╗███████║██║█████╗  ██║     ██║  ██║
    ██╔██╗      ██║  ╚════╝╚════██║██╔══██║██║██╔══╝  ██║     ██║  ██║
   ██╔╝ ██╗    ██║          ███████║██║  ██║██║███████╗███████╗██████╔╝
   ╚═╝  ╚═╝    ╚═╝          ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═════╝

  ──────────────────────────────────────────────
  XT-SHIELD - PROTECTION HASH INTEGRITY
  by @Sorsceleste
  ──────────────────────────────────────────────
`);
  const timer = setInterval(() => {
    const result = check();
    if (!result.ok) {
      const message = `[XT-SHIELD] ! ${result.reason}.`;
      if (typeof onViolation === "function") {
        onViolation(result);
      } else {
        console.error(message);
      }
      clearInterval(timer);
      process.exit(1);
    }
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();

  return timer;
}

module.exports = { check, startMonitor, loadManifest };
