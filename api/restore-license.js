import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed", ok: false });
  }

  const { email } = req.query;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "Missing or invalid email", ok: false });
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();

    // Get the most recent purchase for this email
    const { data: purchase, error: dbError } = await supabase
      .from("aphelion_purchases")
      .select("license_key, backup_license_key, license_type, email, purchased_at")
      .eq("email", normalizedEmail)
      .order("purchased_at", { ascending: false })
      .limit(1)
      .single();

    if (dbError) {
      console.warn("[restore-license] Database error:", { email: normalizedEmail, dbError });
      return res.status(404).json({
        error: "NO_PURCHASE_FOUND",
        details: "No purchase record found for that email",
        ok: false
      });
    }

    if (!purchase) {
      return res.status(404).json({
        error: "NO_PURCHASE_FOUND",
        details: "No purchase record found for that email",
        ok: false
      });
    }

    return res.status(200).json({
      ok: true,
      licenseKey: purchase.license_key,
      backupLicenseKey: purchase.backup_license_key,
      licenseType: purchase.license_type,
      email: purchase.email,
      purchasedAt: purchase.purchased_at
    });
  } catch (error) {
    console.error("[restore-license] Error:", error);
    return res.status(500).json({
      error: "RESTORE_LICENSE_SERVER_ERROR",
      details: error.message,
      ok: false
    });
  }
}
