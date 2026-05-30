// netlify/functions/messenger.js
// Facebook Messenger webhook. Same brain as the website bot.
// GET  -> webhook verification handshake with Meta.
// POST -> incoming DMs: run through Claude, capture leads, alert Daniel,
//         offer real booking times as quick replies, and book on tap.
//
// Env vars (in addition to ANTHROPIC / GOOGLE / TWILIO / RESEND already set):
//   FB_VERIFY_TOKEN   a random string you make up (entered again in Meta's webhook setup)
//   FB_PAGE_TOKEN     the Page access token for Elias Crew Co.'s Facebook Page
//   FB_APP_SECRET     your Meta app secret (used to verify request signatures)
//   GRAPH_VER         optional, defaults to v25.0

const crypto = require("crypto");
const { askClaude } = require("./lib/brain.js");
const { getAccessToken, getBusy, computeSlots, bookSlot, sendSMS, sendEmail, shortLabel, cfg } = require("./lib/core.js");
const { loadState, saveState } = require("./lib/store.js");

const GRAPH = "https://graph.facebook.com/" + (process.env.GRAPH_VER || "v25.0");

// ---------- Send API helpers ----------
async function callSend(payload) {
  const token = process.env.FB_PAGE_TOKEN;
  if (!token) { console.warn("FB_PAGE_TOKEN missing — cannot send"); return; }
  const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!res.ok) console.error("Send API error", res.status, await res.text());
}
const sendText = (psid, text) => callSend({ recipient: { id: psid }, messaging_type: "RESPONSE", message: { text } });
const sendTyping = (psid) => callSend({ recipient: { id: psid }, sender_action: "typing_on" });
function sendSlots(psid, text, slots) {
  const quick_replies = slots.slice(0, 11).map((s) => ({
    content_type: "text",
    title: shortLabel(new Date(s.start), cfg.tz).slice(0, 20),
    payload: JSON.stringify({ t: "book", s: s.start, e: s.end }),
  }));
  return callSend({ recipient: { id: psid }, messaging_type: "RESPONSE", message: { text, quick_replies } });
}

