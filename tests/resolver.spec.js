const { test, expect } = require("@playwright/test");
const h = require("./fixtures/harness");

const ID = h.PROXY_PAYLOAD.id;
const URL = `https://www.tiktok.com/@demo/video/${ID}`;
const OTHER_ID = "8000000000000000001";
const OTHER_URL = `https://www.tiktok.com/@demo2/video/${OTHER_ID}`;
let harness;
let page;
let popup;

const call = (popup, type, payload) => popup.evaluate(({ type, payload }) => chrome.runtime.sendMessage({
  type, payload, requestId: "resolver-regression"
}), { type, payload });

test.beforeAll(async () => { harness = await h.launch(); });
test.beforeEach(async () => {
  await h.resetStorage(harness.worker);
  await h.stubProxy(harness);
  page = await h.openTikTok(harness, `/@demo/video/${ID}`);
  popup = await h.openPopup(harness, page);
});
test.afterEach(async () => {
  await h.cancelJobs(harness);
  await h.closeExtraTabs(harness);
});
test.afterAll(async () => { await h.dispose(harness); });

test("link /video/ID mà player tự điền và link mobile/embed đều phân tích được", async () => {
  for (const url of [
    `https://www.tiktok.com/video/${ID}?is_from_webapp=1`,
    `https://m.tiktok.com/v/${ID}.html`,
    `https://www.tiktok.com/player/v1/${ID}`,
    `https://www.tiktok.com/embed/v2/${ID}`,
    ID
  ]) {
    const result = await call(popup, "DOWNLOAD_RESOLVE", { url });
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.data.videoId).toBe(ID);
    expect(result.data.source).toBe("tikwm");
    expect(result.data.canonicalUrl).toBe(URL);
  }
});

test("nhận link /t/, link trong văn bản chia sẻ và Markdown nhưng chặn host giả", async () => {
  for (const url of [
    "https://www.tiktok.com/t/ZSExample/",
    `Xem video này: ${URL} nhé!`,
    `[${URL}](${URL})`
  ]) {
    const result = await call(popup, "DOWNLOAD_RESOLVE", { url });
    expect(result.ok, result.error?.message).toBe(true);
    expect(result.data.videoId).toBe(ID);
  }
  for (const url of [
    `https://tiktok.com.evil.test/video/${ID}`,
    `https://user:password@www.tiktok.com/video/${ID}`,
    `https://www.tiktok.com:444/video/${ID}`,
    `http://www.tiktok.com/video/${ID}`,
    `${URL} ${OTHER_URL}`
  ]) {
    expect((await call(popup, "DOWNLOAD_RESOLVE", { url })).ok).toBe(false);
  }
});

test("API trả đường dẫn tương đối, mã thành công dạng chuỗi và music_info vẫn dùng được", async () => {
  const result = await harness.worker.evaluate(async ({ url, id, data }) => {
    TikTokTools.proxyService.clearCache();
    self.fetch = async () => new Response(JSON.stringify({ code: "0", data: {
      ...data, play: "/video/media/play/test.mp4", hdplay: null, music: null,
      music_info: { play: "https://tikwm.com/video/music/test.mp3" }
    }}));
    return TikTokTools.proxyService.resolve(url, id);
  }, { url: URL, id: ID, data: h.PROXY_PAYLOAD });
  expect(result.ok, result.error?.message).toBe(true);
  expect(result.data.play).toBe("https://tikwm.com/video/media/play/test.mp4");
  expect(result.data.music).toBe("https://tikwm.com/video/music/test.mp3");
});

test("HTTP 429 không phải JSON được thử lại và POST chỉ gửi url, hd=1", async () => {
  const result = await harness.worker.evaluate(async ({ url, id, data }) => {
    TikTokTools.proxyService.clearCache();
    const calls = [];
    self.fetch = async (_url, init) => {
      calls.push({ method: init.method, body: String(init.body), headers: init.headers, credentials: init.credentials });
      return calls.length === 1
        ? new Response("Too many requests", { status: 429 })
        : new Response(JSON.stringify({ code: 0, data }));
    };
    return { response: await TikTokTools.proxyService.resolve(url, id), calls };
  }, { url: URL, id: ID, data: h.PROXY_PAYLOAD });
  expect(result.response.ok).toBe(true);
  expect(result.calls).toHaveLength(2);
  const sent = result.calls[0];
  expect(sent.method).toBe("POST");
  expect(new URLSearchParams(sent.body).get("url")).toBe(URL);
  expect(new URLSearchParams(sent.body).get("hd")).toBe("1");
  expect(sent.headers).not.toHaveProperty("origin");
  expect(sent.headers).not.toHaveProperty("referer");
  expect(sent.credentials).toBe("omit");
});

