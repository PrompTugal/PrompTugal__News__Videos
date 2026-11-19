# Threat model: the shared sites bar (scripts/sync-sites.mjs, the build, src/assets/sites-bar/)

> videos.b@PrompTugal.dinis, 19 November 2026. For review by security@PrompTugal.dinis. Licence: CC BY 4.0.

## What it is
The row of PrompTugal.news sites at the top of every page: sites bar 1.2.1, made by dev@ to designer@'s spec, given the go by security@ (Website 2d812d6da), installed at Dinis Cruz's word (19 Nov 2026, about 03:18 UTC: one way to move between the sites). It replaces this site's own hand-kept rail.

## How it flows
1. **At the agent's wake, never in CI:** `scripts/sync-sites.mjs` reads `https://promptugal.news/api/v1/sites.json` (no redirects, 20 s timeout, 256 KB streamed cap, JSON only). It hashes our three vendored files and compares them with the registry's pin for our version (`bar.versions["1.2.1"].integrity`, keys js, css and render; the older shapes are read too). It imports the vendored renderer from the very bytes it hashed and runs its `check()` on the sites (https only, no user info or port, hosts under promptugal.news, every field bounded; one bad entry refuses the lot), then its own: unique ids and hosts, promptugal.news first. It writes `data/sites/latest.json` (only the checked fields, the pins for our version only) atomically, and refuses a clock earlier than the last read.
2. **At build (no network):** the build re-checks everything from that copy: the vendored files against the stored pin, the renderer imported from its hashed bytes, `check()` again. Then it renders the bar first in `<body>`, links the bar's CSS and deferred script from this site, and adds the other sites' exact hosts to `img-src` and `connect-src`.
3. **In the browser:** the bar's script shows a pop-up on hover or focus, with the site's `/preview.svg` as an `<img>` and its `/version.json` fetched with no credentials, no referrer and redirects refused; every string by textContent.

## What could go wrong, and the mitigations
| Threat | Mitigation |
|---|---|
| A poisoned or broken registry | The renderer's `check()` and ours refuse the whole registry; the previous copy stays; the build never fetches. |
| A host injected into the CSP | Hosts come only from `new URL()` of checked entries, must match `^(?:[a-z0-9-]+\.)*promptugal\.news$`, are sorted, deduplicated and capped at 32; no wildcard. The validator works the CSP out on its own from the copy and fails any page that differs. |
| Changed code under the same version | A different file stops the sync and the build; the renderer is imported from the bytes that were hashed; git keeps the files byte for byte (`-text`). |
| A hand-edited `latest.json` that says "match" | The build ignores the stored result and re-hashes the files against the stored pin; a wrong pin stops the build. |
| A new bar version | Our version stays on while the registry lists it; when it does not, the bar is left out (logged "sites bar 1.2.1 off: the registry names <v>") and the CSP goes back to its plain form. Never a hand-kept list instead. |
| The registry takes over a subdomain | Any host under promptugal.news is in policy; the registry is the authority on which exist. The sync prints any new host so a person sees it. A poisoned registry cannot change what we ship (we compare our own bytes); it can only switch the bar off. |
| Pins in the repo tripping the leak scan | Exempt only in `data/sites/latest.json`, only at `bar.versions["<v>"].integrity.<js, css or render>` (found by parsing), only for the exact SRI pattern (security@, Website 5109e7a09); `scripts/test-leak-scan.mjs` proves the same string elsewhere, or a key-shaped string in that file, still fails. |
| Other sites learning who reads us | Only on hover or focus: their preview image and version file, with no cookies and no referrer. Said on /how/. |

## Residual risk
- A site in the registry could serve a misleading preview image; it is an image only, from its own host.
- The copy is as fresh as the last wake; the build prints the read time.
