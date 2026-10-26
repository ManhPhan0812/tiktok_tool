const { test, expect } = require("@playwright/test");
const h = require("./fixtures/harness");

let harness;
let page;

test.beforeAll(async () => {
  harness = await h.launch();
});

test.beforeEach(async () => {
  await h.resetStorage(harness.worker);
  await h.resetDouyin(harness);
  page = await h.openTikTok(harness);
});

test.afterEach(async () => {
  await h.resetDouyin(harness);
  await h.closeExtraTabs(harness);
});

test.afterAll(async () => {
  await h.dispose(harness);
});

test("nhận bốn dạng link Douyin và từ chối host/path khác", async () => {
  const results = await harness.worker.evaluate(() => {
    const parse = TikTokTools.validation.parseDouyinUrl;
    return {
      video: parse("https://www.douyin.com/video/7699882284404591872"),
      modal: parse("https://www.douyin.com/jingxuan?modal_id=7699882284404591872"),
      share: parse("https://www.iesdouyin.com/share/video/7699882284404591872/"),
      short: parse("https://v.douyin.com/iAbCdEf/"),
      tiktok: parse("https://www.tiktok.com/@user/video/123456789"),
      profile: parse("https://www.douyin.com/user/MS4wLjABAAAA"),
      notUrl: parse("xin chào")
    };
  });
  expect(results.video).toMatchObject({ ok: true, videoId: "7699882284404591872" });
  expect(results.modal).toMatchObject({ ok: true, videoId: "7699882284404591872" });
  expect(results.share).toMatchObject({ ok: true, videoId: "7699882284404591872" });
  expect(results.short).toMatchObject({ ok: true, short: true, videoId: null });
  expect(results.tiktok).toMatchObject({ ok: false, code: "INVALID_HOST" });
  expect(results.profile).toMatchObject({ ok: false, code: "INVALID_PATH" });
  expect(results.notUrl).toMatchObject({ ok: false, code: "INVALID_URL" });
});

test("chưa cấu hình vẫn gọi Seekin mặc định với chữ ký mới, không gửi cookie/token cũ", async () => {
  await h.stubDouyin(harness, { endpoint: null, token: null });
  await harness.worker.evaluate(() => chrome.storage.local.set({ douyinToken: "old-proxy-token" }));
  const result = await harness.worker.evaluate(() => TikTokTools.douyinService.analyze({
    url: "https://www.douyin.com/video/7699882284404591872"
  }));
  expect(result.ok).toBe(true);
  expect(result.data.provider).toBe("Seekin");
  const [call] = await h.douyinCalls(harness);
  expect(call.url).toBe("https://download.seekin.ai/ikool/media/download");
  expect(call.credentials).toBe("omit");
  expect(call.headers.authorization).toBeUndefined();
  expect(call.headers.lang).toBe("vi");
  expect(call.headers.nonce).toMatch(/^[a-f0-9]{32}$/);
  expect(call.headers.sign).toMatch(/^[a-f0-9]{64}$/);
  const now = await harness.worker.evaluate(() => Date.now());
  expect(Math.abs(now - Number(call.headers.timestamp))).toBeLessThan(5000);
  const hasPermission = await harness.worker.evaluate(() => self.__originalContains({ origins: ["https://download.seekin.ai/*"] }));
  expect(hasPermission).toBe(true);
  await harness.worker.evaluate(() => TikTokTools.douyinService.clearCache());
  await harness.worker.evaluate(() => TikTokTools.douyinService.analyze({ url: "https://www.douyin.com/video/7699882284404591872" }));
  const calls = await h.douyinCalls(harness);
  expect(calls).toHaveLength(2);
  expect(calls[1].headers.nonce).not.toBe(call.headers.nonce);
  expect(calls[1].headers.sign).not.toBe(call.headers.sign);
});

