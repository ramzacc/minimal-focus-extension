"use strict";

globalThis.FocusDomains = {
  defaults: [
    "facebook.com", "instagram.com", "reddit.com", "tiktok.com",
    "twitter.com", "x.com", "youtube.com"
  ].join("\n"),

  parse(text) {
    const domains = new Set();
    for (const [index, raw] of text.split(/\r?\n/).entries()) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;

      let hostname;
      try {
        // URL handles international domain names; reject URL syntax in the input.
        if (/[\s/:?#@\\%]/u.test(line)) throw new Error();
        hostname = new URL(`https://${line}`).hostname.replace(/\.$/, "");
        if (hostname.length > 253 || !hostname.split(".").every(label =>
          /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
        )) throw new Error();
      } catch {
        throw new Error(`Line ${index + 1}: enter a domain like reddit.com, not a URL or wildcard.`);
      }
      domains.add(hostname);
    }
    return domains;
  },

  matches(url, domains) {
    let hostname;
    try {
      hostname = new URL(url).hostname.replace(/\.$/, "");
    } catch {
      return false;
    }
    return [...domains].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  }
};
