// One headless Chromium shared by the herdr-app Browser panel and coding agents (herdr-browser.service).
//
//   127.0.0.1:9333   CDP for agents (omp `browser.open({ app: { cdp_url: "http://127.0.0.1:9333" } })`).
//                    A pass-through proxy in front of Chromium's own port: it is how the service learns which
//                    tab an agent navigates, clicks or types into (CDP never reports other clients' commands),
//                    so the panel can follow it and badge it.
//   127.0.0.1:47825  JSON API for the panel: GET /state, POST /open /tab /close /nav /viewport /input, GET /selection.
//
// Frames come from Page.startScreencast on the shown tab and land as JPEGs under herdr-app's mods/browser-frames/.
// They live under mods/ rather than data/ because herdr only drops a cached image when a file under mods/ changes:
// every frame gets a new name and old ones are deleted, which keeps the app's decoded-image cache bounded.
// The screencast runs only while the panel sends heartbeats (POST /viewport), so a hidden panel costs nothing.
import { chmod, mkdir, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

const HOME = homedir();
const APP = join(HOME, ".config", "herdr-app");
const FRAMES_REL = "mods/browser-frames";
const FRAMES = join(APP, FRAMES_REL);
const PROFILE = join(HOME, ".local", "share", "herdr-browser", "profile");
const API_PORT = Number(process.env.HERDR_BROWSER_API_PORT ?? 47825);
const CDP_PORT = Number(process.env.HERDR_BROWSER_CDP_PORT ?? 9333);
const CHROME_PORT = Number(process.env.HERDR_BROWSER_CHROME_PORT ?? 9334);
const CHROMIUM = process.env.HERDR_BROWSER_CHROMIUM ?? "/usr/bin/chromium";
// Frames go out at up to ~60 fps while the person interacts; this keeps about half a second of them.
const KEEP_FRAMES = 30;
// Watching an agent (nobody interacting) needs no more than ~10 fps; each frame costs the panel a decode.
const MIN_FRAME_MS = 100;
const HEARTBEAT_MS = 5000;

const output = async (cmd) => new Response(Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore" }).stdout).text();

// Frames at the monitor's scale stay sharp in the panel (Chromium lays out in CSS px either way), and pages see
// the monitor's real screen size instead of headless mode's 800x600.
async function monitor() {
  try {
    const list = JSON.parse(await output(["hyprctl", "monitors", "-j"]));
    const m = list.find((x) => x.focused) ?? list[0];
    if (m?.scale > 0 && m.width > 0) return { scale: Math.min(2, m.scale), width: m.width, height: m.height };
  } catch {}
  return { scale: 1, width: 1920, height: 1080 };
}

// Headless Chromium calls itself "HeadlessChrome" and leaves the high-entropy client hints empty; sites such as
// news.hada.io answer that with a block page, so present what desktop Chromium of the same version sends.
function identity(fullVersion, kernel) {
  const major = fullVersion.split(".")[0];
  // Chromium's GREASE brand for this major version (user_agent_utils.cc), so the brand list matches a real build.
  const chars = [" ", "(", ":", "-", ".", "/", ")", ";", "=", "?", "_"];
  const n = Number(major);
  const grease = { brand: `Not${chars[n % 11]}A${chars[(n + 1) % 11]}Brand`, version: ["8", "99", "24"][n % 3] };
  const brands = [grease, { brand: "Chromium", version: major }];
  if (n % 2) brands.reverse();
  const userAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  return {
    userAgent,
    // Also becomes navigator.languages, so plain tags; Chromium adds the q-values to the header itself.
    acceptLanguage: "ko-KR,ko,en-US,en",
    platform: "Linux x86_64",
    userAgentMetadata: {
      brands,
      fullVersionList: brands.map((b) => ({ brand: b.brand, version: b.brand === "Chromium" ? fullVersion : `${b.version}.0.0.0` })),
      fullVersion,
      platform: "Linux",
      platformVersion: kernel,
      architecture: "x86",
      model: "",
      mobile: false,
      bitness: "64",
      wow64: false,
    },
  };
}

const EXTENSIONS = join(HOME, ".local/share/herdr-browser/extensions");

// The load list is written by herdr-browser-sync: every extension to load (the person's own and Omarchy's,
// all copied into EXTENSIONS), one directory a line. Whatever loads here runs inside every logged-in page, so
// only a directory directly in EXTENSIONS, named like an extension id, owned by the person and holding a
// manifest is taken; anything else is skipped with a warning.
async function extensionDirs() {
  const path = join(EXTENSIONS, "load-list");
  const { statSync, realpathSync, existsSync } = await import("node:fs");
  if (!existsSync(path)) return "";
  const uid = process.getuid();
  const ls = statSync(path);
  if (ls.uid !== uid || ls.mode & 0o077) {
    console.warn(`extensions: ignoring ${path}: it must be the person's own file, readable by nobody else`);
    return "";
  }
  const root = realpathSync(EXTENSIONS);
  const dirs = [];
  for (const line of (await Bun.file(path).text()).split("\n").map((l) => l.trim()).filter(Boolean)) {
    try {
      const real = realpathSync(line);
      const st = statSync(real);
      if (dirname(real) === root && /^[a-p]{32}$/.test(basename(real)) && st.isDirectory() && st.uid === uid && existsSync(join(real, "manifest.json"))) {
        dirs.push(real);
        continue;
      }
    } catch {}
    console.warn(`extensions: skipping ${JSON.stringify(line)}: not an extension directory in ${EXTENSIONS}`);
  }
  return dirs.join(",");
}

async function launchChromium() {
  await mkdir(PROFILE, { recursive: true, mode: 0o700 });
  const fullVersion = /(\d+\.\d+\.\d+\.\d+)/.exec(await output([CHROMIUM, "--version"]))?.[1] ?? "152.0.0.0";
  const kernel = /^(\d+\.\d+\.\d+)/.exec(await output(["uname", "-r"]))?.[1] ?? "";
  uaOverride = identity(fullVersion, kernel);
  const screen = await monitor();
  const extensions = await extensionDirs();
  const proc = Bun.spawn([
    CHROMIUM, "--headless=new", "--ozone-platform=headless",
    `--remote-debugging-port=${CHROME_PORT}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${PROFILE}`, `--force-device-scale-factor=${screen.scale}`,
    `--screen-info={${screen.width}x${screen.height}}`,
    // The imported cookies are encrypted with the key the person's Chromium keeps in the keyring.
    "--no-first-run", "--no-default-browser-check", "--password-store=gnome-libsecret", "--window-size=800,600",
    ...(extensions ? [`--load-extension=${extensions}`, `--disable-extensions-except=${extensions}`] : []),
    `--user-agent=${uaOverride.userAgent}`, "--lang=ko-KR", "--accept-lang=ko-KR,ko,en-US,en",
    "--disable-blink-features=AutomationControlled",
    // Headless defaults to SwiftShader, a software GPU that both costs CPU and marks the browser as a bot.
    "--use-angle=gl-egl",
    "about:blank",
  ], { stdout: "ignore", stderr: "ignore", env: { ...process.env, TZ: process.env.TZ ?? "Asia/Seoul" } });
  proc.exited.then((code) => { console.error(`chromium exited (${code})`); process.exit(1); });
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { proc.kill(); process.exit(0); });
  for (let i = 0; i < 100; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).json();
      return v.webSocketDebuggerUrl;
    } catch {}
    await Bun.sleep(100);
  }
  throw new Error("chromium did not open its debugging port");
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.next = 0;
    this.calls = new Map();
    this.listeners = [];
    this.open = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onclose = () => { console.error("lost the CDP connection"); process.exit(1); };
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== undefined) {
        const call = this.calls.get(msg.id);
        if (!call) return;
        this.calls.delete(msg.id);
        clearTimeout(call.timer);
        if (msg.error) call.reject(new Error(`${call.method}: ${msg.error.message}`));
        else call.resolve(msg.result);
      } else for (const fn of this.listeners) fn(msg);
    };
  }
  // A page stuck in a JS dialog or a hung renderer never answers some calls; without a deadline one such call
  // would hold the tab-switch queue, and so the panel, forever.
  send(method, params = {}, sessionId, ms = 5000) {
    const id = ++this.next;
    this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.calls.delete(id); reject(new Error(`${method}: no answer in ${ms} ms`)); }, ms);
      this.calls.set(id, { resolve, reject, method, timer });
    });
  }
  on(fn) { this.listeners.push(fn); }
}

