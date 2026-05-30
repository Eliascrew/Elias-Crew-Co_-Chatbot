// netlify/functions/send-reminders.js
// Scheduled function (runs every 15 min). Finds chatbot-booked consults that
// start within the reminder window and haven't been reminded yet, texts/emails
// the customer a heads-up, then marks the event so it never double-sends.

const { getAccessToken, listEvents, patchEvent, sendSMSTo, sendEmailTo, labelSlot, timeLabel, cfg } = require("./lib/core.js");

const REMIND_MIN = +(process.env.REMINDER_LEAD_MINUTES || 120); // remind ~2h before

exports.handler = async () => {
  try {
    const token = await getAccessToken();
    const now = Date.now();
    // Look at events from now out to a bit past the reminder window.
    const timeMin = new Date(now).toISOString();
    const timeMax = new Date(now + (REMIND_MIN + 30) * 60000).toISOString();
    const events = await listEvents(token, timeMin, timeMax);

    let sent = 0;
    for (const ev of events) {
      const ep = (ev.extendedProperties && ev.extendedProperties.private) || {};
      if (ep.eliasBot !== "1" || ep.reminded === "1") continue;
      const startMs = Date.parse(ev.start && (ev.start.dateTime || ev.start.date));
      if (isNaN(startMs)) continue;
      const minsUntil = (startMs - now) / 60000;
      if (minsUntil <= 0 || minsUntil > REMIND_MIN) continue; // only inside the window

      const first = (ep.custName || "").trim().split(/\s+/)[0] || "there";
      const when = labelSlot(new Date(startMs), cfg.tz);
      const at = timeLabel(new Date(startMs), cfg.tz);
      const sms = `Hi ${first}, a reminder: your free phone consult with Elias Crew Co. is today at ${at}. Daniel will call you then. Need to change it? Call/text 214-836-1418.`;
      const html = `<p>Hi ${first},</p><p>Friendly reminder — your free phone consult with <b>Elias Crew Co.</b> is coming up:</p><p><b>${when}</b></p><p>Daniel will call you then. Need to reschedule? Call or text <b>214-836-1418</b>.</p>`;

      const tasks = [];
      if (ep.custPhone) tasks.push(sendSMSTo(ep.custPhone, sms));
      if (ep.custEmail) tasks.push(sendEmailTo(ep.custEmail, `Reminder: your consult today at ${at}`, html));
      if (!tasks.length) continue;

      const results = await Promise.allSettled(tasks);
      const anyOk = results.some((r) => r.status === "fulfilled" && r.value);
      if (anyOk) {
        // mark reminded so we never send twice
        ep.reminded = "1";
        await patchEvent(token, ev.id, { extendedProperties: { private: ep } });
        sent++;
      }
    }
    console.log(`reminders: checked ${events.length}, sent ${sent}`);
    return { statusCode: 200, body: JSON.stringify({ checked: events.length, sent }) };
  } catch (e) {
    console.error("reminder job error:", e.message);
    return { statusCode: 200, body: JSON.stringify({ error: e.message }) };
  }
};

// Netlify scheduled-function config: run every 15 minutes.
exports.config = { schedule: "*/15 * * * *" };
