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

// Blocked tweet and video links open a local viewer that shows only that item.
// Everything else on a blocked domain is cancelled or replaced by blocked.html.
function viewerTarget(url) {
  const tweet = FocusDomains.tweetId(url);
  if (tweet) return `${browser.runtime.getURL("tweet.html")}?id=${encodeURIComponent(tweet)}`;
  const video = FocusDomains.videoId(url);
  if (video) return `${browser.runtime.getURL("youtube.html")}?v=${encodeURIComponent(video)}`;
  return null;
}

function decide(url, type) {
  if (!isBlocked(url)) return { cancel: false };
  if (type === "main_frame") {
    const target = viewerTarget(url);
    return target ? { redirectUrl: target } : { cancel: true };
  }
  // The viewers' own assets must load even though they live on blocked hosts.
  return { cancel: !FocusDomains.isEmbedAsset(url) };
}

// Wait for saved settings before checking startup requests.
browser.webRequest.onBeforeRequest.addListener(
  details => ready.then(() => decide(details.url, details.type)),
  { urls: ["<all_urls>"] },
  ["blocking"]
);

// YouTube rejects embeds whose Referer is missing or is not a legitimate
// non-YouTube http(s) origin (Error 153 / 152-4). Extension pages have a
// moz-extension:// origin and YouTube treats youtube.com as a self-referrer,
// so present a real external origin for player requests started by our viewers.
const viewerOrigin = browser.runtime.getURL("");
const isViewerDocument = url => typeof url === "string" && url.startsWith(viewerOrigin);
const playerReferrer = "https://github.com/";

browser.webRequest.onBeforeSendHeaders.addListener(
  details => {
    if (!isViewerDocument(details.documentUrl) && !isViewerDocument(details.originUrl)) return undefined;
    const requestHeaders = details.requestHeaders.filter(header => header.name.toLowerCase() !== "referer");
    requestHeaders.push({ name: "Referer", value: playerReferrer });
    return { requestHeaders };
  },
  { urls: ["https://www.youtube.com/*", "https://www.youtube-nocookie.com/*"] },
  ["blocking", "requestHeaders"]
);

async function enforceTab(tabId) {
  await ready;
  if (!enabled) return;
  try {
    // Read the current tab instead of trusting an event that may now be stale.
    const tab = await browser.tabs.get(tabId);
    // A viewer navigation in flight is already being redirected by webRequest.
    // Updating the tab here too would restart it before it commits and loop.
    if (isBlocked(tab.pendingUrl) && viewerTarget(tab.pendingUrl)) return;
    const url = isBlocked(tab.url) ? tab.url : isBlocked(tab.pendingUrl) ? tab.pendingUrl : null;
    if (!url) return;
    const target = viewerTarget(url) || browser.runtime.getURL("blocked.html");
    if (tab.url === target || tab.pendingUrl === target) return;
    await browser.tabs.update(tabId, { url: target });
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
