// Chạy trong MAIN world của trang Douyin (được content script chèn bằng thẻ
// <script>, không phải isolated world), nên thấy được chính request mà trang
// tự gọi kèm cookie và chữ ký a_bogus của nó. Chỉ nghe các endpoint dữ liệu
// video của Douyin, không chạm vào request khác và không sửa response: dùng
// response.clone() để đọc, response gốc vẫn trả về cho trang nguyên vẹn.
// Kết quả gửi về content script bằng window.postMessage, content script mới
// là nơi quyết định tải gì.
(() => {
  "use strict";
  const SOURCE = "tiktok-tools-douyin-capture";

  function toNoWatermark(value) {
    if (typeof value !== "string") return null;
    const url = value.trim();
    if (!/^https:\/\//i.test(url)) return null;
    return url.replace("/playwm/", "/play/");
  }

  function isPageUrl(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return /(^|\.)(douyin|iesdouyin|tiktok)\.com$/.test(host);
    } catch {
      return true;
    }
  }

  function pickUrl(list) {
    if (!Array.isArray(list)) return null;
    for (const raw of list) {
      const url = toNoWatermark(raw);
      if (url && !isPageUrl(url)) return url;
    }
    return null;
  }

  // Dạng aweme của Douyin: video.play_addr.url_list, có thể kèm bit_rate.
  function videoFromAweme(aweme) {
    const item = aweme?.aweme_detail || aweme;
    const video = item?.video;
    if (!video || typeof video !== "object") return null;
    const medias = [];
    const seen = new Set();
    const push = (url, quality) => {
      if (url && !seen.has(url)) {
        seen.add(url);
        medias.push({ url, quality: String(quality || "").trim() || "Gốc" });
      }
    };
    if (Array.isArray(video.bit_rate)) {
      for (const entry of video.bit_rate) {
        if (entry && typeof entry === "object") {
          push(pickUrl(entry.play_addr?.url_list), entry.gear_name || entry.quality_type);
        }
      }
    }
    push(pickUrl(video.play_addr?.url_list), "Gốc");
    push(pickUrl(video.download_addr?.url_list), "Gốc");
    if (!medias.length) return null;
    const id = item.aweme_id || item.id || null;
    return {
      videoId: id ? String(id) : null,
      title: item.desc || null,
      cover: pickUrl(video.origin_cover?.url_list)
        || pickUrl(video.dynamic_cover?.url_list)
        || null,
      duration: video.duration ?? null,
      medias
    };
  }

  function capturesFromJson(json) {
    if (!json || typeof json !== "object") return [];
    const data = json.data && typeof json.data === "object" ? json.data : json;
    const list = Array.isArray(data.aweme_list) ? data.aweme_list
      : Array.isArray(data.item_list) ? data.item_list
      : data.aweme_detail ? [data.aweme_detail]
      : null;
    if (!list) return [];
    const out = [];
    for (const entry of list) {
      const found = videoFromAweme(entry);
      if (found) out.push(found);
    }
    return out;
  }

  function isAwemeEndpoint(url) {
    return typeof url === "string"
      && url.includes("aweme")
      && /(detail|iteminfo|feed|post|video)/.test(url);
  }

  function emit(captured) {
    try {
      window.postMessage({ source: SOURCE, captured, at: Date.now() }, "*");
    } catch {
      // Trang chặn postMessage thì hook vẫn không làm hỏng trang.
    }
  }

  function inspect(url, jsonPromise) {
    if (!isAwemeEndpoint(url)) return;
    jsonPromise.then(json => {
      for (const captured of capturesFromJson(json)) emit(captured);
    }).catch(() => {});
  }

  // Hook fetch: chỉ đọc bản sao, không đổi request/response của trang.
  if (typeof window.fetch === "function" && !window.fetch.__tiktokToolsHooked) {
    const originalFetch = window.fetch;
    const hookedFetch = function (input, init) {
      const url = typeof input === "string" ? input : input?.url;
      const responsePromise = originalFetch.apply(this, arguments);
      if (isAwemeEndpoint(url)) {
        responsePromise.then(response => {
          try {
            inspect(url, response.clone().json());
          } catch {
            // Response không phải JSON (ví dụ stream video) thì bỏ qua.
          }
        }).catch(() => {});
      }
      return responsePromise;
    };
    hookedFetch.__tiktokToolsHooked = true;
    window.fetch = hookedFetch;
  }

  // Hook XHR cho những request Douyin còn dùng XMLHttpRequest.
  if (typeof window.XMLHttpRequest === "function" && !window.XMLHttpRequest.prototype.__tiktokToolsHooked) {
    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      this.__tiktokToolsUrl = url;
      return originalOpen.apply(this, arguments);
    };
    window.XMLHttpRequest.prototype.send = function () {
      const xhr = this;
      if (isAwemeEndpoint(xhr.__tiktokToolsUrl)) {
        xhr.addEventListener("load", () => {
          try {
            inspect(xhr.__tiktokToolsUrl, Promise.resolve(JSON.parse(xhr.responseText)));
          } catch {
            // Không phải JSON thì bỏ qua.
          }
        });
      }
      return originalSend.apply(this, arguments);
    };
    window.XMLHttpRequest.prototype.__tiktokToolsHooked = true;
  }

  // Để Node check và console debug dùng được, không ảnh hưởng trang.
  try {
    window.__tiktokToolsDouyinHook = Object.freeze({
      isAwemeEndpoint,
      capturesFromJson,
      videoFromAweme,
      toNoWatermark
    });
  } catch {
    // Trang đóng băng window thì hook vẫn chạy, chỉ không expose được.
  }
})();
