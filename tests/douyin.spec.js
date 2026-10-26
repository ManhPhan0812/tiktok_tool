const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const h = require("./fixtures/harness");

let harness;
let page;

test.beforeAll(async () => {
  harness = await h.launch();
});

test.beforeEach(async () => {
  await h.resetStorage(harness.worker);
  page = await h.openDouyin(harness);
});

test.afterEach(async () => {
  await h.closeExtraTabs(harness);
});

test.afterAll(async () => {
  await h.dispose(harness);
});

test("content script chạy trên Douyin và đọc đúng video đang xem", async () => {
  const status = await h.send(harness, page, "PLAYER_STATUS");
  expect(status.available).toBe(true);
  expect(status.videoId).toBe("7697907897409228095");
  expect(status.canonicalUrl).toBe("https://www.douyin.com/video/7697907897409228095");
  expect(status.url).toBe("https://www.douyin.com/video/7697907897409228095");
  await expect(page.locator("#tiktok-tools-control")).toBeVisible();
});

test("lật video Douyin chỉ đụng tới <video>, khôi phục nguyên trạng", async () => {
  const video = page.locator("#dy-one");
  const before = await video.boundingBox();
  await page.locator("#tiktok-tools-control").click();
  await expect(video).toHaveAttribute(h.marked, "");
  await expect(video).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 0, 0)");
  // Lớp canvas nền của xgplayer không được lật theo (nó chỉ là nền mờ).
  await expect(page.locator(".xgplayer-dynamic-bg")).not.toHaveAttribute(h.marked);
  const after = await video.boundingBox();
  for (const key of ["x", "y", "width", "height"]) expect(after[key]).toBeCloseTo(before[key], 3);

  await page.locator("#tiktok-tools-control").click();
  await expect(video).not.toHaveAttribute(h.marked);
  await expect(video).toHaveCSS("transform", "none");
});

test("đổi tốc độ trên Douyin áp dụng vào video và theo tùy chọn đã lưu", async () => {
  const data = await h.send(harness, page, "SPEED_SET", { rate: 2 });
  expect(data.rate).toBe(2);
  await expect.poll(() => page.evaluate(() => document.querySelector("#dy-one")?.playbackRate ?? null)).toBe(2);

  // Đổi trong popup là ghi vào storage; content script phải áp dụng lại ngay.
  await h.writeSettings(harness, { playbackRate: 1.5 });
  await expect.poll(() => page.evaluate(() => document.querySelector("#dy-one")?.playbackRate ?? null)).toBe(1.5);
});

test("Clean Mode Douyin ẩn đạn màn hình, khai báo và tiến trình, giữ nút thao tác", async () => {
  await h.writeSettings(harness, { cleanMode: true });
  await expect(page.locator("html")).toHaveAttribute("data-tiktok-tools-clean", "1");
  await expect(page.locator('[data-e2e="danmaku-container"]')).toBeHidden();
  await expect(page.locator(".player-position-box-bottom")).toBeHidden();
  await expect(page.locator(".xgplayer-progress")).toBeHidden();
  // Nút thích/bình luận/lưu/chia sẻ và danh sách bình luận phải còn.
  await expect(page.locator('[data-e2e="video-player-digg"]')).toBeVisible();
  await expect(page.locator('[data-e2e="comment-list"]')).toBeVisible();

  await h.writeSettings(harness, { cleanMode: false });
  await expect(page.locator('[data-e2e="danmaku-container"]')).toBeVisible();
  await expect(page.locator(".xgplayer-progress")).toBeVisible();
});

test("chụp khung hình trên Douyin đặt tên douyin_ và lưu PNG đúng chiều lật", async () => {
  await h.useCanvasVideo(page, "#dy-one", { width: 320, height: 240 });
  await h.send(harness, page, "MIRROR_TOGGLE");
  const popup = await h.openPopup(harness, page);
  await expect(popup.locator("#capture")).toBeEnabled();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    popup.locator("#capture").click()
  ]);
  const name = download.suggestedFilename();
  expect(name).toMatch(/^douyin_7697907897409228095_\d{8}-\d{6}_khung-hinh\.png$/);

  const saved = await h.waitForDownload(harness, name);
  const bytes = await fs.readFile(saved.path);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(320);
  expect(bytes.readUInt32BE(20)).toBe(240);
});

test("popup nhận đúng nền tảng Douyin và điều khiển được video", async () => {
  const popup = await h.openPopup(harness, page);
  await expect(popup.locator("#connection")).toContainText("Douyin");
  await expect(popup.locator("#mirror")).toBeEnabled();
  await popup.locator("#mirror").click();
  await expect(page.locator("#dy-one")).toHaveAttribute(h.marked, "");
  await expect(popup.locator("#video-chip")).toContainText("Đang xem video");
});

test("link Douyin được báo chưa hỗ trợ tải thay vì 'chỉ hỗ trợ tiktok.com'", async () => {
  const parsed = await harness.worker.evaluate(() => TikTokTools.validation.parseVideoUrl("https://www.douyin.com/video/7697907897409228095"));
  expect(parsed.ok).toBe(false);
  expect(parsed.code).toBe("UNSUPPORTED_PLATFORM");
  // Trong khi đó link Douyin vẫn được coi là tab extension chạy được.
  const tab = await harness.worker.evaluate(() => TikTokTools.validation.isSupportedTabUrl("https://www.douyin.com/video/7697907897409228095"));
  expect(tab).toBe(true);
});
