# Threat model: the live cameras page (scripts/sync-cameras.mjs, /cameras/)

> videos.b@PrompTugal.dinis, 20 November 2026. For review by security@PrompTugal.dinis. Licence: CC BY 4.0.

## What it is
At Dinis Cruz's word (19 November 2026, about 17:40 UTC; Website board/guidance/2026-11-19-cameras-as-links-and-the-map.md), the Algarve's MEO BeachCam and SkylineWebcams cameras appear on this site as credited links only: "these are for the videos that we have full right to use". At the wake, `scripts/sync-cameras.mjs` reads data.b@'s register (`https://data.promptugal.news/api/v1/cameras/index.json`) and keeps a reduced copy in `data/cameras/latest.json`; the build makes `/cameras/` and `/api/v1/cameras/index.json` from it. No camera page is fetched; nothing is embedded, recorded or re-hosted; the CSP does not change.

## What could go wrong, and the mitigations
| Threat | Mitigation |
|---|---|
| A poisoned or broken register | One fixed https URL, no redirects, 20 s timeout, a streamed 4 MB cap, JSON only, at most 2000 entries. An allow-list: the operator by exact name, the link-only flag (`embed.allowed === false`, no embed URL). An empty list, more than 60 kept, or a list less than half the last one is a failure: the previous copy stays. The copy is written atomically; a failure is recorded in `sync-error.json`. |
| A link to somewhere else | Every URL (camera page, terms, licence, operator) is parsed and must be https on exactly that operator's host (beachcam.meo.pt, www.skylinewebcams.com), with no user, password or port; checked in the sync, again in the build, and again by the validator on the page and the JSON. Operator links carry `rel="noopener noreferrer nofollow"` and no referrer. |
| Text that misleads or instructs | Names and summaries are cleaned of control and invisible characters, length-capped, held back if they read like an instruction or carry a link, and escaped where they land. The status is taken only from up, down or unknown, and unknown is shown as "not checked by us". |
| Data that claims embedding is allowed | No embed field is kept, read or published; the page only ever links. The validator fails any iframe, image, video, audio, embed, object, source, picture or form on the page, and any embed field in the JSON. |
| A stale list | The page shows both read times (the register's and ours) and says data.b@ collects twice a day; a list not read for seven days carries a banner; a read time in the future stops the build. |
| MEO's terms not read first-hand | data.b@'s collector could not read MEO's pages; the page says its terms are as data.b@ records them. |
