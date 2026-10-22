// Live smoke test: analyse a real URL through the popup without relying on TikTok page metadata.
// Usage: npm run check:resolve -- "https://www.tiktok.com/@user/video/id"
const fs = require("node:fs/promises");
const path = require("node:path");
const h = require("../tests/fixtures/harness");

const url = process.argv[2] || "https://www.tiktok.com/@967.432.813.hieutpbank/video/7697075597226315026";

(async () => {
  const harness = await h.launch({ routePage: false });
  try {
    const blank = harness.context.pages()[0];
    const popup = await h.openPopup(harness, blank);
    await popup.locator("#url").fill(url);
    await popup.locator("#analyze").click();
    const result = await Promise.race([
      popup.locator("#download-result").waitFor({ state: "visible", timeout: 60000 }).then(() => "success"),
      popup.locator("#error").waitFor({ state: "visible", timeout: 60000 }).then(() => "error")
    ]);
    if (result === "error") throw new Error(await popup.locator("#error").innerText());
    const details = await popup.locator("#download-meta").innerText();
    if (!details.includes("link từ tikwm.com")) throw new Error("The result did not come from TikWM.");
    const rows = await popup.locator("#download-rows button").evaluateAll(buttons => buttons.map(button => ({
      variant: button.dataset.variant,
      available: !button.disabled,
      primary: button.classList.contains("primary"),
      text: button.textContent
    })));
    const primary = rows.find(row => row.primary);
    if (!primary?.available || !["hd", "noLogo"].includes(primary.variant)) throw new Error("No default watermark-free video available.");
    await fs.mkdir("test-results", { recursive: true });
    await popup.locator("#download-result").scrollIntoViewIfNeeded();
    await popup.screenshot({ path: path.resolve("test-results/resolve-live.png"), fullPage: true });
    console.log(JSON.stringify({
      version: await harness.worker.evaluate(() => chrome.runtime.getManifest().version),
      url, details, rows, screenshot: "test-results/resolve-live.png"
    }, null, 2));
  } finally {
    await h.dispose(harness);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
