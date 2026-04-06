const crypto = require("crypto");
const { createLicenseKey } = require("../license-tools");

const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
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

function getBuyerReference(session) {
  return session?.customer_details?.email
    || session?.customer_email
    || session?.customer
    || session?.id
    || `paid-${Date.now()}`;
}

function maskLicenseKey(key) {
  const clean = String(key || "").trim();
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 8)}…${clean.slice(-4)}`;
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
      endpoint: "/api/webhooks",
      expects: Array.from(SUPPORTED_EVENTS)
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
    const plan = getPlanDetails(session);
    const buyerReference = getBuyerReference(session);
    const licenseKey = createLicenseKey(plan.licenseArg, buyerReference);

    console.log("[stripe webhook] checkout fulfilled", {
      eventId: event.id || "",
      eventType: event.type,
      sessionId: session.id || "",
      email: session?.customer_details?.email || session?.customer_email || "",
      plan: plan.key,
      licenseType: plan.licenseType,
      licenseKeyMasked: maskLicenseKey(licenseKey)
    });

    res.status(200).json({
      ok: true,
      received: true,
      handled: true,
      eventType: event.type,
      sessionId: session.id || "",
      plan: plan.key,
      licenseType: plan.licenseType
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
