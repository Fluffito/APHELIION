import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
 
if (!process.env.RESEND_API_KEY) {
  console.warn("[webhook] RESEND_API_KEY not configured; outbound emails will be skipped.");
}
const LICENSE_SECRET = process.env.LICENSE_SECRET;
const LICENSE_VERSION = "APH1";
const LICENSE_FROM_EMAIL = process.env.LICENSE_FROM_EMAIL || "APHELION <hello@aphelion.click>";
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
  return PRICE_CODE_MAP[priceId] || null;
}

async function inferLicenseCodeFromPrice(priceId) {
  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
    const product = price.product;
    const textCandidates = [price.nickname, price.metadata && price.metadata.plan_code, product && product.name, product && product.metadata && product.metadata.plan_code]
      .filter(Boolean)
      .map((t) => String(t).toLowerCase());

    for (const t of textCandidates) {
      if (t.includes("unlimit") || t.includes("unl") || t.includes("unlimited")) return "UNL";
      if (t.includes("kitsune") || t.includes("no-ads") || t.includes("noads") || t.includes("kit")) return "KIT";
      if (t.includes("founder") || t.includes("max") || t.includes("founder bundle")) return "MAX";
    }

    return null;
  } catch (err) {
    console.warn("[webhook] Failed to infer license code from price:", priceId, err && err.message);
    return null;
  }
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

  const emailHtml = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="width=device-width" name="viewport" />
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); color: white; padding: 30px; text-align: center; border-radius: 8px; }
      .content { background: #f9fafb; padding: 20px; margin: 20px 0; border-radius: 8px; }
      .license-box { background: white; border: 2px solid #7c3aed; padding: 15px; margin: 10px 0; font-family: 'Courier New', monospace; font-weight: bold; word-break: break-all; text-align: center; }
      .footer { font-size: 12px; color: #666; text-align: center; margin-top: 20px; }
    </style>
  </head>
  <body style="background-color:#ffffff">
    <table border="0" width="100%" cellpadding="0" cellspacing="0" role="presentation" align="center">
      <tbody>
        <tr>
          <td style="background-color:#ffffff">
            <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background-color:#ffffff">
              <tbody>
                <tr>
                  <td>
                    <div class="container">
                      <div class="header">
                        <h1>🦊 APHELION License Activated</h1>
                        <p>Thanks for your purchase!</p>
                      </div>
                      <div class="content">
                        <h2>Your ${licenseType}</h2>
                        <p>Your license is ready to use. Copy the key below and paste it into the APHELION extension popup to unlock your features.</p>
                        <h3>Primary License Key:</h3>
                        <div class="license-box">
                          <p style="margin:0">${licenseKey}</p>
                        </div>
                        <h3>Backup License Key:</h3>
                        <div class="license-box">
                          <p style="margin:0">${backupKey}</p>
                        </div>
                        <p style="color:#666;font-size:14px">Keep both keys safe. You can use either one to activate your license at any time.</p>
                        <h3>Next Steps:</h3>
                        <ol start="1" style="padding-left:1.1em">
                          <li><p style="margin:0">Open the APHELION extension popup</p></li>
                          <li><p style="margin:0">Paste either license key into the text field</p></li>
                          <li><p style="margin:0">Click <strong>Unlock</strong> or <strong>Restore Purchase</strong></p></li>
                          <li><p style="margin:0">Enjoy your ${licenseType}!</p></li>
                        </ol>
                      </div>
                      <div class="footer">
                        <p>If you have any questions, email <a href="mailto:aphelion.bex@gmail.com" style="color:#0670DB;text-decoration:underline">aphelion.bex@gmail.com</a></p>
                        <p>© 2026 APHELION. All rights reserved.</p>
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;

  try {
    const mailRequest = {
      from: LICENSE_FROM_EMAIL,
      to: email,
      subject: `Your APHELION ${licenseType} License Keys`,
      ...(LICENSE_REPLY_TO_EMAIL ? { reply_to: LICENSE_REPLY_TO_EMAIL } : {}),
      html: emailHtml
    };
    
    const response = await resend.emails.send(mailRequest);
    return { ok: true, messageId: response.id };
  } catch (error) {
    console.error("[webhook] Failed to send email to", email, error);
    return { ok: false, error: String(error) };
  }
}

async function storePaymentRecord(email, sessionId, licenseKey, backupKey, licenseCode, licenseType, emailSent = false) {
  try {
    const payload = {
      email: email.toLowerCase(),
      stripe_session_id: sessionId,
      license_key: licenseKey,
      backup_license_key: backupKey,
      license_code: licenseCode,
      license_type: licenseType,
      purchased_at: new Date().toISOString(),
      email_sent: Boolean(emailSent)
    };
    const { data, error } = await supabase
      .from("aphelion_purchases")
      .upsert(payload, { onConflict: "stripe_session_id" });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function handleCheckoutCompleted(event) {
  const session = event.data.object;
  const sessionId = session.id;

  let email = null;
  try {
    const fullSession = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["customer", "payment_intent"] });
    email = fullSession.customer_email || fullSession.customer?.email || fullSession.payment_intent?.receipt_email;
  } catch (fetchError) {
    console.error("[webhook] Critical fetch error:", fetchError.message);
  }

  if (!email) return;

  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);
    const priceId = lineItems.data[0].price.id;
    let licenseCode = getLicenseCodeFromPriceId(priceId) || await inferLicenseCodeFromPrice(priceId) || "MAX";
    const licenseType = getLicenseLabel(licenseCode);

    const primaryLicense = generateLicenseKey(licenseCode);
    const backupLicense = generateBackupLicenseKey(licenseCode);

    // --- VAULT LOGIC: SAVE TO SUPABASE ---
    const { error: dbError } = await supabase
      .from("licenses")
      .insert([
        { license_key: primaryLicense.key, is_used: false },
        { license_key: backupLicense.key, is_used: false }
      ]);

    if (dbError) console.error("[webhook] Failed to save keys to Supabase:", dbError);
    // -------------------------------------

    const emailResult = await sendLicenseEmail(email, primaryLicense.key, backupLicense.key, licenseType, priceId);
    await storePaymentRecord(email, sessionId, primaryLicense.key, backupLicense.key, licenseCode, licenseType, emailResult.ok);
  } catch (error) {
    console.error("[webhook] Error processing checkout:", error);
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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).json({ error: "Missing signature" });

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type === "checkout.session.completed") {
    await handleCheckoutCompleted(event);
  }
  res.status(200).json({ received: true });
}
