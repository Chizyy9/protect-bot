const { loadManifest, startMonitor, check } = require("./lib/core");
const { generate, INTEGRITY_FILE } = require("./lib/generateinteg");
// PROTECTION RUN
function protect(options = {}) {
  loadManifest();
  return startMonitor(options);
}

protect();

module.exports = { protect, check, generate, INTEGRITY_FILE };
