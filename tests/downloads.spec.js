const { test, expect } = require("@playwright/test");
const h = require("./fixtures/harness");

const CURRENT = "https://www.tiktok.com/@demo/video/7699174948165651743";
const WITH_LOGO = "https://www.tiktok.com/@demo2/video/8000000000000000001";
const VIDEO_ID = "7699174948165651743";

const call = (popup, type, payload = {}) => popup.evaluate(({ type, payload }) => chrome.runtime.sendMessage({
  type,
  payload,
  requestId: `test-${type}`
}), { type, payload });

let harness;
let page;
let popup;

test.beforeAll(async () => {
  harness = await h.launch();
});

test.beforeEach(async () => {
  await h.resetStorage(harness.worker);
  // Không để bài kiểm thử gọi tikwm.com thật.
  await h.stubProxy(harness);
  page = await h.openTikTok(harness, "/@demo/video/7699174948165651743");
  popup = await h.openPopup(harness, page);
});

test.afterEach(async () => {
  await h.cancelJobs(harness);
  await h.closeExtraTabs(harness);
});

test.afterAll(async () => {
  await h.dispose(harness);
});

test("phân tích lấy bốn định dạng từ tikwm.com đúng như API trả về", async () => {
  const resolved = await call(popup, "DOWNLOAD_RESOLVE", { url: CURRENT });
  expect(resolved.ok, resolved.error?.message).toBe(true);
  const data = resolved.data;
  expect(data.videoId).toBe(VIDEO_ID);
  expect(data.author).toBe("demo");
  expect(data.source).toBe("tikwm");
  expect(data.availableCount).toBe(4);
  expect(data.defaultVariant).toBe("hd");
  expect(data.canonicalUrl).toBe(CURRENT);

  // hdplay → HD, play → bản chuẩn, wmplay → có logo, music → mp3. Cả bốn đều qua dịch vụ ngoài.
  expect(data.rows.hd).toMatchObject({ available: true, via: "proxy", watermark: false, sizeBytes: 2000, label: "HD" });
  expect(data.rows.hd.note).toContain("HEVC");
  expect(data.rows.noLogo).toMatchObject({ available: true, via: "proxy", watermark: false, sizeBytes: 1000, label: "Chuẩn" });
  expect(data.rows.noLogo.note).toContain("H.264");
  expect(data.rows.logo).toMatchObject({ available: true, via: "proxy", watermark: true, sizeBytes: 1500 });
  expect(data.rows.mp3).toMatchObject({ available: true, via: "proxy", ext: "mp3" });
  expect(data.rows.mp3.note).toContain("không phải bản trích từ video");
});

test("API báo wm_size = 0 thì hàng logo bị khoá, không gắn nhãn có logo cho tệp không logo", async () => {
  await h.stubProxy(harness, { data: { ...h.PROXY_PAYLOAD, wm_size: 0 } });
  const resolved = await call(popup, "DOWNLOAD_RESOLVE", { url: CURRENT });
  expect(resolved.ok, resolved.error?.message).toBe(true);
  const data = resolved.data;
  expect(data.rows.logo.available).toBe(false);
  expect(data.rows.logo.reason).toContain("không có bản có logo");
  expect(data.availableCount).toBe(3);
});

test("hdplay trùng play thì hàng HD bị khoá thay vì tải hai lần một tệp", async () => {
  await h.stubProxy(harness, { data: { ...h.PROXY_PAYLOAD, hdplay: h.PROXY_PAYLOAD.play } });
  const resolved = await call(popup, "DOWNLOAD_RESOLVE", { url: CURRENT });
  expect(resolved.ok, resolved.error?.message).toBe(true);
  expect(resolved.data.rows.hd.available).toBe(false);
  expect(resolved.data.rows.hd.reason).toContain("trùng");
  expect(resolved.data.defaultVariant).toBe("noLogo");
});

