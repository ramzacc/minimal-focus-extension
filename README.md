# Minimal Focus Extension

Firefox extension that blocks a list of domains and subdomains, while still letting you open a shared tweet, video or Instagram post in a distraction-free viewer — no feed, recommendations or autoplay.

## How it works

Add domains from the toolbar button's options page (one per line; subdomains are included, blank lines and `#` comments are ignored). The extension blocks each domain everywhere — network requests, restored tabs and history navigation. The exception is a link to a single item, which is redirected to a local viewer instead of the blocked page.

Blocking can be toggled off, and the list saved, from the options page; open tabs update immediately.

## Viewers

Only the requested item loads — never the home feed, sidebar or recommendations.

- **Tweets** — `x.com/<user>/status/<id>` or `twitter.com/...`. Renders the author, text and media from Twitter's syndication API.
- **Videos** — `youtube.com/watch?v=<id>`, `youtu.be/<id>`, `/shorts/<id>`, `/live/<id>`. A fixed 16:9 no-cookie player (`youtube-nocookie.com/embed/<id>?rel=0`), with end-screen suggestions limited to the same channel.
- **Instagram posts** — `instagram.com/p/<code>/`, `/reel/<code>/`, `/tv/<code>/`. Embeds Instagram's official `/embed/captioned/` page.

## Notes

- Instagram controls two things the extension can't change: videos and reels with licensed music never play inline (Instagram serves a cover image with a "Watch on Instagram" link), and some posts show a login prompt.
- The YouTube player presents a normal http(s) referrer so embeds don't trip its "Error 153 / 152-4" checks.
- Private windows require permission in `about:addons`.
- Not affiliated with Mozilla's Firefox Focus browser.

## Development

Test: `node --test tests/*.test.cjs`

Package for signing: `./package.sh` (writes `minimal-focus-extension.zip`).
