// Spotify in the side panel: what's playing (cover, progress, controls, volume, devices) on top,
// then Search, Library and Lyrics.
//
// Two ways to reach Spotify:
//   Web API   signed in with the person's own Spotify app (setup.js, api.js). Reads playback,
//             search and library; controls need Premium.
//   MPRIS     the desktop app on this computer (mpris.js). Used to show and control playback
//             when the Web API can't: no sign-in, no Premium, or no active device.
// Lyrics come from LRCLIB (lyrics.js); covers are cached on disk (covers.js).
//
// Polling: the player every second while the panel is shown, every 10 s while hidden; a 429
// pauses all Web API calls for the Retry-After Spotify gives.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { theme, layout, exec, shared, nextCommand, props as given, window as appWindow } from "herdr";
import { Account, AuthError, item, playbackFromApi } from "./api.js";
import { readMpris, mprisControl } from "./mpris.js";
import { fetchLyrics, lineAt } from "./lyrics.js";
import { Covers } from "./covers.js";
import { renderSetup, newWizard, button } from "./setup.js";

const ICON = (name) => `mods/spotify/${name}.svg`;
const SHOWN_MS = 1000;
const HIDDEN_MS = 10000;
const SEARCH_DEBOUNCE_MS = 350;
const PAGE = 50;
const SEARCH_PAGE = 10; // the most Development Mode apps may ask /search for
const ROW_H = { head: 30, item: 44, pl: 46, note: 30, more: 32, act: 30 };
const WEB = /^https:\/\/[^\s]+$/;

