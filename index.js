#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const vm = require('vm');

const targetFile = './index-chico.js';
const outputFile = './dist/index.protected.js';
const deleteOriginal = true;

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exitCode = 1;
}

function b64(value) {
  return Buffer.from(value).toString('base64');
}

function randInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function splitChunks(buffer, min = 64, max = 192) {
  const chunks = [];
  let offset = 0;

  while (offset < buffer.length) {
    const size = Math.min(
      randInt(min, max),
      buffer.length - offset
    );
    chunks.push(buffer.subarray(offset, offset + size));
    offset += size;
  }

  return chunks;
}

function buildPayload(source) {
  const compressed = zlib.gzipSync(Buffer.from(source, 'utf8'), {
    level: 9
  });

  // AES-256-GCM: encryption + authenticated integrity.
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(compressed),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  // Split the encrypted payload and shuffle its order.
  const chunks = splitChunks(encrypted);
  const order = shuffle(chunks.map((_, i) => i));
  const shuffled = order.map(i => chunks[i]);

  // Split the key into random parts and shuffle those too.
  const keyParts = [];
  const partSize = Math.ceil(key.length / 4);

  for (let i = 0; i < 4; i++) {
    keyParts.push(key.subarray(i * partSize, (i + 1) * partSize));
  }

  const keyOrder = shuffle(keyParts.map((_, i) => i));

  const payload = {
    v: 2,
    alg: 'aes-256-gcm',
    iv: b64(iv),
    tag: b64(tag),
    kp: keyOrder.map(i => b64(keyParts[i])),
    ko: keyOrder,
    chunks: shuffled.map(b64),
    co: order
  };

  const encoded = b64(JSON.stringify(payload));

  // Build-level integrity seal.
  const sealKey = crypto.randomBytes(32);
  const mac = crypto
    .createHmac('sha256', sealKey)
    .update(encoded)
    .digest('hex');

  return {
    payload: encoded,
    sealKey: sealKey.toString('base64'),
    mac
  };
}

function loader({ payload, sealKey, mac }) {
  return `#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const zlib = require('zlib');
const vm = require('vm');

const DATA = ${JSON.stringify(payload)};
const SEAL_KEY = ${JSON.stringify(sealKey)};
const MAC = ${JSON.stringify(mac)};

function fail() {
  process.exitCode = 1;
  throw new Error('Protected payload validation failed');
}

function verify() {
  const actual = crypto
    .createHmac('sha256', Buffer.from(SEAL_KEY, 'base64'))
    .update(DATA)
    .digest('hex');

  if (
    actual.length !== MAC.length ||
    !crypto.timingSafeEqual(
      Buffer.from(actual),
      Buffer.from(MAC)
    )
  ) {
    fail();
  }
}

function rebuildChunks(chunks, order) {
  const original = new Array(order.length);

  for (let i = 0; i < order.length; i++) {
    original[order[i]] = Buffer.from(chunks[i], 'base64');
  }

  return Buffer.concat(original);
}

function rebuildKey(parts, order) {
  const original = new Array(order.length);

  for (let i = 0; i < order.length; i++) {
    original[order[i]] = Buffer.from(parts[i], 'base64');
  }

  return Buffer.concat(original);
}

function decrypt() {
  const payload = JSON.parse(
    Buffer.from(DATA, 'base64').toString('utf8')
  );

  const key = rebuildKey(payload.kp, payload.ko);
  const encrypted = rebuildChunks(payload.chunks, payload.co);

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64')
  );

  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

  const compressed = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return zlib.gunzipSync(compressed).toString('utf8');
}

function run(source) {
  /*
   * VM context isolates the protected source from the loader's local
   * variables. Node's require is deliberately exposed because normal
   * Node.js applications commonly depend on it.
   */
  const sandbox = {
    console,
    Buffer,
    process,
    require,
    module: { exports: {} },
    exports: {},
    __filename: process.argv[1],
    __dirname: process.cwd(),
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval
  };

  const context = vm.createContext(sandbox);

  const script = new vm.Script(
    source,
    { filename: 'protected.vm.js' }
  );

  return script.runInContext(context);
}

try {
  verify();
  const source = decrypt();
  run(source);
} catch (error) {
  console.error('[VM ENCRYPT]', error.message);
  process.exitCode = 1;
}
`;
}

function main() {
  const input = path.resolve(targetFile);
  const output = path.resolve(outputFile);

  console.log('\n🔐 VM ENCRYPT');
  console.log('─'.repeat(42));
  console.log(`Target : ${path.relative(process.cwd(), input)}`);
  console.log(`Output : ${path.relative(process.cwd(), output)}`);

  if (!fs.existsSync(input)) {
    return fail(`Target tidak ditemukan: ${targetFile}`);
  }

  if (path.resolve(input) === path.resolve(output)) {
    return fail('Target dan output tidak boleh sama.');
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });

  const source = fs.readFileSync(input, 'utf8');

  if (!source.trim()) {
    return fail('Target kosong.');
  }

  console.log('\n[1/5] Reading target       ✓');

  const encrypted = buildPayload(source);
  console.log('[2/5] Compress + encrypt   ✓');
  console.log('[3/5] Chunk + key shuffle   ✓');

  const protectedCode = loader(encrypted);

  // Tulis atomically agar output tidak setengah jadi.
  const temp = `${output}.${process.pid}.tmp`;
  fs.writeFileSync(temp, protectedCode, {
    encoding: 'utf8',
    mode: 0o600
  });
  fs.renameSync(temp, output);

  console.log('[4/5] Build VM loader       ✓');

  // Verifikasi bahwa hasil benar-benar dapat dibaca kembali.
  const generated = fs.readFileSync(output, 'utf8');

  if (!generated.includes('const DATA =')) {
    throw new Error('Output verification gagal.');
  }

  console.log('[5/5] Integrity check       ✓');

  // Source hanya dihapus setelah seluruh proses sukses.
  if (deleteOriginal) {
    fs.unlinkSync(input);
    console.log('\n🗑️  Source asli dihapus.');
  }

  console.log(`\n✅ Protection complete`);
  console.log(`📦 ${path.relative(process.cwd(), output)}`);
  console.log(`▶️  node ${path.relative(process.cwd(), output)}\n`);
}

try {
  main();
} catch (error) {
  fail(error.message);
}
