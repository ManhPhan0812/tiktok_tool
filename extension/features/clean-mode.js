(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};
  const attribute = "data-tiktok-tools-clean";
  let enabled = false;

  // Clean Mode chỉ gắn một thuộc tính do extension sở hữu lên <html>; ẩn/hiện do
  // content.css quyết định. Không xóa DOM hay sửa innerHTML của TikTok.
  function apply(value) {
    enabled = Boolean(value);
    const root = document.documentElement;
    if (enabled) root.setAttribute(attribute, "1");
    else root.removeAttribute(attribute);
    return enabled;
  }

  ns.cleanMode = Object.freeze({
    attribute,
    apply,
    isEnabled: () => enabled
  });
})();
