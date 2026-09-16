const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const source = name => readFileSync(join(__dirname, "..", name), "utf8");
function setup(storage = Promise.resolve({}), tabs = []) {
  const listeners = { updates: [], tabs };
  const context = vm.createContext({
    URL, console,
    browser: {
      storage: {
        local: { get: () => storage },
        onChanged: { addListener: fn => { listeners.change = fn; } }
      },
      webRequest: {
        onBeforeRequest: { addListener: (fn, filter, extra) => {
          listeners.request = fn;
          assert.deepEqual(Array.from(filter.urls), ["<all_urls>"]);
          assert.deepEqual(Array.from(extra), ["blocking"]);
        } },
        onBeforeSendHeaders: { addListener: (fn, filter, extra) => {
          listeners.sendHeaders = fn;
          assert.deepEqual(Array.from(extra), ["blocking", "requestHeaders"]);
        } }
      },
      browserAction: { onClicked: { addListener: fn => { listeners.click = fn; } } },
      runtime: {
        openOptionsPage: () => { listeners.opened = true; },
        getURL: path => `moz-extension://focus/${path}`
      },
      tabs: {
        query: async () => tabs,
        get: async id => {
          const tab = tabs.find(tab => tab.id === id);
          if (!tab) throw new Error("Tab closed");
          return tab;
        },
        update: async (id, changes) => {
          listeners.updates.push({ id, url: changes.url });
          Object.assign(tabs.find(tab => tab.id === id), changes);
        },
        onUpdated: { addListener: fn => { listeners.updated = fn; } }
      },
      webNavigation: {
        onCommitted: { addListener: fn => { listeners.committed = fn; } },
        onHistoryStateUpdated: { addListener: fn => { listeners.history = fn; } }
      }
    }
  });
  vm.runInContext(source("domains.js"), context);
  vm.runInContext(source("background.js"), context);
  return { domains: context.FocusDomains, listeners };
}

test("plain-text parsing normalizes, deduplicates, and preserves subdomain specificity", () => {
  const { domains } = setup();
  assert.deepEqual(Array.from(domains.parse("# comment\r\n Reddit.COM \r\nreddit.com.\n\nwww.youtube.com")),
    ["reddit.com", "www.youtube.com"]);
  assert.deepEqual(Array.from(domains.parse("b\u00fccher.de")), ["xn--bcher-kva.de"]);
  assert.equal(domains.parse("").size, 0);
});

test("rejects URLs, wildcards, invalid labels and misleading input", () => {
  const { domains } = setup();
  for (const input of ["https://reddit.com", "*.reddit.com", "reddit.com/path", "reddit.com:443",
    "foo bar", "foo@reddit.com", "reddit.com?x", "reddit.com#x", "foo\\bar", "foo..com",
    "-foo.com", "foo_.com", "%72eddit.com", "a".repeat(64) + ".com"]) {
    assert.throws(() => domains.parse("# header\n" + input), /Line 2:/);
  }
});

test("matches exact domains and nested subdomains, not lookalikes or URL text", () => {
  const { domains } = setup();
  const list = domains.parse("reddit.com\nwww.youtube.com");
  for (const url of ["https://reddit.com/", "https://old.reddit.com/", "http://a.b.reddit.com:8080/",
    "https://REDDIT.COM./", "wss://reddit.com/socket", "https://www.youtube.com/"]) {
    assert.equal(domains.matches(url, list), true, url);
  }
  for (const url of ["https://notreddit.com", "https://reddit.com.example.org",
    "https://example.org/reddit.com", "https://reddit.com@example.org", "https://youtube.com", "invalid"]) {
    assert.equal(domains.matches(url, list), false, url);
  }
});

test("parses tweet status ids across twitter and x hosts", () => {
  const { domains } = setup();
  assert.equal(domains.tweetId("https://x.com/jack/status/20"), "20");
  assert.equal(domains.tweetId("https://twitter.com/jack/statuses/20?ref=abc"), "20");
  assert.equal(domains.tweetId("https://mobile.twitter.com/jack/status/20"), "20");
  assert.equal(domains.tweetId("https://www.x.com/i/web/status/1234567890"), "1234567890");
  for (const url of ["https://x.com/jack", "https://x.com/jack/status/abc",
    "https://notx.com/jack/status/20", "https://x.com.example.org/jack/status/20", "invalid"]) {
    assert.equal(domains.tweetId(url), null, url);
  }
});

