# Aries AI — Client Onboarding Checklist
**Every manual step, in order, from first meeting to go-live.**

---

## BEFORE THE MEETING

- [ ] Know their business type (restaurant / clinic / salon / real estate / other)
- [ ] Have your Aries AI demo account ready to show
- [ ] Have Supabase Studio open and logged in (app.supabase.com)
- [ ] Have gupshup.io bookmarked and your Gupshup account credentials handy

---

## STEP 1 — AT THE MEETING: Collect Everything

Write these down or fill in a notes app:

```
Business Name:        ___________________________
Business Type:        ___________________________
WhatsApp Number:      +91 _______________________   ← the number they want for WhatsApp Business
Their Business Email: ___________________________   ← used to create Gupshup account
Facebook Account:     ___________________________   ← needed for Gupshup Embedded Signup

Bot FAQs (top 5–10 questions customers ask):
1. ___________________________
2. ___________________________
3. ___________________________
4. ___________________________
5. ___________________________

Working Hours:        Mon–Sat _______  Sun _______
Staff Name:           ___________________________
Staff Phone:          +91 _______________________
Welcome Message:      ___________________________
Special Offer/Promo:  ___________________________
Payment Collected:    ₹ _______  Date: __________
```

⚠️ IMPORTANT — Ask about their WhatsApp number:
- Is this number currently active on regular WhatsApp (the green app)?
- If YES → they must delete WhatsApp from that phone before you can register it for Business API
- If NO (new SIM / unused number) → proceed directly

---

## STEP 2 — CREATE GUPSHUP ACCOUNT (30–60 mins)

Do this yourself — the client never sees or touches Gupshup.

1. Go to **https://www.gupshup.io** → click **Sign Up**
2. Use the **client's business email** as the account email
3. Set a strong password (save it in your notes/password manager for this client)
4. Once inside, click **Create App** → give it an internal name:
   - Format: `clientname_wa` (e.g. `zara_restaurant_wa`, `sai_clinic_wa`)
   - Use lowercase, underscores only — no spaces
5. In the app setup, Gupshup will launch **Embedded Signup** (a Facebook popup appears)
6. Log in with the **client's Facebook account**
   - If they don't have one → create a new Facebook account for their business right there
7. Inside Embedded Signup, follow the steps:
   - Select or create **Meta Business Account** (use business name)
   - Create **WhatsApp Business Account (WABA)** → enter business name + category
   - Add phone number → enter their WhatsApp number (without +)
   - Verify with OTP → they'll receive a call or SMS on that number
   - ⚠️ If number was on regular WhatsApp: they must have deleted it first — OTP won't arrive otherwise
8. Once Embedded Signup is complete → you're back in Gupshup dashboard
9. Go to **API Keys** section → copy the API key
10. Note down the **App Name** you created (e.g. `zara_restaurant_wa`)

**Save these 3 values — you'll need them in the next step:**
```
gupshup_api_key:       ___________________________
gupshup_app_name:      ___________________________   (the app name from step 4)
gupshup_phone_number:  ___________________________   (number without + e.g. 919876543210)
```

---

## STEP 3 — CREATE ARIES AI ACCOUNT FOR CLIENT (5 mins)

1. Go to **https://ariesai.in/signup**
2. Sign up using the **client's business email**
3. Set a password (save it for this client)
4. Complete signup → they land on the dashboard

OR: Have the client sign up themselves if they're with you — just hand them the laptop.

---

## STEP 4 — ENTER GUPSHUP CREDENTIALS IN SUPABASE (5 mins)

This is the most important step. This is how the Aries AI platform "knows" which Gupshup account belongs to this client.

1. Open **https://app.supabase.com** → your project
2. Go to **Table Editor** → select the `tenants` table
3. Find the row with the client's email
4. Click **Edit** (pencil icon) on their row
5. Fill in these 3 fields:
   - `gupshup_api_key` → paste the API key from Step 2 (it auto-encrypts)
   - `gupshup_app_name` → paste the app name (e.g. `zara_restaurant_wa`)
   - `gupshup_phone_number` → paste the number without + (e.g. `919876543210`)
6. Click **Save**

✅ After this, the client's Settings page will show **"WhatsApp Active"** with their number.

---

## STEP 5 — SET UP GUPSHUP WEBHOOK (5 mins)

This tells Gupshup where to send incoming WhatsApp messages (to your server).

1. Go back to the client's Gupshup app dashboard
2. Click on the app you created (e.g. `zara_restaurant_wa`)
3. Find **Webhook / Callback URL** settings
4. Set the webhook URL to:
   ```
   https://ariesai.in/api/webhooks/gupshup
   ```
5. Save / Update webhook
6. Make sure the webhook is **enabled**

---

## STEP 6 — CONFIGURE THE BOT IN ARIES AI DASHBOARD (30–45 mins)

Log into the client's Aries AI dashboard using their credentials.

Go to **Settings** and fill in each tab:

### Business Tab
- [ ] Business Name
- [ ] Business Type (select from dropdown)
- [ ] Business Phone
- [ ] Business Address
- [ ] Business Website (if any)
- [ ] Business Email

