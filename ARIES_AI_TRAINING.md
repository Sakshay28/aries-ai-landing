# Aries AI — Complete Knowledge Base

> This document contains everything about Aries AI. Use this as the primary source of truth for all customer interactions.

---

## About Aries AI

Aries AI is an AI-powered WhatsApp Business Automation platform built for Indian businesses. We help businesses automate their WhatsApp conversations — from replying to customer enquiries, taking bookings, capturing leads, qualifying prospects, and following up — all 24/7, even while the business owner sleeps.

We use the **Official Meta WhatsApp Cloud API** (direct integration, no third-party BSP) and **Google Gemini 2.0 Flash AI** for natural language understanding. Our AI truly understands Hindi, English, and Hinglish — it gets messages like "bhai kal 4 baje table milega?" perfectly.

**Tagline:** "Automate Your WhatsApp Business With AI"

**Website:** [https://ariesai.in](https://ariesai.in)

**Emails:**
- General & Sales: info@ariesai.in
- Technical Support: support@ariesai.in

**Support Hours:** Monday to Saturday, 9:00 AM to 7:00 PM IST (typical response within 2 hours during operational hours)

---

## Founders

### Sakshay
- **Role:** Co-Founder & Lead Developer
- **Education:** 3rd Year B.Tech (Engineering) at Manipal University Jaipur (MUJ)
- **What he does:** Sakshay is the technical brain behind Aries AI. He built the entire platform from scratch — the AI engine, the WhatsApp integration, the multi-tenant architecture, the dashboard, the broadcast system, and everything in between. He handles all product development, deployment, and infrastructure.

### Kavya
- **Role:** Co-Founder
- **Education:** 3rd Year B.Tech (Engineering) at Manipal University Jaipur (MUJ)
- **What she does:** Kavya co-founded Aries AI alongside Sakshay. Together they are building Aries AI while pursuing their engineering degrees.

**Fun fact:** Both founders are college students in their 3rd year of engineering, building a production SaaS platform that serves real businesses across India. Aries AI is fully bootstrapped and built with passion.

---

## What Makes Aries AI Different

1. **Real AI, Not Chatbot Templates** — We don't use rigid decision trees or template-based flows. Our AI uses Google Gemini 2.0 Flash to genuinely understand what customers are saying and respond naturally.

2. **Built for India** — Full support for Hindi, English, and Hinglish. Our AI handles the way Indians actually talk on WhatsApp — mixed languages, slang, abbreviations, voice-to-text typos, and all.

3. **Official Meta API** — We use the direct WhatsApp Cloud API from Meta. No third-party BSP middleman. This means better deliverability, lower costs, and direct control.

4. **Bank-Grade Security** — AES-256 encryption for all tokens, row-level isolation per tenant, encrypted credentials storage. Your data is completely isolated from other businesses on the platform.

5. **Setup in Under 10 Minutes** — No complex onboarding. Connect your WhatsApp Business number, train the AI with your business info, and you're live.

6. **24/7 Availability** — Your AI assistant never sleeps, never takes breaks, never has a bad day. Every customer gets an instant, helpful response.

---

## Core Features

### AI Conversation Engine
- Natural language understanding powered by Google Gemini 2.0 Flash
- Understands Hindi, English, Hinglish seamlessly
- Context-aware multi-turn conversations (remembers what was said earlier)
- Smart intent detection (booking, enquiry, complaint, pricing, etc.)
- Automatic data extraction (names, phone numbers, dates, times, guest counts)
- Custom personality and tone configuration (Premium Fine Dining, Cafe Friendly, Luxury Hospitality, Fast Casual, etc.)

### AI Assistant Training Panel
- Configure bot name, personality, and tone
- Set custom welcome messages and offers
- Add Unique Selling Points (USPs) as chips
- Write custom Staff Guidelines / System Prompt
- Add Custom FAQs (question-answer pairs the AI will use)
- Upload Knowledge Base documents (PDF, text) — the AI reads and learns from them
- Built-in chat simulator to test before going live
- Starter templates for different business types (Fine Dining, Cafe, etc.)

### Smart Lead Pipeline
- Automatic lead capture from every WhatsApp conversation
- Hot / Warm / Cold lead scoring based on intent
- Lead source tracking: WhatsApp (organic), Meta Ad (CTWA), Meta Lead Form
- Round-robin lead assignment to team members
- Campaign tagging and attribution
- Returning customer recognition (visit count tracking)

### Auto Follow-Ups
- Configurable follow-up sequences:
  - 30 minutes after first contact
  - 3 hours later
  - 24 hours later
  - 7 days later
- AI-generated personalized follow-up messages
- Only fires for new leads (doesn't spam existing customers)

### Shared Inbox & Live Chat
- Unified inbox for all WhatsApp conversations across team members
- Real-time message sync
- Bot pause/resume — human agent can take over anytime
- Escalation system — AI flags conversations that need human attention
- Message status tracking (sent, delivered, read with blue ticks)

### Broadcast Campaigns
- Send bulk WhatsApp messages using approved Meta templates
- Audience segmentation (by tags, lead status, source, etc.)
- Delivery tracking (sent, delivered, read, failed, replied)
- Opt-out / opt-in management (STOP/START keyword handling)
- Broadcast analytics dashboard
- Schedule broadcasts for later

### Booking System (for Restaurants & Hospitality)
- AI-powered table reservation via WhatsApp
- Automatic date/time/guest count extraction
- Slot capacity management (prevents overbooking)
- Reservation ID generation
- Google Sheets sync for booking records
- Booking commitment fee via Razorpay (optional)
- Cancel/modify booking flow with staff escalation

### Contact Management
- Full contact/lead database per tenant
- Custom tags and attributes
- Source tracking (WhatsApp, Meta Ads, Lead Forms)
- Visit history and interaction timeline
- Bulk import/export capability

### Analytics Dashboard
- Conversation analytics
- Lead conversion metrics
- AI performance stats (response times, intent distribution)
- Broadcast campaign analytics
- Team performance tracking

### Integrations
- **Google Sheets** — Auto-sync leads and bookings to spreadsheets
- **Google Calendar** — Appointment and booking sync
- **Pabbly Connect** — Connect with 1000+ apps via webhooks
- **Meta Ads & Pixel (CAPI)** — Track ad conversions, CTWA attribution
- **Razorpay** — Payment links, booking fees, invoice collection
- **Shiprocket** — E-commerce shipping integration
- **Webhooks / API** — Custom integrations via outbound webhooks

### Click-to-WhatsApp (CTWA) Ads Support
- Works with Meta's Click-to-WhatsApp ads
- Automatic lead source attribution ("This lead came from Meta Ad")
- Campaign context injection — AI knows what ad the customer clicked
- Conversions API (CAPI) integration for tracking Lead, Schedule, Purchase events back to Meta

### Off-Hours Management
- Configure working hours per day of the week
- Automatic off-hours message when business is closed
- Smart deduplication — doesn't spam the same person with "we're closed" repeatedly
- Optional lead capture during off-hours

### Flow Builder (Pro plan and above)
- Visual drag-and-drop workflow builder
- Custom automation flows
- Button triggers and interactive message flows
- Conditional logic and branching
- Wait-for-reply nodes
- Inactivity timeout triggers

---

## Pricing Plans

All plans include the Official WhatsApp Business API. Template message charges apply per Meta's pricing.

### Template Message Charges (same across all plans):
| Type | Cost per message |
|------|-----------------|
| Marketing | ₹1.09 |
| Utility | ₹0.145 |
| Authentication | ₹0.145 |
| Service (24hr window) | Unlimited Free |

### Starter — ₹3,999/month
*Best for small businesses just getting started with WhatsApp automation*

- 1 Agent Seat
- 2,000 conversations/month
- 1 Team Member
- WhatsApp Business API Access
- Shared Inbox
- Manual Live Chat
- Contact Management
- Broadcast Campaigns
- Basic Customer Segmentation
- Chat Labels/Tags
- AI FAQ Assistant (Basic)
- Basic Analytics Dashboard
- Click-to-WhatsApp Widget
- Blue Tick Guidance Support
- ₹100 Trial Credits

### Growth — ₹5,999/month (Most Popular)
*Best for growing businesses that need smart AI automation*

- Everything in Starter, plus:
- 3 Team Members
- 10,000 conversations/month
- Advanced AI FAQ Chatbot
- Hindi + English + Hinglish AI
- Smart Customer Segments
- Auto Replies & Smart Workflows
- Drip Campaigns / Follow-ups
- Lead Capture Forms
- Custom Attributes & Tags
- Broadcast Scheduling
- Appointment Reminders
- Cart Recovery / Follow-up Automation
- AI Lead Qualification
- Basic CRM Sync
- Priority Support

### Pro — ₹7,999/month
*Best for businesses that need full automation and integrations*

- Everything in Growth, plus:
- 5 Team Members
- 25,000 conversations/month
- Visual Workflow Builder
- Unlimited Automation Flows
- CRM Integrations
- Google Sheets Sync
- Lead Scoring & Alerts
- Conversion Analytics
- Advanced Customer Journey Builder
- AI Intent Detection
- Team Assignment Rules
- Sales Pipeline Tracking
- API / Webhook Access
- Advanced Analytics Dashboard
- Custom Automation Rules

### Ultra — Custom Pricing
*For enterprises that need unlimited scale and dedicated support*

- Everything in Pro, plus:
- Unlimited Team Members
- Unlimited Conversations
- Dedicated AI Model Training
- AI Voice Calling Agent
- Custom Integrations
- White-label Reports
- SLA + Dedicated Account Manager
- Enterprise Security Controls
- Multi-Branch Management
- Priority Infrastructure
- Custom Workflows
- Dedicated Success Manager
- Custom API Limits
- WhatsApp Commerce Automation

### Annual Billing
Save 10% on all plans with annual billing.

### Free Trial
- 14-day free trial on all plans
- No credit card required
- Full feature access during trial
- ₹100 trial credits included

---

## Industry Solutions

### E-Commerce & Retail
- Abandoned cart recovery via WhatsApp
- Order status updates and shipping notifications
- Product inquiry handling
- COD confirmation automation
- Upselling and cross-selling via AI

### Healthcare & Clinics
- Appointment booking and management
- Automated appointment reminders (reduces no-shows)
- Patient FAQ handling
- Prescription refill reminders

### Real Estate
- High-intent buyer qualification via AI
- Property query auto-responses
- Site visit scheduling
- Lead scoring for serious buyers

### Restaurants & Cafes
- Table reservation via WhatsApp
- Daily menu and specials updates
- Loyalty offers and promotions
- Direct booking channel (no third-party apps needed)

### Hotels & Hospitality
- Room booking inquiries
- Concierge-style AI assistant
- Check-in/check-out information
- Upselling premium services

### Education & Coaching
- Course inquiry handling
- Admission form collection
- Class schedule information
- Fee payment reminders

---

## Frequently Asked Questions

**Q: How does the AI work? Does it need pre-configured templates?**
A: No rigid templates needed. Our AI uses Google Gemini 2.0 Flash — a state-of-the-art language model — to understand natural language. You just tell it about your business (name, type, USPs, FAQs, guidelines) and it handles conversations naturally. It understands context, remembers previous messages, and responds like a trained human staff member.

**Q: Will my WhatsApp Business number get banned?**
A: No. We use the Official Meta WhatsApp Cloud API — the same API that Meta provides to authorized businesses. As long as you follow Meta's commerce and messaging policies (no spam, respect opt-outs), your number is completely safe. We also handle STOP/START keyword compliance automatically.

**Q: Does it support multiple Indian languages and Hinglish?**
A: Yes! Our AI natively understands Hindi, English, and Hinglish (mixed Hindi-English that Indians commonly use on WhatsApp). It responds in the same language the customer is using. It handles slang, abbreviations, voice-to-text errors, and regional expressions.

**Q: How do I train the AI on my product information?**
A: Through our AI Assistant panel in the dashboard. You can set your bot's name, personality, welcome message, USPs, custom FAQs, and detailed staff guidelines. You can also upload PDF or text documents as a Knowledge Base — the AI reads them and uses that information to answer customer questions accurately.

**Q: Does it integrate with my existing tools (CRMs, sheets)?**
A: Yes. We integrate with Google Sheets, Google Calendar, Pabbly Connect (1000+ apps), Meta Ads & Pixel, Razorpay payments, and Shiprocket shipping. Pro plan and above also get API/Webhook access for custom integrations with any tool.

**Q: Is there a free trial? Do I need a credit card to sign up?**
A: Yes, we offer a 14-day free trial with full feature access. No credit card required to start. You also get ₹100 in trial credits to test broadcast messages and template sending. Cancel anytime.

**Q: How long does setup take?**
A: Under 10 minutes. Connect your WhatsApp Business number, configure your AI assistant with your business details, and you're live. Our onboarding guide walks you through every step.

**Q: Can I switch to a human agent mid-conversation?**
A: Absolutely. You can pause the AI bot anytime from the Shared Inbox and take over the conversation manually. The AI also automatically escalates to a human when it detects the customer is angry, asks for a real person, or when the AI confidence is low.

**Q: How is my data secured?**
A: We use AES-256 encryption for all sensitive tokens and credentials. Every tenant's data is completely isolated with row-level security in the database. We never share data between businesses. All API communications use HTTPS.

---

## Technical Stack (for technical inquiries)

- **Frontend:** Next.js 16 (App Router) with React, Tailwind CSS
- **Backend:** Next.js API Routes (serverless on Vercel)
- **Database:** Supabase (PostgreSQL with Row-Level Security)
- **AI Model:** Google Gemini 2.0 Flash
- **WhatsApp API:** Meta Cloud API v21.0 (direct, no BSP)
- **Hosting:** Vercel (Edge-optimized, auto-scaling)
- **Payments:** Razorpay
- **Caching:** Upstash Redis
- **Security:** AES-256-GCM encryption, HMAC-SHA256 webhook verification

---

## Contact & Support

- **Website:** https://ariesai.in
- **Sales & General Inquiries:** info@ariesai.in
- **Technical Support:** support@ariesai.in
- **Support Hours:** Monday–Saturday, 9:00 AM – 7:00 PM IST
- **Response Time:** Within 2 hours during operational hours
- **Priority Support:** Available for Pro and Ultra plan subscribers (dedicated SLA + direct WhatsApp support)

---

## Quick Answers for Common Queries

| Question | Quick Answer |
|----------|-------------|
| What is Aries AI? | AI-powered WhatsApp automation platform for Indian businesses |
| Who founded it? | Sakshay and Kavya — 3rd year B.Tech students at Manipal University Jaipur |
| What does it cost? | Plans start at ₹3,999/month. 14-day free trial available. |
| Which AI model? | Google Gemini 2.0 Flash |
| Does it support Hindi? | Yes — Hindi, English, and Hinglish natively |
| Is there a free trial? | Yes, 14 days, no credit card required |
| How fast is setup? | Under 10 minutes |
| Is it official Meta API? | Yes, Official WhatsApp Cloud API |
| Can a human take over? | Yes, anytime from the Shared Inbox |
| Annual discount? | 10% off on annual billing |
