import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = './license-tools.cjs';
const lib = require(path);
const key = process.argv[2];
const verification = lib.verifyLicenseKey(key);
console.log(JSON.stringify({ ok: !!verification, verification }, null, 2));
