"use strict";

const status = document.querySelector("#status");
const frame = document.querySelector("#post");
const params = new URLSearchParams(location.search);
const type = params.get("type");
const code = params.get("code");
const referrer = "https://github.com";
let sized = false;

// The embedded post reports its rendered height via postMessage so the frame
// can fit its contents instead of leaving a fixed box with a scrollbar.
window.addEventListener("message", event => {
  let hostname;
  try {
    hostname = new URL(event.origin).hostname;
  } catch {
    return;
  }
  if (hostname !== "instagram.com" && !hostname.endsWith(".instagram.com")) return;
  let data = event.data;
  if (typeof data === "string") {
    if (data.startsWith("instagram-embed-")) data = data.slice("instagram-embed-".length);
    try {
      data = JSON.parse(data);
    } catch {
      return;
    }
  }
  const height = data && data.details && data.details.height;
  if (data && data.type === "MEASURE" && typeof height === "number" && height > 0) {
    sized = true;
    frame.style.height = `${Math.ceil(height) + 2}px`;
  }
});

if (!/^(?:p|reel|tv)$/.test(type || "") || !/^[A-Za-z0-9_-]{5,20}$/.test(code || "")) {
  status.textContent = "This link is not a post.";
} else {
  frame.src = `https://www.instagram.com/${type}/${code}/embed/captioned/?cr=1&v=14&wp=540&rd=${encodeURIComponent(referrer)}`;
  status.hidden = true;
  frame.hidden = false;
  // If the embed never reports a height, fall back to a viewport-tall frame.
  setTimeout(() => {
    if (!sized) frame.style.height = `${Math.min(Math.max(window.innerHeight - 64, 480), 1000)}px`;
  }, 1500);
}
