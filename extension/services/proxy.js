(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  const ENDPOINT = "https://tikwm.com/api/";
  const TIMEOUT = 20_000;
  const TTL = 5 * 60_000;
  // API miễn phí của tikwm giới hạn 1 request/giây và trả lỗi khi vượt.
  const MIN_GAP = 1_200;
  const ATTEMPTS = 3;
  const cache = new Map();
  const pending = new Map();

  let chain = Promise.resolve();
  let lastCallAt = 0;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function pick(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value.trim(), ENDPOINT);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  // Xếp hàng các lần gọi để không vượt giới hạn 1 request/giây.
  function queued(task) {
    const result = chain.then(async () => {
      const wait = MIN_GAP - (Date.now() - lastCallAt);
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();
      return task();
    });
    chain = result.then(() => {}, () => {});
    return result;
  }

  function isRateLimit(message) {
    return /limit|too many|429|rate/i.test(String(message || ""));
  }

  async function request(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ url, hd: "1" }),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit"
      });
      if (!response.ok) {
        throw new Error(`TikWM trả HTTP ${response.status}${response.status === 429 ? " (quá nhiều yêu cầu, hãy thử lại sau)" : ""}.`);
      }
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`tikwm trả nội dung không phải JSON (HTTP ${response.status}).`);
      }
      if ((json?.code !== 0 && json?.code !== "0") || !json?.data || typeof json.data !== "object") {
        throw new Error(typeof json?.msg === "string" ? json.msg : `TikWM không trả dữ liệu video (HTTP ${response.status}).`);
      }
      const data = json.data;
      const info = {
        videoId: String(data.id || ""),
        title: data.title || "",
        author: data.author?.unique_id || "",
        nickname: data.author?.nickname || "",
        duration: Number(data.duration) || 0,
        play: pick(data.play),
        hdplay: pick(data.hdplay),
        wmplay: pick(data.wmplay),
        music: pick(data.music) || pick(data.music_info?.play),
        size: Number(data.size) || 0,
        hdSize: Number(data.hd_size) || 0,
        // wm_size = 0 nghĩa là video không có bản có logo: wmplay trả lại đúng tệp không logo.
        wmSize: Number(data.wm_size) || 0,
        fetchedAt: Date.now()
      };
      if (!info.play && !info.hdplay) throw new Error("tikwm không trả link phát.");
      return info;
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError" || error?.name === "TimeoutError") {
        throw new Error("TikWM chưa phản hồi sau 20 giây. Hãy thử phân tích lại.");
      }
      if (error instanceof TypeError) {
        throw new Error("Không kết nối được TikWM. Kiểm tra mạng và quyền truy cập tikwm.com của extension trong chrome://extensions.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // Lấy link qua dịch vụ ngoài. Được gọi khi Phân tích và khi cần đổi tuyến tải;
  // kết quả cache 5 phút nên bấm tải ngay sau khi phân tích không tốn thêm request.
  async function resolveRequest(url, videoId) {
    const key = String(videoId || "");
    const hit = key ? cache.get(key) : null;
    if (hit && Date.now() - hit.fetchedAt < TTL) return { ok: true, data: { ...hit, cached: true } };

    let lastError = null;
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      try {
        const info = await queued(() => request(url));
        if (key && info.videoId && key !== info.videoId) {
          throw new Error("TikWM trả dữ liệu của video khác. Hãy phân tích lại link.");
        }
        if (key || info.videoId) cache.set(key || info.videoId, info);
        return { ok: true, data: { ...info, cached: false } };
      } catch (error) {
        lastError = error;
        if (!isRateLimit(error?.message) || attempt === ATTEMPTS - 1) break;
        await sleep(MIN_GAP);
      }
    }
    return {
      ok: false,
      error: {
        code: "PROXY_FAILED",
        message: `Dịch vụ tikwm.com không trả được link: ${lastError?.message || lastError}.`
      }
    };
  }

  function resolve(url, videoId) {
    const key = String(videoId || url);
    if (pending.has(key)) return pending.get(key);
    const task = resolveRequest(url, videoId).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }

  function urlFor(info, variant) {
    if (!info) return null;
    switch (variant) {
      case "hd": return info.hdplay || info.play;
      case "noLogo": return info.play || info.hdplay;
      case "logo": return info.wmplay;
      case "mp3": return info.music;
      default: return info.play;
    }
  }

  ns.proxyService = Object.freeze({
    resolve,
    urlFor,
    ENDPOINT,
    clearCache() {
      cache.clear();
    }
  });
})();
