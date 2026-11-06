// Renders Artifact Hub documents exactly as the web shows them (openui, mermaid, charts, ::: layouts)
// into PNG tiles for the herdr-app Artifacts panel, which has no web view.
// Runs as a loopback service (herdr-artifacts-render.service) so Chromium stays warm: a cold launch
// per document cost ~5s, a warm page costs well under one.
//   GET /render?id=&v=&w=&scheme=dark|light → {"tiles":[{"path","height"}],"width"}
// Tiles are cached per id/version/width/scheme under herdr-app's own folder (it loads images only from there).
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
// Prefetches must not starve the document the person just clicked; cap pages open at once.
const MAX_PAGES = 3;
let pages = 0;
const waiters = [];
const slot = () => pages < MAX_PAGES ? (pages++, Promise.resolve()) : new Promise((r) => waiters.push(r));
const release = () => { const next = waiters.shift(); if (next) next(); else pages--; };

function start(id, version, width, scheme) {
  const key = `${id}-v${version}-${width}-${scheme}`;
  let job = jobs.get(key);
  if (job && !job.error) return job;
  let firstDone;
  job = { tiles: [], width, done: false, error: null, first: new Promise((r) => { firstDone = r; }) };
  jobs.set(key, job);
  render(job, key, id, version, width, scheme)
    .catch((e) => { job.error = String(e?.message ?? e); })
    .finally(() => { job.done = !job.error; firstDone(); });
  job.markFirst = firstDone;
  return job;
}

async function render(job, key, id, version, width, scheme) {
  const rel = join("data", "artifacts-cache", key);
  const dir = join(APP, rel);
  try { Object.assign(job, JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"))); return; } catch {}

  // /open checks the token on the app origin and redirects to the content origin with a short-lived signed URL.
  const open = await fetch(`${HUB}/a/${id}/open?bare=1&v=${version}`, { headers: { Authorization: await token() }, redirect: "manual" });
  const target = open.headers.get("location");
  if (!target) throw new Error(`open failed: HTTP ${open.status}`);

  await slot();
  const ctx = await (await browser()).newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
  try {
    const page = await ctx.newPage();
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
    await page.setViewportSize({ width, height: Math.min(height, 16000) });
    await mkdir(dir, { recursive: true, mode: 0o700 });
    for (let y = 0, i = 0; y < height; y += TILE, i++) {
      const h = Math.min(TILE, height - y);
      // JPEG encodes several times faster than PNG at this size; at 2x the text stays sharp.
      const name = `${String(i).padStart(3, "0")}.jpg`;
      await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 88, clip: { x: 0, y, width, height: h }, fullPage: true });
      job.tiles.push({ path: join(rel, name), height: h });
      if (i === 0) job.markFirst();
    }
    await writeFile(join(dir, "manifest.json"), JSON.stringify({ tiles: job.tiles, width }), { mode: 0o600 });
  } finally {
    await ctx.close();
    release();
  }
}

Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  // A first tile can take longer than Bun's default 10 s idle limit while other widths render; the panel's
  // request would be cut off and look like the service had gone.
  idleTimeout: 120,
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname !== "/render") return new Response("not found", { status: 404 });
    const id = u.searchParams.get("id") ?? "", version = u.searchParams.get("v") ?? "";
    if (!/^[a-z0-9]+$/.test(id) || !/^\d+$/.test(version)) return Response.json({ error: "id and v are required" }, { status: 400 });
    const width = Math.max(280, Math.min(1600, Number(u.searchParams.get("w")) || 480));
    const scheme = u.searchParams.get("scheme") === "light" ? "light" : "dark";
    const job = start(id, version, width, scheme);
    if (u.searchParams.get("prefetch") === "1") return Response.json({ queued: true });
    await job.first;
    if (job.error) return Response.json({ error: job.error }, { status: 502 });
    return Response.json({ tiles: job.tiles, width: job.width, done: job.done });
  },
});
console.log(`herdr-artifacts-render on 127.0.0.1:${PORT}`);