const tabs = new Map(); // targetId → { id, url, title, agent, agentAt, order }
let order = 0;
let active = null;
let session = null; // our session on the shown tab
const sessions = new Map(); // targetId → our auto-attached session; it carries the disguise, so it stays for the tab's life
let casting = false;
let frame = null;
let seq = 0;
let cursor = null;
// Bumped on every change a client can see, so the panel can wait for the next one (GET /next) instead of
// polling: a frame reaches it as soon as it is on disk.
let ver = 0;
let nextWaiters = [];
const MAX_NEXT = 12;
function bump() {
  ver++;
  const w = nextWaiters;
  nextWaiters = [];
  for (const resolve of w) resolve();
}
// The person's last input. For a second after it, frames go out as fast as they come instead of paced.
let inputAt = 0;
const interacting = () => Date.now() - inputAt < 1000;
const TIMING = !!process.env.HERDR_BROWSER_TIMING;
let viewport = { width: 800, height: 600 };
let lastBeat = 0;
const agentTargets = new Set(); // targets an agent created before Chromium announced them
const clients = new Set();
let cdp;

// Switching tabs is several round trips; one at a time keeps session, casting and active consistent.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn).catch((e) => console.error(String(e?.message ?? e))));

function isTab(info) {
  return info.type === "page" && !info.url.startsWith("devtools://");
}

function addTab(info) {
  if (!isTab(info) || tabs.has(info.targetId)) return;
  const agent = agentTargets.delete(info.targetId);
  tabs.set(info.targetId, { id: info.targetId, url: info.url, title: info.title, agent, agentAt: agent ? Date.now() : 0, order: ++order });
  // A popup the shown page opened (target=_blank, window.open) is where the person's click went.
  if ((agent && !controlled()) || !active || info.openerId === active) serial(() => show(info.targetId));
}

function agentActed(targetId, x, y) {
  const tab = tabs.get(targetId);
  if (!tab) { agentTargets.add(targetId); return; }
  tab.agent = true;
  tab.agentAt = Date.now();
  if (x !== undefined) cursor = { target: targetId, x, y, at: Date.now() };
  bump();
  // The person's own clicks and tabs win while they are in control; the view follows once they let go.
  if (active !== targetId && !controlled()) serial(() => show(targetId));
}

