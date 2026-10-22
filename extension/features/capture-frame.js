(() => {
  "use strict";
  const ns = globalThis.TikTokTools = globalThis.TikTokTools || {};

  const error = (message, code) => Object.assign(new Error(message), { code });

  function canvasOf(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw error("Không tạo được canvas để chụp khung hình.", "CAPTURE_FAILED");
    return { canvas, context };
  }

  // Ảnh toàn một màu (đen hoặc trong suốt) nghĩa là chưa có khung hình thật.
  function hasContent(context, width, height) {
    try {
      const { data } = context.getImageData(0, 0, width, height);
      const step = Math.max(4, Math.floor(data.length / 4 / 4096) * 4);
      let sum = 0;
      let samples = 0;
      for (let i = 0; i < data.length; i += step) {
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        samples += 1;
      }
      return samples > 0 && sum / samples > 2;
    } catch {
      // getImageData lỗi nghĩa là canvas bị taint hoặc chưa có dữ liệu.
      return false;
    }
  }

  async function fromVideo(video, mirrored) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height || video.readyState < 2) {
      throw error("Video chưa có khung hình để chụp. Hãy phát video rồi thử lại.", "NO_FRAME");
    }
    const { canvas, context } = canvasOf(width, height);
    context.save();
    // Áp dụng chiều lật đúng một lần tại canvas xuất.
    if (mirrored) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, width, height);
    context.restore();
    if (!hasContent(context, width, height)) {
      throw error("Khung hình hiện chưa có nội dung. Hãy thử lại khi video đang phát.", "NO_FRAME");
    }
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch {
      throw error("Không xuất được ảnh vì video bị chặn đọc khung hình (CORS).", "CAPTURE_FAILED");
    }
    return { dataUrl, width, height, source: "frame" };
  }

  // Dự phòng: cắt vùng video từ ảnh chụp tab. Ảnh có thể chứa lớp phủ của giao diện.
  async function cropTab(dataUrl, rect, devicePixelRatio, viewport) {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(error("Không đọc được ảnh chụp tab.", "CAPTURE_FAILED"));
      image.src = dataUrl;
    });
    const scaleX = image.naturalWidth / Math.max(1, viewport.width);
    const scaleY = image.naturalHeight / Math.max(1, viewport.height);
    const x = Math.max(0, Math.round(rect.left * scaleX));
    const y = Math.max(0, Math.round(rect.top * scaleY));
    const width = Math.max(1, Math.min(image.naturalWidth - x, Math.round(rect.width * scaleX)));
    const height = Math.max(1, Math.min(image.naturalHeight - y, Math.round(rect.height * scaleY)));
    const { canvas, context } = canvasOf(width, height);
    context.drawImage(image, x, y, width, height, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width,
      height,
      source: "tab-region",
      scale: { x: scaleX, y: scaleY, devicePixelRatio }
    };
  }

  ns.capture = Object.freeze({ fromVideo, cropTab });
})();
