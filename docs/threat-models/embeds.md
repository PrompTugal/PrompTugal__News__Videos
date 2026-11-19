# Threat model: the embedded players (src/assets/player.js)

> videos.b@PrompTugal.dinis, 18 November 2026. For review by security@PrompTugal.dinis. Licence: CC BY 4.0.

## What it is
A small script that, when the reader presses play or clicks the preview image, puts one iframe of YouTube's privacy-enhanced player (`https://www.youtube-nocookie.com/embed/<id>`) on the page in place of the image. Before that, the page loads only YouTube's preview image for each video, from `https://i.ytimg.com/vi/<id>/(hq|mq)default.jpg` (added 19 Nov 2026 at Dinis Cruz's word, about 01:34 UTC, under rights@'s conditions T1 to T4).

## What it reads, writes and trusts
- **Reads:** the `data-yt`, `data-title` and `data-start` attributes the build wrote, and `data-start` on the timestamp buttons.
- **Writes:** one iframe inside the player's screen, removing the preview image.
- **Trusts:** YouTube's player, inside a sandboxed iframe, and YouTube's image host `i.ytimg.com` for the preview images (shown as images, never scripts), both under YouTube's terms. Nothing else.

## What could go wrong, and the mitigations
| Threat | Mitigation |
|---|---|
| An iframe from another host (a crafted id or URL) | The host is a constant; the id must match `^[A-Za-z0-9_-]{11}$` in the script and in the build; the page's CSP allows frames only from `https://www.youtube-nocookie.com`. |
| Parameter injection through the start time | `start` is parsed as an integer between 0 and 86399; anything else is ignored. |
| The framed player acting on our page | `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"`: the frame is cross-origin, so it cannot read or change our page; no top navigation is allowed. |
| Tracking of readers who never watch | The player loads only on play, from the privacy-enhanced host, sending only our origin (`strict-origin-when-cross-origin`, as YouTube requires). The preview image is fetched when the page opens, so YouTube sees the reader's address and browser; it is sent with `referrerpolicy=no-referrer` (the image only), list images load lazily, and the site says so on every player, card and /how/. Accepted by Dinis Cruz for usability (19 Nov 2026). |
| An image from another host (a crafted id) | The address is built only from the constant `https://i.ytimg.com` and an id that matches `^[A-Za-z0-9_-]{11}$`; the build stops on anything else; the CSP allows images only from this site and `https://i.ytimg.com`; the validator fails any other image address, any YouTube image without no-referrer, any image without alt, width and height, and any inline event handler. |
| A missing or private video's image | YouTube serves a placeholder or nothing; the screen keeps its dark background and size, and the play button and the link to YouTube still work. No inline error handler (the CSP forbids one). |
| Breaking the platform's terms | Only the platform's own player and its own embed; the preview image is shown unaltered (no crop, filter or overlay; the play button sits below it), at least 120 by 70, linked to the video or swapped for the player, with the credit "The preview image comes from YouTube."; no download, no re-hosting, no copy kept (rights@, b523d57c8, conditions T1 to T4). |

## Residual risk
- Opening a page with a video tells YouTube's image host that the reader's browser asked for that image; the page says so. Once a reader presses play, YouTube's own terms and privacy policy apply to that reader; the page says so before play.
- The credit is text only until Dinis decides on YouTube's official icon (its brand terms are his to accept).
- YouTube may change its embed host or rules; the allow-list then needs a reviewed change in the script, the build, the CSP and the validator.
