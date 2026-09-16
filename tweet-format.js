"use strict";

// Pure helpers for the single-tweet viewer. Kept free of DOM APIs so they can
// be unit tested directly.
globalThis.FocusTweet = {
  getToken(id) {
    return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
  },

  resultUrl(id) {
    return `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${this.getToken(id)}&lang=en`;
  },

  // Splits a tweet's text into plain text and linkified entity parts, honoring
  // display_text_range (which trims the trailing media link).
  segments(tweet) {
    const chars = Array.from(tweet.text || "");
    const [start, end] = tweet.display_text_range || [0, chars.length];
    const entities = [];
    const add = (kind, list) => (list || []).forEach(entity => entities.push({ kind, entity }));
    const source = tweet.entities || {};
    add("url", source.urls);
    add("mention", source.user_mentions);
    add("hashtag", source.hashtags);
    add("symbol", source.symbols);
    entities.sort((a, b) => a.entity.indices[0] - b.entity.indices[0]);

    const parts = [];
    let cursor = start;
    for (const { kind, entity } of entities) {
      const from = entity.indices[0];
      const to = entity.indices[1];
      if (from < cursor || to > end) continue;
      if (from > cursor) parts.push({ kind: "text", value: chars.slice(cursor, from).join("") });
      const value = chars.slice(from, to).join("");
      if (kind === "url") {
        parts.push({ kind, value: entity.display_url || value, href: entity.expanded_url || entity.url || value });
      } else {
        parts.push({ kind, value });
      }
      cursor = to;
    }
    if (cursor < end) parts.push({ kind: "text", value: chars.slice(cursor, end).join("") });
    return parts;
  },

  // Picks the best progressive MP4 from a mediaDetails video entry.
  videoSrc(media) {
    const variants = (media && media.video_info && media.video_info.variants) || [];
    return variants
      .filter(variant => variant.content_type === "video/mp4")
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
      .map(variant => variant.url)[0] || null;
  }
};
