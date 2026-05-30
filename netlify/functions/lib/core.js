// netlify/functions/lib/core.js
// Shared helpers for the Elias Crew Co. chatbot backend.
// Zero external dependencies — Node's built-in crypto + global fetch (Node 18+).

const crypto = require("crypto");

// ---------- config (override any of these via env vars) ----------
const TZ = process.env.TIMEZONE || "America/Chicago";
const cfg = {
  tz: TZ,
  workStart: +(process.env.WORK_START || 9),
  workEnd: +(process.env.WORK_END || 18),
  consultMin: +(process.env.CONSULT_MINUTES || 20),
  intervalMin: +(process.env.SLOT_INTERVAL_MINUTES || 30),
  leadHours: +(process.env.MIN_LEAD_HOURS || 2),
  windowDays: +(process.env.BOOKING_WINDOW_DAYS || 5),
  perDay: +(process.env.MAX_SLOTS_PER_DAY || 3),
  maxSlots: +(process.env.MAX_SLOTS || 6),
};

// ---------- timezone helpers (DST-correct, no library) ----------
function tzOffsetMs(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime();
}
function zonedTimeToUtc(y, mo, d, h, mi, tz) {
  const guess = new Date(Date.UTC(y, mo, d, h, mi));
  const off1 = tzOffsetMs(guess, tz);
  let utc = guess.getTime() - off1;
  const off2 = tzOffsetMs(new Date(utc), tz);
  if (off2 !== off1) utc = guess.getTime() - off2;
  return new Date(utc);
}
function zonedParts(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, weekday: p.weekday };
}
function labelSlot(date, tz) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
function timeLabel(date, tz) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(date);
}
// Normalize a free-typed US phone to E.164 (+1XXXXXXXXXX); null if it can't.
function toE164(raw) {
  if (!raw) return null;
  const d = ("" + raw).replace(/[^\d]/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  if (("" + raw).trim().startsWith("+") && d.length >= 11) return "+" + d;
  return null;
}

// ---------- Google service-account auth ----------
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account env vars missing");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = header + "." + claim;
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(key);
  const jwt = unsigned + "." + b64url(sig);
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  const data = await res.json();
  if (!res.ok) throw new Error("Google auth failed: " + JSON.stringify(data));
  return data.access_token;
}

// ---------- calendar ----------
const CAL_ID = () => process.env.GOOGLE_CALENDAR_ID || "primary";
async function getBusy(token, timeMin, timeMax) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ timeMin, timeMax, timeZone: TZ, items: [{ id: CAL_ID() }] }) });
  const data = await res.json();
  if (!res.ok) throw new Error("freeBusy failed: " + JSON.stringify(data));
  const cals = data.calendars || {};
  const cal = cals[CAL_ID()] || cals[Object.keys(cals)[0]] || {};
  return cal.busy || [];
}
async function createEvent(token, resource, withMeet) {
  const url = "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(CAL_ID()) + "/events?sendUpdates=all" + (withMeet ? "&conferenceDataVersion=1" : "");
  const res = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(resource) });
  const data = await res.json();
  if (!res.ok) throw new Error("createEvent failed: " + JSON.stringify(data));
  return data;
}
async function listEvents(token, timeMin, timeMax) {
  const url = "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(CAL_ID()) + "/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=" + encodeURIComponent(timeMin) + "&timeMax=" + encodeURIComponent(timeMax);
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  const data = await res.json();
  if (!res.ok) throw new Error("listEvents failed: " + JSON.stringify(data));
  return data.items || [];
}
async function patchEvent(token, eventId, patch) {
  const url = "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(CAL_ID()) + "/events/" + encodeURIComponent(eventId);
  const res = await fetch(url, { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  const data = await res.json();
  if (!res.ok) throw new Error("patchEvent failed: " + JSON.stringify(data));
  return data;
}

// ---------- slot computation ----------
function computeSlots(busy) {
  const consultMs = cfg.consultMin * 60000;
  const iv = busy.map((b) => [Date.parse(b.start), Date.parse(b.end)]);
  const overlaps = (s, e) => iv.some(([bs, be]) => s < be && e > bs);
  const earliest = Date.now() + cfg.leadHours * 3600000;
  const out = [];
  for (let d = 0; d < 14 && out.length < cfg.maxSlots; d++) {
    const zp = zonedParts(new Date(Date.now() + d * 86400000), cfg.tz);
    if (zp.weekday === "Sun") continue;
    let perDay = 0;
    for (let mins = cfg.workStart * 60; mins + cfg.consultMin <= cfg.workEnd * 60 && out.length < cfg.maxSlots && perDay < cfg.perDay; mins += cfg.intervalMin) {
      const start = zonedTimeToUtc(zp.year, zp.month - 1, zp.day, Math.floor(mins / 60), mins % 60, cfg.tz);
      const s = start.getTime(), e = s + consultMs;
      if (s < earliest || overlaps(s, e)) continue;
      out.push({ start: new Date(s).toISOString(), end: new Date(e).toISOString(), label: labelSlot(new Date(s), cfg.tz) });
      perDay++;
    }
  }
  return out;
}

// ---------- alerts (generic senders + Daniel shortcuts) ----------
async function sendSMSTo(to, text) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) { console.warn("SMS skipped — Twilio not configured"); return false; }
  if (!to) { console.warn("SMS skipped — no destination number"); return false; }
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, { method: "POST", headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: text }) });
  if (!res.ok) { console.error("Twilio error", res.status, await res.text()); return false; }
  return true;
}
async function sendEmailTo(to, subject, html) {
  const { RESEND_API_KEY } = process.env;
  if (!RESEND_API_KEY || !to) return false;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Elias Crew Co. <onboarding@resend.dev>", to: [to], subject, html }) });
  if (!res.ok) { console.error("Resend error", res.status, await res.text()); return false; }
  return true;
}
const sendSMS = (text) => sendSMSTo(process.env.LEAD_PHONE, text);     // -> Daniel
const sendEmail = (subject, html) => sendEmailTo(process.env.LEAD_EMAIL, subject, html); // -> Daniel