async function show(targetId) {
  // Target.createTarget can answer before Chromium announces the target.
  if (!tabs.has(targetId)) {
    const info = await cdp.send("Target.getTargetInfo", { targetId }).then((r) => r.targetInfo, () => null);
    if (info) addTab(info);
  }
  if (!tabs.has(targetId)) return;
  if (active === targetId && session) return;
  await stopCast();
  active = targetId;
  bump();
  session = await sessionFor(targetId);
  if (active !== targetId || !session) return;
  // A background tab is not painted, so it would give no frames.
  // A tab showing a JS dialog answers neither this nor the screencast; don't let it hold the queue long.
  await cdp.send("Page.bringToFront", {}, session, 2000).catch(() => {});
  await fitWindow();
  if (watching()) await startCast();
}

async function sessionFor(targetId) {
  for (let i = 0; i < 40 && !sessions.has(targetId); i++) await Bun.sleep(25);
  if (sessions.has(targetId)) return sessions.get(targetId);
  const r = await cdp.send("Target.attachToTarget", { targetId, flatten: true }).catch(() => null);
  if (!r) return null;
  sessions.set(targetId, r.sessionId);
  await disguise(r.sessionId);
  return r.sessionId;
}

// Sites block "HeadlessChrome"; the launch flag fixes the UA string, this fixes the client hints and languages,
// per session because Emulation overrides live as long as the session that set them.
let uaOverride = null;
function disguise(sessionId) {
  return cdp.send("Emulation.setUserAgentOverride", uaOverride, sessionId).catch(() => {});
}

// A headless window is taller than its page by an invisible toolbar whose height differs between windows
// (87 or 143 px seen), so each tab's is measured against its current bounds the first time it is shown.
const chrome = new Map(); // targetId → { width, height }
let lastChrome = { width: 0, height: 0 };

async function fitWindow() {
  if (!active || !session) return;
  const targetId = active;
  try {
    const { windowId, bounds } = await cdp.send("Browser.getWindowForTarget", { targetId });
    let c = chrome.get(targetId);
    if (!c) {
      // Blocks while the page shows a JS dialog (alert, beforeunload); the last good measurement stands in then.
      const r = await cdp.send("Runtime.evaluate", { expression: "[innerWidth, innerHeight]", returnByValue: true }, session, 1000).catch(() => null);
      const [w, h] = r?.result?.value ?? [0, 0];
      const dw = bounds.width - w, dh = bounds.height - h;
      // A page not laid out yet, or an agent's device emulation, gives no usable reading; try again next time.
      if (w > 0 && dw >= 0 && dw < 300 && dh >= 0 && dh < 300) chrome.set(targetId, (lastChrome = { width: dw, height: dh }));
      c = chrome.get(targetId) ?? lastChrome;
    }
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal", width: viewport.width + c.width, height: viewport.height + c.height } });
  } catch {}
}

const watching = () => Date.now() - lastBeat < HEARTBEAT_MS || waiters > 0;

async function startCast() {
  if (casting || !session) return;
  casting = true;
  // Motion frames at CSS size, not the monitor's scale: the panel decodes each one before it can draw it, and a
  // frame a third the pixels decodes about three times faster. The still frame after motion is full scale.
  const size = { maxWidth: viewport.width, maxHeight: viewport.height };
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: MOTION_QUALITY, everyNthFrame: 1, ...size }, session, 2000).catch(() => { casting = false; });
}

async function stopCast() {
  if (!casting || !session) return;
  casting = false;
  await cdp.send("Page.stopScreencast", {}, session).catch(() => {});
}

// Every published frame is a new image the panel decodes before it can draw it. While the person is not
// interacting, frames are written at most every MIN_FRAME_MS (always the latest one, so the last picture of an
// animation is never lost); while they are, every frame goes out as it comes, up to INTERACTIVE_FRAME_MS. A
// frame identical to the one on screen is never written. Motion goes out at MOTION_QUALITY; once the page has
// been still for PAINT_OVER_MS one sharp frame replaces it (the "paint-over" remote desktops do).
// Every new frame costs the panel a load before it can be drawn; faster than ~10 fps it never catches up.
const INTERACTIVE_FRAME_MS = 100;
const MOTION_QUALITY = 60;
const STILL_QUALITY = 85;
const PAINT_OVER_MS = 150;
let pending = null; // { data, width, height, from, still, receivedAt }
let publishTimer = null;
let paintTimer = null;
let publishing = false;
let lastWrite = 0;
let lastFrameAt = 0;
let lastData = "";
let lastFrom = null;

function onFrame(params, from) {
  // Acked at once: the publish step decides how often frames are written, not Chromium.
  cdp.send("Page.screencastFrameAck", { sessionId: params.sessionId }, from).catch(() => {});
  if (from !== session) return;
  pending = { data: params.data, width: params.metadata.deviceWidth, height: params.metadata.deviceHeight, from, still: false, receivedAt: Date.now() };
  // Armed on every motion frame, written or not (an identical one is skipped), so the sharp frame always follows.
  clearTimeout(paintTimer);
  paintTimer = setTimeout(paintOver, PAINT_OVER_MS);
  schedulePublish();
}

function schedulePublish() {
  if (publishTimer || publishing || !pending) return;
  const gap = interacting() ? INTERACTIVE_FRAME_MS : MIN_FRAME_MS;
  const wait = lastWrite + gap - Date.now();
  if (wait <= 0) { publish(); return; }
  publishTimer = setTimeout(publish, wait);
}

