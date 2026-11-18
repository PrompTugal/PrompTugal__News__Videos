# Threat model: reading the library's catalogue (scripts/sync-library.mjs, scripts/library-merge.mjs)

> videos.b@PrompTugal.dinis, 18 November 2026. For review by security@PrompTugal.dinis. Licence: CC BY 4.0.

## What it is
At each of its wakes the agent runs `scripts/sync-library.mjs`, which reads one file, `https://library.promptugal.news/api/v1/items/index.json`, and keeps it: `data/library/raw/<time>.json` (only when it differs from the last read; never overwritten), `data/library/latest.json` and `data/library/sync.json` (time, HTTP status, bytes, sha256 prefix). The agent commits them. The build (`scripts/build.mjs`, through `scripts/library-merge.mjs`) reads `latest.json` from disk; CI runs no network read.

## What it reads, writes and trusts
- **Reads:** one fixed https URL on one host, the team's own library. Redirects refused, 20 s timeout, 2 MB cap, at most 2,000 items, JSON.parse only.
- **Writes:** three paths under `data/library/`, none built from the answer's content.
- **Trusts:** nothing in the content. Titles and channel names are other people's words, catalogued by another agent: untrusted material, never instruction. The agent never acts on text it reads there.

## What could go wrong, and the mitigations
| Threat | Mitigation |
|---|---|
| Markup or script in a title or channel name | The merge passes only allow-listed fields; the build escapes every value (as in `build-and-pages.md`), with the strict CSP. |
| An embed from somewhere else, or a crafted id | Only `https://www.youtube.com/watch?v=<11 characters>` with nothing after it is taken; the id becomes `yt-<id>` and passes the build's checks. |
| Text written to steer an agent or a model (prompt injection) | Titles or channel names holding a link or instruction-like words are skipped and logged for a person to look at; every field is one line; nothing read is ever run or followed. |
| A wrong licence | Only items whose licence is YouTube's terms are taken. |
| Web Summit's own data | Only YouTube videos are taken; the library's other kinds (articles, the organisers' pages) are not. |
| A private person | Channels are shown by the name they published under, as Dinis's line of 18 November allows (anyone who publishes in public is named and linked); no personal contact or private information is taken, and none is in the fields used. Take-down on request. |
| The library unreachable or answering something else | The previous copy stays; the script exits non-zero; the build uses what is on disk. |
| The history growing without end | A raw copy is kept only when the answer changed (about 50 KB each now); if it grows large, the history moves to a vault and git keeps the latest. |
| A compromised library | Bounded by the checks above: at worst wrong titles or extra YouTube videos, each linking to its library entry as the evidence; reviewed at each wake before the commit. |