test("tikwm.com lỗi thì quay về dữ liệu trang: tải trực tiếp được, logo và MP3 khoá kèm lý do", async () => {
  await h.stubProxy(harness, { error: "rate limited" });
  const resolved = await call(popup, "DOWNLOAD_RESOLVE", { url: CURRENT });
  expect(resolved.ok, resolved.error?.message).toBe(true);
  const data = resolved.data;
  expect(data.source).toBe("page");
  expect(data.sourceError).toContain("rate limited");
  expect(data.rows.hd).toMatchObject({ available: true, via: "direct", width: 720, height: 960 });
  expect(data.rows.noLogo).toMatchObject({ available: true, url: "https://cdn.example.com/v/540.mp4", via: "direct" });
  expect(data.rows.logo.available).toBe(false);
  expect(data.rows.logo.reason).toContain("rate limited");
  expect(data.rows.mp3.available).toBe(false);

  await h.stubDownloads(harness);
  const started = await call(popup, "DOWNLOAD_START", { videoId: VIDEO_ID, variant: "mp3" });
  expect(started.ok).toBe(false);
  expect(started.error.code).toBe("NO_SOURCE");
  expect(await h.lastDownload(harness)).toBe(null);
});

test("video có downloadAddr riêng thì dùng bản logo trực tiếp khi không gọi được dịch vụ ngoài", async () => {
  await h.stubProxy(harness, { error: "offline" });
  const other = await harness.context.newPage();
  await other.goto(WITH_LOGO);
  await expect(other.locator("#tiktok-tools-control")).toBeVisible();

  const resolved = await call(popup, "DOWNLOAD_RESOLVE", { url: WITH_LOGO });
  expect(resolved.ok, resolved.error?.message).toBe(true);
  const data = resolved.data;
  expect(data.source).toBe("page");
  expect(data.rows.logo).toMatchObject({ available: true, url: "https://cdn.example.com/logo.mp4", watermark: true, via: "direct" });
  expect(data.defaultVariant).toBe("noLogo");
  expect(data.rows.hd.available).toBe(false);
});

test("URL sai hoặc không phải link video bị từ chối kèm hướng dẫn", async () => {
  const host = await call(popup, "DOWNLOAD_RESOLVE", { url: "https://example.com/@a/video/123456789" });
  expect(host.ok).toBe(false);
  expect(host.error.code).toBe("INVALID_HOST");
  expect(host.error.message).toContain("tiktok.com");

  const path = await call(popup, "DOWNLOAD_RESOLVE", { url: "https://www.tiktok.com/@demo" });
  expect(path.ok).toBe(false);
  expect(path.error.code).toBe("INVALID_PATH");
  expect(path.error.message).toContain("/video/");
});

test("tải mặc định là bản HD không logo, tên tệp an toàn", async () => {
  await h.stubDownloads(harness);
  await call(popup, "DOWNLOAD_RESOLVE", { url: CURRENT });
  const started = await call(popup, "DOWNLOAD_START", { videoId: VIDEO_ID });
  expect(started.ok, started.error?.message).toBe(true);
  expect(started.data.variant).toBe("hd");
  expect(started.data.via).toBe("proxy");
  expect(started.data.filename).toBe(`TikTok/demo_${VIDEO_ID}_hd.mp4`);
  const options = await h.lastDownload(harness);
  expect(options.url).toBe(h.PROXY_PAYLOAD.hdplay);
  expect(options.filename).toBe(`TikTok/demo_${VIDEO_ID}_hd.mp4`);
  expect(options.conflictAction).toBe("uniquify");
});