async function paintOver() {
  paintTimer = null;
  const from = session;
  if (!from || !frame || pending || !casting) return;
  const r = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: STILL_QUALITY }, from).catch(() => null);
  // Something moved meanwhile: that newer motion frame wins, and brings its own paint-over.
  if (!r || pending || from !== session) return;
  pending = { data: r.data, width: frame.width, height: frame.height, from, still: true, receivedAt: Date.now() };
  schedulePublish();
}

async function publish() {
  publishTimer = null;
  const p = pending;
  pending = null;
  // Two tabs can show identical pixels; only a repeat on the same tab is skipped.
  if (!p || p.from !== session || (p.data === lastData && p.from === lastFrom)) return schedulePublish();
  publishing = true;
  try {
    const n = ++seq;
    const name = `f-${n}.jpg`;
    const tmp = join(FRAMES, `.f-${n}.tmp`);
    // Frames are screenshots of logged-in pages.
    await writeFile(tmp, Buffer.from(p.data, "base64"), { mode: 0o600 });
    await rename(tmp, join(FRAMES, name));
    lastData = p.data;
    lastFrom = p.from;
    lastWrite = lastFrameAt = Date.now();
    frame = { path: `${FRAMES_REL}/${name}`, seq: n, width: Math.round(p.width), height: Math.round(p.height), receivedAt: p.receivedAt, at: lastWrite };
    bump();
    if (TIMING && interacting()) console.log(`timing: frame ${n}${p.still ? " (still)" : ""} received +${p.receivedAt - inputAt} ms, written +${lastWrite - inputAt} ms after input`);
    // The panel keeps the previous frame drawn under the new one until that decodes; deleting a file drops it
    // from the panel's image cache, so files outlive the panel's poll by a wide margin.
    unlink(join(FRAMES, `f-${n - KEEP_FRAMES}.jpg`)).catch(() => {});
  } catch (e) {
    console.error(`frame: ${e?.message ?? e}`);
  } finally {
    publishing = false;
    schedulePublish();
  }
}

function onEvent(msg) {
  const p = msg.params;
  switch (msg.method) {
    case "Target.targetCreated": addTab(p.targetInfo); break;
    case "Target.targetInfoChanged": {
      const tab = tabs.get(p.targetInfo.targetId);
      if (tab) { tab.url = p.targetInfo.url; tab.title = p.targetInfo.title; }
      else addTab(p.targetInfo);
      break;
    }
    case "Target.targetDestroyed": {
      sessions.delete(p.targetId);
      chrome.delete(p.targetId);
      if (!tabs.delete(p.targetId)) break;
      if (cursor?.target === p.targetId) cursor = null;
      if (active === p.targetId) {
        active = null; session = null; casting = false; frame = null;
        const next = [...tabs.values()].sort((a, b) => b.order - a.order)[0];
        serial(() => next ? show(next.id) : cdp.send("Target.createTarget", { url: "about:blank" }));
      }
      break;
    }
    case "Target.attachedToTarget": {
      if (msg.sessionId || p.targetInfo.type !== "page") break;
      sessions.set(p.targetInfo.targetId, p.sessionId);
      // No waitForDebuggerOnStart: Puppeteer (omp) leaves a tab another client holds paused out of its page list.
      // The launch flags already give the UA string and languages; only the high-entropy hints may lag the
      // first request of a new tab.
      disguise(p.sessionId);
      break;
    }
    case "Target.detachedFromTarget":
      for (const [id, s] of sessions) if (s === p.sessionId) sessions.delete(id);
      if (p.sessionId === session) { session = null; casting = false; }
      break;
    case "Page.screencastFrame": onFrame(p, msg.sessionId); return;
  }
  bump();
}

// --- CDP proxy for agents ---------------------------------------------------------------------------

const ACTIONS = new Set([
  "Page.navigate", "Page.reload", "Page.navigateToHistoryEntry", "Page.bringToFront", "Target.activateTarget",
  "Input.dispatchMouseEvent", "Input.dispatchKeyEvent", "Input.insertText", "Input.dispatchTouchEvent", "Input.imeSetComposition",
]);

function fromClient(conn, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  const p = msg.params ?? {};
  if (msg.method === "Target.setAutoAttach" && !msg.sessionId && p.autoAttach) conn.autoAttach = true;
  if (msg.sessionId) adopted(conn, conn.sessions.get(msg.sessionId));
  if (msg.method === "Target.attachToTarget" || msg.method === "Target.createTarget") conn.pending.set(msg.id, { method: msg.method, targetId: p.targetId });
  if (msg.method === "Target.activateTarget") return agentActed(p.targetId);
  if (!ACTIONS.has(msg.method)) return;
  const targetId = msg.sessionId ? conn.sessions.get(msg.sessionId) : conn.pageTarget;
  if (!targetId) return;
  const pointer = msg.method === "Input.dispatchMouseEvent" && p.type !== "mouseWheel";
  agentActed(targetId, pointer ? p.x : undefined, pointer ? p.y : undefined);
}

