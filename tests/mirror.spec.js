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
  // Giữ tab trống ban đầu để trình duyệt persistent không đóng.
  await h.closeExtraTabs(harness);
});

test.afterAll(async () => {
  await h.dispose(harness);
});

test("nút nổi lật đúng video đang hiển thị và khôi phục nguyên trạng", async () => {
  const video = page.locator("#one");
  const transform = await video.evaluate(el => getComputedStyle(el).transform);
  const originalStyle = await video.evaluate(el => el.style.cssText);
  const before = await video.boundingBox();
  await page.locator("#tiktok-tools-control").click();
  await expect(video).toHaveAttribute(h.marked, "");
  await expect(video).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 12, 0)");
  await expect(page.locator("#two")).not.toHaveAttribute(h.marked);
  const after = await video.boundingBox();
  for (const key of ["x", "y", "width", "height"]) expect(after[key]).toBeCloseTo(before[key], 3);
  await expect(page.locator("#interface")).toHaveCSS("scale", "none");
  await page.locator("#tiktok-tools-control").click();
  await expect(video).not.toHaveAttribute(h.marked);
  await expect(video).toHaveCSS("scale", "0.9 0.8");
  expect(await video.evaluate(el => getComputedStyle(el).transform)).toBe(transform);
  expect(await video.evaluate(el => el.style.cssText)).toBe(originalStyle);
});

test("transform của TikTok thay đổi khi đang lật vẫn giữ tịnh tiến và khôi phục sạch", async () => {
  await h.send(harness, page, "MIRROR_TOGGLE");
  await page.locator("#one").evaluate(el => el.style.transform = "translateX(36px) scale(1.1)");
  await expect(page.locator("#one")).toHaveCSS("transform", "matrix(-1.1, 0, 0, 1.1, 36, 0)");
  await h.send(harness, page, "MIRROR_TOGGLE");
  await expect(page.locator("#one")).toHaveCSS("transform", "matrix(1.1, 0, 0, 1.1, 36, 0)");
});

test("cuộn trang đổi video đang chọn và giữ lựa chọn thủ công từng video", async () => {
  await h.send(harness, page, "MIRROR_TOGGLE");
  await page.locator("#two").scrollIntoViewIfNeeded();
  expect((await h.send(harness, page, "PLAYER_STATUS")).mirrored).toBe(false);
  await h.send(harness, page, "MIRROR_TOGGLE");
  await expect(page.locator("#two")).toHaveAttribute(h.marked, "");
  await page.locator("#one").scrollIntoViewIfNeeded();
  expect((await h.send(harness, page, "PLAYER_STATUS")).mirrored).toBe(true);
  await h.send(harness, page, "MIRROR_TOGGLE");
  await expect(page.locator("#one")).not.toHaveAttribute(h.marked);
  await expect(page.locator("#two")).toHaveAttribute(h.marked, "");
});

test("video bị tái sử dụng với nguồn khác sẽ mất lựa chọn thủ công cũ", async () => {
  await h.send(harness, page, "MIRROR_TOGGLE");
  await expect(page.locator("#one")).toHaveAttribute(h.marked, "");
  await page.locator("#one").evaluate(el => el.src = "/different-video.mp4");
  await expect(page.locator("#one")).not.toHaveAttribute(h.marked);
  await expect(page.locator("#one")).toHaveCSS("scale", "0.9 0.8");
});

test("chế độ tự lật xử lý video mới, ngoại lệ thủ công và settings giữa các tab", async () => {
  const other = await harness.context.newPage();
  await other.goto("https://www.tiktok.com/@demo/video/123456789");
  await h.writeSettings(harness, { autoMirror: true, showFloatingButton: true });
  await expect(page.locator("#one")).toHaveAttribute(h.marked, "");
  await expect(other.locator("#one")).toHaveAttribute(h.marked, "");
  await h.send(harness, page, "MIRROR_TOGGLE");
  await expect(page.locator("#one")).not.toHaveAttribute(h.marked);
  await page.evaluate(() => {
    const video = document.createElement("video");
    video.id = "dynamic";
    document.querySelector("main").append(video);
  });
  await expect(page.locator("#dynamic")).toHaveAttribute(h.marked, "");
  await expect(page.locator("#one")).not.toHaveAttribute(h.marked);
  await h.writeSettings(harness, { autoMirror: false, showFloatingButton: false });
  await expect(page.locator(`video[${h.marked}]`)).toHaveCount(0);
  await expect(other.locator(`video[${h.marked}]`)).toHaveCount(0);
  await expect(page.locator("#tiktok-tools-control")).toBeHidden();
  await h.send(harness, page, "MIRROR_TOGGLE");
  await expect(page.locator("#one")).toHaveAttribute(h.marked, "");
  await h.writeSettings(harness, { autoMirror: true, showFloatingButton: false });
  await page.reload();
  await expect(page.locator("#one")).toHaveAttribute(h.marked, "");
  await expect(page.locator("#tiktok-tools-control")).toBeHidden();
});

