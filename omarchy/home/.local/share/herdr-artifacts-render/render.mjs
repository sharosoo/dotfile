// Renders Artifact Hub documents exactly as the web shows them (openui, mermaid, charts, ::: layouts)
// into PNG tiles for the herdr-app Artifacts panel, which has no web view.
// Runs as a loopback service (herdr-artifacts-render.service) so Chromium stays warm: a cold launch
// per document cost ~5s, a warm page costs well under one.
// Every call is POST with a JSON body (see refused()):
//   /render {id, v, w, z, scheme: "dark"|"light", prefetch?: true}
//     → {"key","tiles":[{"path","height"}],"width","zoom","done","images"}
//   w is the width the panel draws the page at; z its zoom: the page is laid out for a w / z wide window and
//   shot at 2 × z device pixels per CSS pixel, so text comes out z times its web size, still at 2× sharpness.
//   Heights and picture boxes are in panel pixels (CSS px × z).
//   images (once done): [{x,y,w,h, nw,nh (natural px), alt, path}], so the panel can open a picture larger.
//   prefetch queues the page behind everything the panel asked for itself.
//   /cancel-prefetch {} drops prefetches that haven't started; the panel calls it when a document is opened.
//   /touch {key} marks a cached page used; the panel calls it when it shows a page it read from disk itself.
// Tiles and pictures are cached per id/version/width/zoom/scheme under herdr-app's own folder (it loads images
// only from there); a cached page is answered from disk without starting Chromium.
import { chromium } from "playwright-core";
import { mkdir, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.HERDR_ARTIFACTS_RENDER_PORT ?? 47824);
const HUB = "https://artifact.sharosoo.com";
const APP = join(homedir(), ".config", "herdr-app");
// Chromium caps one screenshot texture; slices also keep each image the panel decodes small.
const TILE = 1600;

async function token() {
  const cfg = JSON.parse(await readFile(join(homedir(), ".omp/agent/mcp.json"), "utf8"));
  const find = (o) => o && typeof o === "object" ? (o["artifact-hub"] ?? Object.values(o).map(find).find(Boolean)) : null;
  const auth = find(cfg)?.headers?.Authorization;
  if (!auth) throw new Error("artifact-hub token not found in ~/.omp/agent/mcp.json");
  return auth;
}

let browserP = null;
function browser() {
  browserP ??= chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--headless=new", "--ozone-platform=headless"] })
    .then((b) => { b.on("disconnected", () => { browserP = null; }); return b; }, (e) => { browserP = null; throw e; });
  return browserP;
}

// One job per document: tiles appear as they are shot, so the panel can show the top while the rest renders.
// job = { tiles, width, done, error, first: Promise resolved after the first tile (or failure) }
const jobs = new Map();
// A finished job only answers the polls still in flight; after that the manifest on disk serves the page.
const JOB_KEEP_MS = 60 * 1000;
// Pages open at once are capped. What the panel asked for itself never waits behind prefetches: it has its own
// MAX_PAGES, and prefetches only use what it leaves idle, at most MAX_PREFETCH_PAGES of it.
const MAX_PAGES = 3;
const MAX_PREFETCH_PAGES = 2;
const lanes = { fg: 0, bg: 0 };
const urgent = [], later = [];
function pump() {
  const grant = (w, lane) => { lanes[lane]++; w.job.waiter = null; w.job.lane = lane; w.resolve(); };
  while (urgent.length && lanes.fg < MAX_PAGES) grant(urgent.shift(), "fg");
  while (later.length && lanes.bg < MAX_PREFETCH_PAGES && lanes.fg + lanes.bg < MAX_PAGES) grant(later.shift(), "bg");
}
const slot = (job) => new Promise((resolve, reject) => {
  job.waiter = { resolve, reject, job };
  (job.prefetch ? later : urgent).push(job.waiter);
  pump();
});
const release = (job) => { lanes[job.lane]--; pump(); };

