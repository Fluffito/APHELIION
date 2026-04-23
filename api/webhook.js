const crypto = require("crypto");
const { createLicenseKey } = require("../license-tools");

const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const PUBLIC_SITE_URL = String(process.env.PUBLIC_SITE_URL || "https://fluffito.github.io").replace(/\/$/, "");
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || "").trim();
const LICENSE_FROM_EMAIL = String(process.env.LICENSE_FROM_EMAIL || "APHELION <onboarding@resend.dev>").trim();
const LICENSE_REPLY_TO_EMAIL = String(process.env.LICENSE_REPLY_TO_EMAIL || "").trim();
const EMAIL_BACKUP_CONFIGURED = Boolean(RESEND_API_KEY);
const WEBHOOK_TOLERANCE_SECONDS = 60 * 5;
const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded"
]);

function getRawBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === "string") {
    return Promise.resolve(Buffer.from(req.body, "utf8"));
  }

  if (req.body && typeof req.body === "object") {
    return Promise.resolve(Buffer.from(JSON.stringify(req.body), "utf8"));
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}

function safeCompareHex(a, b) {
  try {
    const left = Buffer.from(String(a || ""), "hex");
    const right = Buffer.from(String(b || ""), "hex");
    if (!left.length || left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function verifyStripeEvent(rawBody, signatureHeader, secret) {
  if (!secret) {
    return { ok: false, status: 500, error: "STRIPE_WEBHOOK_SECRET is not configured." };
  }

  if (!signatureHeader) {
    return { ok: false, status: 400, error: "Missing Stripe signature header." };
  }

  const parsed = {};
  for (const segment of String(signatureHeader).split(",")) {
    const [key, value] = segment.split("=");
    if (!key || !value) continue;
    if (!parsed[key]) parsed[key] = [];
    parsed[key].push(value);
  }

  const timestamp = Number(parsed.t?.[0] || 0);
  const signatures = parsed.v1 || [];

  if (!timestamp || !signatures.length) {
    return { ok: false, status: 400, error: "Invalid Stripe signature header format." };
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, status: 400, error: "Stripe signature timestamp is outside the allowed tolerance." };
  }

  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  const valid = signatures.some((candidate) => safeCompareHex(candidate, expected));

  if (!valid) {
    return { ok: false, status: 400, error: "Stripe signature verification failed." };
  }

  try {
    return { ok: true, event: JSON.parse(rawBody.toString("utf8") || "{}") };
  } catch (error) {
    return { ok: false, status: 400, error: `Webhook JSON parse failed: ${error.message}` };
  }
}

function getPlanDetails(session) {
  const planKey = String(session?.metadata?.aphelion_plan || "").trim().toLowerCase();
  const rawLicenseArg = String(session?.metadata?.license_arg || "").trim().toLowerCase();
  const licenseArg = rawLicenseArg || (planKey.includes("kitsune") ? "noads" : "unlimited-bonk");
  const licenseType = String(
    session?.metadata?.license_type
      || (licenseArg === "noads" ? "No-Ads Kitsune" : "Unlimited Bonk")
  ).trim();

  return {
    key: planKey || licenseArg,
    licenseArg,
    licenseType
  };
}

function getBuyerEmail(session) {
  return String(
    session?.customer_details?.email
    || session?.customer_email
    || session?.metadata?.email
    || ""
  ).trim().toLowerCase();
}

function getBuyerReference(session) {
  return getBuyerEmail(session)
    || session?.customer
    || session?.id
    || `paid-${Date.now()}`;
}

function maskLicenseKey(key) {
  const clean = String(key || "").trim();
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 8)}…${clean.slice(-4)}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char] || char));
}