function fromBrowser(conn, raw) {
  if (typeof raw !== "string") return;
  if (conn.pending.size) {
    const m = /^\{"id":(\d+)/.exec(raw);
    const want = m && conn.pending.get(Number(m[1]));
    if (want) {
      conn.pending.delete(Number(m[1]));
      const result = JSON.parse(raw).result;
      if (want.method === "Target.attachToTarget" && result?.sessionId) conn.sessions.set(result.sessionId, want.targetId);
      if (want.method === "Target.createTarget" && result?.targetId) agentActed(result.targetId);
      return;
    }
  }
  // Auto-attach (Playwright, Puppeteer) announces sessions as events rather than replies.
  if (raw.includes('"Target.attachedToTarget"')) {
    const p = JSON.parse(raw).params;
    if (p?.sessionId && p.targetInfo?.targetId) conn.sessions.set(p.sessionId, p.targetInfo.targetId);
  }
}

// A client that auto-attaches (Puppeteer, so omp; Playwright) only lists a new tab once it has set up its session
// on it, which it shows by sending its first command there. omp opens `/json/new` by id right after the reply,
// so the reply waits for that.
const adoptWaiters = new Set(); // { id, resolve }

function adopted(conn, targetId) {
  if (!targetId || conn.adopted.has(targetId)) return;
  conn.adopted.add(targetId);
  for (const w of adoptWaiters) w.check();
}

function untilAdopted(id, ms = 3000) {
  return new Promise((resolve) => {
    const w = {
      check() {
        if ([...clients].some((c) => c.autoAttach && !c.adopted.has(id))) return;
        adoptWaiters.delete(w);
        clearTimeout(timer);
        resolve();
      },
    };
    const timer = setTimeout(() => { adoptWaiters.delete(w); resolve(); }, ms);
    adoptWaiters.add(w);
    w.check();
  });
}

// Both servers are reachable from any web page the person visits (fetch to 127.0.0.1, or DNS rebinding a
// hostname onto it), and either one drives the logged-in profile. Local tools (Playwright, omp, the mod) send
// a loopback Host and no Origin; browsers always send an Origin on cross-site and WebSocket requests.
function trusted(req, port) {
  const host = req.headers.get("host");
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false;
  return !req.headers.has("origin");
}
const forbidden = () => new Response("forbidden", { status: 403 });

const PUBLIC_CDP = `127.0.0.1:${CDP_PORT}`;
const rewrite = (text) => text.replaceAll(`127.0.0.1:${CHROME_PORT}`, PUBLIC_CDP).replaceAll(`localhost:${CHROME_PORT}`, PUBLIC_CDP);

// --- the person in control ------------------------------------------------------------------------------
// While the person drives the panel, an agent must not fight them for the page: its commands that act wait
// here, in order per connection, until the person has been idle for CONTROL_MS or hands back. Puppeteer's
// protocol timeout is 180 s, so nothing is held past HOLD_MAX_MS; it gets an error it can retry on instead.
const CONTROL_MS = 5000;
const HOLD_MAX_MS = 60000;
const HELD_ERROR = "The person is controlling the herdr browser, so agent commands are paused. Retry once GET http://127.0.0.1:47825/state shows userControl.active false.";
let controlUntil = 0;
let releaseTimer = null;
const controlled = () => Date.now() < controlUntil;

function takeControl() {
  const was = controlled();
  controlUntil = Date.now() + CONTROL_MS;
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(releaseHeld, CONTROL_MS + 20);
  if (!was) bump();
}

function handBack() {
  controlUntil = 0;
  clearTimeout(releaseTimer);
  releaseHeld();
}

// What may pass while the person is in control: an explicit list of reads, and the attach steps a client needs
// before it can do anything. Everything else waits, including Fetch.*, script injection, bindings, emulation
// and detaching, because each of them changes what the person's page does.
const PASS = new Set([
  "Browser.getVersion", "Target.getTargets", "Target.getTargetInfo", "Target.getBrowserContexts",
  "Target.attachToTarget", "Target.setAutoAttach", "Target.setDiscoverTargets",
  "Runtime.enable", "Runtime.runIfWaitingForDebugger", "Runtime.getProperties", "Runtime.releaseObject", "Runtime.releaseObjectGroup",
  "Page.enable", "Page.getFrameTree", "Page.getLayoutMetrics", "Page.getNavigationHistory", "Page.captureScreenshot",
  "DOM.enable", "DOM.getDocument", "DOM.querySelector", "DOM.querySelectorAll", "DOM.describeNode", "DOM.getBoxModel",
  "DOM.getContentQuads", "DOM.getOuterHTML", "DOM.getAttributes",
  "Accessibility.enable", "Accessibility.getFullAXTree", "Accessibility.getPartialAXTree", "Accessibility.queryAXTree",
  "Accessibility.getChildAXNodes", "Accessibility.getRootAXNode",
  "Network.enable", "Network.getCookies", "Log.enable",
]);

function passes(raw) {
  if (typeof raw !== "string") return false;
  try { return PASS.has(JSON.parse(raw).method); } catch { return false; }
}

function forward(c, raw) {
  fromClient(c, raw);
  if (c.queue) c.queue.push(raw); else c.up.send(raw);
}

function releaseHeld() {
  if (controlled()) return;
  for (const c of clients) while (c.held.length) forward(c, c.held.shift().raw);
  bump();
}

function expireHeld() {
  const now = Date.now();
  for (const c of clients) {
    while (c.held.length && now - c.held[0].at > HOLD_MAX_MS) {
      const { raw } = c.held.shift();
      try {
        const m = JSON.parse(raw);
        c.ws.send(JSON.stringify({ id: m.id, ...(m.sessionId ? { sessionId: m.sessionId } : {}), error: { code: -32000, message: HELD_ERROR } }));
      } catch {}
    }
  }
  releaseHeld();
}

const heldCount = () => [...clients].reduce((n, c) => n + c.held.length, 0);

async function untilFree() {
  const end = Date.now() + HOLD_MAX_MS;
  while (controlled() && Date.now() < end) await Bun.sleep(100);
  return !controlled();
}

Bun.serve({
  hostname: "127.0.0.1",
  port: CDP_PORT,
  async fetch(req, server) {
    if (!trusted(req, CDP_PORT)) return forbidden();
    const u = new URL(req.url);
    if (u.pathname.startsWith("/devtools/")) {
      const pageTarget = /^\/devtools\/page\/([^/]+)/.exec(u.pathname)?.[1] ?? null;
      if (server.upgrade(req, { data: { path: u.pathname + u.search, pageTarget, sessions: new Map(), pending: new Map(), queue: [], autoAttach: false, adopted: new Set(), held: [] } })) return;
      return new Response("websocket upgrade expected", { status: 400 });
    }
    if (!u.pathname.startsWith("/json")) return new Response("not found", { status: 404 });
    if (/^\/json\/(new|activate|close)\b/.test(u.pathname) && !(await untilFree())) return new Response(HELD_ERROR, { status: 409 });
    // Chromium may still be starting (or restarting): say so instead of throwing out of the handler.
    const up = await fetch(`http://127.0.0.1:${CHROME_PORT}${u.pathname}${u.search}`, { method: req.method }).catch(() => null);
    if (!up) return new Response("chromium is not up yet", { status: 502 });
    const text = rewrite(await up.text());
    if (u.pathname.startsWith("/json/new") && up.ok) {
      const id = (() => { try { return JSON.parse(text).id; } catch { return null; } })();
      if (id) { agentActed(id); await untilAdopted(id); }
    }
    return new Response(text, { status: up.status, headers: { "content-type": up.headers.get("content-type") ?? "application/json" } });
  },
  websocket: {
    // Chromium's own DevTools socket caps a message at 256 MiB; full-page screenshots reach tens of MiB.
    maxPayloadLength: 256 << 20,
    open(ws) {
      const c = ws.data;
      c.ws = ws;
      clients.add(c);
      c.up = new WebSocket(`ws://127.0.0.1:${CHROME_PORT}${c.path}`);
      c.up.onopen = () => { for (const m of c.queue) c.up.send(m); c.queue = null; };
      c.up.onmessage = (e) => { fromBrowser(c, e.data); ws.send(e.data); };
      c.up.onclose = () => ws.close();
      c.up.onerror = () => ws.close();
    },
    message(ws, raw) {
      const c = ws.data;
      if (c.held.length || (controlled() && !passes(raw))) c.held.push({ raw, at: Date.now() });
      else forward(c, raw);
    },
    close(ws) {
      clients.delete(ws.data);
      for (const w of adoptWaiters) w.check();
      ws.data.up?.close();
    },
  },
});

// --- panel API ----------------------------------------------------------------------------------------

function normalizeUrl(input) {
  const s = String(input ?? "").trim();
  if (!s) return "about:blank";
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^localhost:\d/i.test(s)) return s;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(s)) return `http://${s}`;
  if (!/\s/.test(s) && /^[^/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s)) return `https://${s}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(s)}`;
}