function start(id, version, width, zoom, scheme, prefetch) {
  const key = `${id}-v${version}-${width}-z${Math.round(zoom * 100)}-${scheme}`;
  let job = jobs.get(key);
  if (job && !job.error) {
    // Asked for in earnest while still queued as a prefetch: move it to the front.
    if (!prefetch && job.prefetch) {
      job.prefetch = false;
      const i = later.indexOf(job.waiter);
      if (i >= 0) { urgent.push(...later.splice(i, 1)); pump(); }
    }
    return job;
  }
  let firstDone;
  job = { key, tiles: [], images: [], width, zoom, done: false, error: null, prefetch, waiter: null, first: new Promise((r) => { firstDone = r; }) };
  jobs.set(key, job);
  render(job, key, id, version, width, zoom, scheme)
    .catch((e) => { job.error = String(e?.message ?? e); })
    .finally(() => {
      job.done = !job.error; firstDone();
      setTimeout(() => { if (jobs.get(key) === job) jobs.delete(key); }, job.error ? 0 : JOB_KEEP_MS);
      if (job.done) evict().catch(() => {});
    });
  job.markFirst = firstDone;
  return job;
}

function cancelPrefetches() {
  const dropped = later.splice(0);
  for (const w of dropped) { w.job.waiter = null; w.reject(new Error("prefetch cancelled")); }
  return dropped.length;
}

// The cache keeps the most recently used pages up to CACHE_BYTES. A use is a render, a cache hit or a
// POST /touch from the panel when it shows a page it read from disk itself. Pages with a job (rendering, or
// polled within JOB_KEEP_MS), used within IN_USE_MS, or among the KEEP_RECENT newest are never removed, so a
// panel never loses the page it shows, however large; a folder left without a manifest by a failed render is.
const CACHE = join(APP, "data", "artifacts-cache");
const CACHE_BYTES = 300 * 1024 * 1024;
const KEEP_RECENT = 6;
const IN_USE_MS = 10 * 60 * 1000;
const KEY = /^[a-z0-9]+-v\d+-\d+-z\d+-(dark|light)$/;
async function evict() {
  const entries = [];
  for (const name of await readdir(CACHE).catch(() => [])) {
    const dir = join(CACHE, name);
    let bytes = 0, used = 0;
    for (const f of await readdir(dir).catch(() => [])) {
      const s = await stat(join(dir, f)).catch(() => null);
      if (!s) continue;
      bytes += s.size;
      if (f === "manifest.json") used = s.mtimeMs;
    }
    entries.push({ name, dir, bytes, used });
  }
  entries.sort((a, b) => b.used - a.used);
  let total = 0;
  const removals = [];
  entries.forEach((e, i) => {
    total += e.bytes;
    if (jobs.has(e.name) || (e.used && (i < KEEP_RECENT || Date.now() - e.used < IN_USE_MS))) return;
    if (!e.used || total > CACHE_BYTES) removals.push(rm(e.dir, { recursive: true, force: true }));
  });
  await Promise.all(removals);
}