async function sendLicenseEmail({ email, licenseKey, licenseType, planKey, sessionId }) {
  if (!email) {
    return { ok: false, skipped: true, reason: "MISSING_EMAIL" };
  }

  if (!EMAIL_BACKUP_CONFIGURED) {
    return { ok: false, skipped: true, reason: "EMAIL_NOT_CONFIGURED" };
  }

  if (typeof fetch !== "function") {
    throw new Error("This runtime does not expose fetch(), so receipt emails cannot be sent.");
  }

  const safeLicenseType = escapeHtml(licenseType || "APHELION");
  const safePlanKey = escapeHtml(planKey || "paid-plan");
  const safeLicenseKey = escapeHtml(licenseKey || "");
  const successUrl = `${PUBLIC_SITE_URL}/success.html?license_key=${encodeURIComponent(licenseKey)}&license_type=${encodeURIComponent(licenseType || "APHELION")}&email=${encodeURIComponent(email)}`;

  const payload = {
    from: LICENSE_FROM_EMAIL,
    to: [email],
    subject: `Your ${licenseType || "APHELION"} license key`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2 style="margin-bottom:8px;">Thanks for supporting APHELION now go enjoy this wild mess</h2>
        <p>Your purchase is complete, and your backup license key is ready.</p>
        <p><strong>Plan:</strong> ${safeLicenseType} (${safePlanKey})</p>
        <p><strong>License key:</strong><br /><code style="display:inline-block;padding:10px 12px;background:#f4f0ff;border-radius:8px;font-size:16px;">${safeLicenseKey}</code></p>
        <p>Paste this key into the APHELION extension popup and click <strong>Unlock</strong>.</p>
        <p><a href="${successUrl}">Open your purchase success page again</a></p>
        <p style="color:#666;font-size:12px;">Session ID: ${escapeHtml(sessionId || "n/a")}</p>
      </div>
    `,
    text: [
      "Thanks for supporting APHELION!",
      "",
      `Plan: ${licenseType || "APHELION"} (${planKey || "paid-plan"})`,
      `License key: ${licenseKey}`,
      "",
      "Paste this key into the APHELION extension popup and click Unlock.",
      `Reopen your success page: ${successUrl}`,
      `Session ID: ${sessionId || "n/a"}`
    ].join("\n")
  };

  if (LICENSE_REPLY_TO_EMAIL) {
    payload.reply_to = LICENSE_REPLY_TO_EMAIL;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend email failed (${response.status}): ${data?.message || data?.error || JSON.stringify(data)}`);
  }

  return {
    ok: true,
    skipped: false,
    provider: "resend",
    id: String(data?.id || "")
  };
}

async function storeLicenseInSupabase({ email, licenseKey }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in Vercel.");
  }

  if (!email) {
    throw new Error("Checkout session did not include a customer email.");
  }

  if (typeof fetch !== "function") {
    throw new Error("This runtime does not expose fetch(), so the Supabase insert cannot run.");
  }

  const payload = [{ email, license_key: licenseKey }];
  const commonHeaders = {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
  };

  const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/licenses`, {
    method: "POST",
    headers: {
      ...commonHeaders,
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });

  if (insertResponse.ok) {
    return;
  }

  if (insertResponse.status === 409 || insertResponse.status === 42501) {
    const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/licenses?email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: {
        ...commonHeaders,
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ license_key: licenseKey })
    });

    if (updateResponse.ok) {
      return;
    }

    const updateDetails = await updateResponse.text();
    throw new Error(`Supabase update failed (${updateResponse.status}): ${updateDetails}`);
  }

  const details = await insertResponse.text();
  throw new Error(`Supabase insert failed (${insertResponse.status}): ${details}`);
}

async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    res.status(200).json({
      ok: true,
      endpoint: "/api/webhook",
      expects: Array.from(SUPPORTED_EVENTS),
      supabaseConfigured: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
      emailConfigured: EMAIL_BACKUP_CONFIGURED,
      emailFrom: LICENSE_FROM_EMAIL
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "METHOD_NOT_ALLOWED" });
    return;
  }

  try {
    const rawBody = await getRawBody(req);
    const verified = verifyStripeEvent(rawBody, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET);

    if (!verified.ok) {
      res.status(verified.status || 400).json({ ok: false, error: verified.error });
      return;
    }

    const event = verified.event || {};
    if (!SUPPORTED_EVENTS.has(event.type)) {
      res.status(200).json({ ok: true, received: true, handled: false, eventType: event.type || "unknown" });
      return;
    }

    const session = event?.data?.object || {};
    const email = getBuyerEmail(session);
    const plan = getPlanDetails(session);
    const buyerReference = getBuyerReference(session);
    const licenseKey = createLicenseKey(plan.licenseArg, buyerReference);

    await storeLicenseInSupabase({ email, licenseKey });
    const emailResult = await sendLicenseEmail({
      email,
      licenseKey,
      licenseType: plan.licenseType,
      planKey: plan.key,
      sessionId: session.id || ""
    });

    console.log("[stripe webhook] checkout fulfilled", {
      eventId: event.id || "",
      eventType: event.type,
      sessionId: session.id || "",
      email,
      plan: plan.key,
      licenseType: plan.licenseType,
      licenseKeyMasked: maskLicenseKey(licenseKey),
      emailBackup: emailResult.ok ? "sent" : (emailResult.reason || "skipped")
    });

    res.status(200).json({
      ok: true,
      received: true,
      handled: true,
      eventType: event.type,
      sessionId: session.id || "",
      email,
      plan: plan.key,
      licenseType: plan.licenseType,
      emailBackup: emailResult
    });
  } catch (error) {
    console.error("[stripe webhook] unhandled error:", error);
    res.status(500).json({ ok: false, error: "WEBHOOK_SERVER_ERROR", details: error.message });
  }
}

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false
  }
};
