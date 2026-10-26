(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  // Mỗi nền tảng một bộ selector. Hiện chỉ `renderer` được mã dùng trực tiếp
  // (xem `player/adapter.js`); `cleanTargets`/`keepTargets` là bản mô tả song song
  // của các quy tắc trong `content.css` — sửa bên này thì sửa cả bên kia.
  // TikTok: tên lớp có dạng `css-<hash>-<hash>--<TenNguNghia>`, nên bám vào phần
  // tên ngữ nghĩa qua `[class*=...]`; `data-e2e` chỉ dùng khi TikTok thật sự có.
  const SELECTORS = Object.freeze({
    tiktok: Object.freeze({
      mediaCard: 'section[data-e2e="feed-video"]',
      recommendItem: '[data-e2e="recommend-list-item-container"]',
      playerWrapper: '[class*="DivBasicPlayerWrapper"]',
      playerContainer: '[class*="DivVideoPlayerContainer"]',
      renderer: "tt-vod-sr-wrap",
      cleanTargets: Object.freeze([
        '[class*="DivMediaCardOverlayBottomSection"]',
        '[class*="DivOverlayBottomContent"]',
        '[class*="DivVideoProgressContainer"]',
        '[data-e2e="capcut-tag"]'
      ]),
      keepTargets: Object.freeze([
        '[class*="ButtonActionItem"]',
        '[data-e2e="comment-list"]'
      ])
    }),
    // Douyin: player `xgplayer`, khung hình nằm trong chính <video> nên không có
    // renderer canvas riêng. Lớp phủ cần ẩn là đạn màn hình (danmaku), dòng khai báo
    // của tác giả và thanh tiến trình; nút thao tác và bình luận nằm ngoài vùng video.
    douyin: Object.freeze({
      mediaCard: '[data-e2e="player-container"]',
      recommendItem: '[data-aweme-id]',
      playerWrapper: '[data-e2e="player-container"]',
      playerContainer: ".basePlayerContainer",
      renderer: null,
      cleanTargets: Object.freeze([
        '[data-e2e="danmaku-container"]',
        ".player-position-box-bottom",
        ".xgplayer-progress"
      ]),
      keepTargets: Object.freeze([
        '[data-e2e="video-player-digg"]',
        '[data-e2e="feed-comment-icon"]',
        '[data-e2e="video-player-collect"]',
        '[data-e2e="video-player-share"]',
        '[data-e2e="comment-list"]'
      ])
    })
  });

  function forPlatform(id) {
    return SELECTORS[id] || SELECTORS.tiktok;
  }

  ns.selectors = SELECTORS.tiktok;
  ns.selectorsFor = forPlatform;
  ns.selectorSets = SELECTORS;
})();
