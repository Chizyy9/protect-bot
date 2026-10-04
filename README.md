# sentinel-kit (v2 — self-enforcing)

Integrity-checker + kill-switch untuk bot Node.js yang di-hosting di Pterodactyl. Beda dari v1: logic "bunuh proses kalau gagal" sekarang ada **di dalam sentinel-kit sendiri**, bukan bergantung pada kode bot untuk melakukan pengecekan.

## Apa yang berubah dari versi sebelumnya

1. **Watchdog otomatis saat `require()`.** Begitu `require("sentinel-kit")` dieksekusi, timer internal langsung aktif (default 8 detik). Kalau `verifyIntegrity()` tidak pernah dipanggil dan sukses dalam waktu itu, proses dibunuh sendiri — walau kode `if (!allowAccess)` di file bot kamu dihapus total.
2. **`verifyIntegrity()` membunuh proses sendiri kalau gagal**, bukan cuma return `false`. Return value cuma berguna untuk logging (atau kalau kamu pakai `verbose: true`).
3. **Referensi `process.exit` / `process.kill` / `process.abort` dikunci di awal file** pakai `Function.prototype.bind`, sebelum kode lain sempat jalan. Kalau ada yang override `process.exit = function(){}` setelahnya, sentinel-kit tetap pakai referensi asli yang sudah di-bind. Urutan fallback: `exit` asli → `abort` asli → `kill(SIGKILL)` ke PID sendiri → kalau semua gagal, paksa hang (`while(true){}`) supaya proses tidak pernah lanjut.
4. **Hash & enkripsi lebih kuat:** HMAC-**SHA512** (naik dari SHA256) untuk tiap file + manifest, dan `.integ` dienkripsi pakai **AES-256-GCM** (authenticated encryption, bukan CBC) dengan key diturunkan via `scrypt`. GCM otomatis menolak dekripsi kalau ciphertext diubah sedikit pun — jadi ada dua lapis deteksi tamper: di level enkripsi (authTag) dan di level manifest hash.
5. **Mode `watch`:** opsional terus mengecek ulang secara berkala selama proses hidup, supaya tamper yang terjadi *setelah* bot sudah start (bukan cuma saat start) juga ketahuan.

## Dua entry point

- `require("sentinel-kit")` → entry utama (`bridge.js`). **Langsung bersenjata begitu di-require.** Pakai ini di file yang benar-benar menjalankan bot (`index.js`).
- `require("sentinel-kit/generate")` → entry khusus generate manifest, **tanpa watchdog**. Pakai ini HANYA di script generate (`generateIntegFile.js`) yang kamu jalankan sendiri sekali sebelum deploy — supaya script itu tidak ikut dibunuh gara-gara tidak memanggil `verifyIntegrity()`.

## 1. Generate `.integ` (sekali, sebelum deploy)

```js
const sentinel = require("sentinel-kit/generate");

sentinel.generateIntegFile({
    listProtectedFileAndFolder: ["./"],
    excludeFileAndFolder: [
        "./node_modules", "./.npm", "./.cache", "./.env", "./.integ",
        "./package-lock.json", "./generateIntegFile.js", "./config.json",
    ],
    secretKey: process.env.SENTINEL_SECRET || "MY_SECRET_KEY",
});
```

## 2. Verifikasi di entry point bot (dijalankan sebagai Startup Command Pterodactyl)

```js
const sentinel = require("sentinel-kit");

sentinel.verifyIntegrity({
    listProtectedFileAndFolder: ["./"],
    excludeFileAndFolder: [
        "./node_modules", "./.npm", "./.cache", "./.env", "./.integ",
        "./package-lock.json", "./generateIntegFile.js", "./config.json",
    ],
    secretKey: process.env.SENTINEL_SECRET || "MY_SECRET_KEY",
    watch: true,            // opsional: cek ulang terus selama bot hidup
    watchIntervalMs: 15000, // opsional: interval cek ulang (ms)
});

require("./bot.js");
```

List file + `secretKey` di dua file ini **harus identik**.

## Konfigurasi

- `SENTINEL_ARM_TIMEOUT_MS` (env var, default `8000`) — berapa lama sentinel-kit menunggu `verifyIntegrity()` dipanggil-dan-sukses sejak `require()` sebelum membunuh proses.
- `watch` / `watchIntervalMs` (opsi di `verifyIntegrity`) — aktifkan pengecekan berkala pasca-start.

## Batasan yang tetap berlaku (baca ini)

Hardening di atas membuat ini jauh lebih sulit dilewati dibanding versi pertama (tidak bisa lagi sekadar menghapus satu baris `if` di `index.js`, dan `process.exit` tidak bisa di-override begitu saja). Tapi tetap ada **satu celah fundamental yang tidak bisa ditutup software apa pun**:

- **`node_modules` ada di daftar `exclude`.** Artinya sentinel-kit tidak memverifikasi file dirinya sendiri. Siapa pun yang punya akses penuh ke server (pemilik/penyewa server Pterodactyl itu sendiri) bisa langsung mengedit `node_modules/sentinel-kit/bridge.js` atau `dist/core.js` — misalnya mengganti isi `_hardKill` jadi fungsi kosong — lalu `npm start`. Watchdog, kill, semuanya bisa dilumpuhkan dari situ, karena kode yang menegakkan aturan dan kode yang mau ditegakkan jalan di mesin yang sama, dikontrol orang yang sama.
  - Kalau kamu mau menutup celah ini sebagian, masukkan `node_modules/sentinel-kit` ke `listProtectedFileAndFolder` (bukan exclude). Konsekuensinya: setiap kali versi sentinel-kit berubah, `.integ` harus di-generate ulang.
- Tidak ada implementasi anti-tamper client-side yang benar-benar tidak bisa ditembus oleh orang yang punya akses root/shell penuh ke mesin tempat kode itu berjalan. Semua hardening di atas menaikkan effort yang dibutuhkan (dari "hapus satu baris" jadi "harus edit file di node_modules dan paham cara kerja watchdog-nya"), bukan menghilangkan kemungkinannya sepenuhnya.
