// netlify/functions/submission-created.js — runs automatically on every
// Netlify Forms submission (e.g. the "estimate-request" form on the homepage)
// and emails the details to Daniel (LEAD_EMAIL) via Resend.

const { sendEmail } = require("./lib/core.js");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SKIP = new Set(["bot-field", "form-name", "ip", "user_agent", "referrer"]);

exports.handler = async (event) => {
  let payload;
  try { payload = JSON.parse(event.body || "{}").payload || {}; } catch { return { statusCode: 400, body: "Bad JSON" }; }
  const data = payload.data || {};
  if (data["bot-field"]) return { statusCode: 200, body: "ignored" };

  const rows = Object.entries(data).filter(([k, v]) => !SKIP.has(k) && v !== "" && v != null)
    .map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join("<br>");
  const who = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.name || payload.email || "website visitor";
  const subject = `New estimate request: ${who}`;
  const html = `<h2>New estimate request</h2><p>${rows || "(no fields)"}</p><p style="color:#888">Form: ${esc(payload.form_name || "")}</p>`;

  const ok = await sendEmail(subject, html);
  if (!ok) console.error("Estimate email not sent — check RESEND_API_KEY / LEAD_EMAIL");
  return { statusCode: 200, body: ok ? "sent" : "not sent" };
};
