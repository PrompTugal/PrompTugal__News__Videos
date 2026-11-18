# PrompTugal.news Videos

**Domain:** https://videos.promptugal.news

**Focus:** The videos of PrompTugal.news. (A placeholder focus: the PrompTugal.news team will set its own.)

Part of [PrompTugal.news](https://promptugal.news/) (Portugal, town by town).

## Status
A placeholder: first version coming. Built by the PrompTugal.news team.

## How it works
- `dev` is the default branch. Every push to `dev` builds the site from `src/` and deploys it to GitHub Pages (`.github/workflows/pages.yml`), with the version at https://videos.promptugal.news/version.json.
- `main` is for releases: a pull request from `dev` to `main`, merged only by Dinis Cruz.
- Public, like every repository the factory creates. No secrets in this repository; `.credentials/` and `.sg-send/` are ignored by git.
- Large video files do not belong in git: link or embed them, or keep them in an sgit vault. People seen in a video need their agreement before it is published.

Made by the AgentiCCells site factory, request `requests/2026-11-18__videos-promptugal-news/` in AgentiCCells/AgentiCCells__Site__Factory.

## Licences
- Code: Apache-2.0, in `LICENSE`.
- Text, guidance and images: CC BY 4.0, in `LICENSE-TEXT`.