async function render(job, key, id, version, width, zoom, scheme) {
  const rel = join("data", "artifacts-cache", key);
  const dir = join(APP, rel);
  // A manifest from before pictures were recorded has no images list; render that page again.
  try {
    const m = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    if (Array.isArray(m.images)) {
      Object.assign(job, m);
      const now = new Date();
      await utimes(join(dir, "manifest.json"), now, now).catch(() => {});
      return;
    }
  } catch {}

  // /open checks the token on the app origin and redirects to the content origin with a short-lived signed URL.
  const open = await fetch(`${HUB}/a/${id}/open?bare=1&v=${version}`, { headers: { Authorization: await token() }, redirect: "manual" });
  const target = open.headers.get("location");
  if (!target) throw new Error(`open failed: HTTP ${open.status}`);

  await slot(job);
  // The page lays out for a window 1/zoom as wide as the panel draws it, so it reflows as on that wider window.
  const css = Math.round(width / zoom);
  let ctx;
  try {
    ctx = await (await browser()).newContext({ viewport: { width: css, height: 900 }, deviceScaleFactor: 2 * zoom, colorScheme: scheme });
    const page = await ctx.newPage();
    // Picture bytes come only from what the page itself loaded, never from a request of our own: an image
    // address in a document can't make this service reach anywhere the page didn't.
    const loaded = new Map();
    page.on("response", (r) => {
      if (r.request().resourceType() !== "image") return;
      for (let q = r.request(); q; q = q.redirectedFrom()) loaded.set(q.url(), r);
    });
    await page.goto(new URL(target, HUB).href, { waitUntil: "load", timeout: 30000 });
    // openui blocks show SSR HTML until their component chunks load and React hydrates them
    // (data-openui-hydrated); mermaid and charts draw after load too. Wait for those, not a fixed delay.
    await page.evaluate(async () => {
      await document.fonts.ready;
      const pending = () =>
        document.querySelectorAll(".ah-ui[data-openui-program]:not([data-openui-hydrated])").length +
        document.querySelectorAll("pre.mermaid:not([data-processed]), .mermaid:not(:has(svg))").length;
      for (let i = 0; i < 160 && pending(); i++) await new Promise((r) => setTimeout(r, 50));
    });
    // networkidle never settles on pages with live queries; wait for images instead.
    await page.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); }))));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    await page.setViewportSize({ width: css, height: Math.min(height, 16000) });
    await mkdir(dir, { recursive: true, mode: 0o700 });
    // Tile edges in panel pixels come from the CSS edges, so rounding never adds up along the page.
    const at = (y) => Math.round(y * zoom);
    for (let y = 0, i = 0; y < height; y += TILE, i++) {
      const h = Math.min(TILE, height - y);
      // JPEG encodes several times faster than PNG at this size; at 2x the text stays sharp.
      const name = `${String(i).padStart(3, "0")}.jpg`;
      await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 88, clip: { x: 0, y, width: css, height: h }, fullPage: true });
      job.tiles.push({ path: join(rel, name), height: at(y + h) - at(y) });
      if (i === 0) job.markFirst();
    }
    job.images = await pictures(page, loaded, dir, rel, zoom);
    await writeFile(join(dir, "manifest.json"), JSON.stringify({ tiles: job.tiles, width, zoom, images: job.images }), { mode: 0o600 });
  } finally {
    await ctx?.close();
    release(job);
  }
}

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };
const MAX_PICTURE = 20 * 1024 * 1024;
const MAX_PICTURES = 40;
const MAX_PAGE_PICTURES = 80 * 1024 * 1024;
const MAX_SIDE = 8000;
// Device pixels a picture shot from the page may cover (about 32 megapixels, ~128 MB decoded).
const MAX_CROP_AREA = 32_000_000;

// The original bytes of one picture: a data: address decoded (its length checked first), or the body of the
// response the page received for it. null when unavailable, too large or not an image format the panel draws.
async function original(src, loaded, budget) {
  const data = /^data:([^;,]+)(;base64)?,/.exec(src.slice(0, 200));
  if (data) {
    const ext = EXT[data[1].toLowerCase()], body = src.slice(data[0].length);
    if (!ext || (data[2] ? body.length * 3 / 4 : body.length) > Math.min(MAX_PICTURE, budget)) return null;
    return { ext, bytes: data[2] ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body)) };
  }
  const r = loaded.get(src);
  if (!r || !r.ok()) return null;
  const h = r.headers(), ext = EXT[(h["content-type"] ?? "").split(";")[0].trim().toLowerCase()];
  // With a content coding the body Chromium hands over is decoded and its size unknown until read.
  if (!ext || (h["content-encoding"] && h["content-encoding"] !== "identity")) return null;
  const cap = Math.min(MAX_PICTURE, budget);
  const size = h["content-length"] != null ? Number(h["content-length"]) : (await r.request().sizes()).responseBodySize;
  if (!(size >= 0) || size > cap) return null;
  const bytes = await r.body();
  return bytes.length <= cap ? { ext, bytes } : null;
}

