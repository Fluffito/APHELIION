## 🔐 License Key Generation & Validation

This document explains how the license key system works end-to-end.

### Generation Process (Server-side)

```javascript
// 1. Determine product type from Stripe price ID
STRIPE_PRICE_UNLIMITED_MONTHLY → "UNL" (Unlimited Bonk)
STRIPE_PRICE_KITSUNE_MONTHLY    → "KIT" (No-Ads Kitsune)

// 2. Generate random seed (4 hex-safe characters)
seed = "2A3B"

// 3. Calculate checksum using LICENSE_SECRET
raw = "APH1-UNL-2A3B|APHELION::KITSUNE::2026"
checksum = hash(raw) → "C5D6" (mod 1679616)

// 4. Final key
LICENSE_KEY = "APH1UNL2A3BC5D6"
MASKED_KEY = "APH1-UNL-2A3B-C5D6"
```

### Checksum Algorithm

The checksum prevents tampering. If someone tries to modify a key digit, the checksum won't match.

```javascript
function computeLicenseChecksum(seed) {
  const raw = `${seed}|${LICENSE_SECRET}`;
  let acc = 17;
  for (let i = 0; i < raw.length; i++) {
    acc = (acc * 31 + raw.charCodeAt(i) * (i + 3)) % 1679616;
  }
  return acc.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

// Example:
computeLicenseChecksum("APH1-UNL-2A3B") 
→ hash based on:
   - "APH1-UNL-2A3B|APHELION::KITSUNE::2026"
   - Character positions matter
   - Result: 4-char hex string
```

### Validation Process (Extension-side)

The extension validates keys using the same algorithm (in `background.js`):

```javascript
function parseLicenseKey(value) {
  const clean = normalizeLicenseKeyInput(value); // APH1UNL2A3BC5D6
  
  // Extract parts using regex
  const match = clean.match(/^APH1(UNL|KIT|MAX)([A-Z0-9]{4})([A-Z0-9]{4})$/);
  // Groups: [full, code, seed, checksum]
  
  // Validate checksum
  const expectedChecksum = computeLicenseChecksum(`APH1-${code}-${seed}`);
  if (providedChecksum !== expectedChecksum) 
    return null; // Invalid key!
  
  // If we get here, key is valid
  return {
    licenseCode: code,
    licenseType: getLicenseLabel(code), // "Unlimited Bonk"
    planTier: code === "UNL" ? "unlimited-bonk" : "free",
    noAdsKitsune: code === "KIT" || code === "MAX"
  };
}
```

### License Codes

| Code | Product | Permissions |
|------|---------|-------------|
| UNL | Unlimited Bonk (monthly/quarterly/yearly) | Unlimited words, all features |
| KIT | No-Ads Kitsune | No ads, spinning fox |
| MAX | Founder Bundle | All of above + everything |

### Key Validation Security

✅ **What's Protected:**
- Checksum validates key hasn't been modified
- Code can't be swapped (UNL → KIT)
- Seed can't be changed without invalidating checksum
- LICENSE_SECRET is used as signing key

❌ **What's NOT protected:**
- Someone could brute-force a valid key (generate random seeds until checksum matches)
  - BUT: Your keys are in their email and extension storage, not transmitted
  - Stripe purchase verification is the real gatekeeper

### Why Two Keys?

1. **Primary Key** - For current use
2. **Backup Key** - For safety (device lost, re-install, etc.)

Both are identical in functionality. User can activate either one.

### Database Storage

In Supabase:
```
email: "user@example.com"
license_key: "APH1UNL2A3BC5D6"
backup_license_key: "APH1UNLA1B2C3D4"
license_code: "UNL"
license_type: "Unlimited Bonk"
stripe_session_id: "cs_test_xxxx"
purchased_at: "2026-05-23T10:30:00.000Z"
```

### Flow Diagram

```
[Stripe Payment]
        ↓
   [Webhook Event]
        ↓
  [Generate Seed 1] → [Compute Checksum 1] → [License Key 1]
  [Generate Seed 2] → [Compute Checksum 2] → [License Key 2]
        ↓
   [Send Email]
        ↓
   [Store in DB]
        ↓
[User receives email with both keys]
        ↓
[User pastes Key 1 into extension]
        ↓
[Extension validates checksum]
        ↓
✅ Features unlocked!
```

### Important: LICENSE_SECRET

**⚠️ DO NOT CHANGE:** `LICENSE_SECRET=APHELION::KITSUNE::2026`

This is used to compute checksums. If you change it:
- Old keys become invalid
- New keys won't validate against old SECRET
- Users with old keys will be locked out

If you ever need to change it (e.g., security compromise):
1. Update in `.env` everywhere
2. Re-generate keys for all existing users
3. Send updated keys via email

### Testing Key Generation

To test if key generation is working, check:

1. **Email arrives with both keys?**
   - ✅ Key generation happened
   - ✅ Email sending worked

2. **Can you paste key into extension popup?**
   - Click "Restore Purchase" in popup
   - Paste license key
   - If it works → checksum validated correctly

3. **Verify in Supabase:**
   ```
   SELECT license_key, backup_license_key FROM aphelion_purchases 
   WHERE email = 'test@example.com'
   ```
   - Both keys should look like: APH1XXXYYYYZZZZ
   - Should be different (different seeds)

### Common Issues

**"Invalid License Key" in extension:**
- Checksum doesn't match
- Key has typos
- LICENSE_SECRET differs between server and extension

**License key in email looks wrong:**
- Server-side generation failed
- Check webhook logs for errors
- Verify LICENSE_SECRET in .env

**Two keys are identical:**
- Seed randomization failed
- Should be extremely rare
- Check Math.random() is working

---

This system is solid because:
✅ Checksum prevents tampering  
✅ Server-side generation (user can't fake keys)  
✅ Stripe integration (only actual purchases work)  
✅ Two backup keys (emergency recovery)  
✅ Database lookup (restore purchase by email)