// Compact label for narrow UIs like Messenger quick replies (<=20 chars).
function shortLabel(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.month}/${p.day} ${p.hour}:${p.minute} ${p.dayPeriod}`;
}

// Shared booking logic used by the web book.js AND Messenger.
// Re-checks the slot is free, writes the calendar event (tagged for reminders),
// alerts Daniel, and (if a phone/email is known) confirms to the customer.
// Returns { ok:true, label, meetLink } | { ok:false, reason:"taken" } | { ok:false }.
async function bookSlot(token, slot, L, opts) {
  opts = opts || {};
  const busy = await getBusy(token, slot.start, slot.end);
  const s = Date.parse(slot.start), e = Date.parse(slot.end);
  if (busy.some((b) => s < Date.parse(b.end) && e > Date.parse(b.start))) return { ok: false, reason: "taken" };

  const isEmail = (L.contact || "").includes("@");
  const custPhone = isEmail ? null : toE164(L.contact);
  const withMeet = process.env.GOOGLE_CREATE_MEET === "true";
  const label = labelSlot(new Date(slot.start), cfg.tz);

  const resource = {
    summary: `Phone consult — ${L.name || "Website lead"} (${L.service || "inquiry"})`,
    description: `Booked via ${opts.source || "chatbot"}.\nService: ${L.service || "-"}\nCity: ${L.city || "-"}\nContact: ${L.contact || "-"}\nProject: ${L.details || "-"}`,
    start: { dateTime: slot.start, timeZone: cfg.tz },
    end: { dateTime: slot.end, timeZone: cfg.tz },
    reminders: { useDefault: true },
    extendedProperties: { private: { eliasBot: "1", custName: (L.name || "").slice(0, 80), custPhone: custPhone || "", custEmail: isEmail ? L.contact : "", service: (L.service || "").slice(0, 80), reminded: "0" } },
    ...(isEmail ? { attendees: [{ email: L.contact }] } : {}),
    ...(withMeet ? { conferenceData: { createRequest: { requestId: "meet-" + Date.now(), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
  };
  const ev = await createEvent(token, resource, withMeet);
  const meetLink = ev.hangoutLink || "";

  const dSms = `BOOKED consult — ${L.name || "lead"}\n${label}\nService: ${L.service || "-"}\nCall: ${L.contact || "-"}${meetLink ? "\nMeet: " + meetLink : ""}`;
  const dHtml = `<h2>Consult booked</h2><p><b>When:</b> ${label}<br><b>Name:</b> ${L.name || "-"}<br><b>Service:</b> ${L.service || "-"}<br><b>Contact:</b> ${L.contact || "-"}<br><b>Project:</b> ${L.details || "-"}</p>${meetLink ? "<p><b>Meet:</b> " + meetLink + "</p>" : ""}`;
  const first = (L.name || "").trim().split(/\s+/)[0] || "there";
  const cSms = `Hi ${first}! You're booked with Elias Crew Co. for a free phone consult on ${label}. Daniel will call you then. Need to change it? Call/text 214-836-1418.`;
  const cHtml = `<p>Hi ${first},</p><p>You're booked for a free phone consult with <b>Elias Crew Co.</b></p><p><b>When:</b> ${label}<br><b>About:</b> ${L.service || "your project"}</p><p>Daniel will call you then${meetLink ? ` (or join by video: ${meetLink})` : ""}. Need to reschedule? Just call or text <b>214-836-1418</b>.</p><p>— Elias Crew Co.</p>`;

  await Promise.allSettled([
    sendSMS(dSms),
    sendEmail(`Consult booked: ${L.name || "lead"} — ${label}`, dHtml),
    opts.confirmCustomer !== false && custPhone ? sendSMSTo(custPhone, cSms) : Promise.resolve(false),
    opts.confirmCustomer !== false && isEmail ? sendEmailTo(L.contact, `Your Elias Crew Co. consult — ${label}`, cHtml) : Promise.resolve(false),
  ]);
  return { ok: true, label, meetLink };
}

const json = (statusCode, body, origin) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" },
  body: JSON.stringify(body),
});

module.exports = { cfg, getAccessToken, getBusy, createEvent, listEvents, patchEvent, computeSlots, bookSlot, sendSMS, sendEmail, sendSMSTo, sendEmailTo, toE164, labelSlot, timeLabel, shortLabel, json };