// The page's pictures (at most MAX_PICTURES files, MAX_PAGE_PICTURES bytes): where each sits, in panel
// pixels, and its file. A picture whose original isn't available, is too large or is over MAX_SIDE on a side
// is shot from the page instead, at its shown size (2 × zoom device pixels per CSS pixel).
async function pictures(page, loaded, dir, rel, zoom) {
  const found = await page.evaluate(() => [...document.images].map((img) => {
    const r = img.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, nw: img.naturalWidth, nh: img.naturalHeight, alt: img.alt || "", src: img.currentSrc || img.src };
  }).filter((p) => p.w >= 32 && p.h >= 32 && p.nw > 0 && p.nh > 0 && p.src));
  const bySrc = new Map(), out = [];
  let budget = MAX_PAGE_PICTURES;
  for (const p of found) {
    let pic = bySrc.get(p.src);
    if (pic === null) continue;
    if (!pic) {
      if (bySrc.size >= MAX_PICTURES) break;
      const n = String(bySrc.size).padStart(3, "0");
      const o = p.nw <= MAX_SIDE && p.nh <= MAX_SIDE ? await original(p.src, loaded, budget).catch(() => null) : null;
      let name, nw = p.nw, nh = p.nh;
      if (o) {
        name = `img-${n}.${o.ext}`;
        budget -= o.bytes.length;
        await writeFile(join(dir, name), o.bytes, { mode: 0o600 });
      } else {
        nw = Math.round(p.w * 2 * zoom); nh = Math.round(p.h * 2 * zoom);
        // Too large to shoot: the picture stays part of the page, just not openable.
        if (nw > MAX_SIDE || nh > MAX_SIDE || nw * nh > MAX_CROP_AREA) { bySrc.set(p.src, null); continue; }
        name = `img-${n}.jpg`;
        await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 90, clip: { x: p.x, y: p.y, width: p.w, height: p.h }, fullPage: true });
      }
      pic = { path: join(rel, name), nw, nh };
      bySrc.set(p.src, pic);
    }
    const at = (v) => Math.round(v * zoom);
    out.push({ x: at(p.x), y: at(p.y), w: at(p.w), h: at(p.h), nw: pic.nw, nh: pic.nh, alt: p.alt, path: pic.path });
  }
  return out;
}

// Only the panel may call: a web page in any browser on this machine could otherwise reach 127.0.0.1 and make
// the service render or cancel (a request from a page carries Origin or Sec-Fetch-Site, or a foreign Host
// through DNS rebinding). Calls that change anything are POST with a JSON body, which a page can't send
// without a CORS preflight this service never answers.
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
function refused(req) {
  const site = req.headers.get("sec-fetch-site");
  if (req.headers.has("origin") || (site != null && site !== "none") || !HOSTS.has(req.headers.get("host") ?? "")) {
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return new Response("application/json only", { status: 415 });
  }
  if (Number(req.headers.get("content-length") ?? 0) > 4096) return new Response("too large", { status: 413 });
  return null;
}

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  // A first tile can take longer than Bun's default 10 s idle limit while other widths render; the panel's
  // request would be cut off and look like the service had gone.
  idleTimeout: 120,
  maxRequestBodySize: 4096,
  async fetch(req) {
    const u = new URL(req.url);
    if (!["/render", "/cancel-prefetch", "/touch"].includes(u.pathname)) {
      const no = refused(req);
      return no?.status === 403 ? no : new Response("not found", { status: 404 });
    }
    const no = refused(req);
    if (no) return no;
    let b;
    try { b = JSON.parse((await req.text()) || "{}"); } catch { return Response.json({ error: "bad JSON" }, { status: 400 }); }
    if (!b || typeof b !== "object") return Response.json({ error: "bad JSON" }, { status: 400 });
    if (u.pathname === "/cancel-prefetch") return Response.json({ cancelled: cancelPrefetches() });
    if (u.pathname === "/touch") {
      const key = String(b.key ?? "");
      if (!KEY.test(key)) return Response.json({ error: "bad key" }, { status: 400 });
      const now = new Date();
      const touched = await utimes(join(CACHE, key, "manifest.json"), now, now).then(() => true, () => false);
      return Response.json({ touched });
    }
    const id = String(b.id ?? ""), version = String(b.v ?? "");
    if (!/^[a-z0-9]+$/.test(id) || !/^\d+$/.test(version)) return Response.json({ error: "id and v are required" }, { status: 400 });
    const width = Math.max(280, Math.min(1600, Math.round(Number(b.w)) || 480));
    // Twentieths, so a zoom keeps one cache folder however the panel spells it.
    const zoom = Math.max(0.5, Math.min(1.5, Math.round((Number(b.z) || 1) * 20) / 20));
    const scheme = b.scheme === "light" ? "light" : "dark";
    const prefetch = b.prefetch === true;
    const job = start(id, version, width, zoom, scheme, prefetch);
    if (prefetch) return Response.json({ queued: true });
    await job.first;
    if (job.error) return Response.json({ error: job.error }, { status: 502 });
    return Response.json({ key: job.key, tiles: job.tiles, width: job.width, zoom: job.zoom, done: job.done, images: job.images });
  },
});
console.log(`herdr-artifacts-render on 127.0.0.1:${PORT}`);