test("parses YouTube video ids across watch, short, embed, shorts and live URLs", () => {
  const { domains } = setup();
  const video = "dQw4w9WgXcQ";
  for (const url of [
    `https://www.youtube.com/watch?v=${video}`,
    `https://m.youtube.com/watch?v=${video}&t=30s`,
    `https://youtu.be/${video}`,
    `https://youtu.be/${video}?si=abc`,
    `https://www.youtube.com/shorts/${video}`,
    `https://www.youtube.com/live/${video}`,
    `https://www.youtube.com/embed/${video}`,
    `https://www.youtube-nocookie.com/embed/${video}`
  ]) {
    assert.equal(domains.videoId(url), video, url);
  }
  for (const url of ["https://www.youtube.com/", "https://www.youtube.com/watch?v=short",
    `https://www.youtube.com/playlist?list=PL123`, `https://youtube.com.evil.org/watch?v=${video}`,
    `https://example.org/watch?v=${video}`, "invalid"]) {
    assert.equal(domains.videoId(url), null, url);
  }
});

function setupFormat() {
  const context = vm.createContext({ URL, console });
  vm.runInContext(source("tweet-format.js"), context);
  return context.FocusTweet;
}

test("derives the syndication token and result URL", () => {
  const format = setupFormat();
  assert.equal(format.getToken("20"), "6dq1a2xwd93");
  assert.equal(format.resultUrl("20"),
    "https://cdn.syndication.twimg.com/tweet-result?id=20&token=6dq1a2xwd93&lang=en");
});

test("splits tweet text into entities and honors the display range", () => {
  const format = setupFormat();
  const tweet = {
    text: "Hi @a #b https://t.co/x",
    display_text_range: [0, 8],
    entities: {
      user_mentions: [{ screen_name: "a", indices: [3, 5] }],
      hashtags: [{ text: "b", indices: [6, 8] }],
      urls: [{ display_url: "ex.com", expanded_url: "https://ex.com", url: "https://t.co/x", indices: [9, 22] }]
    }
  };
  assert.deepEqual(JSON.parse(JSON.stringify(format.segments(tweet))), [
    { kind: "text", value: "Hi " },
    { kind: "mention", value: "@a" },
    { kind: "text", value: " " },
    { kind: "hashtag", value: "#b" }
  ]);
});

test("linkifies URLs and counts indices by code point, not UTF-16 unit", () => {
  const format = setupFormat();
  const tweet = {
    text: "\u{1f600} https://t.co/x",
    display_text_range: [0, 15],
    entities: { urls: [{ display_url: "ex.com", expanded_url: "https://ex.com", url: "https://t.co/x", indices: [2, 15] }] }
  };
  assert.deepEqual(JSON.parse(JSON.stringify(format.segments(tweet))), [
    { kind: "text", value: "\u{1f600} " },
    { kind: "url", value: "ex.com", href: "https://ex.com" }
  ]);
});

test("selects the highest-bitrate mp4 variant and rejects non-video media", () => {
  const format = setupFormat();
  const media = { video_info: { variants: [
    { content_type: "application/x-mpegURL", url: "hls" },
    { content_type: "video/mp4", bitrate: 100, url: "low" },
    { content_type: "video/mp4", bitrate: 800, url: "high" }
  ] } };
  assert.equal(format.videoSrc(media), "high");
  assert.equal(format.videoSrc({ type: "photo" }), null);
  assert.equal(format.videoSrc({}), null);
});

test("tweet links open the viewer and embed assets stay loadable", async () => {
  const { listeners } = setup();
  assert.equal((await listeners.request({ url: "https://x.com/jack/status/20", type: "main_frame" })).redirectUrl,
    "moz-extension://focus/tweet.html?id=20");
  assert.equal((await listeners.request({ url: "https://x.com/home", type: "main_frame" })).cancel, true);
  assert.equal((await listeners.request({ url: "https://cdn.syndication.twimg.com/tweet-result", type: "xmlhttprequest" })).cancel, false);
  assert.equal((await listeners.request({ url: "https://pbs.twimg.com/media/abc.jpg", type: "image" })).cancel, false);
  assert.equal((await listeners.request({ url: "https://x.com/scripts/main.js", type: "script" })).cancel, true);
});

