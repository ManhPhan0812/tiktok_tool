const { test, expect } = require("@playwright/test");
const h = require("./fixtures/harness");

let harness;
let page;

test.beforeAll(async () => {
  harness = await h.launch();
});

test.beforeEach(async () => {
  await h.resetStorage(harness.worker);
  page = await h.openTikTok(harness);
});

test.afterEach(async () => {
  await h.closeExtraTabs(harness);
});

test.afterAll(async () => {
  await h.dispose(harness);
});

test("popup rộng 360px, có đủ ba nhóm và phiên bản khớp manifest", async () => {
  const popup = await h.openPopup(harness, page);
  expect(await popup.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await expect(popup.locator("#features-heading")).toHaveText("FEATURES");
  await expect(popup.locator("#playback-heading")).toHaveText("PLAYBACK");
  await expect(popup.locator("#actions-heading")).toHaveText("ACTIONS");
  const version = await harness.worker.evaluate(() => chrome.runtime.getManifest().version);
  await expect(popup.locator("#version")).toHaveText(`v${version}`);
  expect(version).toBe(require("../package.json").version);
});

test("Equalizer phản ánh đúng trạng thái, không giả vờ đang bật", async () => {
  const popup = await h.openPopup(harness, page);
  await expect(popup.locator("#connection")).toContainText("Đã kết nối");
  await expect(popup.locator("#eq")).toBeEnabled();
  await expect(popup.locator("#eq-note")).toContainText("Tắt");

  // Popup mở bằng URL không có activeTab: bật phải thất bại kèm lý do, không hiện "Đang bật".
  await popup.selectOption("#eq", "bass");
  await expect(popup.locator("#error")).toContainText("icon extension");
  await expect(popup.locator("#eq")).toHaveValue("off");
  await expect(popup.locator("#eq-note")).toContainText("Tắt");
});

test("nút đổi giao diện chuyển sáng/tối và lưu lựa chọn", async () => {
  const popup = await h.openPopup(harness, page);
  await expect(popup.locator("html")).toHaveAttribute("data-theme", "dark");
  await popup.locator("#theme").click();
  await expect(popup.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(async () => (await h.readSettings(harness)).theme).toBe("light");
  await popup.locator("#theme").click();
  await expect(popup.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("popup điều khiển tab TikTok: lật video và lưu tùy chọn", async () => {
  const popup = await h.openPopup(harness, page);
  await expect(popup.locator("#mirror")).toBeEnabled();
  await expect(popup.locator("#connection")).toContainText("Đã kết nối");
  await popup.locator("#mirror").click();
  await expect(page.locator("#one")).toHaveAttribute(h.marked, "");
  await expect(popup.locator("#mirror")).toHaveText("Khôi phục chiều gốc");

  await popup.locator("#auto-mirror").check();
  await expect(page.locator("#two")).toHaveAttribute(h.marked, "");
  await expect.poll(async () => (await h.readSettings(harness)).autoMirror).toBe(true);

  await popup.locator("#floating-button").uncheck();
  await expect(page.locator("#tiktok-tools-control")).toBeHidden();
  await expect.poll(async () => (await h.readSettings(harness)).showFloatingButton).toBe(false);
});

test("popup đổi tốc độ bằng preset và slider, thanh tốc độ hiển thị đúng", async () => {
  const popup = await h.openPopup(harness, page);
  await popup.locator('#presets button[data-rate="2"]').click();
  await expect(page.locator("#one")).toHaveJSProperty("playbackRate", 2);
  await expect(popup.locator("#rate-value")).toHaveText("2×");
  await expect(popup.locator('#presets button[data-rate="2"]')).toHaveAttribute("aria-pressed", "true");

  await popup.locator("#rate").evaluate(el => {
    el.value = "1.3";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#one")).toHaveJSProperty("playbackRate", 1.3);
  await expect(popup.locator('#presets button[data-rate="1.5"]')).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await h.readSettings(harness)).playbackRate).toBe(1.3);
});

test("không có tab TikTok thì popup khóa điều khiển và hướng dẫn mở TikTok", async () => {
  await h.closeExtraTabs(harness);
  const blank = await harness.context.newPage();
  await blank.goto("about:blank");
  await blank.bringToFront();
  const popup = await h.openPopup(harness, blank);
  await expect(popup.locator("#connection")).toContainText("Chưa kết nối");
  await expect(popup.locator("#mirror")).toBeDisabled();
  await expect(popup.locator("#capture")).toBeDisabled();
  await expect(popup.locator("#auto-mirror")).toBeDisabled();
});

test("settings phiên bản cũ được migrate, giữ nguyên lựa chọn đã lưu", async () => {
  await h.writeSettings(harness, { autoMirror: true, showFloatingButton: false });
  const popup = await h.openPopup(harness, page);
  await expect(popup.locator("#auto-mirror")).toBeChecked();
  await expect(popup.locator("#floating-button")).not.toBeChecked();
  const stored = await h.readSettings(harness);
  expect(stored.schemaVersion).toBe(2);
  expect(stored.playbackRate).toBe(1);
  expect(stored.theme).toBe("dark");
  // Content script nhận cùng giá trị đã chuẩn hóa.
  const status = await h.send(harness, page, "PLAYER_STATUS");
  expect(status.settings.autoMirror).toBe(true);
  expect(status.settings.showFloatingButton).toBe(false);
});
