// netlify/functions/availability.js
// GET -> { slots: [{ start, end, label }, ...] }  (next open phone-consult times)
// On any error it returns an empty list so the widget falls back gracefully.

const { getAccessToken, getBusy, computeSlots, cfg, json } = require("./lib/core.js");

exports.handler = async (event) => {
  const origin = process.env.ALLOWED_ORIGIN || "*";
  if (event.httpMethod === "OPTIONS") return json(200, {}, origin);
  try {
    const token = await getAccessToken();
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + (cfg.windowDays + 2) * 86400000).toISOString();
    const busy = await getBusy(token, timeMin, timeMax);
    return json(200, { slots: computeSlots(busy) }, origin);
  } catch (e) {
    console.error("availability error:", e.message);
    return json(200, { slots: [], error: "unavailable" }, origin);
  }
};
