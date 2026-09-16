# Changelog

Notable changes since the last 1.1.x release. Versions match `manifest.json`.

## 1.3.0

### Added
- Instagram support: post, reel and tv links (`instagram.com/p/<code>/`, `/reel/<code>/`, `/tv/<code>/`) open a feed-free viewer that embeds Instagram's official `/embed/captioned/` page.
- The Instagram viewer auto-sizes to the post's real height using the embed's `MEASURE` postMessage, with a viewport fallback.
- Blocking exemptions for Instagram's own embed resources (`instagram.com`, `cdninstagram.com`, `fbcdn.net`, `facebook.com`/`facebook.net`); top-level browsing stays blocked.

### Notes
- Enforced by Instagram, not the extension: videos and reels with licensed music cannot play inline (Instagram serves a cover image plus a "Watch on Instagram" link), and some posts show a login prompt.

## 1.2.2

### Fixed
- YouTube "Error 152-4": player requests now present a normal external `Referer` (`https://github.com/`) instead of `youtube.com`, and the embed passes a matching `origin` parameter.

## 1.2.1

### Fixed
- YouTube "Error 153": viewer-initiated player requests now send a valid http(s) `Referer` instead of the extension's suppressed `moz-extension://` origin.

## 1.2.0

### Added
- YouTube support: video links (`watch?v=<id>`, `youtu.be/<id>`, `/shorts/`, `/live/`, `/embed/`) open a fixed 16:9 no-cookie player (`youtube-nocookie.com/embed/<id>?rel=0`) that limits end-screen suggestions to the same channel, so no home feed or sidebar loads.
- Path-scoped blocking exemptions for the player's own API and asset paths (`/s/player/`, `/youtubei/`, `/yts/`, …); top-level `youtube.com` stays blocked.

### Fixed
- Restored/reloaded video tabs now open the viewer instead of the blocked page, reusing the redirect-loop guard from the tweet viewer.