// ---------- signature verification ----------
function verifySig(event) {
  const secret = process.env.FB_APP_SECRET;
  if (!secret) return true; // allow during early testing if not set (set it before going live)
  const sig = event.headers["x-hub-signature-256"] || event.headers["X-Hub-Signature-256"] || "";
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(event.body || "", "utf8").digest("hex");
  try { return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
  catch (e) { return false; }
}

// ---------- availability ----------
async function nextSlots() {
  try {
    const token = await getAccessToken();
    const now = new Date();
    const busy = await getBusy(token, now.toISOString(), new Date(now.getTime() + (cfg.windowDays + 2) * 86400000).toISOString());
    return computeSlots(busy);
  } catch (e) { console.error("availability error", e.message); return []; }
}

// ---------- core message handling ----------
async function handleText(psid, text) {
  const state = (await loadState(psid)) || { history: [], lead: null, booked: false };
  await sendTyping(psid);

  state.history.push({ role: "user", content: text.slice(0, 4000) });
  if (state.history.length > 20) state.history = state.history.slice(-20);

  let reply, lead;
  try { ({ reply, lead } = await askClaude(state.history)); }
  catch (e) { await sendText(psid, "Sorry, I'm having trouble right now — please call or text Daniel at 214-836-1418."); return; }

  state.history.push({ role: "assistant", content: reply });

  if (lead && !state.lead && !state.booked) {
    state.lead = lead;
    // alert Daniel immediately (before they pick a time)
    const sms = `New FB lead — Elias Crew Co.\nName: ${lead.name || "(n/a)"}\nService: ${lead.service || "(n/a)"}\nCity: ${lead.city || "(n/a)"}\nContact: ${lead.contact || "(n/a)"}\n${lead.details ? "Project: " + lead.details + "\n" : ""}(picking a time next)`;
    const html = `<h2>New lead (Facebook)</h2><p><b>Name:</b> ${lead.name || "-"}<br><b>Service:</b> ${lead.service || "-"}<br><b>City:</b> ${lead.city || "-"}<br><b>Contact:</b> ${lead.contact || "-"}<br><b>Project:</b> ${lead.details || "-"}</p>`;
    await Promise.allSettled([sendSMS(sms), sendEmail(`New FB lead: ${lead.name || "visitor"} — ${lead.service || "inquiry"}`, html)]);

    const slots = await nextSlots();
    if (slots.length) await sendSlots(psid, reply, slots);
    else await sendText(psid, reply + "\n\nDaniel will reach out shortly. You can also call/text 214-836-1418.");
  } else {
    await sendText(psid, reply);
  }
  await saveState(psid, state);
}

async function handleBooking(psid, payload) {
  const state = (await loadState(psid)) || { history: [], lead: null, booked: false };
  if (state.booked) { await sendText(psid, "You're already booked — see you then! Need changes? Call/text 214-836-1418."); return; }
  if (!state.lead) { await sendText(psid, "Let's grab a couple details first — what's your name and the service you need?"); return; }

  await sendTyping(psid);
  try {
    const token = await getAccessToken();
    const result = await bookSlot(token, { start: payload.s, end: payload.e }, state.lead, { source: "Facebook Messenger" });
    if (result.ok) {
      state.booked = true;
      const first = (state.lead.name || "").trim().split(/\s+/)[0] || "there";
      await sendText(psid, `\u2705 You're all set for ${result.label}, ${first}! Daniel will call you then${state.lead.contact ? " at " + state.lead.contact : ""}.${result.meetLink ? " Video: " + result.meetLink : ""}`);
    } else if (result.reason === "taken") {
      const slots = await nextSlots();
      if (slots.length) await sendSlots(psid, "Ah, that time was just taken — here are fresh openings:", slots);
      else await sendText(psid, "That time was just taken — please call/text Daniel at 214-836-1418 and he'll get you scheduled.");
    } else {
      await sendText(psid, "I couldn't lock that in — please call or text Daniel at 214-836-1418.");
    }
  } catch (e) {
    console.error("booking error", e.message);
    await sendText(psid, "I couldn't lock that in — please call or text Daniel at 214-836-1418.");
  }
  await saveState(psid, state);
}

// ---------- webhook entry ----------
exports.handler = async (event) => {
  // GET: Meta verification handshake
  if (event.httpMethod === "GET") {
    const q = event.queryStringParameters || {};
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === process.env.FB_VERIFY_TOKEN) {
      return { statusCode: 200, body: q["hub.challenge"] || "" };
    }
    return { statusCode: 403, body: "Forbidden" };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  if (!verifySig(event)) { console.warn("bad signature"); return { statusCode: 403, body: "bad signature" }; }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 200, body: "ok" }; }
  if (body.object !== "page") return { statusCode: 200, body: "ok" };

  // Acknowledge fast; process inline (low volume for a contractor).
  for (const entry of body.entry || []) {
    for (const ev of entry.messaging || []) {
      const psid = ev.sender && ev.sender.id;
      if (!psid) continue;
      try {
        if (ev.message && ev.message.is_echo) continue;          // ignore our own echoes
        if (ev.message && ev.message.quick_reply) {
          let p = null; try { p = JSON.parse(ev.message.quick_reply.payload); } catch (e) {}
          if (p && p.t === "book") { await handleBooking(psid, p); continue; }
        }
        if (ev.message && ev.message.text) { await handleText(psid, ev.message.text); continue; }
        if (ev.postback) {
          // "Get Started" or menu taps land here; treat as a hello.
          await handleText(psid, "Hi");
          continue;
        }
        // delivery/read receipts etc. -> ignore
      } catch (e) { console.error("handler error", e.message); }
    }
  }
  return { statusCode: 200, body: "ok" };
};