test("restored tweet tabs open the viewer instead of the blocked page", async () => {
  const { listeners } = setup(Promise.resolve({}), [{ id: 1, url: "https://x.com/jack/status/20" }]);
  await flush();
  assert.deepEqual(listeners.updates, [{ id: 1, url: "moz-extension://focus/tweet.html?id=20" }]);
});

test("video links open the YouTube viewer and player paths stay loadable", async () => {
  const { listeners } = setup();
  const video = "dQw4w9WgXcQ";
  assert.equal((await listeners.request({ url: `https://www.youtube.com/watch?v=${video}`, type: "main_frame" })).redirectUrl,
    `moz-extension://focus/youtube.html?v=${video}`);
  assert.equal((await listeners.request({ url: "https://www.youtube.com/", type: "main_frame" })).cancel, true);
  assert.equal((await listeners.request({ url: `https://youtu.be/${video}`, type: "main_frame" })).cancel, false);
  assert.equal((await listeners.request({ url: "https://www.youtube.com/s/player/abc/base.js", type: "script" })).cancel, false);
  assert.equal((await listeners.request({ url: "https://www.youtube.com/youtubei/v1/player", type: "xmlhttprequest" })).cancel, false);
  assert.equal((await listeners.request({ url: "https://www.youtube.com/feed/subscriptions", type: "xmlhttprequest" })).cancel, true);
});

test("restored video tabs open the YouTube viewer", async () => {
  const video = "dQw4w9WgXcQ";
  const { listeners } = setup(Promise.resolve({}), [{ id: 1, url: `https://www.youtube.com/watch?v=${video}` }]);
  await flush();
  assert.deepEqual(listeners.updates, [{ id: 1, url: `moz-extension://focus/youtube.html?v=${video}` }]);
});

test("presents an https Referer for player loads started by the viewers", () => {
  const { listeners } = setup();
  const headers = [{ name: "Accept", value: "*/*" }, { name: "Referer", value: "moz-extension://focus/youtube.html" }];
  const viewer = listeners.sendHeaders({ documentUrl: "moz-extension://focus/youtube.html", requestHeaders: headers });
  assert.deepEqual(JSON.parse(JSON.stringify(viewer.requestHeaders)), [
    { name: "Accept", value: "*/*" },
    { name: "Referer", value: "https://github.com/" }
  ]);
  assert.equal(listeners.sendHeaders({ documentUrl: "https://example.org", requestHeaders: headers }), undefined);
  const nested = listeners.sendHeaders({ originUrl: "moz-extension://focus/tweet.html", requestHeaders: headers });
  assert.equal(JSON.parse(JSON.stringify(nested.requestHeaders)).at(-1).value, "https://github.com/");
});

test("parses Instagram post, reel and tv codes", () => {
  const { domains } = setup();
  const post = url => JSON.parse(JSON.stringify(domains.instagramPost(url)));
  assert.deepEqual(post("https://www.instagram.com/p/Cabc123XYZ/"), { type: "p", code: "Cabc123XYZ" });
  assert.deepEqual(post("https://instagram.com/reel/Cabc123XYZ/?utm=1"), { type: "reel", code: "Cabc123XYZ" });
  assert.deepEqual(post("https://m.instagram.com/tv/Cabc123XYZ"), { type: "tv", code: "Cabc123XYZ" });
  assert.deepEqual(post("https://www.instagram.com/reels/Cabc123XYZ/"), { type: "reel", code: "Cabc123XYZ" });
  for (const url of ["https://www.instagram.com/", "https://www.instagram.com/someuser/",
    "https://www.instagram.com/stories/someuser/12345/", "https://example.org/p/Cabc123XYZ/", "invalid"]) {
    assert.equal(domains.instagramPost(url), null, url);
  }
});