test("chữ ký Seekin khớp cURL mẫu và thay đổi theo nội dung, không ký cho host khác", async () => {
  const result = await harness.worker.evaluate(async () => {
    const service = TikTokTools.seekinService;
    const options = { timestamp: 1792985182500, nonce: "fd2791f8da80f14068e1baf9e4ea8bc6", lang: "vi" };
    const body = JSON.stringify({ url: "https://www.douyin.com/jingxuan?modal_id=7699882284404591872" });
    const known = await service.headers(service.endpoint, body, options);
    const other = await service.headers(service.endpoint, JSON.stringify({ url: "https://www.douyin.com/video/7699882284404591872" }), options);
    let rejected = false;
    try { await service.headers("https://proxy.test/ikool/media/download", body, options); } catch { rejected = true; }
    return { known, other, rejected };
  });
  expect(result.known.sign).toBe("a18a96edd701cd9d49a7c0bfbfc81428e20ac8c607bfc0bc596c23bdf9602b18");
  expect(result.other.sign).not.toBe(result.known.sign);
  expect(result.rejected).toBe(true);
});

test("Seekin trả 5016 thì popup hiện lỗi dịch vụ, không còn yêu cầu cấu hình endpoint", async () => {
  await h.stubDouyin(harness, { endpoint: null, token: null, payload: { code: "5016", msg: "Download failed", data: null } });
  const popup = await h.openPopup(harness, page);
  await popup.locator("#url").fill("https://www.douyin.com/jingxuan?modal_id=7699882284404591872");
  await popup.locator("#analyze").click();
  await expect(popup.locator("#error")).toContainText("Seekin báo lỗi 5016");
  await expect(popup.locator("#error")).not.toContainText("douyinEndpoint");
  await expect(popup.locator("#download-result")).toBeHidden();
  await expect(popup.locator("#analyze")).toBeEnabled();
});

test("cache chỉ dùng cho đúng cấu hình và phân tích lại trước khi tải link hết TTL", async () => {
  await h.stubDouyin(harness, { endpoint: null, token: null });
  const first = await harness.worker.evaluate(() => TikTokTools.douyinService.analyze({ url: "https://www.douyin.com/video/7699882284404591872" }));
  expect(first.ok).toBe(true);
  await harness.worker.evaluate(() => chrome.storage.local.set({ douyinEndpoint: "https://proxy.test/ikool/media/download", douyinToken: "test-token" }));
  const second = await harness.worker.evaluate(() => TikTokTools.douyinService.analyze({ url: "https://www.douyin.com/video/7699882284404591872" }));
  expect(second.ok).toBe(true);
  expect(await h.douyinCalls(harness)).toHaveLength(2);
  await h.stubDownloads(harness);
  const downloaded = await harness.worker.evaluate(async () => {
    const originalNow = Date.now;
    const future = originalNow() + 61000;
    Date.now = () => future;
    try { return await TikTokTools.douyinService.download({ url: "https://www.douyin.com/video/7699882284404591872", variant: "q720" }); }
    finally { Date.now = originalNow; }
  });
  expect(downloaded.ok).toBe(true);
  expect(await h.douyinCalls(harness)).toHaveLength(3);
});

test("phân tích qua máy chủ: giữ đúng bản khoá/khả dụng và gửi đúng thân yêu cầu", async () => {
  await h.stubDouyin(harness);
  const result = await harness.worker.evaluate(() => TikTokTools.douyinService.analyze({
    url: "https://www.douyin.com/jingxuan?modal_id=7699882284404591872"
  }));
  expect(result.ok).toBe(true);
  expect(result.data.videoId).toBe("7699882284404591872");
  expect(result.data.availableCount).toBe(2);
  expect(result.data.defaultVariant).toBe("q720");
  expect(result.data.rows.map(row => [row.label, row.available, row.sizeBytes])).toEqual([
    ["1080p", false, 13943633],
    ["720p", true, 10567934],
    ["540p", true, 10642817]
  ]);
  const locked = result.data.rows[0];
  expect(locked.url).toBeNull();
  expect(locked.note).toContain("khoá");

  const calls = await h.douyinCalls(harness);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://proxy.test/ikool/media/download");
  expect(calls[0].method).toBe("POST");
  expect(JSON.parse(calls[0].body)).toEqual({ url: "https://www.douyin.com/video/7699882284404591872" });
  expect(calls[0].headers.authorization).toBe("test-token");
  expect(calls[0].headers.sign).toBeUndefined();
});

