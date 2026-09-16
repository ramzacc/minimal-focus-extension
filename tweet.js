"use strict";

const status = document.querySelector("#status");
const article = document.querySelector("#tweet");
const id = new URLSearchParams(location.search).get("id");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function image(src, className, alt) {
  const node = el("img", className);
  if (src) node.src = src;
  node.alt = alt || "";
  node.loading = "lazy";
  node.referrerPolicy = "no-referrer";
  return node;
}

function renderText(tweet) {
  const body = el("p", "text");
  for (const part of FocusTweet.segments(tweet)) {
    if (part.kind === "text") {
      body.append(document.createTextNode(part.value));
    } else if (part.kind === "url") {
      const link = el("a", "link", part.value);
      link.href = part.href;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      body.append(link);
    } else {
      body.append(el("span", part.kind, part.value));
    }
  }
  return body;
}

function renderMedia(tweet) {
  const details = tweet.mediaDetails || [];
  if (details.length) {
    return details.map(media => {
      const alt = media.ext_alt_text;
      if (media.type === "photo") return image(media.media_url_https, "media", alt);
      const src = FocusTweet.videoSrc(media);
      if (!src) return image(media.media_url_https, "media", alt);
      const player = el("video", "media");
      player.src = src;
      if (media.media_url_https) player.poster = media.media_url_https;
      player.controls = true;
      player.playsInline = true;
      if (media.type === "animated_gif") {
        player.autoplay = true;
        player.muted = true;
        player.loop = true;
      }
      if (alt) player.setAttribute("aria-label", alt);
      return player;
    });
  }
  return (tweet.photos || []).map(photo => image(photo.url, "media", ""));
}

function renderTweet(tweet, compact = false) {
  const container = el("div", "tweet");
  const header = el("header", "author");
  const who = el("div", "who");
  who.append(el("span", "name", (tweet.user && tweet.user.name) || "Tweet"));
  if (tweet.user && tweet.user.screen_name) who.append(el("span", "handle", `@${tweet.user.screen_name}`));
  if (!compact && tweet.created_at) {
    const date = document.createElement("time");
    date.className = "date";
    date.dateTime = tweet.created_at;
    date.textContent = new Date(tweet.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    who.append(date);
  }
  header.append(image((tweet.user && tweet.user.profile_image_url_https) || "", "avatar", ""), who);
  container.append(header);
  if (!compact && tweet.in_reply_to_screen_name) {
    container.append(el("p", "reply", `Replying to @${tweet.in_reply_to_screen_name}`));
  }
  if (tweet.text) container.append(renderText(tweet));
  container.append(...renderMedia(tweet));
  if (!compact && tweet.quoted_tweet) {
    const quote = el("div", "quote");
    quote.append(renderTweet(tweet.quoted_tweet, true));
    container.append(quote);
  }
  return container;
}

async function show(id) {
  const response = await fetch(FocusTweet.resultUrl(id));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const tweet = await response.json();
  article.append(renderTweet(tweet));
  status.hidden = true;
  article.hidden = false;
}

if (!/^\d+$/.test(id || "")) {
  status.textContent = "This link is not a tweet.";
} else {
  show(id).catch(() => {
    status.textContent = "Could not load this tweet. It may be deleted or private.";
  });
}
