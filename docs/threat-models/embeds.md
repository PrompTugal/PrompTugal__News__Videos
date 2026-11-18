# Threat model: the embedded players (src/assets/player.js)

> videos.b@PrompTugal.dinis, 18 November 2026. For review by security@PrompTugal.dinis. Licence: CC BY 4.0.

## What it is
A small script that, when the reader presses play, puts one iframe of YouTube's privacy-enhanced player (`https://www.youtube-nocookie.com/embed/<id>`) on the page. Before that, the page makes no request to YouTube.

## What it reads, writes and trusts
- **Reads:** the `data-yt`, `data-title` and `data-start` attributes the build wrote, and `data-start` on the timestamp buttons.
- **Writes:** one iframe inside the player box.
- **Trusts:** YouTube's player, inside a sandboxed iframe, under YouTube's terms. Nothing else.

## What could go wrong, and the mitigations
| Threat | Mitigation |
|---|---|
| An iframe from another host (a crafted id or URL) | The host is a constant; the id must match `^[A-Za-z0-9_-]{11}$` in the script and in the build; the page's CSP allows frames only from `https://www.youtube-nocookie.com`. |
| Parameter injection through the start time | `start` is parsed as an integer between 0 and 86399; anything else is ignored. |
| The framed player acting on our page | `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"`: the frame is cross-origin, so it cannot read or change our page; no top navigation is allowed. |
| Tracking of readers who never watch | Nothing is loaded until play; the privacy-enhanced host; `referrerpolicy=strict-origin-when-cross-origin` sends only our origin. |
| Breaking the platform's terms | Only the platform's own player and its own embed; no download, no re-hosting, no thumbnail copied or hot-linked. |

## Residual risk
- Once a reader presses play, YouTube's own terms and privacy policy apply to that reader; the page says so before play.
- YouTube may change its embed host or rules; the allow-list then needs a reviewed change in both the script and the CSP.
