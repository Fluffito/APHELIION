import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed", ok: false });
  }

  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: "Missing session_id", ok: false });
  }

  try {
    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session) {
      return res.status(404).json({
        error: "SESSION_NOT_FOUND",
        details: "Stripe session not found",
        ok: false
      });
    }

    if (session.payment_status !== "paid") {
      return res.status(400).json({
        error: "SESSION_NOT_PAID",
        details: "This checkout session has not been paid yet",
        ok: false
      });
    }

    const email = session.customer_email;
    if (!email) {
      return res.status(400).json({
        error: "NO_EMAIL",
        details: "No email associated with this session",
        ok: false
      });
    }

    // Look up the purchase in Supabase
    const { data: purchase, error: dbError } = await supabase
      .from("aphelion_purchases")
      .select("license_key, backup_license_key, license_type, email")
      .eq("stripe_session_id", session_id)
      .single();

    if (dbError || !purchase) {
      console.warn("[checkout-status] Purchase not found in DB yet:", { session_id, email, dbError });
      return res.status(202).json({
        error: "PURCHASE_NOT_IN_DB_YET",
        details: "Payment confirmed but license generation may still be processing. Try again in a moment.",
        ok: false,
        email
      });
    }

    return res.status(200).json({
      ok: true,
      licenseKey: purchase.license_key,
      backupLicenseKey: purchase.backup_license_key,
      licenseType: purchase.license_type,
      email: purchase.email,
      emailBackupConfigured: true
    });
  } catch (error) {
    console.error("[checkout-status] Error:", error);
    return res.status(500).json({
      error: "CHECKOUT_STATUS_SERVER_ERROR",
      details: error.message,
      ok: false
    });
  }
}
