const https = require("https");
const { createLicenseKey } = require("../license-tools");

const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || "").trim();
const CORS_ORIGIN = String(process.env.CORS_ORIGIN || "*");
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const EMAIL_BACKUP_CONFIGURED = Boolean(RESEND_API_KEY);

const PLAN_CONFIG = {
  "unlimited-monthly": {
    priceId: String(process.env.STRIPE_PRICE_UNLIMITED_MONTHLY || "").trim(),
    licenseArg: "unlimited-bonk",
    licenseType: "Unlimited Bonk"
  },
  "unlimited-quarterly": {
    priceId: String(process.env.STRIPE_PRICE_UNLIMITED_QUARTERLY || "").trim(),
    licenseArg: "unlimited-bonk",
    licenseType: "Unlimited Bonk"
  },
  "unlimited-yearly": {
    priceId: String(process.env.STRIPE_PRICE_UNLIMITED_YEARLY || "").trim(),
    licenseArg: "unlimited-bonk",
    licenseType: "Unlimited Bonk"
  },
  "kitsune-onetime": {
    priceId: String(process.env.STRIPE_PRICE_KITSUNE_ONETIME || "").trim(),
    licenseArg: "noads",
    licenseType: "No-Ads Kitsune"
  },
  "kitsune-monthly": {
    priceId: String(process.env.STRIPE_PRICE_KITSUNE_MONTHLY || "").trim(),
    licenseArg: "noads",
    licenseType: "No-Ads Kitsune"
  }
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function getPlanConfig(planKey) {
  return PLAN_CONFIG[String(planKey || "").trim().toLowerCase()] || null;
}

function stripeRequest(path, method = "GET") {
  return new Promise((resolve) => {
    if (!STRIPE_SECRET_KEY) {
      resolve({
        ok: false,
        status: 503,
        data: { error: { message: "STRIPE_SECRET_KEY is not configured yet." } }
      });
      return;
    }

    const stripeReq = https.request({
      hostname: "api.stripe.com",
      port: 443,
      path: `/v1${path}`,
      method,
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`
      }
    }, (stripeRes) => {
      let raw = "";
      stripeRes.on("data", (chunk) => {
        raw += chunk;
      });
      stripeRes.on("end", () => {
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = { raw };
        }
        resolve({
          ok: stripeRes.statusCode >= 200 && stripeRes.statusCode < 300,
          status: stripeRes.statusCode || 500,
          data
        });
      });
    });

    stripeReq.on("error", (error) => {
      resolve({
        ok: false,
        status: 500,
        data: { error: { message: error.message } }
      });
    });

    stripeReq.end();
  });
}

function getPlanKeyFromSession(session) {
  const metaPlan = session?.metadata?.aphelion_plan;
  if (metaPlan && PLAN_CONFIG[metaPlan]) return metaPlan;

  const stripePriceId = session?.line_items?.data?.[0]?.price?.id;
  if (!stripePriceId) return null;

  return Object.keys(PLAN_CONFIG).find((key) => PLAN_CONFIG[key].priceId && PLAN_CONFIG[key].priceId === stripePriceId) || null;
}

function getBuyerReference(session) {
  return session?.customer_details?.email
    || session?.customer_email
    || session?.customer
    || session?.id
    || `paid-${Date.now()}`;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    return;
  }

  try {
    const sessionId = String(req.query?.session_id || "").trim();
    if (!sessionId) {
      res.status(400).json({ ok: false, error: "MISSING_SESSION_ID" });
      return;
    }

    if (!STRIPE_SECRET_KEY) {
      res.status(503).json({ ok: false, error: "STRIPE_NOT_READY" });
      return;
    }

    const stripe = await stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items.data.price`);
    if (!stripe.ok) {
      res.status(stripe.status || 502).json({
        ok: false,
        error: "STRIPE_SESSION_LOOKUP_FAILED",
        details: stripe.data?.error?.message || stripe.data
      });
      return;
    }

    const session = stripe.data || {};
    const isPaid = session.payment_status === "paid" || session.status === "complete";
    if (!isPaid) {
      res.status(409).json({
        ok: false,
        error: "SESSION_NOT_PAID",
        paymentStatus: session.payment_status || "unknown",
        status: session.status || "unknown"
      });
      return;
    }

    const planKey = getPlanKeyFromSession(session) || String(session?.metadata?.aphelion_plan || "");
    const plan = getPlanConfig(planKey) || {
      licenseArg: String(session?.metadata?.license_arg || "unlimited-bonk"),
      licenseType: String(session?.metadata?.license_type || "APHELION Paid Plan")
    };

    const buyerReference = getBuyerReference(session);
    const licenseKey = createLicenseKey(plan.licenseArg, buyerReference);

    res.status(200).json({
      ok: true,
      sessionId,
      plan: planKey || plan.licenseArg,
      email: session?.customer_details?.email || session?.customer_email || "",
      licenseType: plan.licenseType,
      licenseKey,
      emailBackupConfigured: EMAIL_BACKUP_CONFIGURED,
      instructions: "Paste this key into the APHELION popup and click Unlock or Restore Purchase."
    });
  } catch (error) {
    console.error("checkout-status error:", error);
    res.status(500).json({ ok: false, error: "CHECKOUT_STATUS_SERVER_ERROR" });
  }
};
