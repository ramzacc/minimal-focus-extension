"use strict";

const form = document.querySelector("form");
const textarea = document.querySelector("textarea");
const button = document.querySelector("button");
const status = document.querySelector("#status");
const toggle = document.querySelector("#enabled");

browser.storage.local.get(["domainsText", "enabled"]).then(({ domainsText, enabled }) => {
  textarea.value = domainsText ?? FocusDomains.defaults;
  toggle.checked = enabled !== false;
  toggle.disabled = false;
  textarea.disabled = false;
  button.disabled = false;
}).catch(error => {
  status.textContent = `Could not load your list: ${error.message}`;
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.enabled) toggle.checked = changes.enabled.newValue !== false;
});
toggle.addEventListener("change", async () => {
  if (!toggle.checked && !confirm("Disable blocking? All listed sites will be accessible until you enable it again.")) {
    toggle.checked = true;
    return;
  }
  toggle.disabled = true;
  try {
    await browser.storage.local.set({ enabled: toggle.checked });
  } catch (error) {
    toggle.checked = !toggle.checked;
    status.textContent = error.message;
  } finally {
    toggle.disabled = false;
  }
});

textarea.addEventListener("input", () => { status.textContent = "Unsaved changes"; });
form.addEventListener("submit", async event => {
  event.preventDefault();
  button.disabled = true;
  try {
    const text = textarea.value;
    FocusDomains.parse(text);
    await browser.storage.local.set({ domainsText: text });
    status.textContent = textarea.value !== text ? "Unsaved changes" : "Saved.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
