'use strict';

// Entry khusus untuk script generate manifest (dev-side, sekali jalan).
// Sengaja TIDAK memuat watchdog/kill dari bridge.js, supaya script
// "generateIntegFile.js" tidak ikut dibunuh gara-gara tidak memanggil
// verifyIntegrity().
const core = require('./folderprotect/core.js');

module.exports = {
    generateIntegFile: core.generateIntegFile,
};
