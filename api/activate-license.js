import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const LICENSE_SECRET = process.env.LICENSE_SECRET;
const LICENSE_VERSION = "APH1";

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

function verifyLicenseKey(value) {
  const clean = normalizeLicenseKeyInput(value);
  const match = clean.match(/^APH1(UNL|KIT|MAX)([A-Z0-9]{4})([A-Z0-9]{4})$/);
  if (!match) return null;

  const [, code, seed, providedChecksum] = match;
  const expectedChecksum = computeLicenseChecksum(`${LICENSE_VERSION}-${code}-${seed}`);
  if (providedChecksum !== expectedChecksum) return null;

  return {
    cleanKey: clean,
    licenseCode: code
  };
}

function getPlanTierFromCode(code) {
  return code === "UNL" || code === "MAX" ? "unlimited-bonk" : "free";
}

function getNoAdsKitsuneFromCode(code) {
  return code === "KIT" || code === "MAX";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  const { licenseKey } = req.body || {};
  if (!licenseKey || typeof licenseKey !== "string") {
    return res.status(400).json({ ok: false, error: "MISSING_LICENSE_KEY" });
  }

  const parsed = verifyLicenseKey(licenseKey);
  if (!parsed) {
    return res.status(400).json({ ok: false, error: "INVALID_LICENSE_KEY" });
  }

  try {
    const { data: purchase, error: lookupError } = await supabase
      .from("aphelion_purchases")
      .select("id, license_key, backup_license_key, license_code, license_type, activated_at")
      .or(`license_key.eq.${parsed.cleanKey},backup_license_key.eq.${parsed.cleanKey}`)
      .limit(1)
      .single();

    if (lookupError || !purchase) {
      return res.status(404).json({ ok: false, error: "LICENSE_NOT_FOUND" });
    }

    if (purchase.activated_at) {
      return res.status(409).json({ ok: false, error: "LICENSE_ALREADY_ACTIVATED", details: "This license key has already been activated." });
    }

    const { data: updated, error: updateError } = await supabase
      .from("aphelion_purchases")
      .update({ activated_at: new Date().toISOString() })
      .eq("id", purchase.id)
      .select("activated_at")
      .single();

    if (updateError || !updated) {
      console.error("[activate-license] Failed to update activation state:", updateError);
      return res.status(500).json({ ok: false, error: "ACTIVATION_UPDATE_FAILED" });
    }

    return res.status(200).json({
      ok: true,
      licenseCode: purchase.license_code,
      licenseType: purchase.license_type,
      planTier: getPlanTierFromCode(purchase.license_code),
      noAdsKitsune: getNoAdsKitsuneFromCode(purchase.license_code),
      activatedAt: updated.activated_at
    });
  } catch (error) {
    console.error("[activate-license] Error:", error);
    return res.status(500).json({ ok: false, error: "ACTIVATION_SERVER_ERROR", details: error?.message || String(error) });
  }
}
