// Lyrics from LRCLIB (https://lrclib.net): the Web API has none. A track is looked up by its
// exact signature first (/api/get), then by a search whose result is the one closest in
// length. Synced lyrics come as LRC: "[mm:ss.xx] line".
const LRCLIB = "https://lrclib.net/api";
const HEADERS = { "User-Agent": "herdr-spotify-mod/1.0" };

// "[01:02.34]" may repeat at a line's start: the same words at several moments.
export function parseLrc(text) {
  const out = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const stamps = [];
    let rest = raw, m;
    while ((m = /^\s*\[(\d+):(\d+(?:[.:]\d+)?)\]/.exec(rest))) {
      stamps.push(Math.round((Number(m[1]) * 60 + Number(m[2].replace(":", "."))) * 1000));
      rest = rest.slice(m[0].length);
    }
    for (const t of stamps) out.push({ t, text: rest.trim() });
  }
  return out.sort((a, b) => a.t - b.t);
}

// The line sung at `ms`: the last one started, or -1 before the first.
export function lineAt(lines, ms) {
  let lo = 0, hi = lines.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= ms) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at;
}

function shape(j) {
  if (!j) return null;
  if (j.syncedLyrics) {
    const lines = parseLrc(j.syncedLyrics);
    if (lines.length) return { kind: "synced", lines };
  }
  if (j.plainLyrics) return { kind: "plain", lines: j.plainLyrics.split(/\r?\n/).map((text) => ({ t: null, text: text.trim() })) };
  if (j.instrumental) return { kind: "instrumental", lines: [] };
  return null;
}

// { kind: "synced" | "plain" | "instrumental" | "none", lines } for a track
// ({ name, artists, album, durationMs }); throws only when LRCLIB can't be reached.
export async function fetchLyrics(track) {
  const artist = (track.artists ?? "").split(", ")[0];
  const secs = Math.round((track.durationMs ?? 0) / 1000);
  const q = new URLSearchParams({ track_name: track.name, artist_name: artist });
  if (track.album) q.set("album_name", track.album);
  if (secs) q.set("duration", String(secs));
  const res = await fetch(`${LRCLIB}/get?${q}`, { headers: HEADERS });
  if (res.status === 200) {
    const got = shape(await res.json().catch(() => null));
    if (got) return got;
  } else if (res.status !== 404) {
    throw new Error(`LRCLIB answered ${res.status}`);
  }
  const s = await fetch(`${LRCLIB}/search?${new URLSearchParams({ track_name: track.name, artist_name: artist })}`, { headers: HEADERS });
  if (s.status !== 200) return { kind: "none", lines: [] };
  const list = (await s.json().catch(() => [])) ?? [];
  // Within 3 s of the track's length, synced first: a different cut has different timings.
  const near = list.filter((r) => !secs || Math.abs((r.duration ?? 0) - secs) <= 3);
  const best = near.find((r) => r.syncedLyrics) ?? near.find((r) => r.plainLyrics) ?? (secs ? null : list[0]);
  return shape(best) ?? { kind: "none", lines: [] };
}