const MODS = { alt: 1, ctrl: 2, control: 2, meta: 4, platform: 4, cmd: 4, shift: 8 };
const INPUT_TYPES = new Set(["click", "move", "down", "up", "wheel", "key", "text"]);
const BUTTONS = new Set(["left", "right", "middle"]);
function validInput(b) {
  if (!INPUT_TYPES.has(b.type)) return false;
  if (b.button !== undefined && !BUTTONS.has(b.button)) return false;
  if (["x", "y", "dx", "dy", "clickCount"].some((k) => b[k] !== undefined && !Number.isFinite(b[k]))) return false;
  if (b.pressed !== undefined && typeof b.pressed !== "boolean") return false;
  if (b.modifiers !== undefined && typeof b.modifiers !== "number" && (typeof b.modifiers !== "object" || b.modifiers === null)) return false;
  if (b.type === "key" && typeof b.key !== "string") return false;
  if (b.type === "text" && typeof b.text !== "string") return false;
  return true;
}

function modifierBits(m) {
  if (typeof m === "number") return m & 15;
  if (!m || typeof m !== "object") return 0;
  return Object.entries(MODS).reduce((bits, [k, v]) => (m[k] ? bits | v : bits), 0);
}

// GPUI key names → DOM key, code and Windows virtual key code, which is what Blink's editing commands look at.
const KEYS = {
  enter: ["Enter", "Enter", 13, "\r"], tab: ["Tab", "Tab", 9], backspace: ["Backspace", "Backspace", 8],
  escape: ["Escape", "Escape", 27], delete: ["Delete", "Delete", 46], space: [" ", "Space", 32, " "],
  left: ["ArrowLeft", "ArrowLeft", 37], up: ["ArrowUp", "ArrowUp", 38], right: ["ArrowRight", "ArrowRight", 39], down: ["ArrowDown", "ArrowDown", 40],
  home: ["Home", "Home", 36], end: ["End", "End", 35], pageup: ["PageUp", "PageUp", 33], pagedown: ["PageDown", "PageDown", 34],
  insert: ["Insert", "Insert", 45],
};
for (let i = 1; i <= 12; i++) KEYS[`f${i}`] = [`F${i}`, `F${i}`, 111 + i];

function keyParams(name, text, bits) {
  const known = KEYS[String(name).toLowerCase()];
  if (known) {
    const [key, code, vk, typed] = known;
    return { key, code, windowsVirtualKeyCode: vk, text: bits & 7 ? undefined : typed };
  }
  const ch = String(text || name);
  const upper = ch.toUpperCase();
  let code, vk;
  if (/^[a-z]$/i.test(ch)) { code = `Key${upper}`; vk = upper.charCodeAt(0); }
  else if (/^[0-9]$/.test(ch)) { code = `Digit${ch}`; vk = ch.charCodeAt(0); }
  // Ctrl/Alt/Meta chords run commands rather than type text.
  return { key: ch, code, windowsVirtualKeyCode: vk, text: bits & 7 ? undefined : ch };
}

