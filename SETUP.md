# Elias Crew Co. Chatbot — Setup Guide

An AI chatbot for your website that answers questions, captures leads (texting
Daniel, with email backup), **and books free phone consults straight into
Daniel's Google Calendar** using his real availability.

## Files
- `chat-widget.js` — the chatbot. One line adds it to your site.
- `netlify/functions/chat.js` — chat relay + lead capture/alert.
- `netlify/functions/availability.js` — returns Daniel's next open consult times.
- `netlify/functions/book.js` — books the chosen time, alerts Daniel, confirms to the customer.
- `netlify/functions/send-reminders.js` — scheduled job; reminds customers before their consult.
- `netlify/functions/lib/core.js` — shared logic (Google auth, slots, booking, alerts).
- `netlify/functions/lib/brain.js` — shared assistant brain (system prompt + Claude call). Edit business info HERE.
- `netlify/functions/lib/store.js` — per-user Messenger memory.
- `netlify/functions/messenger.js` — Facebook Messenger webhook (same brain as the website).
- `package.json` — declares the one dependency (Netlify Blobs, for Messenger memory).
- `netlify.toml` — config.

## How the booking flow works
1. Visitor chats; the bot answers and collects name + phone + service.
2. The bot invites them to pick a time. The widget pulls Daniel's **real**
   free/busy from Google Calendar and shows the next few openings as buttons.
3. Visitor taps a time -> it's written to Daniel's calendar (with the customer
   invited if they gave an email), and Daniel gets a "BOOKED" text/email.
4. It re-checks the slot at the moment of booking, so it can never double-book.
5. The customer instantly gets a confirmation (text if they gave a phone, else
   email), and a reminder automatically goes out before the consult.

## No-show protection (automatic)
- The moment a time is booked, the customer receives a confirmation.
- A scheduled job (`send-reminders.js`) runs every 15 min and texts/emails each
  customer a reminder about 2 hours before their consult, then marks the event
  so it never sends twice. Tune timing with `REMINDER_LEAD_MINUTES`.
- These customer messages need Twilio (for texts) and/or Resend (for emails)
  configured — same accounts as Daniel's alerts. Until Twilio is live, customers
  who gave an email still get confirmations/reminders by email.

---

## Setup

### 1. Add the files
Drop them into the project/repo that deploys eliascrewco.netlify.app, keeping
the netlify/functions/... folder structure. Put chat-widget.js where your
site files live so it serves at /chat-widget.js.

### 2. Embed the widget
Add before </body>:

    <script src="/chat-widget.js" defer></script>

### 3. Connect Google Calendar (one-time, ~10 min)
1. Go to console.cloud.google.com -> create a project.
2. APIs & Services -> Library -> enable Google Calendar API.
3. APIs & Services -> Credentials -> Create credentials -> Service account.
   Create it, then under its Keys tab, Add key -> JSON and download it.
4. Open the JSON. You'll use client_email and private_key.
5. In Google Calendar (as Daniel), Settings -> his calendar ->
   "Share with specific people" -> add the service account's client_email
   with permission "Make changes to events."
6. The calendar ID is Daniel's address, e.g. eliascrew@gmail.com
   (Calendar settings -> "Integrate calendar" -> Calendar ID).

### 4. Get the other accounts
- Anthropic API key  -> console.anthropic.com
- Twilio (the text)  -> console.twilio.com (can add later, see note below)
- Resend (email)     -> resend.com

### 5. Set environment variables
Netlify -> Site settings -> Environment variables:

| Variable | Value |
|---|---|
| ANTHROPIC_API_KEY | your Anthropic key |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | the JSON client_email |
| GOOGLE_PRIVATE_KEY | the JSON private_key (paste as-is; \n's are handled) |
| GOOGLE_CALENDAR_ID | eliascrew@gmail.com |
| RESEND_API_KEY | from Resend |
| LEAD_EMAIL | eliascrew@gmail.com |
| TWILIO_ACCOUNT_SID | (add later) from Twilio |
| TWILIO_AUTH_TOKEN | (add later) from Twilio |
| TWILIO_FROM | (add later) your Twilio number, e.g. +14695551234 |
| LEAD_PHONE | (add later) +12148361418 |
| ALLOWED_ORIGIN | (recommended once tested) https://eliascrewco.netlify.app |

Optional tuning (sensible defaults built in):

| Variable | Default | Meaning |
|---|---|---|
| TIMEZONE | America/Chicago | timezone for slots |
| WORK_START / WORK_END | 9 / 18 | consult hours (24h) |
| CONSULT_MINUTES | 20 | consult length |
| SLOT_INTERVAL_MINUTES | 30 | spacing between offered times |
| MIN_LEAD_HOURS | 2 | no slots sooner than this |
| BOOKING_WINDOW_DAYS | 5 | how far ahead to offer |
| MAX_SLOTS_PER_DAY / MAX_SLOTS | 3 / 6 | how many to show |
| REMINDER_LEAD_MINUTES | 120 | how long before a consult to remind the customer |
| GOOGLE_CREATE_MEET | unset | set "true" to add a Google Meet video link |

Note: Sundays are skipped automatically. A Google Meet link via service account
works reliably only on Google Workspace calendars; on a personal Gmail it may
not -- leave GOOGLE_CREATE_MEET unset and run it as a phone consult (Daniel
calls the number), which always works.

### 6. Deploy & test
Redeploy on Netlify, open your site, and run a lead through the bot. You should
see real time buttons appear; tapping one creates the calendar event and fires
the confirmation. The reminder job is a Netlify Scheduled Function — it turns on
automatically when you deploy (no cron setup needed); confirm it under
Netlify -> Functions after the first deploy.

---

## You can launch WITHOUT Twilio
If the TWILIO_* / LEAD_PHONE vars are unset, the text step is skipped
automatically and every lead/booking still reaches Daniel by email. Add
Twilio later once the texting registration below is done.

## Texting registration (A2P 10DLC) -- only when you add Twilio
US carriers require business numbers that send automated texts to be registered
before texts deliver reliably (set up in Twilio -> Messaging -> Regulatory
Compliance). One-time, a few dollars/month, approval takes several days to a
couple of weeks. Verify the current process in Twilio when you start. Keep
the email backup on until it clears.

## Facebook Messenger (same bot in your Page DMs)

`messenger.js` lets the same assistant answer Facebook Messenger messages, capture
leads, alert Daniel, and offer booking times as tappable quick replies.

### What works when
- While your Meta app is in **Development mode**, the bot already replies to **you
  and anyone you add as an app Tester/Admin** — so Daniel can use it right away.
- To open it to the **general public**, Meta requires **App Review** (for the
  `pages_messaging` permission) plus **Business Verification** — plan for several
  days to a couple of weeks. Start it early; it runs in the background.
- Messenger's rule: a business can reply freely within **24 hours** of a user's
  last message. Our bot only ever replies to incoming messages, so this is fine.

### Setup
1. At **developers.facebook.com**, create an app (type: Business) and add the
   **Messenger** product. Connect Elias Crew Co.'s Facebook Page and generate a
   **Page access token**.
2. Add the webhook. Callback URL:
   `https://eliascrewco.netlify.app/.netlify/functions/messenger`
   Verify token: whatever you set as `FB_VERIFY_TOKEN` below.
   Subscribe the Page to the **messages** and **messaging_postbacks** fields.
3. Add these environment variables in Netlify:

| Variable | Value |
|---|---|
| FB_VERIFY_TOKEN | a random string you invent (must match step 2) |
| FB_PAGE_TOKEN | the Page access token from step 1 |
| FB_APP_SECRET | your Meta app secret (App settings -> Basic) |
| GRAPH_VER | (optional) defaults to v25.0 — bump as Meta releases newer versions |

4. Redeploy. Add Daniel as a Tester on the app, then DM the Page from his account
   to test the full flow (chat -> lead -> pick a time -> booked).

Note: the bot's knowledge now lives in `lib/brain.js` (not `chat.js`) — one edit
updates BOTH the website and Messenger.

## Notes
- Bot wording/knowledge: edit SYSTEM_PROMPT in lib/brain.js (updates web + Messenger).
- Lower cost: change MODEL in lib/brain.js to the Haiku model.
- ALLOWED_ORIGIN stops other sites from running up charges on your endpoints.
