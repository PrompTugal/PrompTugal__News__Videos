# REALITY.md: what exists now

- Seeded by the AgentiCCells site factory on 2026-11-18 from AgentiCCells/AgentiCCells__Site__Template@dev.
- Its live state is recorded in requests/2026-11-18__videos-promptugal-news/status.json in AgentiCCells__Site__Factory.
- 2026-11-18: cells@AgentiCCells.dinis, at Dinis's word (~15:17 UTC), replaced the seed page with a placeholder, wrote the README, added `LICENSE-TEXT` (CC BY 4.0) beside `LICENSE` (Apache-2.0), added `src/CNAME`, ignored `.credentials/` and `.sg-send/`, and created `main` from this commit. The factory's collaborators step found `riskmandate-agent` already had write access.

## First version, 18 November 2026 (videos.b@PrompTugal.dinis, from about 15:20 UTC)

Started by conductor.b@PrompTugal.dinis at Dinis Cruz's word in conductor.b@'s session on 18 November 2026 (a site for videos, and audio once we have it). Exists in `dev` (live once CI deploys it):

- **The data, JSON first:** `data/videos.json`, a seed of 20 videos and one collection (Web Summit Lisbon 2026), copied by hand from social.watch@PrompTugal.dinis's coverage record (PrompTugal__News__Website `board/team/social.watch/coverage.json` at 142060e2), found in its sweeps of 10 November 2026 and checked then with YouTube's oEmbed. 19 on YouTube, 1 on CNBC's site (linked only). Nothing was read again from YouTube or websummit.com. Three videos by private people are a count and theme only.
- **The collection by day:** Opening Night (9 Nov) and Day One (10 Nov) with the organiser's replays; Day Two (11 Nov) cancelled by Storm Charles, with the organisers' statement and two press reports linked and the Storm archive on weather.promptugal.news; Day Three (12 Nov): the replay is not in our evidence, said so.
- **Pages** (`scripts/build.mjs`, Node 18+, no dependencies, no network): `/`, `/collections/web-summit-lisbon-2026/`, `/videos/` and a page per video `/videos/<id>/` (the player and the card: what, who, when with its precision, where, source, licence "the platform's terms" linked, how we found it with the evidence, call number), `/playlists/` and 18 playlist pages (19 playlists in the API, counting the event one, whose page is the collection; by kind, organisation and topic where two or more videos, place, Storm Charles), `/how/`, `/security/`, `/api/`, `/404.html`; a markdown twin (`index.md`) for each, `llms.txt`, `version.json`.
- **The JSON API** under `/api/v1/`: `videos/index.json`, `videos/<id>.json`, `collections/`, `playlists/`, `security/findings.json`.
- **The player** (`src/assets/player.js`): click to load; nothing is requested from YouTube until play; then one sandboxed iframe from `https://www.youtube-nocookie.com/embed/<11-character id>`. Every page carries a Content Security Policy that allows frames from that host only and no inline script or style.
- **The frame:** the masthead, the "Pay for what you read · free here" chip, the sites rail (Videos, Library, Events, Weather, Civic, Startups, Travel, Data), the take-down disclaimer, the principles line linking promptugal.news/principles/ and /report/, /security/, how the page was made, the version.
- **Threat models:** `docs/threat-models/build-and-pages.md`, `docs/threat-models/embeds.md`, linked from /how/ and /security/.
- **The key** `videos.b-promptugal` (encryption sha256:0609e5f610785868, signing sha256:44ce13a193253220), made with `sgit pki keygen`; public bundle `team/keys/videos-b-promptugal.json`, listed in `board/keys.json`. The private half stays in this session's container.
- **The commit check** accepts role@PrompTugal.dinis, as in the Weather and Events repositories.
- `board/team/videos/status.json` and the first debrief.

Does not exist yet:

- Talks by timestamp (the field exists, empty): Dinis answered on 18 November (~16:00 UTC) that they come from YouTube's listings (chapters), never Web Summit's agenda; they wait for data.b@ to publish them.
- Any read from library.promptugal.news or data.promptugal.news: neither publishes videos yet (404 on 18 November, about 15:25 UTC). No collector runs here.
- Audio; other events, places and organisations' collections.
- Observability (an obs.js lane), the brand fonts, a `/design/` page, a scheduled rebuild, GitHub issue forms (a plain "new issue" link stands in).
- Signed work: `scripts/sign-release.sh` signs a manifest of every tracked file (tested valid with `sgit pki verify`), but no signature is committed: the leak scan flags the `.sig` as a long high-entropy string; an ask to Dinis. Commits carry the `Agent:` trailer only.
- A check of any page by a person.
- 2026-11-18, about 15:42 UTC: live at https://videos.promptugal.news as v0.1.3 (commit 433b0d6); the home page, the collection, a video page, /how/, /security/, a playlist and /api/v1/videos/index.json answered 200.
- 2026-11-18, about 15:55 UTC: Day Three's replay (the organiser's, `yt--MGZdAtbTrs`) added from the library's catalogue (library.promptugal.news, WS26 2026/0001), credited on its card with the library's item as the evidence; which stage it shows is not confirmed. 21 videos now. The library itself publishes `/api/v1/items/` (answered 200); this site does not read it in the build yet (copied by hand). Finding VID-2026-011 (low) fixed before the push.
- 2026-11-18, wake 2 (from 16:48 UTC): the library is read as the catalogue. `scripts/sync-library.mjs`, run by the agent (not CI), reads https://library.promptugal.news/api/v1/items/index.json and keeps each changed answer as received with its time in `data/library/raw/` (first read 16:49 UTC, 80 items, 50,973 bytes), plus `latest.json` and `sync.json`. `scripts/library-merge.mjs` takes the library's YouTube videos of the Web Summit collection: 11 new (32 videos in all) and every earlier one linked to its library call number on its card. `/api/openapi.json` describes the API. Threat model `docs/threat-models/sync-library.md`. Findings VID-2026-012 to 014 (low) fixed before the push; VID-2026-009 accepted under Dinis's line on people who publish in public.
- 2026-11-18, about 17:50 UTC: `/how/youtube-api-key/`, the operator's instructions for the YouTube Data API key (asked for by Dinis ~16:55 UTC), checked against Google's documentation; linked from /how/. No key exists yet.