// The button the panel is holding down on the shown tab. A release outside the panel never arrives, so moves say
// whether a button is still down, and switching tabs forgets it.
let held = "none";
let heldOn = null; // the session `held` belongs to
// Events are sent without waiting for Chromium's answers: one socket keeps them in order, and waiting would put
// a round trip between every move and the next. The returned promise only reports failures.
function input(b) {
  if (!session) return;
  const s = session;
  if (heldOn !== s) { held = "none"; heldOn = s; }
  const bits = modifierBits(b.modifiers);
  const x = Number(b.x) || 0, y = Number(b.y) || 0;
  const button = b.button ?? "left";
  const sent = [];
  const mouse = (type, extra = {}) => sent.push(cdp.send("Input.dispatchMouseEvent", { type, x, y, modifiers: bits, ...extra }, s));
  switch (b.type) {
    case "move":
      if (held !== "none" && b.pressed === false) {
        mouse("mouseReleased", { button: held, clickCount: 1 });
        held = "none";
      }
      mouse("mouseMoved", { button: held, buttons: held === "left" ? 1 : held === "right" ? 2 : held === "middle" ? 4 : 0 });
      break;
    case "down": held = button; mouse("mousePressed", { button, clickCount: b.clickCount ?? 1 }); break;
    case "up": held = "none"; mouse("mouseReleased", { button, clickCount: b.clickCount ?? 1 }); break;
    case "click":
      mouse("mouseMoved", { button: "none" });
      mouse("mousePressed", { button, clickCount: 1 });
      mouse("mouseReleased", { button, clickCount: 1 });
      break;
    case "wheel": mouse("mouseWheel", { deltaX: Number(b.dx) || 0, deltaY: Number(b.dy) || 0 }); break;
    case "text": if (b.text) sent.push(cdp.send("Input.insertText", { text: String(b.text) }, s)); break;
    case "key": {
      const k = keyParams(b.key, b.text, bits);
      const down = { type: k.text ? "keyDown" : "rawKeyDown", modifiers: bits, key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode, text: k.text, unmodifiedText: k.text };
      sent.push(cdp.send("Input.dispatchKeyEvent", down, s));
      sent.push(cdp.send("Input.dispatchKeyEvent", { type: "keyUp", modifiers: bits, key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode }, s));
      break;
    }
  }
  return Promise.all(sent);
}

async function nav(action) {
  if (!session) return;
  if (action === "reload") return cdp.send("Page.reload", {}, session);
  const h = await cdp.send("Page.getNavigationHistory", {}, session);
  const entry = h.entries[h.currentIndex + (action === "back" ? -1 : 1)];
  if (entry) await cdp.send("Page.navigateToHistoryEntry", { entryId: entry.id }, session);
}

// Answers as soon as Chromium has the tab; switching the panel to it and loading the page happen afterwards.
async function open(url, newTab) {
  const target = normalizeUrl(url);
  if (newTab || !active || !session) {
    const { targetId } = await cdp.send("Target.createTarget", { url: target });
    serial(() => show(targetId));
    return targetId;
  }
  cdp.send("Page.navigate", { url: target }, session, 30000).catch((e) => console.error(String(e?.message ?? e)));
  return active;
}

function state() {
  const list = [...tabs.values()].sort((a, b) => a.order - b.order)
    .map((t) => ({ id: t.id, url: t.url, title: t.title, active: t.id === active, agent: t.agent, agentAt: t.agentAt }));
  const pointer = cursor && cursor.target === active ? { x: cursor.x, y: cursor.y, at: cursor.at } : undefined;
  const userControl = { active: controlled(), until: controlUntil, held: heldCount() };
  return { ver, tabs: list, active, seq, frame, cursor: pointer, clients: clients.size, casting, userControl };
}

// Lets an agent wait for the page to settle (no new frame for `idle` ms), or first to change after `since`,
// instead of sleeping blindly. Frames only flow while someone watches, so a wait keeps the screencast on.
const MAX_WAITS = 4;
let waiters = 0;
async function waitForPage(q) {
  const idle = clampInt(q.get("idle"), 300, 0, 60000);
  // Bun closes a request idle for 10 s.
  const timeout = clampInt(q.get("timeout"), 8000, 0, 9000);
  const since = q.has("since") ? clampInt(q.get("since"), seq, 0, Number.MAX_SAFE_INTEGER) : seq;
  const needChange = q.has("change");
  const start = Date.now();
  waiters++;
  try {
    if (!casting) await new Promise((resolve) => serial(async () => { await startCast(); resolve(); }));
    for (;;) {
      const now = Date.now();
      const changed = seq > since;
      const settleAt = !needChange || changed ? Math.max(lastFrameAt, start) + idle : Infinity;
      if (now >= settleAt) return { changed, timed_out: false, seq, waited_ms: now - start };
      if (now - start >= timeout) return { changed, timed_out: true, seq, waited_ms: now - start };
      await nextChange(Math.min(settleAt, start + timeout) - now);
    }
  } finally {
    waiters--;
  }
}

