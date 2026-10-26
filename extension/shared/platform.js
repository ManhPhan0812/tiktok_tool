(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};
  const hosts = ns.validation.hostPatterns;

  // Mỗi nền tảng chỉ khác nhau ở vài điểm: host, cách dựng URL chuẩn, và có cần lật
  // thêm lớp renderer canvas hay không. Mọi thứ còn lại (chọn <video>, tính điểm,
  // tốc độ, chụp khung hình) đều dùng chung nên thêm nền tảng mới không phải sửa
  // từng tính năng.
  const PROFILES = Object.freeze({
    tiktok: Object.freeze({
      id: "tiktok",
      label: "TikTok",
      host: hosts.tiktok,
      filePrefix: "tiktok",
      // TikTok vẽ khung hình lên canvas `tt-vod-sr-wrap`; lật cả canvas mới thấy đổi.
      renderer: "tt-vod-sr-wrap",
      videoPath: /\/video\/(\d{6,25})/,
      authorPath: /^\/@([^/]+)/,
      canonicalVideoUrl: (id, author) => (author
        ? `https://www.tiktok.com/@${author}/video/${id}`
        : `https://www.tiktok.com/video/${id}`)
    }),
    douyin: Object.freeze({
      id: "douyin",
      label: "Douyin",
      host: hosts.douyin,
      filePrefix: "douyin",
      // Douyin dùng player riêng (`xgplayer`); khung hình nằm trong chính <video>.
      renderer: null,
      videoPath: /\/video\/(\d{6,25})/,
      // Trang người dùng Douyin dùng sec_uid, không phải @tên, nên không ghép được.
      authorPath: null,
      canonicalVideoUrl: id => `https://www.douyin.com/video/${id}`
    })
  });

  function hostOf(value) {
    try {
      return new URL(String(value)).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  function idForHost(host) {
    for (const profile of Object.values(PROFILES)) {
      if (profile.host.test(host)) return profile.id;
    }
    return null;
  }

  function forUrl(value) {
    return PROFILES[idForHost(hostOf(value))] || null;
  }

  function forHost(host) {
    return PROFILES[idForHost(String(host || "").toLowerCase())] || null;
  }

  // Content script luôn chạy trên một host đã khớp `matches`, nên mặc định TikTok là
  // an toàn; nếu không nhận ra host thì giữ hành vi cũ thay vì tắt tính năng.
  function current() {
    return forUrl(globalThis.location?.href) || PROFILES.tiktok;
  }

  function isSupportedUrl(value) {
    return Boolean(forUrl(value));
  }

  function videoIdFromPath(pathname) {
    const match = String(pathname || "").match(/\/video\/(\d{6,25})/);
    return match ? match[1] : null;
  }

  function authorFromPath(pathname) {
    const profile = current();
    const match = profile.authorPath ? String(pathname || "").match(profile.authorPath) : null;
    return match ? decodeURIComponent(match[1]) : null;
  }

  function canonicalVideoUrl(id, author = null) {
    const profile = current();
    return id ? profile.canonicalVideoUrl(id, author) : null;
  }

  ns.platform = Object.freeze({
    PROFILES,
    ids: Object.freeze(Object.keys(PROFILES)),
    hostOf,
    idForHost,
    forUrl,
    forHost,
    current,
    isSupportedUrl,
    videoIdFromPath,
    authorFromPath,
    canonicalVideoUrl
  });
})();