test("nhiều yêu cầu cùng video đang chờ chỉ gọi TikWM một lần", async () => {
  const result = await harness.worker.evaluate(async ({ url, id }) => Promise.all([
    TikTokTools.proxyService.resolve(url, id),
    TikTokTools.proxyService.resolve(url, id),
    TikTokTools.proxyService.resolve(url, id)
  ]), { url: URL, id: ID });
  expect(result.every(entry => entry.ok)).toBe(true);
  expect(await h.proxyCalls(harness)).toHaveLength(1);
});

test("lỗi kết nối có hướng dẫn mạng/quyền thay vì kết luận video riêng tư", async () => {
  const result = await harness.worker.evaluate(async ({ url, id }) => {
    self.fetch = async () => { throw new TypeError("Failed to fetch"); };
    return TikTokTools.proxyService.resolve(url, id);
  }, { url: URL, id: ID });
  expect(result.ok).toBe(false);
  expect(result.error.message).toContain("quyền truy cập tikwm.com");
  expect(result.error.message).not.toContain("riêng tư");
});

test("lỗi phân tích không bị polling trạng thái video xóa sau 0,9 giây", async () => {
  await popup.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    self.__playerPolls = 0;
    chrome.runtime.sendMessage = (...args) => {
      if (args[0]?.type === "PLAYER_STATUS") self.__playerPolls++;
      if (args[0]?.type === "DOWNLOAD_RESOLVE") {
        return Promise.resolve({ ok: false, error: { code: "NO_SOURCE", message: "API đang bảo trì" } });
      }
      return send(...args);
    };
  });
  await popup.locator("#url").fill("https://www.tiktok.com/@missing/video/7000000000000000000");
  await popup.locator("#analyze").click();
  await expect(popup.locator("#error")).toContainText("API đang bảo trì");
  const count = await popup.evaluate(() => self.__playerPolls);
  await expect.poll(() => popup.evaluate(() => self.__playerPolls)).toBeGreaterThan(count + 1);
  await expect(popup.locator("#error")).toBeVisible();
  await expect(popup.locator("#error")).toContainText("API đang bảo trì");
  await expect(popup.locator("#analyze")).toBeEnabled();
  await expect(popup.locator("#download-note")).toContainText("thử lại");
});

test("link người dùng có username chứa dấu chấm phân tích qua API đúng video", async () => {
  const id = "7697075597226315026";
  const author = "967.432.813.hieutpbank";
  await h.stubProxy(harness, { data: { ...h.PROXY_PAYLOAD, id, author: { unique_id: author } } });
  const result = await call(popup, "DOWNLOAD_RESOLVE", { url: `https://www.tiktok.com/@${author}/video/${id}` });
  expect(result.ok, result.error?.message).toBe(true);
  expect(result.data.videoId).toBe(id);
  expect(result.data.source).toBe("tikwm");
  expect(result.data.defaultVariant).toBe("hd");
});

test("đổi URL khi đang phân tích không hiển thị kết quả đến muộn của URL cũ", async () => {
  await harness.worker.evaluate(() => {
    self.__pendingResolves = [];
    self.fetch = (_url, init) => new Promise(resolve => self.__pendingResolves.push({ body: String(init.body), resolve }));
  });
  await popup.locator("#url").fill(URL);
  await popup.locator("#analyze").click();
  await expect(popup.locator("#analyze")).toHaveText("Đang phân tích…");
  await expect.poll(() => harness.worker.evaluate(() => self.__pendingResolves.length)).toBe(1);
  await popup.locator("#url").fill(OTHER_URL);
  await popup.locator("#analyze").click();
  await harness.worker.evaluate(data => self.__pendingResolves[0].resolve(new Response(JSON.stringify({ code: 0, data }))), h.PROXY_PAYLOAD);
  await expect.poll(() => harness.worker.evaluate(() => self.__pendingResolves.length)).toBe(2);
  await expect(popup.locator("#download-result")).toBeHidden();
  await harness.worker.evaluate(data => self.__pendingResolves[1].resolve(new Response(JSON.stringify({ code: 0, data }))), {
    ...h.PROXY_PAYLOAD, id: OTHER_ID, author: { unique_id: "demo2" }
  });
  await expect(popup.locator("#download-meta")).toContainText(OTHER_ID);
  await expect(popup.locator("#download-meta")).not.toContainText(ID);
  await expect(popup.locator("#analyze")).toHaveText("Phân tích");
});
