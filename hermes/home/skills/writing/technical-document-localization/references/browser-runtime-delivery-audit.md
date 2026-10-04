# Browser runtime and delivery audit for localized HTML

Use this after prose correction and static source-vs-target preservation checks have passed. It catches defects that exist only after JavaScript runs or after the final standalone/package build.

## Why this is separate

A static HTML parser sees only IDs and links present in the file. Runtime code may assign IDs to headings, generate a table of contents, inject images, restore a theme, or rewrite anchors. A static validator can therefore report no duplicate IDs while the live DOM contains collisions.

Typical failure pattern:

```js
const headings = [...document.querySelectorAll('h2,h3')];
headings.forEach((h, i) => {
  if (!h.id) h.id = `section-${i + 1}`;
});
```

This can collide with an existing `<section id="section-1">`. Generate IDs from a document-wide used-ID set instead:

```js
const used = new Set([...document.querySelectorAll('[id]')].map(el => el.id));
let n = 1;
for (const heading of document.querySelectorAll('h2,h3')) {
  if (heading.id) continue;
  while (used.has(`toc-heading-${n}`)) n++;
  heading.id = `toc-heading-${n++}`;
  used.add(heading.id);
}
```

## Runtime DOM audit

Open the exact final standalone HTML, not an intermediate fragment. After `document.readyState === 'complete'`, verify:

1. Every image is complete and has `naturalWidth > 0`.
2. Expected Figure, table, reference, heading, and appendix counts are present.
3. Embedded images use the expected `data:` URLs when the artifact is advertised as standalone.
4. No duplicate IDs exist in the live DOM.
5. Every generated table-of-contents `href="#…"` resolves to an element.
6. `scrollWidth <= clientWidth` at the intended viewport; inspect wide equations and tables separately when needed.
7. Theme controls, table-of-contents controls, and at least one deep link work after actual activation.
8. Browser console and uncaught JavaScript error buffers are empty.

Compact browser-console probe:

```js
(() => {
  const imgs = [...document.images];
  const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  const toc = [...document.querySelectorAll('#toc a[href^="#"]')];
  return {
    ready: document.readyState,
    images: imgs.length,
    loadedImages: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
    brokenImages: imgs.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.alt),
    duplicateIds: duplicates,
    missingTocTargets: toc.map(a => a.hash.slice(1)).filter(id => id && !document.getElementById(id)),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
})()
```

Do not trust an automation result that says an element was clicked without checking the resulting state. Confirm `location.hash`, target position, theme attribute, storage value, or other observable state. If element-level click routing reports success but state does not change, refresh the accessibility snapshot and retry; as a last verification step, trigger the same DOM click directly and read back the result.

## Standalone and archive audit

For standalone HTML:

- Count embedded image payloads.
- Base64-decode each payload with strict validation.
- Check the decoded magic bytes or file signature.
- Confirm there are no unexpected external asset dependencies.

For an archive:

- Recreate it from scratch rather than updating an old ZIP in place.
- Test archive CRC/integrity.
- Assert the expected entry count and asset count.
- Read back the packaged main HTML and compare it byte-for-byte with the final source.
- If an original source document is included, compare it byte-for-byte or by cryptographic hash with the designated source.

## Rebuild ordering

Any late fix to prose, build code, generated IDs, or styling invalidates downstream artifacts. Rerun in this order:

1. source-vs-target preservation audit;
2. HTML build;
3. static HTML validation;
4. standalone embedding;
5. coverage/report regeneration using current sizes and counts;
6. archive creation from scratch;
7. archive and embedded-asset integrity tests;
8. browser runtime audit;
9. final size and hash calculation.

Never patch a report's size or hash before the final build is stable. If the browser audit leads to another code change, restart the downstream sequence rather than reusing earlier PASS results.