const sleep = (cx, ms) => new Promise((done) => cx.timer.after(ms, () => done()));
const clock = (ms) => {
  const s = Math.max(0, Math.floor((ms ?? 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
// Where playback is now: the last reading, moved on by the time since, while playing.
const positionOf = (P) => !P?.track ? 0 : Math.min(P.track.durationMs || Infinity, P.progressMs + (P.playing ? Date.now() - P.at : 0));
const sameTrack = (a, b) => Boolean(a && b) && (a.uri && b.uri ? a.uri === b.uri : a.name === b.name && a.artists === b.artists);
const trackKey = (t) => t ? (t.uri ?? `${t.name}|${t.artists}`) : null;

// The panel is shown when no block above it is hidden and every stack above it shows it.
function shownIn(root) {
  const path = [];
  const find = (n) => {
    if (!n) return false;
    path.push(n);
    if (n.content?.mod === "spotify") return true;
    for (const c of n.children ?? []) if (find(c)) return true;
    path.pop();
    return false;
  };
  if (!root || !find(root)) return true;
  return path.every((n, i) => !n.hidden && (n.type !== "stack" || !path[i + 1] || n.active === path[i + 1].id));
}

function systemOpen(target) {
  const os = appWindow().platform;
  const r = os === "macos" ? exec("open", [target]) : os === "windows" ? exec("rundll32", ["url.dll,FileProtocolHandler", target]) : exec("xdg-open", [target]);
  r.catch(() => {});
}

// Lyric rows are as tall as their words wrap; there is no text measuring, so this estimates:
// wide (CJK, Hangul) characters take a full em, the rest a little over half.
function lyricHeight(text, width) {
  if (!text) return 16;
  let w = 0;
  for (const ch of text) w += /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(ch) ? 15 : 8.4;
  return Math.max(1, Math.ceil(w / Math.max(120, width - 36))) * 21 + 9;
}

export default class Spotify extends View {
  init(initial, cx) {
    // The side-panel copy lives in the layout even while its tab is closed (my-tabs keeps
    // shared "spotify.open"); closed, it does no work at all.
    this.inPanel = Boolean((given() ?? initial)?.panel);
    this.acct = new Account();
    this.covers = new Covers(() => { this.coversChanged = true; });
    this.status = "loading"; // loading | setup | ready
    this.wiz = null;
    this.signGen = 0;
    this.openGen = 0;
    this.wasClosed = false;
    this.idIn = InputState.new();
    this.idEmpty = true;
    this.idIn.on("change", (_e, cx) => { this.idEmpty = !this.idIn.value(); if (this.wiz) this.wiz.error = null; cx.notify(); });
    this.idIn.on("submit", (_e, cx) => this.connect(cx));

    this.player = null;
    this.premium = null; // false once Spotify said PREMIUM_REQUIRED
    this.note = null; // { text, error, until? }
    this.lastPoll = 0;
    this.polling = false;
    this.backoffUntil = 0;
    this.shown = true;
    this.size = { width: 368, height: 600 };
    this.menu = false;
    this.signoutArmed = false;
    this.devices = null; // null | { loading, list, error }

    this.view = localStorage.getItem("view") ?? "library";
    this.q = InputState.new();
    this.qEmpty = true;
    this.qGen = 0;
    this.q.on("change", (_e, cx) => {
      this.qEmpty = !this.q.value();
      const gen = ++this.qGen;
      cx.timer.after(SEARCH_DEBOUNCE_MS, (cx) => { if (gen === this.qGen) this.search(cx, false); });
      cx.notify();
    });
    this.q.on("submit", (_e, cx) => { this.qGen++; this.search(cx, false); });
    this.searchTab = "all";
    this.results = null; // { q, tab, loading, error, sections: { track, album, artist, playlist }, more: {kind: bool} }
    this.lib = null; // see loadLibrary
    this.menuKey = null;
    this.rows = [];
    this.rowSizes = [];
    this.rowIndex = new Map();
    this.rowsDirty = true;
    this.wantCovers = [];

    this.lyrics = null; // { key, loading, error, kind, lines, sizes, width }
    this.lyricCache = new Map();
    this.lyricIdx = -1;
    this.lyricFollowAt = 0;
    this.lyricTimer = 0;
    this.lyricScroll = VirtualListScrollHandle.new();
    this.copied = null;

    cx.timer.every(SHOWN_MS, (cx) => this.tick(cx));
    cx.timer.every(150, (cx) => this.flush(cx));
    cx.spawn(async (cx) => {
      await this.covers.load().catch(() => {});
      await this.acct.load().catch(() => {});
      if (this.acct.signedIn) this.status = "ready";
      else { this.status = "setup"; this.wiz = newWizard(this.acct); }
      if (this.acct.clientId) { this.idIn.set_value(this.acct.clientId); this.idEmpty = false; }
      if (!this.closed()) this.poll(cx);
      cx.notify();
    });
    // keys.json can bind `spotify.toggle`, `spotify.next` and `spotify.prev`.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if ((c === "toggle" || c === "next" || c === "prev") && !this.closed()) this.control(c, null, cx);
      }
    });
  }

  close() {
    this.acct.cancelSignIn();
    return this.covers.save();
  }

  // ── timing ──────────────────────────────────────────────────────────────────────────
  closed() { return this.inPanel && shared("spotify.open") !== true; }

  // Closing the tab bumps `openGen`, which every pending timer and follow-up checks, and drops
  // a sign-in in progress.
  shutDown() {
    this.openGen = (this.openGen ?? 0) + 1;
    this.lyricTimer++;
    this.qGen++;
    this.signGen++;
    this.acct.cancelSignIn();
    if (this.wiz) this.wiz.waiting = false;
  }

  tick(cx) {
    const closed = this.closed();
    if (closed && !this.wasClosed) this.shutDown();
    this.wasClosed = closed;
    if (closed) { this.shown = false; return; }
    const shown = shownIn(layout());
    const wasShown = this.shown;
    this.shown = shown;
    const now = Date.now();
    if (!this.polling && this.status !== "loading" && now - this.lastPoll >= (shown ? SHOWN_MS : HIDDEN_MS) - 50) this.poll(cx);
    if (this.note?.until && now > this.note.until) { this.note = null; this.dirty = true; }
    if (now - (this.savedAt ?? 0) > 15000) { this.savedAt = now; this.covers.save(); }
    if (shown && this.view === "lyrics") this.followLyrics(cx);
    if (shown && this.view === "library" && !this.lib && this.apiReady()) this.loadLibrary(cx);
    if (shown && (this.player?.playing || this.dirty || !wasShown)) { this.dirty = false; cx.notify(); }
  }

  // Cover downloads asked for by the last render, newest first; a redraw once some landed.
  flush(cx) {
    if (this.wantCovers.length) {
      for (const url of this.wantCovers.reverse()) this.covers.want(url);
      this.wantCovers = [];
    }
    this.covers.pump();
    if (this.coversChanged) { this.coversChanged = false; if (this.shown) cx.notify(); }
  }

  cover(url) {
    if (!url) return null;
    const path = this.covers.path(url);
    if (!path) this.wantCovers.push(url);
    return path;
  }

  flash(text, error = false, ms = 6000) {
    this.note = { text, error, until: Date.now() + ms };
    this.dirty = true;
  }

  backoff(seconds) {
    this.backoffUntil = Date.now() + seconds * 1000;
    this.flash(`Spotify에서 요청 속도를 늦추라고 했어요. ${seconds}초 후 다시 시도해요.`, true, seconds * 1000);
  }

  apiReady() { return this.status === "ready" && this.acct.signedIn && Date.now() >= this.backoffUntil; }

  lostAuth(message, cx) {
    this.status = "setup";
    this.note = null;
    this.wiz = newWizard(this.acct, message);
    this.lib = null;
    this.results = null;
    this.rowsDirty = true;
    cx?.notify();
  }

  // A Web API call; AuthError sends the panel back to setup, 429 pauses the API. Resolves with
  // the answer, or null when it couldn't be asked.
  async api(cx, method, path, opts) {
    if (!this.apiReady()) return null;
    try {
      const r = await this.acct.call(method, path, opts);
      if (r.status === 429) { this.backoff(r.retryAfter); return null; }
      return r;
    } catch (e) {
      if (e instanceof AuthError) this.lostAuth(e.message, cx);
      else if (!e?.stale) this.flash("Spotify에 연결할 수 없어요.", true);
      return null;
    }
  }

  // ── playback ────────────────────────────────────────────────────────────────────────
  poll(cx) {
    if (this.closed()) return;
    this.polling = true;
    this.lastPoll = Date.now();
    const gen = this.openGen;
    const gone = () => gen !== this.openGen || this.closed();
    cx.spawn(async (cx) => {
      try {
        let next = null;
        if (this.apiReady()) {
          const r = await this.api(cx, "GET", "/me/player", { query: { additional_types: "episode" } });
          if (gone()) return;
          if (r?.status === 200 && r.json?.item) next = playbackFromApi(r.json);
        }
        if (!next) next = await readMpris();
        if (gone()) return;
        this.setPlayer(next, cx);
      } finally {
        this.polling = false;
      }
      if (this.shown) cx.notify();
    });
  }

  setPlayer(next, cx) {
    const prev = this.player;
    // Spotify's Linux app has reported Position 0 throughout a song: keep counting from the
    // last good reading instead of jumping back.
    if (next?.source === "mpris" && next.playing && next.progressMs === 0 && prev?.playing && sameTrack(prev.track, next.track)) {
      next.progressMs = positionOf(prev);
    }
    this.player = next;
    if (!sameTrack(prev?.track, next?.track)) {
      this.lyricIdx = -1;
      this.lyricFollowAt = 0;
      if (this.view === "lyrics") this.loadLyrics(cx);
    }
    if (next?.source === "mpris" && this.premium !== false && this.acct.signedIn && this.status === "ready" && !this.note) {
      this.note = { text: "활성 기기가 없어서 이 컴퓨터의 데스크톱 앱을 보여줘요." };
    } else if (next?.source === "api" && this.note && !this.note.until && this.premium !== false) {
      this.note = null;
    }
    this.dirty = true;
  }

  // Through the Web API when it can; else the desktop app over MPRIS, saying why.
  control(kind, arg, cx) {
    const P = this.player;
    if (P) {
      // Show the change at once; the next reading confirms it.
      if (kind === "toggle") { P.progressMs = positionOf(P); P.at = Date.now(); P.playing = !P.playing; }
      if (kind === "shuffle") P.shuffle = arg;
      if (kind === "repeat") P.repeat = arg;
      if (kind === "volume") P.volume = arg;
      if (kind === "seek") { P.progressMs = arg; P.at = Date.now(); this.lyricFollowAt = 0; }
    }
    cx.notify();
    cx.spawn(async (cx) => {
      const viaApi = this.apiReady() && this.premium !== false && P?.source !== "mpris";
      let why = null;
      if (viaApi || ((kind === "play" || kind === "queue" || kind === "transfer") && this.apiReady() && this.premium !== false)) {
        const r = await this.apiControl(cx, kind, arg);
        if (r && r.status >= 200 && r.status < 300) return this.repoll(cx);
        if (!r) return cx.notify();
        if (r.reason === "PREMIUM_REQUIRED") {
          this.premium = false;
          why = "premium";
        } else if (r.status === 404 || r.reason === "NO_ACTIVE_DEVICE") {
          why = "device";
        } else {
          this.flash(r.message ? `Spotify: ${r.message}` : `Spotify에서 ${r.status} 응답을 보냈어요.`, true);
          return this.repoll(cx);
        }
      }
      const mprisKind = kind === "play" ? "open" : kind;
      const mprisArg = kind === "play" ? (arg.context_uri ?? arg.uris?.[0]) : arg;
      const local = await readMpris();
      if (local && mprisArg !== undefined && await mprisControl(mprisKind, mprisArg, local.track ? local : this.player)) {
        if (why === "premium") this.note = { text: "재생 제어에는 Premium이 필요해서 데스크톱 앱을 직접 제어해요." };
        else if (why === "device") this.note = { text: "활성 Spotify 기기가 없어서 데스크톱 앱을 직접 제어해요." };
        return this.repoll(cx);
      }
      if (kind === "queue") this.flash(why === "premium" ? "재생 대기열에 추가하려면 Spotify Premium이 필요해요." : "먼저 재생을 시작해 주세요. Spotify는 활성 기기에서만 재생 대기열에 추가할 수 있어요.", true);
      else if (kind === "transfer") this.flash("기기를 전환하려면 Spotify Premium이 필요해요.", true);
      else if (why === "premium") this.flash("재생을 제어하려면 Spotify Premium이 필요해요. 여기서 제어하려면 Spotify 데스크톱 앱을 여세요.", true, 10000);
      else if (why === "device") this.flash("활성 기기가 없어요. 다른 곳에서 Spotify를 실행하거나 스피커 버튼으로 기기를 선택하세요.", true, 10000);
      else if (!this.acct.signedIn) this.flash("Spotify 데스크톱 앱을 열거나 아래에서 계정을 연결하세요.", true);
      else this.flash("요청을 Spotify에 전달하지 못했어요.", true);
      this.repoll(cx);
    });
  }

  apiControl(cx, kind, arg) {
    const P = this.player;
    switch (kind) {
      // `control` already flipped `playing` to what the person asked for.
      case "toggle": return this.api(cx, "PUT", P?.playing ? "/me/player/play" : "/me/player/pause");
      case "next": return this.api(cx, "POST", "/me/player/next");
      case "prev": return this.api(cx, "POST", "/me/player/previous");
      case "seek": return this.api(cx, "PUT", "/me/player/seek", { query: { position_ms: String(Math.round(arg)) } });
      case "volume": return this.api(cx, "PUT", "/me/player/volume", { query: { volume_percent: String(Math.round(arg)) } });
      case "shuffle": return this.api(cx, "PUT", "/me/player/shuffle", { query: { state: String(Boolean(arg)) } });
      case "repeat": return this.api(cx, "PUT", "/me/player/repeat", { query: { state: arg } });
      case "play": return this.api(cx, "PUT", "/me/player/play", { body: arg });
      case "queue": return this.api(cx, "POST", "/me/player/queue", { query: { uri: arg } });
      case "transfer": return this.api(cx, "PUT", "/me/player", { body: { device_ids: [arg], play: true } });
      default: return Promise.resolve(null);
    }
  }

  // Spotify takes a moment to apply a change: read again shortly after.
  async repoll(cx) {
    const gen = this.openGen;
    await sleep(cx, 450);
    if (gen !== this.openGen || this.closed()) return;
    if (!this.polling) this.poll(cx);
    cx.notify();
  }

  loadDevices(cx) {
    this.devices = { loading: true, list: [], error: null };
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await this.api(cx, "GET", "/me/player/devices");
      if (!this.devices) return;
      if (r?.status === 200) this.devices = { loading: false, list: r.json?.devices ?? [], error: null };
      else this.devices = { loading: false, list: [], error: r ? `Spotify에서 ${r.status} 응답을 보냈어요.` : "Spotify에 요청을 보내지 못했어요." };
      cx.notify();
    });
  }

  // ── sign-in ─────────────────────────────────────────────────────────────────────────
  connect(cx) {
    const W = this.wiz, id = this.idIn.value().trim();
    if (!W) return;
    const gen = ++this.signGen;
    W.waiting = true;
    W.error = null;
    cx.notify();
    cx.spawn(async (cx) => {
      let error = null;
      try {
        if (id !== this.acct.clientId) { await this.acct.signOut(); await this.acct.saveClientId(id); }
        error = await this.acct.signIn((url) => systemOpen(url));
      } catch (e) {
        error = String(e?.message ?? e);
      }
      if (gen !== this.signGen || this.wiz !== W) return;
      W.waiting = false;
      if (error === "cancelled") error = null;
      else if (error) W.error = error;
      else {
        this.wiz = null;
        this.status = "ready";
        this.premium = null;
        this.note = null;
        this.lib = null;
        this.rowsDirty = true;
        this.backoffUntil = 0;
        if (!this.closed()) {
          this.poll(cx);
          if (this.view === "library") this.loadLibrary(cx);
        }
      }
      cx.notify();
    });
  }

  cancelConnect(cx) {
    this.signGen++;
    this.acct.cancelSignIn();
    if (this.wiz) this.wiz.waiting = false;
    cx.notify();
  }

  closeSetup(cx) {
    this.cancelConnect(cx);
    this.wiz = null;
    cx.notify();
  }

  signOut(cx) {
    this.menu = false;
    this.signoutArmed = false;
    cx.spawn(async (cx) => {
      await this.acct.signOut();
      this.lostAuth(null, cx);
    });
  }

  // ── views ───────────────────────────────────────────────────────────────────────────
  setView(view, cx) {
    this.view = view;
    localStorage.setItem("view", view);
    this.menuKey = null;
    this.rowsDirty = true;
    if (view === "library" && !this.lib) this.loadLibrary(cx);
    if (view === "lyrics") { this.lyricFollowAt = 0; this.lyricIdx = -1; this.loadLyrics(cx); }
    cx.notify();
  }

  search(cx, more) {
    const q = this.q.value().trim();
    if (!q) { this.results = null; this.rowsDirty = true; cx.notify(); return; }
    if (!this.apiReady()) return;
    const tab = this.searchTab;
    const R = more && this.results?.q === q ? this.results : { q, tab, loading: true, error: null, sections: {}, more: {}, offset: {} };
    R.loading = true;
    this.results = R;
    this.rowsDirty = true;
    const types = tab === "all" ? ["track", "album", "artist", "playlist"] : [tab];
    const offset = more ? (R.offset[tab] ?? 0) + SEARCH_PAGE : 0;
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await this.api(cx, "GET", "/search", { query: { q, type: types.join(","), limit: String(SEARCH_PAGE), offset: String(offset) } });
      if (this.results !== R) return;
      R.loading = false;
      if (r?.status === 200) {
        for (const type of types) {
          const page = r.json?.[`${type}s`];
          const got = (page?.items ?? []).map(item).filter(Boolean);
          R.sections[type] = more ? [...(R.sections[type] ?? []), ...got] : got;
          R.more[type] = Boolean(page?.next);
          R.offset[type] = offset;
        }
      } else if (r) R.error = r.message ? `Spotify: ${r.message}` : `Spotify에서 ${r.status} 응답을 보냈어요.`;
      this.rowsDirty = true;
      cx.notify();
    });
  }

  loadLibrary(cx) {
    if (!this.apiReady()) return;
    const L = this.lib = {
      playlists: [], plNext: 0, plLoading: true, plError: null,
      liked: { open: false, items: [], next: 0, loading: false, error: null },
      recent: { open: true, items: [], loading: true, error: null },
      open: {}, // playlist id → { items, next, loading, error }
    };
    this.rowsDirty = true;
    this.morePlaylists(cx);
    cx.spawn(async (cx) => {
      const r = await this.api(cx, "GET", "/me/player/recently-played", { query: { limit: "30" } });
      if (this.lib !== L) return;
      L.recent.loading = false;
      if (r?.status === 200) {
        // The same song played twice in a row is shown once.
        const seen = new Set();
        L.recent.items = (r.json?.items ?? []).map((x) => item(x.track)).filter((t) => t && !seen.has(t.uri) && seen.add(t.uri));
      } else L.recent.error = r ? `Spotify에서 ${r.status} 응답을 보냈어요.` : "Spotify에 요청을 보내지 못했어요.";
      this.rowsDirty = true;
      cx.notify();
    });
  }

  morePlaylists(cx) {
    const L = this.lib;
    if (!L || L.plNext == null) return;
    L.plLoading = true;
    this.rowsDirty = true;
    cx.spawn(async (cx) => {
      const r = await this.api(cx, "GET", "/me/playlists", { query: { limit: String(PAGE), offset: String(L.plNext) } });
      if (this.lib !== L) return;
      L.plLoading = false;
      if (r?.status === 200) {
        L.playlists.push(...(r.json?.items ?? []).map(item).filter(Boolean));
        L.plNext = r.json?.next ? L.plNext + PAGE : null;
      } else L.plError = r ? `Spotify에서 ${r.status} 응답을 보냈어요.` : "Spotify에 요청을 보내지 못했어요.";
      this.rowsDirty = true;
      cx.notify();
    });
  }

  // Liked Songs (id "liked") or a playlist's tracks, a page at a time.
  moreTracks(id, cx) {
    const L = this.lib;
    if (!L) return;
    const T = id === "liked" ? L.liked : (L.open[id] ??= { items: [], next: 0, loading: false, error: null });
    if (T.loading || T.next == null) return;
    T.loading = true;
    this.rowsDirty = true;
    cx.spawn(async (cx) => {
      const r = id === "liked"
        ? await this.api(cx, "GET", "/me/tracks", { query: { limit: String(PAGE), offset: String(T.next) } })
        : await this.api(cx, "GET", `/playlists/${id}/items`, { query: { limit: String(PAGE), offset: String(T.next), additional_types: "track,episode" } });
      if (this.lib !== L) return;
      T.loading = false;
      if (r?.status === 200) {
        // Playlists name each entry `item` since February 2026; Liked Songs still say `track`.
        T.items.push(...(r.json?.items ?? []).map((x) => item(x.item ?? x.track)).filter(Boolean));
        T.next = r.json?.next ? T.next + PAGE : null;
      } else if (r?.status === 403 || r?.status === 404) {
        T.error = "Spotify 제한으로 이 플레이리스트의 곡 목록을 불러올 수 없어요.";
        T.next = null;
      } else T.error = r ? `Spotify에서 ${r.status} 응답을 보냈어요.` : "Spotify에 요청을 보내지 못했어요.";
      this.rowsDirty = true;
      cx.notify();
    });
  }

  loadLyrics(cx) {
    const t = this.player?.track;
    const key = trackKey(t);
    if (!t || !t.name) { this.lyrics = null; return; }
    if (this.lyrics?.key === key) return;
    const cached = this.lyricCache.get(key);
    if (cached) { this.lyrics = { key, ...cached, width: 0 }; this.dirty = true; return; }
    const L = this.lyrics = { key, loading: true, error: null, kind: null, lines: [], width: 0 };
    cx.spawn(async (cx) => {
      try {
        const got = await fetchLyrics(t);
        if (this.lyricCache.size >= 40) this.lyricCache.delete(this.lyricCache.keys().next().value);
        this.lyricCache.set(key, got);
        Object.assign(L, got);
      } catch (e) {
        L.error = "LRCLIB에 연결할 수 없어요.";
      }
      L.loading = false;
      this.lyricIdx = -1;
      if (this.lyrics === L) { this.followLyrics(cx); cx.notify(); }
    });
  }

  // Moves the highlight to the line being sung, and wakes up again when the next one starts.
  followLyrics(cx) {
    const L = this.lyrics, P = this.player;
    if (!L || L.kind !== "synced" || !P?.track) return;
    const pos = positionOf(P), idx = lineAt(L.lines, pos);
    if (idx !== this.lyricIdx) {
      this.lyricIdx = idx;
      if (Date.now() >= this.lyricFollowAt && idx >= 0) this.lyricScroll.scroll_to_item(idx, "center");
      cx.notify();
    }
    const nextT = L.lines[idx + 1]?.t;
    if (P.playing && nextT != null && nextT - pos < SHOWN_MS) {
      const gen = ++this.lyricTimer;
      cx.timer.after(Math.max(16, nextT - pos), (cx) => { if (gen === this.lyricTimer && this.view === "lyrics" && !this.closed()) this.followLyrics(cx); });
    }
  }

  // ── rows (search and library, one virtual list) ─────────────────────────────────────
  buildRows() {
    const rows = [];
    const push = (r) => { rows.push(r); if (r.kind === "item" && this.menuKey === r.key) rows.push(...this.menuRows(r)); };
    if (this.view === "search") {
      const R = this.results;
      if (R) {
        const order = R.tab === "all" ? ["track", "album", "artist", "playlist"] : [R.tab];
        const label = { track: "곡", album: "앨범", artist: "아티스트", playlist: "플레이리스트" };
        for (const type of order) {
          const list = R.sections[type] ?? [];
          if (!list.length) continue;
          if (R.tab === "all") push({ kind: "head", key: `h:${type}`, label: label[type], jump: type });
          const shown = R.tab === "all" ? list.slice(0, type === "track" ? 5 : 4) : list;
          shown.forEach((it, i) => push({ kind: "item", key: `s:${type}:${i}:${it.id}`, it, play: it.kind === "track" ? { uris: [it.uri] } : { context_uri: it.uri } }));
          if (R.tab === "all" && list.length > shown.length) push({ kind: "more", key: `m:${type}`, label: `${label[type]} 전체`, jump: type });
          else if (R.tab !== "all" && R.more[type]) push({ kind: "more", key: `m:${type}`, label: R.loading ? "불러오는 중…" : "더 불러오기", search: true });
        }
        if (R.loading && !Object.values(R.sections).some((l) => l?.length)) push({ kind: "note", key: "n:loading", text: "검색 중…" });
        else if (R.error) push({ kind: "note", key: "n:error", text: R.error, error: true });
        else if (!R.loading && !Object.values(R.sections).some((l) => l?.length)) push({ kind: "note", key: "n:none", text: `“${R.q}” 검색 결과가 없어요.` });
      }
    } else if (this.view === "library" && this.lib) {
      const L = this.lib;
      const tracks = (owner, T, ctx) => {
        T.items.forEach((it, i) => push({ kind: "item", key: `${owner}:${i}:${it.id}`, it, indent: true,
          play: ctx ? { context_uri: ctx, offset: { uri: it.uri } } : { uris: T.items.slice(i, i + 100).map((x) => x.uri) } }));
        if (T.loading) push({ kind: "note", key: `${owner}:loading`, text: "불러오는 중…", indent: true });
        else if (T.error) push({ kind: "note", key: `${owner}:error`, text: T.error, indent: true, error: true });
        else if (T.next != null && T.items.length) push({ kind: "more", key: `${owner}:more`, label: "더 불러오기", tracks: owner, indent: true });
        else if (!T.items.length) push({ kind: "note", key: `${owner}:empty`, text: "곡이 없어요.", indent: true });
      };
      push({ kind: "pl", key: "pl:liked", id: "liked", open: L.liked.open, it: { kind: "liked", name: "좋아요 표시한 곡", sub: L.liked.items.length ? `${L.liked.items.length}${L.liked.next != null ? "+" : ""}곡` : "내가 저장한 곡" } });
      if (L.liked.open) tracks("lk", L.liked, null);
      push({ kind: "head", key: "h:recent", label: "최근 재생한 곡", toggle: "recent", open: L.recent.open });
      if (L.recent.open) {
        L.recent.items.forEach((it, i) => push({ kind: "item", key: `rc:${i}:${it.id}`, it, play: { uris: L.recent.items.slice(i).map((x) => x.uri) } }));
        if (L.recent.loading) push({ kind: "note", key: "rc:loading", text: "불러오는 중…" });
        else if (L.recent.error) push({ kind: "note", key: "rc:error", text: L.recent.error, error: true });
        else if (!L.recent.items.length) push({ kind: "note", key: "rc:empty", text: "최근 재생한 곡이 없어요." });
      }
      push({ kind: "head", key: "h:pl", label: "플레이리스트", count: L.playlists.length || null });
      for (const p of L.playlists) {
        const T = L.open[p.id];
        const open = Boolean(T?.open);
        push({ kind: "pl", key: `pl:${p.id}`, id: p.id, open, it: p });
        if (open) tracks(`pt:${p.id}`, T, p.uri);
      }
      if (L.plLoading) push({ kind: "note", key: "pl:loading", text: "플레이리스트 불러오는 중…" });
      else if (L.plError) push({ kind: "note", key: "pl:error", text: L.plError, error: true });
      else if (L.plNext != null) push({ kind: "more", key: "pl:more", label: "플레이리스트 더 보기", playlists: true });
    }
    // The playlist row's own menu sits right under it, like an item's.
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].kind === "pl" && rows[i].key === this.menuKey && rows[i].it.uri) rows.splice(i + 1, 0, ...this.menuRows(rows[i]));
    }
    this.rows = rows;
    this.rowSizes = rows.map((r) => ROW_H[r.kind]);
    this.rowIndex = new Map(rows.map((r) => [r.key, r]));
    this.rowsDirty = false;
  }

  menuRows(r) {
    const it = r.it, out = [];
    const act = (a, label, icon) => out.push({ kind: "act", key: `${r.key}::${a}`, act: a, label, icon, of: r, indent: r.indent });
    act("play", "재생", "play");
    if (it.kind === "track" || it.kind === "episode") act("queue", "재생 대기열에 추가", "list-plus");
    act("open", "Spotify에서 열기", "external-link");
    if (it.url) act("copy", this.copied === `${r.key}::copy` ? "복사됨" : "링크 복사", this.copied === `${r.key}::copy` ? "check" : "copy");
    return out;
  }

  rowClick(key, cx) {
    const r = this.rowIndex.get(key);
    if (!r) return;
    if (r.kind === "item") { this.menuKey = null; this.rowsDirty = true; this.control("play", r.play, cx); return; }
    if (r.kind === "pl") {
      const L = this.lib;
      if (r.id === "liked") { L.liked.open = !L.liked.open; if (L.liked.open && !L.liked.items.length) this.moreTracks("liked", cx); }
      else {
        const T = L.open[r.id] ??= { items: [], next: 0, loading: false, error: null, open: false };
        T.open = !T.open;
        if (T.open && !T.items.length && !T.error) this.moreTracks(r.id, cx);
      }
      this.rowsDirty = true;
      return cx.notify();
    }
    if (r.kind === "head" && r.toggle === "recent") { this.lib.recent.open = !this.lib.recent.open; this.rowsDirty = true; return cx.notify(); }
    if (r.kind === "head" && r.jump || r.kind === "more" && r.jump) { this.searchTab = r.jump; this.search(cx, false); return; }
    if (r.kind === "more" && r.search) { if (!this.results?.loading) this.search(cx, true); return; }
    if (r.kind === "more" && r.playlists) { this.morePlaylists(cx); return cx.notify(); }
    if (r.kind === "more" && r.tracks) { this.moreTracks(r.tracks === "lk" ? "liked" : r.tracks.slice(3), cx); return cx.notify(); }
    if (r.kind === "act") {
      const it = r.of.it;
      this.rowsDirty = true;
      if (r.act === "play") { this.menuKey = null; this.control("play", r.of.kind === "pl" ? { context_uri: it.uri } : r.of.play, cx); }
      else if (r.act === "queue") { this.menuKey = null; this.control("queue", it.uri, cx); }
      else if (r.act === "open") { this.menuKey = null; systemOpen(it.uri); }
      else if (r.act === "copy" && it.url && WEB.test(it.url)) {
        cx.write_to_clipboard(it.url);
        this.copied = r.key;
        cx.timer.after(1500, (cx) => { if (this.copied === r.key) { this.copied = null; this.rowsDirty = true; cx.notify(); } });
      }
      cx.notify();
    }
  }

  rowMenu(key, cx) {
    const r = this.rowIndex.get(key);
    if (!r || !(r.kind === "item" || (r.kind === "pl" && r.it.uri))) return;
    this.menuKey = this.menuKey === key ? null : key;
    this.rowsDirty = true;
    cx.notify();
  }

  // ── drawing ─────────────────────────────────────────────────────────────────────────
  render(cx) {
    const t = theme();
    const root = v_flex().id("sp-root").size_full().min_h(0).bg(t.surface).text_color(t.foreground).text_size(13)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.size.width) > 1 || Math.abs(size.height - this.size.height) > 1) { this.size = size; cx.notify(); } });
    if (this.status === "loading") return root.child(div().p(14).text_color(t.dim).child("불러오는 중…"));
    root.child(this.nowPlaying(t));
    if (this.devices) root.child(this.devicePicker(t));
    if (this.note) root.child(h_flex().flex_none().px(12).py(5).gap(6).items_start().border_b(1).border_color(t.border).text_size(11.5)
      .text_color(this.note.error ? t.blocked : t.dim)
      .child(svg(ICON(this.note.error ? "triangle-alert" : "music")).size(12).flex_none().mt(1))
      .child(div().flex_1().min_w(0).child(this.note.text)));
    if (this.status === "setup" || this.wiz) {
      if (!this.wiz) this.wiz = newWizard(this.acct);
      return root.child(renderSetup(this, t, cx));
    }
    root.child(this.tabs(t));
    if (this.menu) root.child(this.menuBar(t));
    if (this.view === "lyrics") return root.child(this.lyricsView(t));
    if (this.view === "search") root.child(this.searchBar(t));
    if (this.rowsDirty) this.buildRows();
    return root.child(this.list(t));
  }

  iconButton(t, id, icon, tip, onClick, { on = false, size = 28, iconSize = 15, disabled = false } = {}) {
    return div().id(id).size(size).flex_none().flex().items_center().justify_center().rounded(size / 2)
      .text_color(disabled ? t.dim : on ? t.accent : t.muted).tooltip(tip)
      .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover).text_color(on ? t.accent : t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }))
      .when(disabled, (el) => el.opacity(0.5))
      .child(svg(ICON(icon)).size(iconSize));
  }

  // Click anywhere on a bar to jump there.
  bar(t, id, fraction, onPick, { height = 4, width = null } = {}) {
    const f = Math.max(0, Math.min(1, fraction || 0));
    return div().id(id).h(14).flex().items_center().cursor_pointer().when(width != null, (el) => el.w(width).flex_none()).when(width == null, (el) => el.flex_1().min_w(0))
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        const w = e.bounds?.width, x = e.local_position?.x;
        if (w && x != null) onPick(Math.max(0, Math.min(1, x / w)), cx);
      })
      .child(div().w_full().h(height).rounded(height / 2).bg(t.raised).overflow_hidden()
        .child(div().h_full().w(`${(f * 100).toFixed(2)}%`).rounded(height / 2).bg(t.accent)));
  }

  nowPlaying(t) {
    const P = this.player, tr = P?.track, can = Boolean(P);
    const art = tr ? this.cover(tr.art ?? tr.thumb) : null;
    const pos = positionOf(P), dur = tr?.durationMs ?? 0;
    const repeatNext = { off: "context", context: "track", track: "off" };
    const vol = P?.volume;
    const device = P?.device;
    const signed = this.status === "ready";
    return v_flex().flex_none().px(12).pt(12).pb(8).gap(8).bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().gap(10).items_center()
        .child(art ? image(art).size(56).flex_none().rounded(6)
          : div().size(56).flex_none().rounded(6).bg(t.raised).flex().items_center().justify_center().text_color(t.dim).child(svg(ICON("music")).size(22)))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().text_size(13.5).font_semibold().truncate().when(Boolean(tr?.url), (el) => el.tooltip(tr.name)).child(tr?.name || "재생 중인 곡 없음"))
          .child(div().text_size(12).text_color(t.muted).truncate().child(tr ? tr.sub || tr.album : P ? "아래에서 재생할 항목을 선택하세요" : signed ? "아무 기기에서나 Spotify를 실행하세요" : "여기서 보려면 Spotify 앱을 여세요"))
          .when(Boolean(device), (el) => el.child(h_flex().gap(4).items_center().text_size(11).text_color(P?.playing ? t.accent : t.dim)
            .child(svg(ICON(device.type === "Smartphone" ? "smartphone" : device.type === "Computer" ? "laptop" : "speaker")).size(11).flex_none())
            .child(div().truncate().child(device.name)))))
        .when(signed, (el) => el.child(this.iconButton(t, "sp-devices", "speaker", "기기", (cx) => {
          if (this.devices) { this.devices = null; cx.notify(); } else this.loadDevices(cx);
        }, { on: Boolean(this.devices) }))))
      .child(h_flex().gap(8).items_center().text_size(10.5).text_color(t.dim)
        .child(div().w(30).flex_none().child(clock(pos)))
        .child(tr && dur ? this.bar(t, "sp-seek", pos / dur, (f, cx) => this.control("seek", f * dur, cx)) : div().flex_1().h(4).rounded(2).bg(t.raised))
        .child(div().w(30).flex_none().text_right().child(clock(dur))))
      .child(h_flex().gap(2).items_center()
        .child(this.iconButton(t, "sp-shuffle", "shuffle", P?.shuffle ? "셔플 끄기" : "셔플 켜기", (cx) => this.control("shuffle", !P.shuffle, cx), { on: Boolean(P?.shuffle), disabled: !can || P.shuffle == null }))
        .child(this.iconButton(t, "sp-prev", "skip-back", "이전 곡", (cx) => this.control("prev", null, cx), { disabled: !can }))
        .child(div().id("sp-toggle").size(34).flex_none().flex().items_center().justify_center().rounded(17)
          .bg(can ? t.foreground : t.raised).text_color(can ? t.background : t.dim).tooltip(P?.playing ? "일시정지" : "재생")
          .when(can, (el) => el.cursor_pointer().hover((s) => s.opacity(0.85)).on_click((_e, cx) => this.control("toggle", null, cx)))
          .child(svg(ICON(P?.playing ? "pause" : "play")).size(16)))
        .child(this.iconButton(t, "sp-next", "skip-forward", "다음 곡", (cx) => this.control("next", null, cx), { disabled: !can }))
        .child(this.iconButton(t, "sp-repeat", P?.repeat === "track" ? "repeat-1" : "repeat", P?.repeat === "track" ? "한 곡 반복" : P?.repeat === "context" ? "전체 반복" : "반복 끄기",
          (cx) => this.control("repeat", repeatNext[P.repeat] ?? "context", cx), { on: Boolean(P?.repeat && P.repeat !== "off"), disabled: !can || P.repeat == null }))
        .child(div().flex_1())
        .child(div().id("sp-vol-wheel").flex().items_center().gap(4)
          .on_scroll_wheel((e, cx) => {
            if (vol == null || !Math.abs(e.delta.y)) return;
            this.control("volume", Math.max(0, Math.min(100, vol + (e.delta.y > 0 ? 5 : -5))), cx);
          })
          .child(this.iconButton(t, "sp-mute", vol === 0 ? "volume-x" : (vol ?? 50) < 50 ? "volume-1" : "volume-2", vol == null ? "음량" : `음량 ${vol}%`, (cx) => {
            if (vol == null) return;
            if (vol > 0) { this.unmuteTo = vol; this.control("volume", 0, cx); } else this.control("volume", this.unmuteTo || 50, cx);
          }, { disabled: vol == null || device?.volumeOk === false, size: 24, iconSize: 14 }))
          .child(vol == null ? div().w(56).h(4).rounded(2).bg(t.raised) : this.bar(t, "sp-vol", vol / 100, (f, cx) => this.control("volume", Math.round(f * 100), cx), { width: 56 }))));
  }

  devicePicker(t) {
    const D = this.devices;
    const rows = D.loading ? [div().text_size(12).text_color(t.dim).child("기기 찾는 중…")]
      : D.error ? [div().text_size(12).text_color(t.blocked).child(D.error)]
      : !D.list.length ? [div().text_size(12).text_color(t.dim).child("기기가 없어요. 스마트폰, 컴퓨터 또는 스피커에서 Spotify를 여세요.")]
      : D.list.map((d) => h_flex().id(`sp-dev-${d.id}`).h(30).px(8).gap(8).items_center().rounded(4).cursor_pointer()
        .text_size(12.5).text_color(d.is_active ? t.accent : t.foreground).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { this.devices = null; if (!d.is_active) this.control("transfer", d.id, cx); else cx.notify(); })
        .child(svg(ICON(d.type === "Smartphone" ? "smartphone" : d.type === "Computer" ? "laptop" : "speaker")).size(14).flex_none())
        .child(div().flex_1().min_w(0).truncate().child(d.name))
        .when(d.is_active, (el) => el.child(svg(ICON("check")).size(13).flex_none())));
    return v_flex().flex_none().px(8).py(6).gap(2).bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().px(8).h(22).items_center().text_size(11).text_color(t.dim).child(div().flex_1().child("기기"))
        .child(this.iconButton(t, "sp-dev-refresh", "refresh-cw", "다시 찾기", (cx) => this.loadDevices(cx), { size: 22, iconSize: 12 })))
      .children(rows);
  }

  tabs(t) {
    const tab = (id, label, icon) => {
      const on = this.view === id;
      return h_flex().id(`sp-tab-${id}`).h(26).px(9).gap(5).flex_none().items_center().rounded(6).cursor_pointer().text_size(12)
        .bg(on ? t.selected : t.surface).text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => this.setView(id, cx)).child(svg(ICON(icon)).size(13)).child(label);
    };
    return h_flex().flex_none().px(8).py(6).gap(3).items_center().border_b(1).border_color(t.border)
      .child(tab("search", "검색", "search"))
      .child(tab("library", "라이브러리", "library"))
      .child(tab("lyrics", "가사", "mic-vocal"))
      .child(div().flex_1())
      .child(this.iconButton(t, "sp-gear", "settings", "Spotify 설정", (cx) => { this.menu = !this.menu; this.signoutArmed = false; cx.notify(); }, { on: this.menu, size: 24, iconSize: 13 }));
  }

  menuBar(t) {
    return h_flex().flex_none().px(8).py(6).gap(6).flex_wrap().bg(t.chrome).border_b(1).border_color(t.border)
      .child(button(t, "sp-m-reload", "새로고침", (_e, cx) => { this.menu = false; this.lib = null; this.results = null; this.rowsDirty = true; if (this.view === "library") this.loadLibrary(cx); this.poll(cx); cx.notify(); }, { icon: "refresh-cw" }))
      .child(button(t, "sp-m-client", "Client ID 변경…", (_e, cx) => { this.menu = false; this.wiz = newWizard(this.acct); this.wiz.step = 1; cx.notify(); }, { icon: "key" }))
      .child(button(t, "sp-m-out", this.signoutArmed ? "정말요? 로그아웃" : "로그아웃", (_e, cx) => {
        if (!this.signoutArmed) {
          this.signoutArmed = true;
          cx.timer.after(4000, (cx) => { this.signoutArmed = false; cx.notify(); });
          return cx.notify();
        }
        this.signOut(cx);
      }, { icon: "log-out" }));
  }

  searchBar(t) {
    const chip = (id, label) => {
      const on = this.searchTab === id;
      return div().id(`sp-st-${id}`).h(22).px(8).flex().items_center().rounded(11).cursor_pointer().text_size(11.5)
        .bg(on ? t.foreground : t.raised).text_color(on ? t.background : t.muted).hover((s) => s.opacity(0.85))
        .on_click((_e, cx) => { if (this.searchTab !== id) { this.searchTab = id; this.menuKey = null; this.search(cx, false); cx.notify(); } })
        .child(label);
    };
    return v_flex().flex_none().px(10).pt(8).pb(6).gap(6)
      .child(div().relative()
        .child(Input.new(this.q).h(30).pl(30).pr(9).rounded(6).border(1).border_color(t.input).bg(t.canvas ?? t.background).text_size(12.5).text_color(t.foreground))
        .child(div().absolute().left(9).top(0).h(30).flex().items_center().text_color(t.dim).child(svg(ICON("search")).size(14)))
        .when(this.qEmpty, (el) => el.child(div().absolute().left(30).top(0).h(30).flex().items_center().text_size(12.5).text_color(t.dim).child("곡, 앨범, 아티스트, 플레이리스트"))))
      .child(h_flex().gap(4).flex_wrap()
        .child(chip("all", "전체")).child(chip("track", "곡")).child(chip("album", "앨범"))
        .child(chip("artist", "아티스트")).child(chip("playlist", "플레이리스트")));
  }

  list(t) {
    const rows = this.rows;
    if (!rows.length) {
      const text = this.view === "search" ? "Spotify에서 검색해 보세요. 결과를 클릭하면 재생하고, 우클릭하면 더 많은 메뉴가 열려요." : this.lib ? "불러오는 중…" : "연결 중…";
      return div().flex_1().p(16).text_size(12).text_color(t.dim).child(text);
    }
    const nowUri = this.player?.track?.uri;
    return div().flex_1().min_h(0).relative()
      .child(v_virtual_list("sp-rows", rows.length, this.rowSizes, (i) => rows[i].key, (range) => {
        const out = [];
        for (let i = range.start; i < range.end; i++) out.push(this.row(t, rows[i], nowUri));
        return out;
      }).size_full()
        .on_item_click((key, cx) => this.rowClick(key, cx))
        .on_item_secondary_click((key, _e, cx) => this.rowMenu(key, cx)))
      .child(Scrollbar.vertical("sp-rows").absolute().inset_0());
  }

  thumb(t, url, size, round, fallback) {
    const path = this.cover(url);
    return path ? image(path).size(size).flex_none().rounded(round)
      : div().size(size).flex_none().rounded(round).bg(t.raised).flex().items_center().justify_center().text_color(t.dim).child(svg(ICON(fallback)).size(Math.round(size * 0.45)));
  }

  row(t, r, nowUri) {
    const pad = r.indent ? 28 : 10;
    if (r.kind === "head") {
      return h_flex().h(ROW_H.head).px(12).gap(6).items_center().text_size(11).font_semibold().text_color(t.dim)
        .when(r.toggle != null, (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground))
          .child(svg(ICON(r.open ? "chevron-down" : "chevron-right")).size(12).flex_none()))
        .child(div().flex_1().child(r.label.toUpperCase()))
        .when(r.count != null, (el) => el.child(div().child(String(r.count))))
        .when(Boolean(r.jump), (el) => el.cursor_pointer().hover((s) => s.text_color(t.foreground)).child(svg(ICON("chevron-right")).size(12)));
    }
    if (r.kind === "note") {
      return h_flex().h(ROW_H.note).pl(pad + 2).pr(10).items_center().text_size(11.5).text_color(r.error ? t.blocked : t.dim).child(div().truncate().child(r.text));
    }
    if (r.kind === "more") {
      return h_flex().h(ROW_H.more).pl(pad + 2).pr(10).items_center().gap(4).text_size(12).text_color(t.accent).cursor_pointer().hover((s) => s.text_color(t.foreground))
        .child(r.label).child(svg(ICON("chevron-right")).size(12));
    }
    if (r.kind === "act") {
      return h_flex().h(ROW_H.act).pl(pad + 44).pr(10).gap(8).items_center().text_size(12).text_color(t.foreground).bg(t.chrome).cursor_pointer().hover((s) => s.bg(t.hover))
        .child(svg(ICON(r.icon)).size(13).flex_none().text_color(t.muted)).child(r.label);
    }
    const it = r.it, menu = this.menuKey === r.key;
    if (r.kind === "pl") {
      return h_flex().h(ROW_H.pl).pl(6).pr(10).gap(6).items_center().cursor_pointer().when(menu, (el) => el.bg(t.hover)).hover((s) => s.bg(t.hover))
        .child(svg(ICON(r.open ? "chevron-down" : "chevron-right")).size(13).flex_none().text_color(t.dim))
        .child(it.kind === "liked"
          ? div().size(36).flex_none().rounded(4).bg(t.accent).flex().items_center().justify_center().text_color(t.accent_foreground).child(svg(ICON("heart")).size(16))
          : this.thumb(t, it.thumb, 36, 4, "list-music"))
        .child(v_flex().flex_1().min_w(0).ml(4)
          .child(div().text_size(12.5).truncate().text_color(t.foreground).child(it.name))
          .child(div().text_size(11).truncate().text_color(t.dim).child(it.sub)));
    }
    const playing = Boolean(nowUri) && it.uri === nowUri;
    const fallback = { track: "music", episode: "music", album: "disc-3", artist: "user", playlist: "list-music" }[it.kind] ?? "music";
    return h_flex().h(ROW_H.item).pl(pad).pr(10).gap(10).items_center().cursor_pointer().when(menu, (el) => el.bg(t.hover)).hover((s) => s.bg(t.hover))
      .child(this.thumb(t, it.thumb, 34, it.kind === "artist" ? 17 : 4, fallback))
      .child(v_flex().flex_1().min_w(0)
        .child(div().text_size(12.5).truncate().text_color(playing ? t.accent : t.foreground).child(it.name))
        .child(div().text_size(11).truncate().text_color(t.dim).child(it.kind === "track" || it.kind === "episode" ? it.sub : `${{ album: "앨범", artist: "아티스트", playlist: "플레이리스트" }[it.kind]}${it.sub && it.kind !== "artist" ? ` · ${it.sub}` : ""}`)))
      .when(it.kind === "track" || it.kind === "episode", (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(clock(it.durationMs))));
  }

  lyricsView(t) {
    const L = this.lyrics, tr = this.player?.track;
    const msg = (text) => v_flex().flex_1().p(16).gap(6).items_center().justify_center().text_size(12.5).text_color(t.dim).child(text);
    if (!tr) return msg("가사를 보려면 곡을 재생하세요.");
    if (!L || L.key !== trackKey(tr)) return msg("가사 찾는 중…");
    if (L.loading) return msg("가사 찾는 중…");
    if (L.error) return msg(L.error);
    if (L.kind === "instrumental") return msg("연주곡이에요. 가사가 없어요.");
    if (L.kind === "none" || !L.lines.length) return msg("LRCLIB에서 이 곡의 가사를 찾지 못했어요.");
    const width = this.size.width;
    if (L.width !== width) { L.sizes = L.lines.map((l) => lyricHeight(l.text, width)); L.width = width; }
    const synced = L.kind === "synced", at = synced ? this.lyricIdx : -1;
    return v_flex().flex_1().min_h(0)
      .child(h_flex().flex_none().px(14).py(5).gap(6).items_center().text_size(11).text_color(t.dim)
        .child(div().flex_1().truncate().child(synced ? "싱크 가사 · LRCLIB" : "가사 · LRCLIB (싱크 없음)"))
        .when(synced && Date.now() < this.lyricFollowAt, (el) => el.child(div().id("sp-ly-follow").px(6).h(18).flex().items_center().rounded(9).bg(t.raised).cursor_pointer()
          .text_color(t.foreground).hover((s) => s.opacity(0.85)).on_click((_e, cx) => { this.lyricFollowAt = 0; if (this.lyricIdx >= 0) this.lyricScroll.scroll_to_item(this.lyricIdx, "center"); cx.notify(); })
          .child("따라가기"))))
      .child(div().id("sp-ly-box").flex_1().min_h(0).relative()
        // A scroll by hand stops following the song for a few seconds.
        .on_scroll_wheel((_e, cx) => { if (synced) { this.lyricFollowAt = Date.now() + 6000; cx.notify(); } })
        .child(v_virtual_list("sp-lyrics", L.lines.length, L.sizes, (i) => String(i), (range) => {
          const out = [];
          for (let i = range.start; i < range.end; i++) {
            const line = L.lines[i], cur = i === at;
            out.push(div().h(L.sizes[i]).px(18).py(4).text_size(cur ? 15 : 14).line_height(21)
              .when(cur, (el) => el.font_semibold().text_color(t.foreground))
              .when(!cur, (el) => el.text_color(synced && i < at ? t.dim : t.muted))
              .child(line.text || (synced ? "♪" : "")));
          }
          return out;
        }).size_full().track_scroll(this.lyricScroll)
          .on_item_click((key, cx) => {
            // Click a synced line to jump the song there.
            const line = L.lines[Number(key)];
            if (synced && line?.t != null) this.control("seek", line.t, cx);
          }))
        .child(Scrollbar.vertical("sp-lyrics").absolute().inset_0()));
  }
}
