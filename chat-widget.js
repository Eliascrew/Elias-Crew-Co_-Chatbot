// chat-widget.js — Elias Crew Co. drop-in chatbot with live appointment booking
// Embed with ONE line before </body>:
//   <script src="/chat-widget.js" defer></script>
// Talks to /.netlify/functions/{chat,availability,book} by default.
// Override base path with window.ELIAS_CHAT_ENDPOINT before this script loads.

(function () {
  const ENDPOINT = window.ELIAS_CHAT_ENDPOINT || "/.netlify/functions/chat";
  const BASE = ENDPOINT.replace(/\/[^/]*$/, "");
  const AVAIL = window.ELIAS_AVAIL_ENDPOINT || BASE + "/availability";
  const BOOK = window.ELIAS_BOOK_ENDPOINT || BASE + "/book";

  const GREETING = "Hey there! \uD83D\uDC4B I'm the Elias Crew Co. assistant. Whether you're thinking fence, deck, pergola, or a full remodel, I can answer questions and set up a free consult with Daniel. What's on your mind?";
  const STARTERS = ["\uD83D\uDCB0 What does a fence cost?", "\uD83D\uDCCD Do you serve Frisco?", "\uD83C\uDF73 Kitchen remodel info", "\uD83D\uDCC5 Book a free consult"];

  if (!document.getElementById("elias-chat-fonts")) {
    const f = document.createElement("link");
    f.id = "elias-chat-fonts"; f.rel = "stylesheet";
    f.href = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&display=swap";
    document.head.appendChild(f);
  }

  const host = document.createElement("div");
  host.id = "elias-chat-widget";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
<style>
  :host{ all:initial; }
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Hanken Grotesk',sans-serif}
  :host{
    --espresso:#241c16;--espresso-soft:#33281f;--cream:#f4efe6;--paper:#fff;--panel:#faf6ef;
    --amber:#cf7a33;--amber-deep:#b5612b;--forest:#1f3a2e;--ink:#2b231c;--muted:#8a7d6e;--line:#e7ddcd;
    --shadow:0 24px 60px -18px rgba(36,28,22,.35);--shadow-sm:0 8px 24px -10px rgba(36,28,22,.28);
  }
  .launcher{position:fixed;right:24px;bottom:24px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:12px}
  .nudge{background:var(--paper);border:1px solid var(--line);box-shadow:var(--shadow);border-radius:16px 16px 4px 16px;padding:13px 16px;max-width:255px;font-size:14px;color:var(--ink);line-height:1.4;font-weight:500;cursor:pointer;animation:pop .5s .9s both}
  .nudge b{font-weight:700}.nudge .x{float:right;margin-left:10px;color:var(--muted);font-weight:700}
  .fab{width:64px;height:64px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(150deg,var(--amber),var(--amber-deep));box-shadow:0 14px 30px -8px rgba(181,97,43,.6);display:grid;place-items:center;transition:transform .25s cubic-bezier(.34,1.56,.64,1);position:relative}
  .fab:hover{transform:scale(1.07) rotate(-4deg)}.fab svg{width:30px;height:30px}
  .fab .dot{position:absolute;top:4px;right:4px;width:14px;height:14px;border-radius:50%;background:#e64a4a;border:2.5px solid var(--cream);animation:ping 1.6s infinite}
  .scrim{position:fixed;inset:0;background:rgba(36,28,22,.28);z-index:2147483000;opacity:0;pointer-events:none;transition:opacity .3s}
  .scrim.on{opacity:1;pointer-events:auto}
  .chat{position:fixed;right:24px;bottom:24px;z-index:2147483001;width:min(404px,calc(100vw - 28px));height:min(640px,calc(100vh - 40px));background:var(--panel);border-radius:24px;box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column;transform-origin:bottom right;transform:scale(.6) translateY(30px);opacity:0;pointer-events:none;transition:transform .34s cubic-bezier(.34,1.3,.5,1),opacity .26s;border:1px solid rgba(255,255,255,.6)}
  .chat.open{transform:scale(1) translateY(0);opacity:1;pointer-events:auto}
  .chead{background:linear-gradient(165deg,var(--espresso),var(--espresso-soft));color:#fff;padding:18px;display:flex;align-items:center;gap:13px}
  .mark{width:42px;height:42px;border-radius:11px;background:var(--amber);display:grid;place-items:center;flex-shrink:0}.mark svg{width:24px;height:24px}
  .who b{font-family:'Bricolage Grotesque';font-weight:700;font-size:17px;display:block}
  .who span{font-size:12px;opacity:.72;display:flex;align-items:center;gap:6px;margin-top:1px;font-weight:500}
  .live{width:7px;height:7px;border-radius:50%;background:#5ad07a;animation:ping 2s infinite}
  .close{margin-left:auto;width:34px;height:34px;border-radius:9px;border:none;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;display:grid;place-items:center}
  .close:hover{background:rgba(255,255,255,.22)}.close svg{width:18px;height:18px}
  .msgs{flex:1;overflow-y:auto;padding:20px 18px 8px;display:flex;flex-direction:column;gap:13px}
  .msgs::-webkit-scrollbar{width:7px}.msgs::-webkit-scrollbar-thumb{background:var(--cream);border-radius:10px}
  .row{display:flex;gap:9px;max-width:88%;animation:rise .35s both}.row.bot{align-self:flex-start}.row.me{align-self:flex-end;flex-direction:row-reverse}
  .av{width:30px;height:30px;border-radius:9px;flex-shrink:0;display:grid;place-items:center;background:var(--espresso)}.av svg{width:17px;height:17px}
  .bubble{padding:11px 14px;border-radius:16px;font-size:15px;line-height:1.46}
  .bot .bubble{background:var(--paper);border:1px solid var(--line);border-bottom-left-radius:5px;color:var(--ink)}
  .me .bubble{background:linear-gradient(160deg,var(--amber),var(--amber-deep));color:#fff;border-bottom-right-radius:5px;box-shadow:var(--shadow-sm)}
  .bubble b{font-weight:700}
  .typing{display:flex;gap:4px;padding:3px 1px;align-items:center}.typing span{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:blink 1.3s infinite}
  .typing span:nth-child(2){animation-delay:.2s}.typing span:nth-child(3){animation-delay:.4s}
  .slots{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
  .slot{background:var(--cream);border:1px solid var(--line);color:var(--espresso);font-weight:600;font-size:13px;padding:9px 12px;border-radius:11px;cursor:pointer;transition:.16s}
  .slot:hover{border-color:var(--amber);color:var(--amber-deep);background:#fff}
  .slot:disabled{opacity:.4;cursor:default}
  .chips{display:flex;flex-wrap:wrap;gap:7px;padding:0 18px 12px}
  .chip{background:var(--paper);border:1px solid var(--line);color:var(--espresso-soft);font-weight:600;font-size:13px;padding:8px 13px;border-radius:100px;cursor:pointer;transition:.18s}
  .chip:hover{border-color:var(--amber);color:var(--amber-deep);transform:translateY(-1px)}
  .composer{padding:12px 14px 16px;border-top:1px solid var(--line);background:var(--panel)}
  .inwrap{display:flex;align-items:flex-end;gap:9px;background:var(--paper);border:1.5px solid var(--line);border-radius:16px;padding:6px 6px 6px 15px;transition:border-color .2s}
  .inwrap:focus-within{border-color:var(--amber)}
  .inwrap textarea{flex:1;border:none;outline:none;resize:none;font-size:15px;line-height:1.4;max-height:96px;background:transparent;color:var(--ink);padding:6px 0}
  .send{width:40px;height:40px;border-radius:12px;border:none;cursor:pointer;background:linear-gradient(150deg,var(--amber),var(--amber-deep));display:grid;place-items:center;flex-shrink:0;transition:.2s}
  .send:hover{transform:scale(1.06)}.send:disabled{opacity:.4;cursor:default;transform:none}.send svg{width:19px;height:19px}
  .foot{text-align:center;font-size:11px;color:var(--muted);margin-top:9px;font-weight:500}
  .toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,80px);z-index:2147483002;background:var(--forest);color:#fff;padding:13px 20px;border-radius:13px;box-shadow:var(--shadow);font-weight:600;font-size:14px;display:flex;align-items:center;gap:10px;opacity:0;transition:.4s cubic-bezier(.34,1.4,.6,1)}
  .toast.on{transform:translate(-50%,0);opacity:1}.toast svg{width:20px;height:20px}
  @keyframes pop{from{opacity:0;transform:scale(.8) translateY(8px)}to{opacity:1;transform:none}}
  @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes blink{0%,60%,100%{opacity:.25}30%{opacity:1}}
  @keyframes ping{0%{box-shadow:0 0 0 0 rgba(90,208,122,.55)}70%{box-shadow:0 0 0 7px rgba(90,208,122,0)}100%{box-shadow:0 0 0 0 rgba(90,208,122,0)}}
</style>

<div class="launcher" id="launcher">
  <div class="nudge" id="nudge"><span class="x" id="nudgeX">\u2715</span><b>\uD83D\uDC4B Need a quote?</b><br>Ask me anything — I can book your free consult.</div>
  <button class="fab" id="fab" aria-label="Open chat"><span class="dot"></span>
    <svg viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4 9.6 9.6 0 0 1-4-.9L3 20.5l1.5-5a8.4 8.4 0 0 1-.9-4A8.38 8.38 0 0 1 12 3a8.38 8.38 0 0 1 9 8.5Z" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
</div>

<div class="scrim" id="scrim"></div>

<div class="chat" id="chat">
  <div class="chead">
    <div class="mark"><svg viewBox="0 0 24 24" fill="none"><path d="M3 11.5 12 4l9 7.5M5 10v9h14v-9M9.5 19v-5h5v5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <div class="who"><b>Elias Crew Co.</b><span><span class="live"></span> Online · replies instantly</span></div>
    <button class="close" id="close"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg></button>
  </div>
  <div class="msgs" id="msgs"></div>
  <div class="chips" id="chips"></div>
  <div class="composer">
    <div class="inwrap"><textarea id="input" rows="1" placeholder="Type your message…"></textarea>
      <button class="send" id="send" aria-label="Send"><svg viewBox="0 0 24 24" fill="none"><path d="M4 12l16-8-6 16-3-7-7-1Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg></button>
    </div>
    <div class="foot">AI assistant · For urgent help call 214-836-1418</div>
  </div>
</div>

<div class="toast" id="toast"><svg viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span id="toastText"></span></div>
`;

  const $ = (id) => root.getElementById(id);
  const msgs = $("msgs"), input = $("input"), chips = $("chips");
  const history = [];
  let busy = false, currentLead = null, booked = false, leadHandled = false;

  const botAv = '<div class="av"><svg viewBox="0 0 24 24" fill="none"><path d="M3 11.5 12 4l9 7.5M5 10v9h14v-9M9.5 19v-5h5v5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
  const scroll = () => requestAnimationFrame(() => (msgs.scrollTop = msgs.scrollHeight));

  function botSay(t) { const r = document.createElement("div"); r.className = "row bot"; r.innerHTML = botAv + '<div class="bubble">' + fmt(t) + "</div>"; msgs.appendChild(r); scroll(); }
  function meSay(t) { const r = document.createElement("div"); r.className = "row me"; r.innerHTML = '<div class="bubble">' + fmt(t) + "</div>"; msgs.appendChild(r); scroll(); }
  function showTyping() { const r = document.createElement("div"); r.className = "row bot"; r.id = "typing"; r.innerHTML = botAv + '<div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>'; msgs.appendChild(r); scroll(); }
  function hideTyping() { const t = $("typing"); if (t) t.remove(); }

  let toastTimer;
  function toast(text) { $("toastText").textContent = text; $("toast").classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("on"), 3500); }

  function renderChips() {
    chips.innerHTML = "";
    if (history.length) return;
    STARTERS.forEach((s) => { const c = document.createElement("button"); c.className = "chip"; c.textContent = s; c.onclick = () => send(s.replace(/^[^\w]+\s*/, "")); chips.appendChild(c); });
  }

  function openChat() {
    $("chat").classList.add("open"); $("scrim").classList.add("on"); $("launcher").style.display = "none"; input.focus();
    if (!msgs.dataset.init) { msgs.dataset.init = "1"; botSay(GREETING); renderChips(); }
  }
  function closeChat() { $("chat").classList.remove("open"); $("scrim").classList.remove("on"); $("launcher").style.display = "flex"; }

  $("fab").onclick = openChat; $("nudge").onclick = openChat; $("close").onclick = closeChat; $("scrim").onclick = closeChat;
  $("nudgeX").onclick = (e) => { e.stopPropagation(); $("nudge").style.display = "none"; };
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 96) + "px"; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  $("send").onclick = () => send();

  // ----- chat -----
  async function send(forced) {
    const text = (forced || input.value).trim();
    if (!text || busy) return;
    input.value = ""; input.style.height = "auto";
    meSay(text); history.push({ role: "user", content: text }); chips.innerHTML = "";
    busy = true; $("send").disabled = true; showTyping();
    try {
      const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history, leadCaptured: leadHandled }) });
      const data = await res.json();
      const reply = (data.reply || "").trim() || "Sorry, I hit a snag. You can reach Daniel at 214-836-1418.";
      history.push({ role: "assistant", content: reply });
      hideTyping(); botSay(reply);
      if (data.leadCaptured && data.lead && !leadHandled && !booked) { currentLead = data.lead; leadHandled = true; offerSlots(); }
    } catch (e) {
      hideTyping();
      botSay("I'm having trouble connecting — please call or text Daniel at **214-836-1418** and he'll take great care of you.");
    }
    busy = false; $("send").disabled = false; input.focus();
  }

  // ----- live booking -----
  async function offerSlots() {
    showTyping();
    try {
      const res = await fetch(AVAIL);
      const data = await res.json();
      hideTyping();
      if (data.slots && data.slots.length) renderSlots(data.slots);
      else botSay("Daniel will reach out shortly" + (currentLead && currentLead.contact ? " at " + currentLead.contact : "") + " to set up your free consult. Prefer now? Call or text **214-836-1418**.");
    } catch (e) {
      hideTyping();
      botSay("Daniel will reach out shortly to set up your free consult. You can also call or text **214-836-1418**.");
    }
  }

  function renderSlots(slots) {
    const r = document.createElement("div"); r.className = "row bot";
    const bubble = document.createElement("div"); bubble.className = "bubble";
    bubble.innerHTML = "Pick a time for your free phone consult with Daniel:";
    const sl = document.createElement("div"); sl.className = "slots";
    slots.forEach((s) => { const b = document.createElement("button"); b.className = "slot"; b.textContent = s.label; b.onclick = () => book(s, sl); sl.appendChild(b); });
    bubble.appendChild(sl);
    r.innerHTML = botAv; r.appendChild(bubble);
    msgs.appendChild(r); scroll();
  }

  async function book(slot, slEl) {
    if (booked) return;
    [...slEl.querySelectorAll(".slot")].forEach((b) => (b.disabled = true));
    showTyping();
    try {
      const res = await fetch(BOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, lead: currentLead }) });
      const data = await res.json();
      hideTyping();
      if (data.ok) {
        booked = true;
        botSay(`\u2705 You're all set for **${data.label}**. Daniel will call you then${currentLead && currentLead.contact ? " at " + currentLead.contact : ""} — talk soon!` + (data.meetLink ? `\nVideo link: ${data.meetLink}` : ""));
        toast("\u2713 Consult booked");
      } else if (data.reason === "taken") {
        botSay("Ah, that time just got taken — here are fresh openings:");
        offerSlots();
      } else {
        botSay("I couldn't lock that in just now — please call or text Daniel at **214-836-1418** and he'll get you scheduled.");
      }
    } catch (e) {
      hideTyping();
      botSay("I couldn't lock that in — please call or text Daniel at **214-836-1418**.");
    }
  }
})();
