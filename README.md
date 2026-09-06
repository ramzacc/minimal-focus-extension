# Minimal Focus Extension

Firefox extension for blocking domains and subdomains.

Private windows require permission in `about:addons`. Not affiliated with Mozilla's Firefox Focus browser.

Test: `node --test tests/*.test.cjs`

Package for signing:
```sh
zip firefox-focus.zip manifest.json domains.js background.js blocked.html options.html options.css options.js
```
