"use strict";

const status = document.querySelector("#status");
const player = document.querySelector("#player");
const id = new URLSearchParams(location.search).get("v");

if (!/^[A-Za-z0-9_-]{11}$/.test(id || "")) {
  status.textContent = "This link is not a video.";
} else {
  const frame = document.createElement("iframe");
  frame.title = "Video";
  frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  frame.allowFullscreen = true;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  // rel=0 keeps end-screen suggestions to the same channel; no cookie set.
  // The origin must match the Referer the background sets (YouTube 153/152-4).
  const origin = "https://github.com";
  frame.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&iv_load_policy=3&playsinline=1&origin=${encodeURIComponent(origin)}`;
  player.append(frame);
  status.hidden = true;
  player.hidden = false;
}
