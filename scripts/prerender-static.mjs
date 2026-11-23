// Deploy-time step: bakes the reviews list and project gallery into the HTML so
// search engines and AI crawlers that don't run JavaScript still see them.
// reviews-data.js and gallery-data.js remain the only files to edit; the in-page
// scripts still run in the browser and re-render the same markup.
// This step never fails the deploy — if anything goes wrong, pages ship unchanged.
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function loadData(file, key) {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(file, "utf8"), sandbox, { timeout: 1000 });
  return String(sandbox.window[key] || "");
}

function inject(file, emptyTag, markup) {
  const html = readFileSync(file, "utf8");
  if (!markup || !html.includes(emptyTag)) return console.log(`prerender: ${file} skipped`);
  writeFileSync(file, html.replace(emptyTag, emptyTag.replace("></div>", ">" + markup + "</div>")));
  console.log(`prerender: ${file} updated`);
}

function reviewsMarkup() {
  return loadData("reviews-data.js", "REVIEWS")
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("//")) return "";
      const p = line.split("|");
      if (p.length < 4) return "";
      let n = parseInt((p[2] || "5").trim(), 10);
      if (isNaN(n) || n < 1) n = 5;
      if (n > 5) n = 5;
      const stars = "★".repeat(n) + "☆".repeat(5 - n);
      return `<div class="rev-l"><div class="stars">${stars}</div><p>"${esc(p.slice(3).join("|").trim())}"</p><div class="who">${esc(p[0].trim())}</div><div class="where">${esc(p[1].trim())}</div></div>`;
    })
    .join("");
}

function galleryMarkup() {
  return loadData("gallery-data.js", "GALLERY")
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t || t.startsWith("//")) return "";
      const p = line.split("|");
      if (p.length < 2) return "";
      const cat = (p[0] || "").trim(), src = (p[1] || "").trim(), cap = (p[2] || "").trim();
      if (!cat || !src) return "";
      const isVid = src.toLowerCase().startsWith("video:");
      const thumb = isVid ? `https://img.youtube.com/vi/${src.split(":")[1].trim()}/hqdefault.jpg` : `images/${src}`;
      return `<figure class="shot" data-cat="${esc(cat)}"><img loading="lazy" src="${esc(thumb)}" alt="${esc(cap)}"><span class="tag">${esc(cap)}</span></figure>`;
    })
    .join("");
}

for (const [file, tag, render] of [
  ["reviews.html", '<div class="rev-light" id="reviews"></div>', reviewsMarkup],
  ["our-work.html", '<div class="gallery" id="gallery"></div>', galleryMarkup],
]) {
  try {
    inject(file, tag, render());
  } catch (err) {
    console.warn(`prerender: ${file} left unchanged (${err.message})`);
  }
}
