// netlify/functions/book.js — website widget booking endpoint.
// POST { slot:{start,end}, lead:{...} } -> { ok:true, label, meetLink } | { ok:false, reason } | { ok:false }

const { getAccessToken, bookSlot, json } = require("./lib/core.js");

exports.handler = async (event) => {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  if (event.httpMethod === "OPTIONS") return json(200, {}, origin);
  if (event.httpMethod !== "POST") return json(405, { ok: false }, origin);

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { ok: false, error: "bad json" }, origin); }
  const slot = body.slot || {};
  if (!slot.start || !slot.end) return json(400, { ok: false, error: "slot required" }, origin);

  try {
    const token = await getAccessToken();
    const result = await bookSlot(token, slot, body.lead || {}, { source: "website chatbot" });
    return json(200, result, origin);
  } catch (e) {
    console.error("book error:", e.message);
    return json(200, { ok: false, error: "failed" }, origin);
  }
};