### AI Bot Tab
- [ ] Bot Name (e.g. "Aria" or "Zara" or their brand name)
- [ ] AI Persona (Sales Pro / Support Hero / Lead Magnet — pick based on their goal)
- [ ] Welcome Message (e.g. "Hi! Welcome to Zara Restaurant 👋 How can I help you today?")
- [ ] Welcome Offer (e.g. "Get 10% off on your first order! Tell me what you're looking for.")
- [ ] Unique Selling Points (bullet their top 3 USPs)
- [ ] Core Services Description (describe what they sell — more detail = better AI)
- [ ] Hot Keywords (e.g. "book table, order now, reserve") — triggers hot lead score
- [ ] Warm Keywords (e.g. "menu, pricing, hours") — triggers warm lead score

### Staff & Alerts Tab
- [ ] Staff Name
- [ ] Staff Phone (for escalation alerts)
- [ ] Manager Phone (optional, for backup)
- [ ] Escalation Timeout — default 5 mins is fine

### Follow-ups Tab
- [ ] Enable 30-min follow-up: ✅ YES (recommended)
- [ ] Enable 3-hr follow-up: ✅ YES
- [ ] Enable 24-hr follow-up: ✅ YES
- [ ] 7-day follow-up: client preference

### Off-Hours Tab
- [ ] Set Working Hours (Mon–Sun with open/close times)
- [ ] Off-Hours Message (e.g. "We're closed right now! We'll reply as soon as we open. What can I help you with?")
- [ ] Capture lead during off-hours: ✅ YES

### FAQ Tab (in AI Bot section)
- [ ] Enter the 5–10 FAQs you collected at the meeting
   - Each FAQ = Question + Answer pair
   - The AI will use these to answer customer questions accurately

**Click SAVE after each tab.**

---

## STEP 7 — TEST BEFORE HANDING OVER (10 mins)

Send a WhatsApp message to the client's registered number from **your own phone**.

Check these:
- [ ] Message appears in Aries AI Chat dashboard within 5 seconds
- [ ] AI bot replies within 10 seconds
- [ ] Reply makes sense for their business
- [ ] Lead appears in the Leads page
- [ ] Sending a message from the chat dashboard works (delivered ✓✓)

If no reply received:
- Check Step 4 → verify credentials are saved in Supabase
- Check Step 5 → verify webhook URL is exactly `https://ariesai.in/api/webhooks/gupshup`
- Check Gupshup dashboard → look at Message Logs for errors

---

## STEP 8 — CLIENT WALKTHROUGH (15 mins)

Show the client how to use their dashboard:

| Feature | Where | What to show |
|---------|-------|-------------|
| Conversations | Chat page | How to see and reply to customer messages |
| Leads | Leads page | How to see all leads, call/WhatsApp directly |
| Templates | Templates page | How to create a template and submit for approval |
| Broadcasts | Broadcasts page | How to create and send a campaign |
| Settings | Settings page | What they can edit (bot, staff, FAQs etc.) |

**Tell them:**
- "Your WhatsApp is connected. You'll see all customer messages here."
- "To run a broadcast campaign, first create a template and wait for approval (usually a few hours to a day)."
- "If you want to change the bot's replies or FAQs, go to Settings → AI Bot."
- "If a customer needs human support, click the Handoff button in the chat."

---

## STEP 9 — HAND OVER CREDENTIALS

Give the client:
```
Aries AI Login URL:    https://ariesai.in/login
Email:                 ___________________________
Password:              ___________________________
```

Remind them:
- They do NOT need to log into Gupshup — ever
- They do NOT need to touch Meta Business Manager — ever
- Everything is managed from their Aries AI dashboard

---

## TIMELINE REFERENCE

| Phase | Time | Notes |
|-------|------|-------|
| Meeting + info collection | Day 0 | 30–60 mins |
| Gupshup setup + phone verification | Day 1 | 30–60 mins (you do this alone) |
| Supabase credentials + webhook | Day 1 | 5–10 mins |
| Dashboard config | Day 1 | 30–45 mins |
| Test + go-live | Day 1 (if Meta OTP instant) | 10 mins |
| **Typical total** | **1–3 days** | Delay only if Meta OTP is slow |

---

## COMMON ISSUES & FIXES

| Problem | Cause | Fix |
|---------|-------|-----|
| OTP didn't arrive for phone verification | Number still active on regular WhatsApp | Client deletes WhatsApp from phone, try again |
| Bot not replying | Webhook not set | Go to Gupshup → set webhook URL |
| Bot not replying | Credentials wrong in Supabase | Re-check gupshup_api_key, app_name, phone_number |
| Template rejected | Body text has special characters or URL | Edit template, resubmit without URLs/emojis |
| Template pending >48hrs | Meta queue | Normal — just wait, or resubmit |
| "WhatsApp not active" error in chat | Supabase credentials missing | Complete Step 4 |
| Client can't see their messages | Webhook URL typo | Fix to exactly: `https://ariesai.in/api/webhooks/gupshup` |

---

## YOUR REFERENCE — Per-Client Gupshup Credentials Log

Keep this table updated as you onboard clients.

| Client Name | Email | Gupshup App Name | Phone | Onboarded |
|-------------|-------|-----------------|-------|-----------|
| | | | | |
| | | | | |
| | | | | |
