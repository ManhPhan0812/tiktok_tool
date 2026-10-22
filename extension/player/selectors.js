(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  // Tên lớp của TikTok có dạng `css-<hash>-<hash>--<TenNguNghia>`. Phần tên ngữ nghĩa
  // ổn định hơn phần hash, nên selector bám vào `[class*=...]` thay vì tên đầy đủ.
  // `data-e2e` chỉ dùng khi TikTok thật sự cung cấp.
  ns.selectors = Object.freeze({
    mediaCard: 'section[data-e2e="feed-video"]',
    recommendItem: '[data-e2e="recommend-list-item-container"]',
    playerWrapper: '[class*="DivBasicPlayerWrapper"]',
    playerContainer: '[class*="DivVideoPlayerContainer"]',
    renderer: "tt-vod-sr-wrap",
    rendererCanvas: "tt-vod-sr-wrap canvas",
    // Lớp thông tin đè lên vùng video — mục tiêu của Clean Mode.
    cleanTargets: Object.freeze([
      '[class*="DivMediaCardOverlayBottomSection"]',
      '[class*="DivOverlayBottomContent"]',
      '[class*="DivVideoProgressContainer"]',
      '[data-e2e="capcut-tag"]'
    ]),
    // Vùng không được ẩn: nút thao tác và bình luận.
    keepTargets: Object.freeze([
      '[class*="ButtonActionItem"]',
      '[data-e2e="comment-list"]'
    ])
  });
})();
