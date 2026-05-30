// netlify/functions/lib/store.js
// Per-user conversation memory for Messenger (keyed by Page-Scoped ID).
// Uses Netlify Blobs when available; falls back to in-memory so it never crashes.

let blobs = null;
try { blobs = require("@netlify/blobs"); } catch (e) { /* not installed locally — fine */ }
const mem = new Map();

function store() {
  if (!blobs) return null;
  try { return blobs.getStore("elias-messenger"); } catch (e) { return null; }
}

async function loadState(psid) {
  const s = store();
  if (s) { try { const v = await s.get(psid, { type: "json" }); if (v) return v; } catch (e) { console.error("blob get", e.message); } }
  return mem.get(psid) || null;
}
async function saveState(psid, state) {
  const s = store();
  if (s) { try { await s.setJSON(psid, state); return; } catch (e) { console.error("blob set", e.message); } }
  mem.set(psid, state);
}
module.exports = { loadState, saveState };
