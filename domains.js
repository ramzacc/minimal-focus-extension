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
  },

  // Hosts and paths the viewers need (tweet media + syndication API, the
  // no-cookie YouTube player, and Instagram's embedded post app). Exempt so
  // content renders without the feed; top-level browsing stays blocked.
  embedDomains: ["twimg.com", "instagram.com", "cdninstagram.com", "fbcdn.net", "facebook.com", "facebook.net"],
  embedPaths: [/^\/(?:s\/player|youtubei|yts|api|pagead|ptracking|pcs)\//, /^\/(?:generate_204|csi_204|sw\.js)$/],

  isEmbedAsset(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    const hostname = parsed.hostname.replace(/\.$/, "");
    if (this.embedDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) return true;
    const isYouTube = hostname === "youtube.com" || hostname.endsWith(".youtube.com") ||
      hostname === "youtube-nocookie.com" || hostname.endsWith(".youtube-nocookie.com");
    return isYouTube && this.embedPaths.some(pattern => pattern.test(parsed.pathname));
  },

  // Returns the numeric status id for a tweet URL, or null otherwise.
  tweetId(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    const hostname = parsed.hostname.replace(/\.$/, "");
    const isTwitter = hostname === "twitter.com" || hostname === "x.com" ||
      hostname.endsWith(".twitter.com") || hostname.endsWith(".x.com");
    if (!isTwitter) return null;
    const match = parsed.pathname.match(/\/(?:status|statuses)\/(\d+)/);
    return match ? match[1] : null;
  },

  // Returns the 11-character video id for a YouTube URL, or null otherwise.
  videoId(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    const hostname = parsed.hostname.replace(/\.$/, "");
    const isYouTube = hostname === "youtube.com" || hostname.endsWith(".youtube.com") ||
      hostname === "youtube-nocookie.com" || hostname.endsWith(".youtube-nocookie.com") ||
      hostname === "youtu.be";
    if (!isYouTube) return null;
    const valid = /^[A-Za-z0-9_-]{11}$/;
    const query = parsed.searchParams.get("v");
    if (query && valid.test(query)) return query;
    const path = hostname === "youtu.be" ? parsed.pathname.slice(1) : parsed.pathname;
    const match = path.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/) ||
      (hostname === "youtu.be" ? path.match(/^([A-Za-z0-9_-]{11})(?:\/|$)/) : null);
    return match ? match[1] : null;
  },

  // Returns { type, code } for an Instagram post/reel/tv URL, or null.
  instagramPost(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    const hostname = parsed.hostname.replace(/\.$/, "");
    if (!(hostname === "instagram.com" || hostname.endsWith(".instagram.com"))) return null;
    const match = parsed.pathname.match(/^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,20})(?:\/|$)/);
    if (!match) return null;
    return { type: match[1] === "reels" ? "reel" : match[1], code: match[2] };
  }
};
