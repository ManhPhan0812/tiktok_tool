(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  const SCRIPT_IDS = ["__UNIVERSAL_DATA_FOR_REHYDRATION__", "SIGI_STATE"];
  // Chặn duyệt cây DOM quá lớn trên trang lạ.
  const MAX_NODES = 200_000;

  function readJson(id) {
    const element = document.getElementById(id);
    if (!element || !element.textContent) return null;
    try {
      return JSON.parse(element.textContent);
    } catch {
      return null;
    }
  }

  function looksLikeItem(node) {
    return Boolean(node && typeof node === "object" && node.video && typeof node.video === "object");
  }

  function findItem(videoId) {
    if (!videoId) return null;
    const roots = SCRIPT_IDS.map(readJson).filter(Boolean);
    for (const root of roots) {
      const stack = [root];
      let visited = 0;
      while (stack.length && visited < MAX_NODES) {
        const node = stack.pop();
        visited += 1;
        if (!node || typeof node !== "object") continue;
        if (looksLikeItem(node) && String(node.id) === String(videoId)) return node;
        if (looksLikeItem(node.itemInfo?.itemStruct) && String(node.itemInfo.itemStruct.id) === String(videoId)) {
          return node.itemInfo.itemStruct;
        }
        for (const value of Object.values(node)) {
          if (value && typeof value === "object") stack.push(value);
        }
      }
    }
    return null;
  }

  function codecOf(entry) {
    return String(entry.CodecType || entry.PlayAddr?.CodecType || "").toLowerCase();
  }

  function isH264(codec) {
    return ns.validation.isH264Codec(codec);
  }

  function variantsOf(item) {
    const video = item?.video || {};
    const list = Array.isArray(video.bitrateInfo) ? video.bitrateInfo : [];
    const variants = [];
    for (const entry of list) {
      const play = entry?.PlayAddr || {};
      const url = Array.isArray(play.UrlList) ? play.UrlList[0] : null;
      if (!url || !/^https:\/\//i.test(url)) continue;
      const width = Number(play.Width) || null;
      const height = Number(play.Height) || null;
      variants.push({
        url,
        codec: entry.CodecType || play.CodecType || null,
        quality: entry.Quality || null,
        bitrate: Number(entry.Bitrate || play.Bitrate) || null,
        dataSize: Number(play.DataSize) || null,
        width,
        height,
        pixels: (width || 0) * (height || 0)
      });
    }
    variants.sort((a, b) => (b.pixels - a.pixels) || ((b.bitrate || 0) - (a.bitrate || 0)));
    return variants;
  }

  function bestOf(variants) {
    return variants.find(variant => isH264(codecOf(variant))) || variants[0] || null;
  }

  function describe(videoId) {
    const item = findItem(videoId);
    if (!item) return null;
    const variants = variantsOf(item);
    return {
      videoId: String(item.id),
      author: item.author?.uniqueId || null,
      nickname: item.author?.nickname || null,
      desc: item.desc || null,
      duration: Number(item.video?.duration) || null,
      cover: item.video?.cover || item.video?.originCover || null,
      // downloadAddr là bản TikTok cung cấp để tải, có logo. Không có trường nào
      // tuyên bố là "không logo" nên không được suy diễn thành false.
      logoUrl: /^https:\/\//i.test(item.video?.downloadAddr || "") ? item.video.downloadAddr : null,
      variants
    };
  }

  ns.pageState = Object.freeze({ findItem, describe, isH264 });
})();
