# centrifugal/centrifugo wiki — page inventory and RSC chunk map

Validated 2026-08-09. Used to verify complete extraction (29 pages, 125 mermaid diagrams).

## URL → page → RSC chunk index

`curl -sS https://deepwiki.com/centrifugal/centrifugo/<page>` returns HTML whose
`self.__next_f.push([1,"..."])` script tags contain the whole wiki. Page markdown lives in
alternating text chunks starting at index 9 (index 8 is a small `T`-prefix chunk before it;
odd indexes 9, 11, 13, ... are page bodies).

| # | URL slug | Chunk idx | mermaid count |
|---|---|---|---|
| 1 | 1-overview | 9 | 3 |
| 1.1 | 1.1-architecture-overview | 11 | 6 |
| 1.2 | 1.2-core-concepts-and-cli | 13 | 3 |
| 2 | 2-installation-and-deployment | 15 | 3 |
| 2.1 | 2.1-build-from-source | 17 | 4 |
| 2.2 | 2.2-docker-deployment | 19 | 2 |
| 2.3 | 2.3-configuration-management | 21 | 5 |
| 3 | 3-client-connection-system | 23 | 4 |
| 3.1 | 3.1-transport-protocols | 25 | 3 |
| 3.2 | 3.2-authentication-and-authorization | 27 | 4 |
| 3.3 | 3.3-connection-lifecycle-and-events | 29 | 8 |
| 4 | 4-server-apis | 31 | 4 |
| 4.1 | 4.1-http-rest-api | 33 | 4 |
| 4.2 | 4.2-grpc-api | 35 | 6 |
| 4.3 | 4.3-api-protocol-and-command-execution | 37 | 8 |
| 5 | 5-message-handling | 39 | 6 |
| 5.1 | 5.1-broker-system-and-message-distribution | 41 | 8 |
| 5.2 | 5.2-external-message-consumers | 43 | 5 |
| 5.3 | 5.3-message-storage-and-recovery | 45 | 5 |
| 6 | 6-backend-integration | 47 | 3 |
| 6.1 | 6.1-proxy-infrastructure | 49 | 5 |
| 6.2 | 6.2-proxy-event-handlers | 51 | 3 |
| 7 | 7-security | 53 | 4 |
| 7.1 | 7.1-jwt-authentication-system | 55 | 2 |
| 7.2 | 7.2-token-verification-and-jwks | 57 | 6 |
| 8 | 8-operations-and-monitoring | 59 | 2 |
| 8.1 | 8.1-usage-statistics-and-monitoring | 61 | 3 |
| 8.2 | 8.2-development-and-build-tools | 63 | 4 |
| 9 | 9-glossary | 65 | 2 |

Total diagrams: 125 (matches `re.findall(r"```mermaid", full_markdown)` count).

## Extraction gotchas hit in practice

- `web_extract` on a DeepWiki URL returns the page text but NO diagram content — every
  diagram is a graphics element. The mermaid source only exists inside the RSC chunks.
- Unescape with the `json.loads('"' + s + '"')` trick; the fallback replacer handles the
  odd `\u003e` / `\u0026` escapes if json fails.
- Page headings are `# <Title>` (h1). Don't split on `## ` — sub-sections share the page.
- The sidebar menu links (29 items) are REAL page URLs including the `N.M-` sub-pages —
  collect them with `browser_console` `document.querySelectorAll('a')` filtering href
  containing `centrifugo`, dedupe by href+text.

## Artifact series conventions (정혁, project=centrifugo)

- Title: `Centrifugo 아키텍처 노트 — N. 제목 (English Title)` (N = 01..35 series number)
- Slug: `centrifugo-deepwiki-NN-<slug>-ko`, format `html`, visibility `link`
- 01–07 = 1-overview sections; 08–15 = top-level pages 2–9; 16–35 = sub-pages 1.1–8.2
- HTML template: lang=ko, mermaid CDN 10.9.1, `mermaid.initialize({startOnLoad:true})`,
  `.note` footer linking the DeepWiki source page.