test("trạng thái không có video và video thay thế được xử lý không cần tải lại tab", async () => {
  await page.locator("main").evaluate(el => el.replaceChildren());
  expect((await h.send(harness, page, "PLAYER_STATUS")).available).toBe(false);
  await expect(page.locator("#tiktok-tools-control")).toBeHidden();
  await page.locator("main").evaluate(el => {
    const video = document.createElement("video");
    video.id = "replacement";
    el.append(video);
    history.pushState({}, "", "/@demo/video/456789123");
  });
  await expect(page.locator("#tiktok-tools-control")).toBeVisible();
  await h.send(harness, page, "MIRROR_TOGGLE");
  await expect(page.locator("#replacement")).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 0, 0)");
});

test("fullscreen container giữ nút điều khiển, fullscreen video gốc vẫn nhận thông điệp", async () => {
  await page.locator("main").evaluate(el => el.requestFullscreen());
  await expect(page.locator("main > #tiktok-tools-control")).toBeVisible();
  await page.locator("#tiktok-tools-control").click();
  await expect(page.locator("#one")).toHaveAttribute(h.marked, "");
  await page.evaluate(() => document.exitFullscreen());
  await page.locator("#one").evaluate(el => el.requestFullscreen());
  await expect(page.locator("#tiktok-tools-control")).toBeHidden();
  await h.send(harness, page, "MIRROR_TOGGLE");
  await expect(page.locator("#one")).not.toHaveAttribute(h.marked);
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator("#tiktok-tools-control")).toBeVisible();
});

test("trình phát canvas tăng cường cho phép lật qua popup và lật đúng lớp hiển thị", async () => {
  await h.useEnhancedPlayer(page);
  expect((await h.send(harness, page, "PLAYER_STATUS")).available).toBe(true);
  const wrapper = page.locator("#enhanced-player");
  const before = await wrapper.boundingBox();
  const canvasTransform = await wrapper.locator("canvas").evaluate(el => getComputedStyle(el).transform);
  const popup = await h.openPopup(harness, page);
  await expect(popup.locator("#mirror")).toBeEnabled();
  await popup.locator("#mirror").click();
  await expect(wrapper).toHaveAttribute(h.marked, "");
  await expect(wrapper).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 0, 0)");
  await expect(page.locator("#one")).toHaveAttribute(h.marked, "");
  const after = await wrapper.boundingBox();
  for (const key of ["x", "y", "width", "height"]) expect(after[key]).toBeCloseTo(before[key], 3);
  expect(await wrapper.locator("canvas").evaluate(el => getComputedStyle(el).transform)).toBe(canvasTransform);
  await expect(page.locator("#placeholder")).not.toHaveAttribute(h.marked);
  await expect(page.locator("#interface")).toHaveCSS("transform", "none");
  await popup.locator("#mirror").click();
  await expect(wrapper).toHaveCSS("transform", "none");
  await expect(page.locator("#one")).not.toHaveAttribute(h.marked);
});

test("renderer canvas thay thế kế thừa lựa chọn và được dọn khi nguồn đổi", async () => {
  await h.useEnhancedPlayer(page);
  await h.send(harness, page, "MIRROR_TOGGLE");
  const oldWrapper = await page.locator("#enhanced-player").elementHandle();
  await page.locator("#enhanced-player").evaluate(el => {
    const next = el.cloneNode(true);
    next.removeAttribute("data-tiktok-tools-mirrored");
    next.style.removeProperty("--tiktok-tools-transform");
    el.replaceWith(next);
  });
  await expect(page.locator("#enhanced-player")).toHaveAttribute(h.marked, "");
  expect(await oldWrapper.getAttribute(h.marked)).toBe(null);
  await page.locator("#enhanced-player").evaluate(el => el.style.display = "none");
  await page.locator("#one").evaluate(el => el.style.opacity = "1");
  expect((await h.send(harness, page, "PLAYER_STATUS")).mirrored).toBe(true);
  await expect(page.locator("#one")).toHaveCSS("transform", "matrix(-1, 0, 0, 1, 12, 0)");
  await page.locator("#one").evaluate(el => el.src = "/next-enhanced-video.mp4");
  await expect(page.locator("#enhanced-player")).not.toHaveAttribute(h.marked);
  await expect(page.locator("#one")).not.toHaveAttribute(h.marked);
  await oldWrapper.dispose();
});

test("video trong suốt với canvas ẩn chưa khả dụng cho tới khi renderer xuất hiện", async () => {
  await h.useEnhancedPlayer(page);
  await page.locator("#enhanced-player").evaluate(el => el.style.display = "none");
  expect((await h.send(harness, page, "PLAYER_STATUS")).available).toBe(false);
  await expect(page.locator("#tiktok-tools-control")).toBeHidden();
  await page.locator("#enhanced-player").evaluate(el => el.style.display = "block");
  await expect(page.locator("#tiktok-tools-control")).toBeVisible();
  await h.writeSettings(harness, { autoMirror: true, showFloatingButton: true });
  await expect(page.locator("#enhanced-player")).toHaveAttribute(h.marked, "");
});
