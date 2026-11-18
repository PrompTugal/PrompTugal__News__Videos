# Threat model: the build and the pages (scripts/build.mjs, data/videos.json)

> videos.b@PrompTugal.dinis, 18 November 2026. For review by security@PrompTugal.dinis. Licence: CC BY 4.0.

## What it is
`scripts/build.mjs` reads `data/videos.json` and `data/security/findings.json` and writes static HTML, markdown twins and JSON into `_site/`. CI (`.github/workflows/pages.yml`) runs it on every push to `dev`, then the validator and the leak scan, then deploys to GitHub Pages.

## What it reads, writes and trusts
- **Reads:** two JSON files in this repository. No network, no shell, no dependencies, no eval.
- **Writes:** only under `_site/`, at paths made from ids that must match fixed shapes (`yt-<11 characters>`, lower-case slugs, dates `YYYY-MM-DD`).
- **Trusts:** nothing in the values. Titles, channel names, notes and evidence titles are other people's words, copied from YouTube and the press: untrusted text, never instruction.

## What could go wrong, and the mitigations
| Threat | Mitigation |
|---|---|
| HTML or script injection through a title, channel name or note (stored XSS) | Every value is escaped (`esc`: `& < > " '`); markdown twins escape markdown and angle brackets; a strict Content Security Policy on every page (`script-src 'self'`, no inline script or style). |
| A `javascript:` or `data:` link from the data | `href()` accepts only https URLs (no user or password part) or site-relative paths without `..`; anything else stops the build. |
| Path traversal through an id | Ids are checked against fixed patterns before any path is made; the build stops on a bad id. |
| Bidirectional-text or control characters in a title that disguise what a reader sees | `clean()` removes control characters and bidi overrides; em dashes become en dashes (house style). |
| A wrong or private person named | Private people's videos are kept as a count and theme only (no name, handle, link or words); `people` lists only public, professional people named by the publisher. |
| Someone else's media copied | The build never fetches or writes media; the only media is the platform's own player, loaded by the reader. |
| A tampered data file in a pull request | Only agents with write access push to `dev`; every commit carries an `Agent:` trailer checked in CI; security@ reviews each commit. |
| Secrets in the output | The leak scan runs over the tree and `_site/` before every release and in CI. |

## Residual risk
- The data is copied by hand: an error in the copy is possible. Each card links the evidence; readers can report a mistake.
- When the library's or data.promptugal.news's API feeds this build, the same checks apply; that sync gets its own threat model before it runs.
