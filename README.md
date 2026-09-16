# Minimal Focus Extension

Firefox extension for blocking domains and subdomains.

Links to individual tweets (`x.com/<user>/status/<id>`, `twitter.com/...`) are not blocked. They open in a local viewer that renders the tweet's author, text and media from Twitter's syndication API, so no feed, replies or recommendations load.

Links to individual videos (`youtube.com/watch?v=<id>`, `youtu.be/<id>`, `/shorts/<id>`) are not blocked either. They open a fixed 16:9 no-cookie player (`youtube-nocookie.com/embed/<id>`) with end-screen suggestions limited to the same channel, so no home feed or sidebar loads.

Instagram post/reel/tv links (`instagram.com/p/<code>/`, `/reel/<code>/`, `/tv/<code>/`) are a tryout: they open a viewer pointing at Instagram's official `/embed/captioned/` page, so no feed or recommendations load. Instagram may still show a login prompt for some posts — that is enforced by Instagram, not the extension.

Private windows require permission in `about:addons`. Not affiliated with Mozilla's Firefox Focus browser.

Test: `node --test tests/*.test.cjs`

Package for signing:
```sh
zip firefox-focus.zip manifest.json domains.js background.js blocked.html tweet.html tweet.js tweet-format.js youtube.html youtube.js instagram.html instagram.js options.html options.css options.js
```
