# APHELION Email & License Key System Setup Guide

## 📋 Quick Overview

Your system flow is now complete:
1. **Checkout** → User buys something on Stripe
2. **Webhook** → Stripe tells your server about the purchase
3. **License Generation** → Primary + Backup license keys are created
4. **Email** → Resend sends both keys to the user
5. **Database** → Purchase stored in Supabase for recovery
6. **Success Page** → User can view license immediately OR recover by email

## 🗄️ Supabase Setup Required

You need to create a table called `aphelion_purchases` in Supabase. Go to your Supabase dashboard and run this SQL:

```sql
CREATE TABLE aphelion_purchases (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE NOT NULL,
  license_key TEXT NOT NULL,
  backup_license_key TEXT NOT NULL,
  license_code TEXT NOT NULL,
  license_type TEXT NOT NULL,
  purchased_at TIMESTAMP DEFAULT NOW(),
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_aphelion_purchases_email ON aphelion_purchases(email);
CREATE INDEX idx_aphelion_purchases_session_id ON aphelion_purchases(stripe_session_id);
```

## 🔑 Environment Variables to Configure

Update your `.env` file with these values (and add them to Vercel):

```env
# From Stripe Dashboard
STRIPE_SECRET_KEY=sk_test_xxxx              # Your Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_xxxx            # Webhook endpoint secret

# From Supabase Dashboard
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # Service role key (NOT anon key)

# From Resend Dashboard
RESEND_API_KEY=re_xxxx                      # Your Resend API key
LICENSE_FROM_EMAIL="APHELION <hello@aphelion.click>"   # Email license keys come from
LICENSE_REPLY_TO_EMAIL=aphelion.bex@gmail.com  # Optional, reply-to address

# Already in your .env
LICENSE_SECRET=APHELION::KITSUNE::2026      # DO NOT CHANGE (used for key checksums)
```

### How to get each key:

**STRIPE_SECRET_KEY & STRIPE_WEBHOOK_SECRET:**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Developers → API keys → Copy Secret Key
3. Developers → Webhooks → Create Endpoint
   - URL: `https://your-vercel-domain/api/webhooks`
   - Events: Select `checkout.session.completed`
   - Reveal signing secret and copy it

**SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY:**
1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Settings → API
3. Copy `Project URL` and `service_role` key (NOT `anon` key!)

**RESEND_API_KEY:**
1. Go to [Resend Dashboard](https://resend.com/)
2. API Keys → Copy your key

## 📤 Vercel Environment Variables

1. Go to your Vercel project
2. Settings → Environment Variables
3. Add all the keys above for all environments (Production, Preview, Development)
4. Deploy changes: `git push` or redeploy manually

## 🧪 Testing the Flow

### 1. Test Stripe Webhook Locally
```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe login
stripe listen --forward-to localhost:3000/api/webhooks

# In another terminal, trigger a test event
stripe trigger payment_intent.succeeded
```

### 2. Test Create Checkout Session
```bash
curl -X POST http://localhost:3000/api/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"plan":"unlimited-monthly"}'
# Should return: {"ok": true, "url": "https://checkout.stripe.com/..."}
```

### 3. Verify Supabase Table
After making a test purchase, check if the record appears:
```
Supabase Dashboard → aphelion_purchases table → you should see the email, license keys, etc.
```

## 🐛 Troubleshooting

### Webhook Getting 200 but No Email Sent
- Check Vercel logs: `vercel logs` or Vercel dashboard
- Verify `RESEND_API_KEY` is set correctly
- Check Resend dashboard for failed emails
- Make sure Supabase credentials are correct

### No License Keys Appearing
- Check if API key variables are actually in Vercel (not just local .env)
- Verify `LICENSE_SECRET` matches in both backend and extension
- Look at Vercel function logs for errors

### Checkout Session Not Creating
- Verify all `STRIPE_PRICE_*` IDs are correct
- Check `STRIPE_SECRET_KEY` is valid

### Email Not Arriving
- Check Resend API key and domain verification
- Verify `LICENSE_FROM_EMAIL` domain is verified in Resend
- Check spam folder
- Review Resend dashboard for delivery status

## 📝 Key Generation Details

The system generates license keys like: `APH1UNL2A3B4C5D6E7F8`

Where:
- `APH1` = Version prefix (immutable)
- `UNL`/`KIT`/`MAX` = License code from product
- Random 4 chars = Seed
- Final 4 chars = Checksum (validates the key isn't tampered with)

Both primary and backup keys are functionally identical and work interchangeably.

## 🎯 Next Steps

1. ✅ Copy API handler files to your project (done)
2. ⏳ Create Supabase `aphelion_purchases` table (SQL above)
3. ⏳ Fill in all environment variables in `.env` and Vercel
4. ⏳ Update Stripe webhook URL to point to your Vercel domain
5. ⏳ Test with a small purchase in Stripe test mode
6. ⏳ Monitor logs and verify email arrives with both keys

---

When you're ready to add spinning kitsune images, let me know and I'll help identify where ads are currently placed so we can swap them out!
