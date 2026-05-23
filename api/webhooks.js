import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const LICENSE_SECRET = process.env.LICENSE_SECRET;
const LICENSE_VERSION = "APH1";
const LICENSE_FROM_EMAIL = process.env.LICENSE_FROM_EMAIL || "noreply@aphelion.dev";
const LICENSE_REPLY_TO_EMAIL = process.env.LICENSE_REPLY_TO_EMAIL;
const RESEND_TEMPLATE_ID = process.env.RESEND_TEMPLATE_ID;

function computeLicenseChecksum(seed) {
  const raw = `${seed}|${LICENSE_SECRET}`;
  let acc = 17;
  for (let i = 0; i < raw.length; i++) {
    acc = (acc * 31 + raw.charCodeAt(i) * (i + 3)) % 1679616;
  }
  return acc.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

function generateLicenseKey(code) {
  // Generate random seed
  const seed = Array.from({ length: 4 }, () => Math.floor(Math.random() * 36).toString(36).toUpperCase()).join("");
  const checksum = computeLicenseChecksum(`${LICENSE_VERSION}-${code}-${seed}`);
  return {
    key: `${LICENSE_VERSION}${code}${seed}${checksum}`,
    seed,
    checksum,
    code,
    masked: `${LICENSE_VERSION}-${code}-${seed}-${checksum}`
  };
}

function generateBackupLicenseKey(code) {
  // Generate a second backup key for the same code
  const seed = Array.from({ length: 4 }, () => Math.floor(Math.random() * 36).toString(36).toUpperCase()).join("");
  const checksum = computeLicenseChecksum(`${LICENSE_VERSION}-${code}-${seed}`);
  return {
    key: `${LICENSE_VERSION}${code}${seed}${checksum}`,
    seed,
    checksum,
    code,
    masked: `${LICENSE_VERSION}-${code}-${seed}-${checksum}`
  };
}

const PRICE_CODE_MAP = {
  [process.env.STRIPE_PRICE_UNLIMITED_MONTHLY]: "UNL",
  [process.env.STRIPE_PRICE_UNLIMITED_QUARTERLY]: "UNL",
  [process.env.STRIPE_PRICE_UNLIMITED_YEARLY]: "UNL",
  [process.env.STRIPE_PRICE_KITSUNE_ONETIME]: "KIT",
  [process.env.STRIPE_PRICE_KITSUNE_MONTHLY]: "KIT"
};

function getLicenseCodeFromPriceId(priceId) {
  return PRICE_CODE_MAP[priceId] || "MAX";
}

function getLicenseLabel(code) {
  if (code === "UNL") return "Unlimited Bonk";
  if (code === "KIT") return "No-Ads Kitsune";
  if (code === "MAX") return "Founder Bundle";
  return "APHELION";
}

async function sendLicenseEmail(email, licenseKey, backupKey, licenseType, priceId) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[webhook] RESEND_API_KEY not configured, skipping email");
    return { ok: false, reason: "RESEND_NOT_CONFIGURED" };
  }

  const replyToHeader = LICENSE_REPLY_TO_EMAIL ? { replyTo: LICENSE_REPLY_TO_EMAIL } : {};

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); color: white; padding: 30px; text-align: center; border-radius: 8px; }
        .content { background: #f9fafb; padding: 20px; margin: 20px 0; border-radius: 8px; }
        .license-box { background: white; border: 2px solid #7c3aed; padding: 15px; margin: 10px 0; font-family: 'Courier New', monospace; font-weight: bold; word-break: break-all; text-align: center; }
        .footer { font-size: 12px; color: #666; text-align: center; margin-top: 20px; }
        .button { background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🦊 APHELION License Activated</h1>
          <p>Thanks for your purchase!</p>
        </div>

        <div class="content">
          <h2>Your ${licenseType}</h2>
          <p>Your license is ready to use. Copy the key below and paste it into the APHELION extension popup to unlock your features.</p>

          <h3>Primary License Key:</h3>
          <div class="license-box">${licenseKey}</div>

          <h3>Backup License Key:</h3>
          <div class="license-box">${backupKey}</div>

          <p style="color: #666; font-size: 14px;">Keep both keys safe. You can use either one to activate your license at any time.</p>

          <h3>Next Steps:</h3>
          <ol>
            <li>Open the APHELION extension popup (click the fox icon in your toolbar)</li>
            <li>Paste either license key into the text field</li>
            <li>Click <strong>Unlock</strong> or <strong>Restore Purchase</strong></li>
            <li>Enjoy your ${licenseType}!</li>
          </ol>
        </div>

        <div class="footer">
          <p>If you have any questions, reply to this email or visit our support page.</p>
          <p>© 2026 APHELION. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const payload = {
      from: LICENSE_FROM_EMAIL,
      to: email,
      subject: `Your APHELION ${licenseType} License Keys`,
      ...replyToHeader
    };

    if (RESEND_TEMPLATE_ID) {
      payload.template = RESEND_TEMPLATE_ID;
      payload.input = {
        licenseKey,
        backupKey,
        licenseType,
        email
      };
    } else {
      payload.html = emailHtml;
    }

    const response = await resend.emails.send(payload);

    console.log("[webhook] Email sent to", email, "response:", response);
    return { ok: true, messageId: response.id };
  } catch (error) {
    console.error("[webhook] Failed to send email to", email, error);
    return { ok: false, error: error.message };
  }
}

async function storePaymentRecord(email, sessionId, licenseKey, backupKey, licenseCode, licenseType, emailSent = false) {
  try {
    const { error } = await supabase
      .from("aphelion_purchases")
      .insert({
        email: email.toLowerCase(),
        stripe_session_id: sessionId,
        license_key: licenseKey,
        backup_license_key: backupKey,
        license_code: licenseCode,
        license_type: licenseType,
        purchased_at: new Date().toISOString(),
        email_sent: Boolean(emailSent)
      });

    if (error) {
      console.error("[webhook] Failed to store payment record:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (error) {
    console.error("[webhook] Error storing payment record:", error);
    return { ok: false, error: error.message };
  }
}

async function handleCheckoutCompleted(event) {
  const session = event.data.object;
  const sessionId = session.id;
  const email = session.customer_email;

  console.log("[webhook] checkout.session.completed:", { sessionId, email });

  if (!email) {
    console.warn("[webhook] No email found in session", sessionId);
    return;
  }

  try {
    // Get line items to determine license type
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);
    if (!lineItems || !lineItems.data || lineItems.data.length === 0) {
      console.error("[webhook] No line items found for session", sessionId);
      return;
    }

    const priceId = lineItems.data[0].price.id;
    const licenseCode = getLicenseCodeFromPriceId(priceId);
    const licenseType = getLicenseLabel(licenseCode);

    // Generate primary and backup license keys
    const primaryLicense = generateLicenseKey(licenseCode);
    const backupLicense = generateBackupLicenseKey(licenseCode);

    // Send email with both keys
    const emailResult = await sendLicenseEmail(email, primaryLicense.key, backupLicense.key, licenseType, priceId);

    // Store in Supabase
    const storeResult = await storePaymentRecord(
      email,
      sessionId,
      primaryLicense.key,
      backupLicense.key,
      licenseCode,
      licenseType,
      emailResult.ok
    );

    console.log("[webhook] Completed for session", sessionId, {
      emailSent: emailResult.ok,
      stored: storeResult.ok,
      licenseType
    });
  } catch (error) {
    console.error("[webhook] Error processing checkout.session.completed:", error);
  }
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  let event;
  let rawBody;

  try {
    if (typeof req.body === "string") {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body;
    } else if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
      rawBody = req.rawBody;
    } else {
      rawBody = await readRawBody(req);
    }

    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("[webhook] Webhook signature verification failed:", error.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  console.log("[webhook] Received event type:", event.type);

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event);
    }
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[webhook] Error handling event:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
