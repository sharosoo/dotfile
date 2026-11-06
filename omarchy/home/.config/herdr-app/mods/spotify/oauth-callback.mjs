// One-shot OAuth callback listener for the Spotify mod. Mods can't listen on a port, so the
// mod runs this with bun and waits for it to exit:
//   bun oauth-callback.mjs 47830 <state> <timeout-seconds>
// It answers the browser's redirect to http://127.0.0.1:47830/callback once, prints one JSON
// line ({"code"} or {"error"}) and exits. The mod stops a wait it no longer wants with
// GET /cancel?state=<state>; anything else, or a wrong state, is refused and keeps waiting.
// The port is the one registered as the app's Redirect URI; no other is accepted.
const PORT = 47830;
const HOST = `127.0.0.1:${PORT}`;
const [port, state, timeout] = [Number(process.argv[2]), process.argv[3], Number(process.argv[4] || 300)];
if (port !== PORT || !state) {
  console.log(JSON.stringify({ error: "usage" }));
  process.exit(2);
}

const page = (title, body) => new Response(
  `<!doctype html><meta charset="utf-8"><title>${title}</title>`
  + `<body style="font:15px system-ui;background:#121212;color:#eee;display:grid;place-items:center;height:90vh">`
  + `<div style="text-align:center"><h2 style="color:#1ed760">${title}</h2><p>${body}</p></div>`,
  { headers: { "content-type": "text/html; charset=utf-8" } });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let finished = false;
const finish = (result, code) => {
  if (finished) return;
  finished = true;
  console.log(JSON.stringify(result));
  // Let the response reach the browser before the process goes.
  setTimeout(() => process.exit(code), 150);
};

try {
  Bun.serve({
    hostname: "127.0.0.1",
    port: PORT,
    fetch(req) {
      const url = new URL(req.url);
      const h = req.headers, site = h.get("sec-fetch-site");
      // Only top-level GETs to this exact host: a page elsewhere can't drive it with
      // fetch/forms (Origin) or DNS rebinding (Host).
      if (req.method !== "GET" || h.get("host") !== HOST || h.has("origin")) return new Response("Forbidden", { status: 403 });
      if (url.searchParams.get("state") !== state) return new Response("Not found", { status: 404 });
      // Spotify's redirect is a cross-site navigation; the mod's own cancel request carries no
      // fetch metadata at all.
      const allowed = url.pathname === "/callback" ? [null, "none", "cross-site"] : [null, "none"];
      if (!allowed.includes(site)) return new Response("Forbidden", { status: 403 });
      if (url.pathname === "/cancel") {
        finish({ error: "cancelled" }, 0);
        return new Response("ok");
      }
      if (url.pathname !== "/callback") return new Response("Not found", { status: 404 });
      const error = url.searchParams.get("error"), code = url.searchParams.get("code");
      if (error || !code) {
        finish({ error: error || "no_code" }, 0);
        return page("Not connected", `Spotify said: ${esc(error || "no code")}. Go back to Herdr and try again.`);
      }
      finish({ code }, 0);
      return page("Connected", "You can close this tab and go back to Herdr.");
    },
  });
} catch (e) {
  console.log(JSON.stringify({ error: /in use|EADDRINUSE/i.test(String(e?.message ?? e)) ? "port_in_use" : "listen_failed" }));
  process.exit(1);
}
setTimeout(() => finish({ error: "timeout" }, 0), timeout * 1000);
