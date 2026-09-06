"use strict";

let blockedDomains = FocusDomains.parse(FocusDomains.defaults);
let enabled = true;
const ready = browser.storage.local.get(["domainsText", "enabled"]).then(settings => {
  const { domainsText } = settings;
  enabled = settings.enabled !== false;
  if (typeof domainsText === "string") blockedDomains = FocusDomains.parse(domainsText);
}).catch(error => {
  console.error("Could not load blocked domains; using the default list.", error);
});

const isBlocked = url => enabled && FocusDomains.matches(url, blockedDomains);

// Wait for saved settings before checking startup requests.
browser.webRequest.onBeforeRequest.addListener(
  details => ready.then(() => ({ cancel: isBlocked(details.url) })),
  { urls: ["<all_urls>"] },
  ["blocking"]
);

async function enforceTab(tabId) {
  await ready;
  try {
    // Read the current tab instead of trusting an event that may now be stale.
    const tab = await browser.tabs.get(tabId);
    if (isBlocked(tab.url) || isBlocked(tab.pendingUrl)) {
      await browser.tabs.update(tabId, { url: browser.runtime.getURL("blocked.html") });
    }
  } catch {
    // Tabs may close while their navigation events are being handled.
  }
}

async function enforceOpenTabs() {
  await ready;
  if (!enabled) return;
  const tabs = await browser.tabs.query({});
  await Promise.all(tabs.map(tab => enforceTab(tab.id)));
}

// Navigation events also cover documents restored without a network request.
for (const event of [browser.webNavigation.onCommitted, browser.webNavigation.onHistoryStateUpdated]) {
  event.addListener(details => {
    if (details.frameId === 0) return enforceTab(details.tabId);
  });
}
browser.tabs.onUpdated.addListener((tabId, changes) => {
  if (changes.url !== undefined || changes.status !== undefined) return enforceTab(tabId);
});
enforceOpenTabs().catch(error => console.error("Could not check open tabs.", error));

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !(changes.domainsText || changes.enabled)) return;
  await ready;
  if (changes.enabled) enabled = changes.enabled.newValue !== false;
  try {
    if (changes.domainsText) {
      blockedDomains = FocusDomains.parse(changes.domainsText.newValue ?? FocusDomains.defaults);
    }
  } catch (error) {
    console.error("Invalid domain list; keeping the previous list.", error);
    return;
  }
  await enforceOpenTabs().catch(error => console.error("Could not check open tabs.", error));
});

browser.browserAction.onClicked.addListener(() => browser.runtime.openOptionsPage());