test("chưa cấp quyền cho endpoint thì báo PERMISSION_REQUIRED kèm origin, không gọi mạng", async () => {
  await h.stubDouyin(harness);
  await harness.worker.evaluate(() => {
    chrome.permissions.contains = async () => false;
    TikTokTools.douyinService.clearCache();
  });
  const result = await harness.worker.evaluate(() => TikTokTools.douyinService.analyze({
    url: "https://www.douyin.com/video/7699882284404591872"
  }));
  expect(result.ok).toBe(false);
  expect(result.error.code).toBe("PERMISSION_REQUIRED");
  expect(result.error.origin).toBe("https://proxy.test");
  expect(await h.douyinCalls(harness)).toHaveLength(0);
});

test("máy chủ báo lỗi hoặc chỉ trả bản khoá thì không hiện lựa chọn giả", async () => {
  await h.stubDouyin(harness, { payload: { code: "1001", msg: "余额不足" } });
  const upstream = await harness.worker.evaluate(() => TikTokTools.douyinService.analyze({
    url: "https://www.douyin.com/video/7699882284404591872"
  }));
  expect(upstream.ok).toBe(false);
  expect(upstream.error.code).toBe("UPSTREAM");
  expect(upstream.error.message).toContain("1001");

  await h.stubDouyin(harness, {
    payload: {
      code: "0000",
      data: { title: "x", medias: [{ url: null, quality: "1080p", locked: true, fileSize: 1 }] }
    }
  });
  const lockedOnly = await harness.worker.evaluate(() => TikTokTools.douyinService.analyze({
    url: "https://www.douyin.com/video/7699882284404591872"
  }));
  expect(lockedOnly.ok).toBe(false);
  expect(lockedOnly.error.code).toBe("NO_SOURCE");
});

test("popup hiện đúng hàng Douyin: 1080p khoá, 720p/540p tải được", async () => {
  await h.stubDouyin(harness);
  const popup = await h.openPopup(harness, page);
  await popup.locator("#url").fill("https://www.douyin.com/video/7699882284404591872");
  await popup.locator("#analyze").click();

  await expect(popup.locator("#download-meta")).toContainText("Douyin");
  await expect(popup.locator("#download-meta")).toContainText("2 bản tải được");
  const locked = popup.locator('#download-rows button[data-variant="q1080"]');
  await expect(locked).toBeDisabled();
  await expect(locked).toContainText("1080p (khoá)");
  await expect(locked).toContainText("khoá");
  await expect(popup.locator('#download-rows button[data-variant="q720"]')).toBeEnabled();
  await expect(popup.locator('#download-rows button[data-variant="q720"]')).toContainText("10.08 MB");
  await expect(popup.locator('#download-rows button[data-variant="q720"]')).toHaveClass(/primary/);
  await expect(popup.locator('#download-rows button[data-variant="q540"]')).toBeEnabled();
});

test("bấm tải Douyin gọi chrome.downloads với link CDN và tên tệp đúng", async () => {
  await h.stubDouyin(harness);
  await h.stubDownloads(harness);
  const popup = await h.openPopup(harness, page);
  await popup.locator("#url").fill("https://www.douyin.com/video/7699882284404591872");
  await popup.locator("#analyze").click();
  await popup.locator('#download-rows button[data-variant="q720"]').click();

  await expect.poll(async () => (await h.lastDownload(harness))?.filename || null)
    .toBe("Douyin/7699882284404591872_720p.mp4");
  const download = await h.lastDownload(harness);
  expect(download.url).toBe("https://v26-kefu.douyinvod.test/video/720.mp4");
  expect(download.saveAs).toBe(false);
  expect(download.conflictAction).toBe("uniquify");
});

test("link Douyin sai vẫn báo lỗi rõ trong popup thay vì im lặng", async () => {
  const popup = await h.openPopup(harness, page);
  await popup.locator("#url").fill("https://www.douyin.com/user/MS4wLjABAAAA");
  await popup.locator("#analyze").click();
  await expect(popup.locator("#error")).toContainText("không phải link video Douyin");
  await expect(popup.locator("#download-result")).toBeHidden();
});
