import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_MAP = {
  "unlimited-monthly": process.env.STRIPE_PRICE_UNLIMITED_MONTHLY,
  "unlimited-quarterly": process.env.STRIPE_PRICE_UNLIMITED_QUARTERLY,
  "unlimited-yearly": process.env.STRIPE_PRICE_UNLIMITED_YEARLY,
  "kitsune-onetime": process.env.STRIPE_PRICE_KITSUNE_ONETIME,
  "kitsune-monthly": process.env.STRIPE_PRICE_KITSUNE_MONTHLY,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { plan } = req.body;

  if (!plan || !PRICE_MAP[plan]) {
    return res.status(400).json({ error: "Invalid plan", ok: false });
  }

  const priceId = PRICE_MAP[plan];
  const origin = req.headers.origin || process.env.PUBLIC_SITE_URL;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      mode: "payment",
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/index.html#pricing`,
      customer_email: undefined // Let Stripe collect it
    });

    return res.status(200).json({ ok: true, url: session.url });
  } catch (error) {
    console.error("[create-checkout-session] Error:", error);
    return res.status(500).json({ error: error.message, ok: false });
  }
}
