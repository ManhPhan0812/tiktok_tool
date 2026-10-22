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

test.describe("Speed", () => {
  test("đặt tốc độ áp dụng cho mọi video và video mới kế thừa", async () => {
    await h.send(harness, page, "SPEED_SET", { rate: 1.5 });
    await expect(page.locator("#one")).toHaveJSProperty("playbackRate", 1.5);
    await expect(page.locator("#two")).toHaveJSProperty("playbackRate", 1.5);
    expect((await h.send(harness, page, "PLAYER_STATUS")).rate).toBe(1.5);

    await page.evaluate(() => {
      const video = document.createElement("video");
      video.id = "dynamic";
      document.querySelector("main").append(video);
    });
    await expect(page.locator("#dynamic")).toHaveJSProperty("playbackRate", 1.5);
  });

  test("thanh tốc độ của TikTok cập nhật trạng thái phiên thay vì bị ghi đè", async () => {
    await h.send(harness, page, "SPEED_SET", { rate: 1.5 });
    await page.locator("#one").evaluate(video => { video.playbackRate = 2; });
    await expect.poll(async () => (await h.send(harness, page, "PLAYER_STATUS")).rate).toBe(2);
    await page.waitForTimeout(400);
    await expect(page.locator("#one")).toHaveJSProperty("playbackRate", 2);
  });

  test("giá trị tốc độ được lưu và áp dụng sau khi tải lại trang", async () => {
    await h.writeSettings(harness, { playbackRate: 2.5 });
    await page.reload();
    await expect(page.locator("#one")).toHaveJSProperty("playbackRate", 2.5);
    expect((await h.readSettings(harness)).playbackRate).toBe(2.5);
  });
});

test.describe("Clean Mode", () => {
  test("ẩn caption và thanh tiến trình, giữ nút thao tác và video", async () => {
    await h.writeSettings(harness, { cleanMode: true });
    await expect(page.locator("#caption")).toBeHidden();
    await expect(page.locator("#progress")).toBeHidden();
    await expect(page.locator("#rail")).toBeVisible();
    await expect(page.locator("#one")).toBeVisible();
    expect((await h.send(harness, page, "PLAYER_STATUS")).cleanMode).toBe(true);

    await h.writeSettings(harness, { cleanMode: false });
    await expect(page.locator("#caption")).toBeVisible();
    await expect(page.locator("#progress")).toBeVisible();
  });

  test("nội dung mới thêm khi đang bật cũng bị ẩn mà không cần xử lý lại DOM", async () => {
    await h.writeSettings(harness, { cleanMode: true });
    await page.locator("main").evaluate(main => {
      const caption = document.createElement("div");
      caption.id = "late-caption";
      caption.className = "css-new--DivMediaCardOverlayBottomSection";
      caption.textContent = "Caption mới";
      main.querySelector("section").append(caption);
    });
    await expect(page.locator("#late-caption")).toBeHidden();
  });
});

test.describe("Background Play", () => {
  test("pause do chuyển tab được phát tiếp khi bật tính năng", async () => {
    await h.useCanvasVideo(page);
    await h.disableFocusEmulation(harness.context, page);
    await h.writeSettings(harness, { backgroundPlay: true });
    await expect.poll(() => page.locator("#one").evaluate(video => video.paused)).toBe(false);

    await h.moveToBackground(harness, page);
    await page.locator("#one").evaluate(video => video.pause());
    await expect.poll(() => page.locator("#one").evaluate(video => video.paused), { timeout: 5_000 }).toBe(false);
  });

  test("người dùng chủ động pause thì không bị ép phát lại", async () => {
    await h.useCanvasVideo(page);
    await h.disableFocusEmulation(harness.context, page);
    await h.writeSettings(harness, { backgroundPlay: true });
    await page.locator("#one").evaluate(video => video.pause());
    await h.moveToBackground(harness, page);
    await page.waitForTimeout(700);
    await expect(page.locator("#one")).toHaveJSProperty("paused", true);
  });

  test("tắt tính năng thì không can thiệp vào pause", async () => {
    await h.useCanvasVideo(page);
    await h.disableFocusEmulation(harness.context, page);
    await h.writeSettings(harness, { backgroundPlay: false });
    await h.moveToBackground(harness, page);
    await page.locator("#one").evaluate(video => video.pause());
    await page.waitForTimeout(700);
    await expect(page.locator("#one")).toHaveJSProperty("paused", true);
  });
});
