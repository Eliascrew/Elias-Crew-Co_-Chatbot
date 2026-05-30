// netlify/functions/chat.js — website widget endpoint.
// Relays chat to Claude (key stays server-side), captures leads, alerts Daniel,
// and tells the widget when to show booking times.

const { askClaude } = require("./lib/brain.js");
const { sendSMS, sendEmail, json } = require("./lib/core.js");

exports.handler = async (event) => {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  if (event.httpMethod === "OPTIONS") return json(200, {}, origin);
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" }, origin);
  if (process.env.ALLOWED_ORIGIN) {
    const o = event.headers.origin || event.headers.Origin || "";
    if (o && o !== process.env.ALLOWED_ORIGIN) return json(403, { error: "Forbidden" }, origin);
  }

  let messages, clientHasLead = false;
  try { const b = JSON.parse(event.body || "{}"); messages = b.messages; clientHasLead = b.leadCaptured === true; } catch { return json(400, { error: "Bad JSON" }, origin); }
  if (!Array.isArray(messages) || !messages.length) return json(400, { error: "messages[] required" }, origin);
  if (messages.length > 40) messages = messages.slice(-40);
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return json(400, { error: "Invalid message" }, origin);
    if (m.content.length > 4000) m.content = m.content.slice(0, 4000);
  }

  let reply, lead;
  try { ({ reply, lead } = await askClaude(messages)); }
  catch (e) {
    return json(200, { reply: "I'm having trouble connecting right now — please call or text Daniel at 214-836-1418 and he'll take great care of you.", leadCaptured: false, lead: null }, origin);
  }

  // Treat as a brand-new lead only the first time (the widget tells us if it
  // already handled one) — prevents duplicate alerts if the model re-mentions it.
  const newLead = lead && !clientHasLead;
  if (newLead) {
    const sms = `New lead — Elias Crew Co.\nName: ${lead.name || "(n/a)"}\nService: ${lead.service || "(n/a)"}\nCity: ${lead.city || "(n/a)"}\nContact: ${lead.contact || "(n/a)"}\n${lead.details ? "Project: " + lead.details + "\n" : ""}(picking a consult time next)`;
    const html = `<h2>New lead</h2><p><b>Name:</b> ${lead.name || "(n/a)"}<br><b>Service:</b> ${lead.service || "(n/a)"}<br><b>City:</b> ${lead.city || "(n/a)"}<br><b>Contact:</b> ${lead.contact || "(n/a)"}<br><b>Project:</b> ${lead.details || "(none)"}</p>`;
    await Promise.allSettled([sendSMS(sms), sendEmail(`New lead: ${lead.name || "visitor"} — ${lead.service || "inquiry"}`, html)]);
  }

  return json(200, { reply, leadCaptured: !!newLead, lead: newLead ? lead : null }, origin);
};
