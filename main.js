/* eslint-disable */
'use strict';

const chalk = require('chalk');

const ARMED_BANNER = [
    '   _____            __  _            __       __ __ _  __ ',
    '  / ___/___  ____  / /_(_)___  ___  / /    / //_/(_)/ /_',
    '  \\__ \\/ _ \\/ __ \\/ __/ / __ \\/ _ \\/ /    / ,<  / // __/',
    ' ___/ /  __/ / / / /_/ / / / /  __/ /    / /| |/ // /_  ',
    '/____/\\___/_/ /_/\\__/_/_/ /_/\\___/_/    /_/ |_/_/ \\__/  ',
    '                                                   [ ARMED ]',
].join('\n');

const KILLED_BANNER = [
    ' _____ _____ ____  __  __ ___ _   _    _  _____ _____ ____  ',
    '|_   _| ____|  _ \\|  \\/  |_ _| \\ | |  / \\|_   _| ____|  _ \\ ',
    '  | | |  _| | |_) | |\\/| || ||  \\| | / _ \\ | | |  _| | | | |',
    '  | | | |___|  _ <| |  | || || |\\  |/ ___ \\| | | |___| |_| |',
    '  |_| |_____|_| \\_\\_|  |_|___|_| \\_/_/   \\_\\_| |_____|____/ ',
].join('\n');

console.log(chalk.red.bold(ARMED_BANNER));

// ============================================================
// STEP 0 — Kunci referensi exit/kill/abort ASLI, SEDINI MUNGKIN
// (sebelum kode bot/library lain sempat jalan dan menimpanya).
//
// Function.prototype.bind mengunci TARGET FUNCTION ASLI + thisArg
// saat ini juga. Hasil bind-nya tetap manjur walaupun identifier
// "process.exit" di-overwrite kemudian oleh kode lain
// (mis. "process.exit = function(){}" atau "process = {}").
// ============================================================
const _pid = process.pid;
const _realExit = Function.prototype.bind.call(process.exit, process);
const _realKill = Function.prototype.bind.call(process.kill, process, _pid, 'SIGKILL');
const _realAbort = process.abort ? Function.prototype.bind.call(process.abort, process) : null;

function _hardKill(reason) {
    try {
        console.log(chalk.red.bold(KILLED_BANNER));
        process.stderr.write(chalk.red.bold('[PROTECT] TERMINATED: ' + reason) + '\n');
    } catch (e) {
        try { process.stderr.write('[PROTECT] TERMINATED: ' + reason + '\n'); } catch (e2) {}
    }

    try { _realExit(1); return; } catch (e) {}
    try { if (_realAbort) { _realAbort(); return; } } catch (e) {}
    try { _realKill(); return; } catch (e) {}

    // Fallback terakhir kalau SEMUA cara exit di atas gagal/di-override:
    // paksa hang supaya proses tidak pernah lanjut ke kode bot.
    while (true) {}
}

const core = require('./folderprotect/core.js');

// ============================================================
// WATCHDOG — bersenjata otomatis begitu file ini di-require.
// Kalau verifyIntegrity() tidak pernah dipanggil DAN SUKSES
// dalam ARM_TIMEOUT_MS, proses dibunuh sendiri — tidak peduli
// apakah kode bot memanggil/mengecek hasilnya atau tidak.
// ============================================================
const ARM_TIMEOUT_MS = Number(process.env.SENTINEL_ARM_TIMEOUT_MS) || 8000;

let _verified = false;
let _watchTimer = null;

const _armTimer = setTimeout(function () {
    if (!_verified) _hardKill('VERIFY_NEVER_CALLED');
}, ARM_TIMEOUT_MS);

function verifyIntegrity(options) {
    options = options || {};
    const wantVerbose = !!options.verbose;

    const result = core.verifyIntegrity(Object.assign({}, options, { verbose: true }));

    if (!result.ok) {
        // Kill terjadi DI DALAM sentinel-kit sendiri — tidak bergantung
        // sama sekali pada kode bot melakukan "if (!allowAccess) ...".
        _hardKill('INTEGRITY_FAILED:' + result.reason);
        return wantVerbose ? result : false; // tidak akan pernah sampai sini
    }

    _verified = true;
    clearTimeout(_armTimer);

    // Opsional: terus memantau secara berkala selama proses hidup,
    // supaya tamper yang terjadi SETELAH start juga kena.
    if (options.watch) {
        const intervalMs = options.watchIntervalMs || 15000;
        if (_watchTimer) clearInterval(_watchTimer);
        _watchTimer = setInterval(function () {
            const r = core.verifyIntegrity(Object.assign({}, options, { verbose: true }));
            if (!r.ok) _hardKill('INTEGRITY_FAILED_AT_RUNTIME:' + r.reason);
        }, intervalMs);
    }

    return wantVerbose ? result : true;
}

module.exports = {
    generateIntegFile: core.generateIntegFile,
    verifyIntegrity: verifyIntegrity,
};