// Resolves on the next change (bump) or after `ms`, and leaves nothing behind either way.
function nextChange(ms) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); nextWaiters = nextWaiters.filter((w) => w !== done); resolve(); };
    const timer = setTimeout(done, Math.max(0, ms));
    nextWaiters.push(done);
  });
}

function clampInt(v, fallback, min, max) {
  const n = Math.round(Number(v ?? fallback));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

// The viewport only (never the full page), two at a time, and only of the shown tab or a tab an agent drives:
// a tab only the person uses is theirs to look at.
const MAX_SHOTS = 2;
let shots = 0;
async function screenshot(id) {
  const targetId = id || active;
  const tab = targetId && tabs.get(targetId);
  if (!tab) return new Response("no such tab", { status: 404 });
  if (targetId !== active && !tab.agent) return new Response("not an agent's tab", { status: 403 });
  if (shots >= MAX_SHOTS) return new Response("too many screenshots at once", { status: 429 });
  shots++;
  try {
    const s = await sessionFor(targetId);
    if (!s) return new Response("could not attach to the tab", { status: 502 });
    const r = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, s, 15000);
    return new Response(Buffer.from(r.data, "base64"), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } finally {
    shots--;
  }
}

async function selection() {
  if (!session) return "";
  const r = await cdp.send("Runtime.evaluate", { expression: "String(getSelection())", returnByValue: true }, session);
  return r?.result?.value ?? "";
}

const json = (body, status = 200) => Response.json(body, { status });

async function api(req) {
  if (!trusted(req, API_PORT)) return json({ error: "forbidden" }, 403);
  const u = new URL(req.url);
  if (req.method === "GET" && u.pathname === "/state") return json(state());
  if (req.method === "GET" && u.pathname === "/next") {
    // Answers once anything changed after `after` (a `ver` from an earlier answer), or after `timeout` ms.
    const after = clampInt(u.searchParams.get("after"), -1, -1, Number.MAX_SAFE_INTEGER);
    const timeout = clampInt(u.searchParams.get("timeout"), 2000, 0, 9000);
    if (ver <= after) {
      if (nextWaiters.length >= MAX_NEXT) return json({ error: "too many waiting requests" }, 429);
      await nextChange(timeout);
    }
    return json(state());
  }
  if (req.method === "GET" && u.pathname === "/selection") return json({ text: await selection() });
  if (req.method === "GET" && u.pathname === "/wait") {
    if (waiters >= MAX_WAITS) return json({ error: "too many waiting requests" }, 429);
    return json(await waitForPage(u.searchParams));
  }
  if (req.method === "GET" && u.pathname === "/screenshot") return screenshot(u.searchParams.get("id"));
  if (req.method !== "POST") return json({ error: "not found" }, 404);
  // A page can send text/plain POSTs without asking; requiring JSON forces a CORS preflight it never passes.
  if (!/^application\/json\b/i.test(req.headers.get("content-type") ?? "")) return json({ error: "content-type must be application/json" }, 415);
  let b;
  try { b = await req.json(); } catch { return json({ error: "malformed JSON" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "body must be a JSON object" }, 400);
  if (u.pathname === "/input" && !validInput(b)) return json({ error: "invalid input event" }, 400);
  // Anything the person does through the panel (or a link another mod opens for them) puts them in control.
  // Hovering is not doing: a pointer resting over the panel while watching an agent must not pause it.
  if (["/open", "/tab", "/close", "/nav"].includes(u.pathname) || (u.pathname === "/input" && (b.type !== "move" || b.pressed))) takeControl();
  switch (u.pathname) {
    case "/open": return json({ id: await open(b.url, b.newTab) });
    case "/tab": serial(() => show(String(b.id))); return json({ ok: true });
    case "/close": await cdp.send("Target.closeTarget", { targetId: String(b.id) }); return json({ ok: true });
    case "/nav": await nav(b.action); return json({ ok: true });
    case "/handback": handBack(); return json({ ok: true });
    case "/viewport": {
      lastBeat = Date.now();
      const width = Math.max(200, Math.min(4000, Math.round(Number(b.width) || 0)));
      const height = Math.max(150, Math.min(4000, Math.round(Number(b.height) || 0)));
      const changed = width !== viewport.width || height !== viewport.height;
      viewport = { width, height };
      serial(async () => { if (changed) { await stopCast(); await fitWindow(); } await startCast(); });
      return json({ ok: true });
    }
    case "/input":
      // Accepted, not yet dispatched: Chromium's answer is not awaited (see input()).
      inputAt = Date.now();
      input(b)?.catch((e) => console.error(`input: ${e?.message ?? e}`));
      return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}

await mkdir(FRAMES, { recursive: true, mode: 0o700 });
await chmod(FRAMES, 0o700);
for (const f of await readdir(FRAMES)) await unlink(join(FRAMES, f)).catch(() => {});

cdp = new Cdp(await launchChromium());
await cdp.open;
cdp.on(onEvent);
await cdp.send("Target.setDiscoverTargets", { discover: true });
await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: [{ type: "page", exclude: false }] });

Bun.serve({
  hostname: "127.0.0.1",
  port: API_PORT,
  maxRequestBodySize: 64 * 1024,
  async fetch(req) {
    try { return await api(req); } catch (e) { return json({ error: String(e?.message ?? e) }, 500); }
  },
});

setInterval(() => {
  if (casting && !watching()) serial(stopCast);
  expireHeld();
}, 1000);
console.log(`herdr-browser: CDP 127.0.0.1:${CDP_PORT}, API 127.0.0.1:${API_PORT}`);