test("đủ bốn định dạng tải đúng link API, chống tải trùng và chỉ gọi dịch vụ một lần", async () => {
  await h.stubDownloads(harness);
  await call(popup, "DOWNLOAD_RESOLVE", { url: CURRENT });

  const hd = await call(popup, "DOWNLOAD_START", { videoId: VIDEO_ID, variant: "hd" });
  expect(hd.ok, hd.error?.message).toBe(true);
  expect((await h.lastDownload(harness)).url).toBe(h.PROXY_PAYLOAD.hdplay);

  const duplicate = await call(popup, "DOWNLOAD_START", { videoId: VIDEO_ID, variant: "hd" });
  expect(duplicate.ok).toBe(false);
  expect(duplicate.error.code).toBe("DUPLICATE");

  const standard = await call(popup, "DOWNLOAD_START", { videoId: VIDEO_ID, variant: "noLogo" });
  expect(standard.ok, standard.error?.message).toBe(true);
  const standardOptions = await h.lastDownload(harness);
  expect(standardOptions.url).toBe(h.PROXY_PAYLOAD.play);
  expect(standardOptions.filename).toBe(`TikTok/demo_${VIDEO_ID}_khong-logo.mp4`);

  const logo = await call(popup, "DOWNLOAD_START", { videoId: VIDEO_ID, variant: "logo" });
  expect(logo.ok, logo.error?.message).toBe(true);
  expect((await h.lastDownload(harness)).url).toBe(h.PROXY_PAYLOAD.wmplay);

  const mp3 = await call(popup, "DOWNLOAD_START", { videoId: VIDEO_ID, variant: "mp3" });
  expect(mp3.ok, mp3.error?.message).toBe(true);
  const mp3Options = await h.lastDownload(harness);
  expect(mp3Options.url).toBe(h.PROXY_PAYLOAD.music);
  expect(mp3Options.filename).toBe(`TikTok/demo_${VIDEO_ID}_mp3.mp3`);

  // Phân tích gọi dịch vụ một lần; bốn lần tải dùng lại cache nên không gọi thêm.
  const calls = await h.proxyCalls(harness);
  expect(calls.length).toBe(1);
  expect(calls[0].url).toContain("tikwm.com");
  expect(calls[0].body).toContain(VIDEO_ID);
  expect(calls[0].body).toContain("hd=1");
});

test("dịch vụ ngoài hỏng đúng lúc bấm tải thì báo lỗi rõ và không tạo lệnh tải rỗng", async () => {
  await call(popup, "DOWNLOAD_RESOLVE", { url: CURRENT });
  await h.stubProxy(harness, { error: "connection reset", keepRows: true });
  await h.stubDownloads(harness);
  const started = await call(popup, "DOWNLOAD_START", { videoId: VIDEO_ID, variant: "logo" });
  expect(started.ok).toBe(false);
  expect(started.error.code).toBe("PROXY_FAILED");
  expect(started.error.message).toContain("tikwm.com");
  expect(await h.lastDownload(harness)).toBe(null);
});

test("popup hiển thị bốn hàng và ghi rõ mọi hàng đi qua tikwm.com", async () => {
  await h.stubDownloads(harness);
  await expect(popup.locator("#download-note")).toBeVisible();
  await popup.locator("#analyze").click();
  await expect(popup.locator("#download-meta")).toContainText("4 lựa chọn khả dụng");

  const rows = popup.locator("#download-rows .row-download");
  await expect(rows).toHaveCount(4);
  await expect(popup.locator('[data-variant="hd"]')).toHaveClass(/primary/);
  for (const variant of ["hd", "noLogo", "logo", "mp3"]) {
    await expect(popup.locator(`[data-variant="${variant}"]`)).toBeEnabled();
    await expect(popup.locator(`[data-variant="${variant}"]`)).toContainText("qua tikwm.com");
  }
  await expect(popup.locator("#download-note")).toBeHidden();

  // Chưa bấm tải thì chưa có lệnh tải nào được gửi.
  expect(await h.lastDownload(harness)).toBe(null);

  await popup.locator('[data-variant="noLogo"]').click();
  await expect(popup.locator("#download-progress")).toBeVisible();
  expect((await h.lastDownload(harness)).filename).toContain("khong-logo");
});
