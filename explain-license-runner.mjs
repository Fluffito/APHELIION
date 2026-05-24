import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const lib = require('./license-tools.cjs');
const KEY = process.argv[2];
function normalize(v){return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"");}
const clean = normalize(KEY);
const match = clean.match(/^APH1(UNL|KIT|MAX)([A-Z0-9]{4})([A-Z0-9]{4})$/);
if(!match){
  console.log(JSON.stringify({ ok:false, error: 'INVALID_FORMAT', input: KEY, clean }, null, 2));
  process.exit(0);
}
const [, code, seed, providedChecksum] = match;
const expected = lib.computeLicenseChecksum(`${lib.LICENSE_VERSION}-${code}-${seed}`);
console.log(JSON.stringify({ ok:true, input: KEY, clean, code, seed, providedChecksum, expectedChecksum: expected, matches: providedChecksum===expected }, null, 2));
