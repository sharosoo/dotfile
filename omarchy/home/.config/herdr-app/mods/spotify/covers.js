// Album and playlist pictures, kept in data/spotify/covers/ (image() only loads files under
// the app's folder). The index (name → { size, at }) is in memory and saved now and then;
// the least recently shown pictures go first once the folder passes CAP_BYTES or CAP_FILES.
// Downloads run newest request first, so whatever is on screen now beats what scrolled past.
import { exec, appHome } from "herdr";
import * as fs from "fs/promises";
import { createHash } from "crypto";

const CAP_BYTES = 80 * 1024 * 1024;
const CAP_FILES = 3000;
const PARALLEL = 4;
const QUEUE = 200;
const NAME = /^[0-9a-f]{24}\.jpg$/;
const PART = /^[0-9a-f]{24}\.jpg\.part$/;
const MAX_BYTES = 4000000;
// Spotify serves pictures only from these; any other address in API data is ignored.
const HOSTS = [/^([a-z0-9-]+\.)*scdn\.co$/, /^image-cdn-[a-z0-9-]+\.spotifycdn\.com$/];

const root = () => `${appHome().replace(/\\/g, "/")}/data/spotify/covers`;
const nameOf = (url) => `${createHash("sha1").update(url).digest("hex").slice(0, 24)}.jpg`;
const allowed = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.port && !u.username && HOSTS.some((h) => h.test(u.hostname));
  } catch (_) { return false; }
};

export class Covers {
  constructor(onChange) {
    this.onChange = onChange;
    this.index = {};
    this.ready = false;
    this.queue = [];
    this.busy = new Set();
    this.failed = new Set();
    this.dirty = false;
  }

  async load() {
    const dir = root();
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    // A link in place of the folder would send downloads elsewhere: no cache then.
    const st = await exec("stat", ["-c", "%F", dir]).catch(() => null);
    if (st?.code !== 0 || st.stdout.trim() !== "directory") return;
    let saved = {};
    try { saved = JSON.parse(await fs.readFile(`${dir}/index.json`, "utf8")) ?? {}; } catch (_) {}
    const names = await fs.readdir(dir).catch(() => []);
    const onDisk = new Set(names.filter((n) => NAME.test(n)));
    // A file the index doesn't know, or a .part, is what an interrupted download left behind.
    for (const n of names) if (PART.test(n) || (onDisk.has(n) && !saved[n])) await fs.unlink(`${dir}/${n}`).catch(() => {});
    for (const n of Object.keys(saved)) {
      const e = saved[n];
      if (onDisk.has(n) && Number.isFinite(e?.size) && Number.isFinite(e?.at)) this.index[n] = { size: e.size, at: e.at };
    }
    // The caps may have shrunk, or the index been edited, since the last run.
    await this.prune(null);
    this.ready = true;
    this.pump();
  }

  // The picture's path for image(), or null while it downloads (it is asked for here).
  path(url) {
    if (!url) return null;
    const n = nameOf(url), e = this.index[n];
    if (e) { e.at = Date.now(); this.dirty = true; return `data/spotify/covers/${n}`; }
    this.want(url);
    return null;
  }

  want(url) {
    if (!allowed(url) || this.failed.has(url) || this.busy.has(url)) return;
    const i = this.queue.indexOf(url);
    if (i === 0) return;
    if (i > 0) this.queue.splice(i, 1);
    this.queue.unshift(url);
    if (this.queue.length > QUEUE) this.queue.length = QUEUE;
  }

  pump() {
    if (!this.ready) return;
    while (this.busy.size < PARALLEL && this.queue.length) {
      const url = this.queue.shift();
      if (this.index[nameOf(url)]) continue;
      this.busy.add(url);
      this.download(url).finally(() => { this.busy.delete(url); this.pump(); });
    }
  }

  async download(url) {
    const n = nameOf(url), file = `${root()}/${n}`, part = `${file}.part`;
    // Written under a temporary name and moved into place whole, so a picture that is shown
    // is never half there.
    const r = await exec("curl", ["-s", "-f", "-L", "--proto", "=https", "--proto-redir", "=https", "--max-redirs", "3",
      "--max-time", "20", "--max-filesize", String(MAX_BYTES), "-o", part, "-w", "%{size_download}", url]).catch(() => null);
    const size = Number(r?.stdout) || 0;
    const moved = r?.code === 0 && size > 0 && size <= MAX_BYTES
      && (await exec("mv", ["-f", "-T", part, file]).catch(() => null))?.code === 0;
    if (!moved) {
      await fs.unlink(part).catch(() => {});
      this.failed.add(url);
      if (this.failed.size > 500) this.failed.clear();
      return;
    }
    this.index[n] = { size, at: Date.now() };
    this.dirty = true;
    await this.prune(n);
    this.onChange();
  }

  async prune(keep) {
    const names = Object.keys(this.index);
    let total = names.reduce((s, n) => s + (this.index[n].size || 0), 0), count = names.length;
    if (total <= CAP_BYTES && count <= CAP_FILES) return;
    names.sort((a, b) => this.index[a].at - this.index[b].at);
    for (const n of names) {
      if (total <= CAP_BYTES && count <= CAP_FILES) break;
      if (n === keep) continue;
      total -= this.index[n].size || 0;
      count--;
      delete this.index[n];
      await fs.unlink(`${root()}/${n}`).catch(() => {});
    }
  }

  async save() {
    if (!this.dirty || !this.ready) return;
    this.dirty = false;
    await fs.writeFile(`${root()}/index.json`, JSON.stringify(this.index)).catch(() => { this.dirty = true; });
  }
}
