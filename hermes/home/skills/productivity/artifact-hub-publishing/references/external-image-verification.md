# External image verification for Artifact Hub

Use this when a Markdown artifact embeds third-party images, especially Wikimedia Commons.

## Reliable workflow

1. Prefer an image URL that returns the image bytes directly, not a page URL or redirect endpoint.
2. For Wikimedia Commons, avoid relying on `Special:Redirect/file/...?...` as the final embedded URL. Redirects may render as broken images because of throttling, CORS, or anti-bot handling even when the source page opens normally.
3. Use `upload.wikimedia.org` originals for small files or generated thumbnails for large files. Commons thumbnail URLs use this shape:

   `https://upload.wikimedia.org/wikipedia/commons/thumb/<h1>/<h2>/<filename>/<allowed-width>px-<filename>`

   where `<h1>/<h2>` are the first one and two hexadecimal characters of the MD5 hash of the normalized filename (spaces become underscores). Use Commons-supported thumbnail widths such as 960, 1280, or 1920 rather than arbitrary sizes; unsupported sizes can return HTTP 400.
4. Keep a separate link to the Commons file description page under each image so readers can inspect the author and exact license.
5. After publication, open the rendered document and inspect the full page visually. A semantic snapshot can show an `image` node even when the browser displays only alt text and a broken-image icon. Also inspect runtime properties for every image: `complete === true`, `naturalWidth > 0`, and `naturalHeight > 0`.
6. If any image is broken, replace the embed URL with a direct `upload.wikimedia.org` original/thumbnail URL. If a supported large thumbnail intermittently fails, try another supported width such as 960 instead of assuming the file is absent. Publish a new version, reload the final version, and re-check every image rather than only the changed one.

## Completion criteria

- Every intended image appears as pixels, not alt text or a broken-image icon.
- Captions and license/source links remain visible.
- Images fit the content column without clipping, overlap, or unexpected stretching.
- The final Artifact Hub update returns no structural warnings.

## Sourcing component and product images

When a game or product artifact needs visual materials (boards, components, cards, screenshots), pull image URLs from endpoints that serve lists directly — brand storefronts, crowdfunding pages, and community wikis are bot-walled for plain curl and may Cloudflare-block headless browsers.

1. **Shopify storefronts** — find product handles in the homepage HTML (`/products/([a-z0-9-]+)`), then `curl https://<shop>/products/<handle>.js` returns a JSON object with every CDN image URL (`//cdn.shopify.com/...`).
2. **Steam games and DLC** — `curl 'https://store.steampowered.com/api/appdetails?appids=<id>&l=english'` returns the header image and full-resolution screenshot URLs on `shared.akamai.steamstatic.com`.
3. Download candidates, confirm real image data with `file` (JPEG/PNG, sane dimensions), and identify each picture visually so captions describe what it actually shows.
4. Optimize before hosting: resize to ≤1400px, JPEG quality ~82, flatten alpha onto a white background, then upload with `cdn put` (see `pdf-figure-crop-and-host.md`) and embed per the workflow above.