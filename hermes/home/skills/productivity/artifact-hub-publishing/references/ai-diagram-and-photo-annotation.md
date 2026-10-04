# AI-generated diagrams and annotated photos for article figures

Use when an Artifact Hub article needs visuals that mermaid cannot express: schematic board/map diagrams, concept infographics with art, or annotations on top of a real screenshot/photo. Hosting is shared with `pdf-figure-crop-and-host.md`; embed verification with `external-image-verification.md`.

## Pick the visual type first
- Structure, flow, or state with text → ` ```mermaid ` fence in the md body. Never image-gen these.
- Real appearance of a physical component, board, or screen → real photo/screenshot, annotated if needed.
- Stylized art or icons that no reachable photo covers → `image_generate` art-only assets + local label overlay.

## Source real component images (try in this order, stop at first hit)
1. Shopify shop: scrape product handles from the homepage HTML (`/products/([a-z0-9-]+)`), then `curl https://<shop>/products/<handle>.js` → JSON `images[]` with direct CDN URLs, no hotlink protection.
2. Steam: `curl 'https://store.steampowered.com/api/appdetails?appids=<id>&l=english'` → `data.screenshots[].path_full` (1920x1080 renders) and `header_image`.
3. Bot-walled — do not burn turns: BGG (XML API returns Unauthorized to plain curl; the site serves a Cloudflare challenge to the browser), Gamefound and Kickstarter serve bot-wall pages to curl. If the only source is walled, generate a stylized illustration instead and caption it as an illustration, not a photo.
4. How-to/preview videos on YouTube — stills of real play beat stock photos when no usable photo exists. Product-site promo videos are often dead (Twitch VOD links rot to "does not exist"); go straight to a community how-to video when the promo link is dead.

## How-to video frame stills

1. Find candidates: `yt-dlp --skip-download --flat-playlist --print '%(id)s | %(duration)s | %(title)s' 'ytsearch6:<subject> how to play'`. Pick the shortest full-rules video — a ~10min walkthrough beats a 2h playthrough for frame density.
2. If the default client fails with "n challenge solving failed" → "This video is not available", retry with `--extractor-args 'youtube:player_client=android,ios'`; that downloads when the web client refuses.
3. Sample: `ffmpeg -i vid.mp4 -vf 'fps=1/10,scale=480:-1' -q:v 4 frames/f_%03d.jpg` — frame N lands at t=(N-1)·10s. Build timestamp-labeled contact sheets (PIL grid, 4×4 tiles) and vision_analyze each sheet to classify scenes (setup / cards face-down / reveal / combat / round end) and pick keyframes. 10s sampling sits ±5s from any event — label that uncertainty when re-extracting.
4. Re-extract picks at full quality: `ffmpeg -ss <t> -i vid.mp4 -frames:v 1 -q:v 2 out.jpg`.
5. Vision-verify each pick actually shows its intended caption — read card names and UI text from the frame itself, not from an earlier misread of a low-res contact sheet.
6. Host under the same topic dir, and attribute title + channel in the article's Sources (fetch channel via `curl` of the watch page → `"ownerChannelName":"..."`; `yt-dlp --print` can fail after a download succeeded).

## Never let the image model render the text
Generate art-only assets and overlay every label with PIL — image models mangle text and Korean glyphs come out as garbage.
- Prompt explicitly for "no text, no letters, no numbers".
- Fonts on this box: `/usr/share/fonts/truetype/nanum/NanumSquareB.ttf` (bold labels), `NanumSquareRoundR.ttf` (body), Noto CJK under `/usr/share/fonts/opentype/noto/`.
- ASCII hyphen for negatives (`-1`) — U+2212 minus renders as tofu in Nanum fonts.
- Measure before committing: `font.getlength(label)` must fit the tile/column width. Overlapping labels → two-line layout (main label bold, short parenthetical at ~0.75 size on the second line).
- Translucent strokes, badges, and pill labels go on an RGBA overlay, then `alpha_composite`.

## Multi-asset generation (one image_generate call per response)
- Ask for a 2x2 grid or a row "separated by clean thin white gutters", each panel art-only, no frames.
- Split by whitespace gaps, never fixed thirds: per-column ink projection (count pixels below a threshold), find empty-column runs, split at the run centers nearest the 1/N boundaries. Fixed thirds slice through figures that touch.
- If crops bleed adjacent figures, regenerate with "very wide empty white margins between them, never touching or overlapping" and re-split.

## Label text: English draft → agy naturalize (정혁 preference)
Hand-written Korean labels read as 번역투 to 정혁. Draft every label in English, then naturalize:
1. Write a prompt file with the English labels as a JSON object plus rules: label register (short, drop trailing 조사 where a label reads better without it), keep community terms in English (Throne, Push, Spawn), fixed map (minion→미니언, battle zone→전투 구역, wave counter→웨이브 카운터), respond with JSON only.
2. Run through a script file built with `shlex.quote` — never inline the prompt through shell double quotes:
   `agy --print <quoted-prompt> --dangerously-skip-permissions`
   `agy -p "..."` fails argument parsing (prints usage, exit 2) — use `--print` with the prompt as its value.
3. Regex-extract the outer JSON braces, and read every returned value yourself before rendering.

## Annotating a real photo/screenshot
- Busy 3D screenshots: numbered badges (white circle, dark border) on the image plus a legend strip appended below the photo beats leader-line text boxes — text boxes collide with the subject.
- Flow/push arrows: translucent RGBA polyline with `joint="curve"`, polygon arrowhead, and a small pill label on a white rounded rect.
- Verify placement with vision_analyze on the composed image ("is badge N on feature X — if not, give corrected coordinates"), fix, re-check. Verify label rendering (glyphs, truncation, column overflow) the same way before publishing.

## Pipeline and caching
- Compose in /tmp; composite RGBA over white; resize to ~1400-2300px wide; JPEG q88-90 progressive.
- Host: `github.com/sharosoo/image` under a topic dir; embed `https://raw.githubusercontent.com/sharosoo/image/main/<dir>/<file>.jpg`; curl-verify 200 + bytes before embedding.
- Updating an existing image file in place: append `?v=N` to the raw URL in the article body — GitHub raw caches a few minutes and the embed keeps showing old pixels otherwise.
- Post-publish: browser-check every embed `complete && naturalWidth > 0`, and confirm the new pixel dimensions when an image was replaced — matching dimensions are the proof the fresh file rendered rather than a cache copy.
