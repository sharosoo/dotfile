// The Spotify desktop app on this machine, through MPRIS on the session bus (busctl, part of
// systemd). Used when the Web API can't control playback: no Premium, no active device, or no
// sign-in at all. MPRIS has no queue, devices or search.
import { exec } from "herdr";

const BUS = "org.mpris.MediaPlayer2.spotify";
const PATH = "/org/mpris/MediaPlayer2";
const PLAYER = "org.mpris.MediaPlayer2.Player";
const busctl = (args) => exec("busctl", ["--user", ...args]).catch(() => ({ code: -1, stdout: "", stderr: "busctl missing" }));

const val = (v) => (v && typeof v === "object" && "data" in v ? v.data : v);

// null when the app isn't running (or the bus can't be asked).
export async function readMpris() {
  let r = await busctl(["--json=short", "get-property", BUS, PATH, PLAYER, "Metadata", "PlaybackStatus", "Position", "Volume", "Shuffle", "LoopStatus"]);
  let extra = true;
  // Some builds lack the optional properties; the first three are enough to draw the bar.
  if (r.code !== 0 && !/not activatable|was not provided|ServiceUnknown/i.test(r.stderr)) {
    r = await busctl(["--json=short", "get-property", BUS, PATH, PLAYER, "Metadata", "PlaybackStatus", "Position"]);
    extra = false;
  }
  if (r.code !== 0) return null;
  const lines = r.stdout.trim().split("\n").map((l) => { try { return JSON.parse(l); } catch (_) { return null; } });
  const [meta, status, position, volume, shuffle, loop] = lines.map(val);
  const m = meta ?? {};
  const trackId = val(m["mpris:trackid"]) ?? "";
  const url = val(m["xesam:url"]) ?? "";
  // Spotify's track ids are object paths (/com/spotify/track/<id>); its links name the same id.
  const sid = /\/track\/([A-Za-z0-9]+)/.exec(url)?.[1] ?? /\/track\/([A-Za-z0-9]+)/.exec(trackId)?.[1] ?? null;
  const title = val(m["xesam:title"]) ?? "";
  const artists = (val(m["xesam:artist"]) ?? []).join(", ");
  const art = val(m["mpris:artUrl"]) ?? null;
  return {
    source: "mpris",
    playing: status === "Playing",
    track: title ? {
      kind: "track", id: sid, uri: sid ? `spotify:track:${sid}` : null, name: title, sub: artists, artists,
      album: val(m["xesam:album"]) ?? "", durationMs: Math.round(Number(val(m["mpris:length"]) ?? 0) / 1000),
      url: url || null, thumb: art, art, mprisId: trackId,
    } : null,
    progressMs: Math.round(Number(position ?? 0) / 1000),
    at: Date.now(),
    shuffle: extra ? Boolean(shuffle) : null,
    repeat: extra ? ({ None: "off", Playlist: "context", Track: "track" }[loop] ?? "off") : null,
    volume: extra && volume != null ? Math.round(Number(volume) * 100) : null,
    device: { id: null, name: "이 컴퓨터의 Spotify", type: "Computer", volumeOk: extra },
  };
}

const call = (method, ...args) => busctl(["call", BUS, PATH, PLAYER, method, ...args]);
const set = (prop, sig, value) => busctl(["set-property", BUS, PATH, PLAYER, prop, sig, String(value)]);

// One control. Resolves true when the app took it.
export async function mprisControl(kind, arg, now) {
  let r;
  switch (kind) {
    case "toggle": r = await call("PlayPause"); break;
    case "next": r = await call("Next"); break;
    case "prev": r = await call("Previous"); break;
    case "seek": if (!now?.track?.mprisId) return false; r = await call("SetPosition", "ox", now.track.mprisId, String(Math.round(arg * 1000))); break;
    case "volume": r = await set("Volume", "d", Math.max(0, Math.min(1, arg / 100))); break;
    case "shuffle": r = await set("Shuffle", "b", arg ? "true" : "false"); break;
    case "repeat": r = await set("LoopStatus", "s", { off: "None", context: "Playlist", track: "Track" }[arg] ?? "None"); break;
    case "open": r = await call("OpenUri", "s", arg); break;
    default: return false;
  }
  return r.code === 0;
}
