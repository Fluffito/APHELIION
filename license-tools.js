const crypto = require("crypto");

const LICENSE_SECRET = String(process.env.LICENSE_SECRET || "APHELION::KITSUNE::2026");
const LICENSE_VERSION = "APH1";
const PLAN_CODES = {
  "unlimited-bonk": "UNL",
  unlimited: "UNL",
  noads: "KIT",
  "no-ads": "KIT",
  kitsune: "KIT",
  max: "MAX",
  founder: "MAX"
};

function normalizeLicenseKeyInput(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function computeLicenseChecksum(seed) {
  const raw = `${seed}|${LICENSE_SECRET}`;
  let acc = 17;
  for (let i = 0; i < raw.length; i++) {
    acc = (acc * 31 + raw.charCodeAt(i) * (i + 3)) % 1679616;
  }
  return acc.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

function getLicenseCode(plan) {
  const key = String(plan || "").trim().toLowerCase();
  return PLAN_CODES[key] || "MAX";
}

function buildLicenseSeed(planCode, buyerReference) {
  const digest = crypto
    .createHash("sha256")
    .update(`${planCode}|${String(buyerReference || "").trim()}|${LICENSE_SECRET}`, "utf8")
    .digest("hex")
    .toUpperCase();

  return digest.replace(/[^A-Z0-9]/g, "").slice(0, 4).padEnd(4, "X");
}

function createLicenseKey(plan, buyerReference = "") {
  const planCode = getLicenseCode(plan);
  const seed = buildLicenseSeed(planCode, buyerReference);
  const checksum = computeLicenseChecksum(`${LICENSE_VERSION}-${planCode}-${seed}`);
  return `${LICENSE_VERSION}-${planCode}-${seed}-${checksum}`;
}

function verifyLicenseKey(value) {
  const clean = normalizeLicenseKeyInput(value);
  const match = clean.match(/^APH1(UNL|KIT|MAX)([A-Z0-9]{4})([A-Z0-9]{4})$/);
  if (!match) return null;

  const [, licenseCode, seed, checksum] = match;
  const expected = computeLicenseChecksum(`${LICENSE_VERSION}-${licenseCode}-${seed}`);
  if (checksum !== expected) return null;

  return {
    cleanKey: clean,
    licenseCode,
    seed,
    checksum,
    formatted: `${LICENSE_VERSION}-${licenseCode}-${seed}-${checksum}`
  };
}

module.exports = {
  LICENSE_SECRET,
  LICENSE_VERSION,
  computeLicenseChecksum,
  createLicenseKey,
  verifyLicenseKey
};

