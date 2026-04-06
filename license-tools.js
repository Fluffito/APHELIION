const LICENSE_SECRET = "APHELION::KITSUNE::2026";
const LICENSE_VERSION = "APH1";

const PLAN_CODES = {
  "unlimited-bonk": "UNL",
  unlimited: "UNL",
  "no-ads-kitsune": "KIT",
  noads: "KIT",
  bundle: "MAX",
  founder: "MAX"
};

function computeLicenseChecksum(seed) {
  const raw = `${seed}|${LICENSE_SECRET}`;
  let acc = 17;
  for (let i = 0; i < raw.length; i++) {
    acc = (acc * 31 + raw.charCodeAt(i) * (i + 3)) % 1679616;
  }
  return acc.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

function makeSeed(reference) {
  const raw = String(reference || `BUYER-${Date.now()}`).toUpperCase();
  let acc = 11;
  for (let i = 0; i < raw.length; i++) {
    acc = (acc * 29 + raw.charCodeAt(i) * (i + 1)) % 1679616;
  }
  return acc.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

function createLicenseKey(planName, buyerReference) {
  const normalizedPlan = String(planName || "").trim().toLowerCase();
  const code = PLAN_CODES[normalizedPlan];
  if (!code) {
    throw new Error("Unknown plan. Use: unlimited-bonk, noads, or bundle");
  }

  const seed = makeSeed(buyerReference);
  const checksum = computeLicenseChecksum(`${LICENSE_VERSION}-${code}-${seed}`);
  return `${LICENSE_VERSION}-${code}-${seed}-${checksum}`;
}

function verifyLicenseKey(key) {
  const clean = String(key || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = clean.match(/^APH1(UNL|KIT|MAX)([A-Z0-9]{4})([A-Z0-9]{4})$/);
  if (!match) return false;
  const [, code, seed, checksum] = match;
  return computeLicenseChecksum(`${LICENSE_VERSION}-${code}-${seed}`) === checksum;
}

if (require.main === module) {
  const [, , command, arg1, arg2] = process.argv;

  if (command === "verify") {
    const ok = verifyLicenseKey(arg1);
    console.log(ok ? "VALID" : "INVALID");
    process.exit(ok ? 0 : 1);
  }

  try {
    const key = createLicenseKey(command, arg1 || arg2 || "buyer");
    console.log(`Plan: ${command}`);
    console.log(`Key: ${key}`);
    console.log("\nExample:");
    console.log("  node license-tools.js unlimited-bonk alice@example.com");
    console.log("  node license-tools.js noads order_1042");
    console.log("  node license-tools.js verify APH1-UNL-XXXX-YYYY");
  } catch (error) {
    console.log("Usage:");
    console.log("  node license-tools.js unlimited-bonk alice@example.com");
    console.log("  node license-tools.js noads order_1042");
    console.log("  node license-tools.js bundle founder001");
    console.log("  node license-tools.js verify APH1-UNL-XXXX-YYYY");
    console.log(`\nError: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  createLicenseKey,
  verifyLicenseKey
};
