# ✅ Email & License Key System - Complete Implementation

## What's Been Created

I've built out your entire email and license key delivery system. Here's what's new:

### 🆕 New API Endpoints (in `/api/` folder)
- **`webhooks.js`** - Handles Stripe webhook events, generates license keys, sends emails
- **`create-checkout-session.js`** - Creates Stripe checkout sessions
- **`checkout-status.js`** - Retrieves license key after purchase
- **`restore-license.js`** - Lets users recover license by email

### 📝 Updated Files
- `.env` - Added missing Stripe, Supabase, and Resend keys
- `.env.example` - Documented all required environment variables
- `package.json` - Added Node.js dependencies

### 📚 Documentation
- `EMAIL_LICENSE_SETUP.md` - Complete setup and troubleshooting guide

## 🚀 What Happens in the Flow

```
1. User clicks "Upgrade" button on website
   ↓
2. Frontend calls /api/create-checkout-session
   ↓
3. Redirects to Stripe checkout
   ↓
4. User completes payment
   ↓
5. Stripe webhook → /api/webhooks
   ↓
6. System generates TWO license keys (primary + backup)
   ↓
7. Email sent via Resend with both keys
   ↓
8. Data stored in Supabase
   ↓
9. User redirected to success page with license key displayed
   ↓
10. Fallback: User can use "Recover by Email" if needed
```

## ⚙️ Your Next Steps (Must Do)

### Step 1: Create Supabase Table
Go to [Supabase Dashboard](https://app.supabase.co/) and run this SQL in the SQL Editor:

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

CREATE INDEX idx_aphelion_purchases_email ON aphelion_purchases(email);
CREATE INDEX idx_aphelion_purchases_session_id ON aphelion_purchases(stripe_session_id);
```

### Step 2: Get Your API Keys

**From Stripe:**
- Go to [Dashboard](https://dashboard.stripe.com/) → Developers → API Keys
- Copy your **Secret Key** (starts with `sk_test_` or `sk_live_`)
- Go to Developers → Webhooks → Create Endpoint
  - URL: `https://YOUR-VERCEL-DOMAIN/api/webhooks` (you'll get this after first deploy)
  - Select: `checkout.session.completed`
  - Copy the **Signing Secret** (starts with `whsec_`)

**From Supabase:**
- Go to [Dashboard](https://app.supabase.com/) → Your Project → Settings → API
- Copy **Project URL** 
- Copy **service_role key** (⚠️ NOT the anon key)

**From Resend:**
- Go to [Resend Dashboard](https://resend.com/) → API Keys
- Copy your **API Key** (starts with `re_`)
- Your domain should be verified for `LICENSE_FROM_EMAIL` (e.g., noreply@yourdomain.com)

### Step 3: Update Environment Variables Locally

Edit `.env` and fill in your actual keys:
```env
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx
RESEND_API_KEY=re_xxxxx
LICENSE_FROM_EMAIL=noreply@yourdomain.com
LICENSE_REPLY_TO_EMAIL=support@yourdomain.com
```

### Step 4: Deploy to Vercel

```bash
git add .
git commit -m "Add email and license key system"
git push origin main
```

Then in Vercel Dashboard:
1. Settings → Environment Variables
2. Add all the keys from Step 2 for all environments
3. Redeploy (or just push to trigger auto-deploy)

### Step 5: Update Stripe Webhook URL

Once deployed, you'll have a Vercel URL. Go back to Stripe:
- Developers → Webhooks → Edit the endpoint you created
- Update URL to: `https://YOUR-VERCEL-DOMAIN/api/webhooks`

### Step 6: Test It!

Make a test purchase in Stripe test mode:
1. Use test card: `4242 4242 4242 4242`, any future date, any CVC
2. Check your email for the license keys
3. Verify the key appears in the database

---

## 🎁 How License Keys Work

**Format:** `APH1UNL2A3B4C5D6E7F8`
- `APH1` = Version
- `UNL`/`KIT`/`MAX` = Product type
- Random 4 chars = Seed  
- 4-char checksum = Validates key isn't tampered with

**Both primary and backup keys are identical** - user can use either one to unlock their features.

---

## 📧 Email Content

When users purchase, they get an email with:
- Their primary license key
- Their backup license key (identical, just for safety)
- Instructions to paste into the extension popup
- A link to view the license online
- Support info

---

## 🐛 Debugging Checklist

If emails don't arrive:
- ✅ Verify `RESEND_API_KEY` is set in Vercel
- ✅ Check Resend dashboard for delivery status
- ✅ Verify your from domain is verified in Resend
- ✅ Check Vercel function logs for errors
- ✅ Confirm Supabase credentials are correct

If licenses don't generate:
- ✅ Check that `LICENSE_SECRET` matches in .env
- ✅ Verify webhook is receiving events (Stripe dashboard → Events)
- ✅ Check Vercel logs for webhook processing errors
- ✅ Make sure Supabase table exists with correct schema

---

## 🎯 For Later: Spinning Kitsune Images

Once you get your spinning kitsune images, let me know and I can:
1. Help you find where ads are placed
2. Create a mapping of ad placement locations
3. Replace ads with spinning kitsunes in those exact spots
4. Handle responsive design so they look great on all screen sizes

---

**You're ready! Start with Step 1 above and let me know if you hit any snags.** 🦊