test("Instagram links open the viewer and embed resources stay loadable", async () => {
  const { listeners } = setup();
  assert.equal((await listeners.request({ url: "https://www.instagram.com/p/Cabc123XYZ/", type: "main_frame" })).redirectUrl,
    "moz-extension://focus/instagram.html?type=p&code=Cabc123XYZ");
  assert.equal((await listeners.request({ url: "https://www.instagram.com/", type: "main_frame" })).cancel, true);
  assert.equal((await listeners.request({ url: "https://www.instagram.com/p/Cabc123XYZ/embed/captioned/?cr=1", type: "sub_frame" })).cancel, false);
  assert.equal((await listeners.request({ url: "https://www.instagram.com/static/bundles/app.js", type: "script" })).cancel, false);
  assert.equal((await listeners.request({ url: "https://scontent.cdninstagram.com/v/t51/photo.jpg", type: "image" })).cancel, false);
  assert.equal((await listeners.request({ url: "https://scontent.xx.fbcdn.net/v/t51/photo.jpg", type: "image" })).cancel, false);
});

test("does not restart an in-flight viewer navigation, avoiding a redirect loop", async () => {
  const { listeners } = setup(Promise.resolve({}), [
    { id: 1, url: "https://example.org", pendingUrl: "https://x.com/jack/status/20" },
    { id: 2, url: "https://x.com/jack/status/20", pendingUrl: "moz-extension://focus/tweet.html?id=20" },
    { id: 3, url: "https://example.org", pendingUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { id: 4, url: "https://example.org", pendingUrl: "https://www.instagram.com/p/Cabc123XYZ/" }
  ]);
  await flush();
  for (const id of [1, 2, 3, 4]) await listeners.updated(id, { status: "loading" });
  assert.equal(listeners.updates.length, 0);
});

test("waits for saved settings before deciding startup requests", async () => {
  let resolve;
  const storage = new Promise(done => { resolve = done; });
  const { listeners } = setup(storage);
  let settled = false;
  const request = listeners.request({ url: "https://example.org" }).then(result => {
    settled = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  resolve({ domainsText: "example.org" });
  assert.equal((await request).cancel, true);
  assert.equal((await listeners.request({ url: "https://reddit.com" })).cancel, false);
});

test("defaults, live updates, empty lists, storage deletion and toolbar action", async () => {
  const { listeners } = setup();
  const blocked = async url => (await listeners.request({ url })).cancel;
  assert.equal(await blocked("https://reddit.com"), true);
  await listeners.change({ domainsText: { newValue: "example.org" } }, "local");
  assert.equal(await blocked("https://example.org"), true);
  assert.equal(await blocked("https://reddit.com"), false);
  await listeners.change({ domainsText: { newValue: "reddit.com" } }, "sync");
  assert.equal(await blocked("https://example.org"), true);
  await listeners.change({ domainsText: { newValue: "" } }, "local");
  assert.equal(await blocked("https://example.org"), false);
  await listeners.change({ domainsText: {} }, "local");
  assert.equal(await blocked("https://reddit.com"), true);
  listeners.click();
  assert.equal(listeners.opened, true);
});

test("a saved empty list remains empty at startup", async () => {
  const { listeners } = setup(Promise.resolve({ domainsText: "" }));
  assert.equal((await listeners.request({ url: "https://reddit.com" })).cancel, false);
});

const flush = () => new Promise(resolve => setImmediate(resolve));

test("startup replaces existing blocked tabs only after loading the saved list", async () => {
  let resolve;
  const { listeners } = setup(new Promise(done => { resolve = done; }), [
    { id: 1, url: "https://example.org/cached" },
    { id: 2, url: "https://reddit.com" }
  ]);
  await flush();
  assert.equal(listeners.updates.length, 0);
  resolve({ domainsText: "example.org" });
  await flush();
  assert.deepEqual(listeners.updates, [{ id: 1, url: "moz-extension://focus/blocked.html" }]);
});

test("saving the list also replaces already-open pages", async () => {
  const { listeners } = setup(Promise.resolve({ domainsText: "" }), [
    { id: 1, url: "https://old.reddit.com" },
    { id: 2, url: "https://example.org" }
  ]);
  await flush();
  assert.equal(listeners.updates.length, 0);
  await listeners.change({ domainsText: { newValue: "reddit.com" } }, "local");
  assert.deepEqual(listeners.updates, [{ id: 1, url: "moz-extension://focus/blocked.html" }]);
});

test("reload, cache restore and history navigation are blocked without network events", async () => {
  const tab = { id: 1, url: "https://example.org" };
  const { listeners } = setup(Promise.resolve({}), [tab]);
  await flush();
  for (const trigger of [
    () => listeners.updated(1, { status: "loading" }),
    () => listeners.updated(1, { url: tab.url }),
    () => listeners.committed({ tabId: 1, frameId: 0 }),
    () => listeners.history({ tabId: 1, frameId: 0 })
  ]) {
    tab.url = "https://old.reddit.com/cached";
    await trigger();
    assert.equal(tab.url, "moz-extension://focus/blocked.html");
  }
  assert.equal(listeners.updates.length, 4);
  await listeners.updated(1, { status: "complete" });
  assert.equal(listeners.updates.length, 4, "blocked page must not redirect itself");
});

test("ignores subframe events, stale blocked URLs, unrelated changes and closed tabs", async () => {
  const { listeners } = setup(Promise.resolve({}), [{ id: 1, url: "https://example.org" }]);
  await flush();
  await listeners.committed({ tabId: 1, frameId: 2, url: "https://reddit.com" });
  await listeners.committed({ tabId: 1, frameId: 0, url: "https://reddit.com" });
  await listeners.updated(1, { title: "New title" });
  await listeners.updated(99, { status: "loading" });
  assert.equal(listeners.updates.length, 0);
});

test("disabled state survives startup, allows navigation, and re-enabling checks open tabs", async () => {
  const tab = { id: 1, url: "https://reddit.com" };
  const { listeners } = setup(Promise.resolve({ enabled: false }), [tab]);
  await flush();
  assert.equal((await listeners.request({ url: tab.url })).cancel, false);
  await listeners.updated(1, { status: "loading" });
  await listeners.committed({ tabId: 1, frameId: 0 });
  await listeners.history({ tabId: 1, frameId: 0 });
  await listeners.change({ domainsText: { newValue: "reddit.com" } }, "local");
  assert.equal(listeners.updates.length, 0);

  await listeners.change({ enabled: { newValue: true } }, "local");
  assert.equal(tab.url, "moz-extension://focus/blocked.html");
  assert.equal((await listeners.request({ url: "https://reddit.com" })).cancel, true);
  await listeners.change({ enabled: { newValue: false } }, "local");
  assert.equal((await listeners.request({ url: "https://reddit.com" })).cancel, false);
});

test("settings require confirmation only when disabling and recover from save errors", async () => {
  for (const [enabled, confirmResult, fail, expected, writes, prompts] of [
    [true, false, false, true, 0, 1],
    [true, true, false, false, 1, 1],
    [false, false, false, true, 1, 0],
    [true, true, true, true, 0, 1]
  ]) {
    const elements = Object.fromEntries(["form", "textarea", "button", "#status", "#enabled"].map(id =>
      [id, { disabled: true, addEventListener(event, fn) { this[event] = fn; } }]
    ));
    const saved = [];
    let prompted = 0;
    let changed;
    const context = vm.createContext({
      document: { querySelector: selector => elements[selector] },
      confirm: message => {
        assert.match(message, /All listed sites will be accessible/);
        prompted++;
        return confirmResult;
      },
      browser: { storage: {
        local: {
          get: async () => ({ enabled, domainsText: "reddit.com" }),
          set: async value => {
            if (fail) throw new Error("Storage unavailable");
            saved.push(value);
          }
        },
        onChanged: { addListener: fn => { changed = fn; } }
      } }
    });
    vm.runInContext(source("options.js"), context);
    await flush();
    const toggle = elements["#enabled"];
    assert.equal(toggle.checked, enabled);
    toggle.checked = !enabled;
    await toggle.change();
    assert.equal(toggle.checked, expected);
    assert.equal(toggle.disabled, false);
    assert.equal(saved.length, writes);
    if (writes) assert.equal(saved[0].enabled, expected);
    assert.equal(prompted, prompts);
    if (fail) assert.equal(elements["#status"].textContent, "Storage unavailable");
    changed({ enabled: { newValue: false } }, "local");
    assert.equal(toggle.checked, false, "reflect changes from another settings tab");
  }
});
