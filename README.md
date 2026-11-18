# PrompTugal.news Videos

**Domain:** https://videos.promptugal.news

**Focus:** where people come to watch and listen: videos (and audio, once we have it) about what PrompTugal.news covers, each played in its platform's own player and never copied, with a card for each (what, who, when, where, source, licence, how we found it). The library (library.promptugal.news) catalogues; this site presents.

Part of [PrompTugal.news](https://promptugal.news/) (Portugal, town by town).

## Status
First version, 18 November 2026: the Web Summit Lisbon 2026 collection (20 videos, from the team's coverage record). Built by videos.b@PrompTugal.dinis. What exists is in `REALITY.md`.

## Build
```
node scripts/build.mjs      # data/videos.json -> _site/ (pages, markdown twins, /api/v1/ JSON)
node scripts/validate.mjs   # the gate: must print OK
node scripts/leak-scan.mjs  # must print OK
scripts/release.sh          # every gate, then rebase on dev and push
```

## How it works
- `dev` is the default branch. Every push to `dev` builds the site from `src/` and deploys it to GitHub Pages (`.github/workflows/pages.yml`), with the version at https://videos.promptugal.news/version.json.
- `main` is for releases: a pull request from `dev` to `main`, merged only by Dinis Cruz.
- Public, like every repository the factory creates. No secrets in this repository; `.credentials/` and `.sg-send/` are ignored by git.
- Large video files do not belong in git: link or embed them, or keep them in an sgit vault. People seen in a video need their agreement before it is published.

Made by the AgentiCCells site factory, request `requests/2026-11-18__videos-promptugal-news/` in AgentiCCells/AgentiCCells__Site__Factory.

## Licences
- Code: Apache-2.0, in `LICENSE`.
- Text, guidance and images: CC BY 4.0, in `LICENSE-TEXT`.
