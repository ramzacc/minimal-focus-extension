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
      webRequest: { onBeforeRequest: { addListener: (fn, filter, extra) => {
        listeners.request = fn;
        assert.deepEqual(Array.from(filter.urls), ["<all_urls>"]);
        assert.deepEqual(Array.from(extra), ["blocking"]);
      } } },
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
