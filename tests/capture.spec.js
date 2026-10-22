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
  page = await h.openTikTok(harness);
});

test.afterEach(async () => {
  await h.closeExtraTabs(harness);
});

test.afterAll(async () => {
  await h.dispose(harness);
});

test("chụp khung hình lưu PNG đúng kích thước và đúng chiều lật", async () => {
  await h.useCanvasVideo(page, "#one", { width: 320, height: 240 });
  await h.send(harness, page, "MIRROR_TOGGLE");
  const popup = await h.openPopup(harness, page);
  await expect(popup.locator("#capture")).toBeEnabled();

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    popup.locator("#capture").click()
  ]);
  await expect(popup.locator("#notice")).toContainText("Đã lưu");
  const name = download.suggestedFilename();
  expect(name).toMatch(/^tiktok_.+_khung-hinh\.png$/);

  const saved = await h.waitForDownload(harness, name);
  const bytes = await fs.readFile(saved.path);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.readUInt32BE(16)).toBe(320);
  expect(bytes.readUInt32BE(20)).toBe(240);

  // Giải mã ảnh để kiểm tra pixel, không chỉ kiểm tra sự tồn tại của tệp.
  const sample = await popup.evaluate(async b64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${b64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const middle = Math.floor(image.height / 2);
    return {
      left: [...context.getImageData(4, middle, 1, 1).data],
      right: [...context.getImageData(image.width - 5, middle, 1, 1).data]
    };
  }, bytes.toString("base64"));

  // Video gốc: nửa trái đỏ, nửa phải xanh. Sau khi lật, nửa trái phải là xanh.
  expect(sample.left[2]).toBeGreaterThan(180);
  expect(sample.left[0]).toBeLessThan(80);
  expect(sample.right[0]).toBeGreaterThan(180);
  expect(sample.right[2]).toBeLessThan(80);
});

test("khi chưa có khung hình, popup báo lỗi và đề nghị chụp vùng hiển thị", async () => {
  const popup = await h.openPopup(harness, page);
  await expect(popup.locator("#capture")).toBeEnabled();
  await popup.locator("#capture").click();
  await expect(popup.locator("#error")).toBeVisible();
  await expect(popup.locator("#error")).toContainText("khung hình");
  await expect(popup.locator("#capture-region")).toBeVisible();
});

test("chụp vùng hiển thị cần quyền activeTab và báo lỗi rõ ràng khi thiếu", async () => {
  await h.useCanvasVideo(page, "#one", { width: 320, height: 240 });
  // Kiểm thử mở popup bằng URL nên không có quyền activeTab như khi bấm icon.
  // Điều cần khẳng định: không im lặng thành công, mà báo đúng lỗi.
  const response = await h.sendRaw(harness, page, "CAPTURE_FRAME", { mode: "region" });
  expect(response.ok).toBe(false);
  expect(response.error.code).toBe("CAPTURE_FAILED");
  expect(response.error.message).toContain("vùng đang hiển thị");
});
