// Kiểm chứng end-to-end trên TikTok thật (không nằm trong bộ test mặc định).
// Cách chạy:
//   $env:TIKTOK_TOOLS_BROWSER_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
//   node tools/live-check.cjs [videoUrl]
const fs = require("node:fs/promises");
const h = require("../tests/fixtures/harness");

const VIDEO_ID = "7699174948165651743";
const START_URL = process.argv[2] || `https://www.tiktok.com/video/${VIDEO_ID}`;

const call = (page, type, payload = {}) => page.evaluate(({ type, payload }) => chrome.runtime.sendMessage({
  type,
  payload,
  requestId: `live-${type}`
}), { type, payload });

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

// Đọc cấu trúc MP4 để biết codec và độ phân giải thật, không chỉ kiểm tra "có tệp".
function boxes(buffer, start, end) {
  const out = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (size < 8 || offset + size > end) break;
    out.push({ type, start: offset, body: offset + 8, end: offset + size });
    offset += size;
  }
  return out;
}

function child(buffer, box, type) {
  return boxes(buffer, box.body, box.end).find(entry => entry.type === type) || null;
}

function analyseMp4(buffer) {
  const result = { ftyp: false, moov: false, mdat: false, audio: false, codec: null, width: null, height: null };
  const top = boxes(buffer, 0, buffer.length);
  result.ftyp = top.some(box => box.type === "ftyp");
  result.mdat = top.some(box => box.type === "mdat");
  const moov = top.find(box => box.type === "moov");
  if (!moov) return result;
  result.moov = true;
  for (const trak of boxes(buffer, moov.body, moov.end).filter(box => box.type === "trak")) {
    const stbl = ["mdia", "minf", "stbl"].reduce((box, type) => box && child(buffer, box, type), trak);
    const stsd = stbl && child(buffer, stbl, "stsd");
    if (!stsd) continue;
    for (const entry of boxes(buffer, stsd.body + 8, stsd.end)) {
      if (entry.type === "mp4a") result.audio = true;
      if (["avc1", "hvc1", "hev1", "av01"].includes(entry.type)) {
        result.codec = entry.type;
        result.width = buffer.readUInt16BE(entry.body + 24);
        result.height = buffer.readUInt16BE(entry.body + 26);
      }
    }
  }
  return result;
}

async function downloadVariant(popup, videoId, variant) {
  const started = await call(popup, "DOWNLOAD_START", { videoId, variant });
  if (!started?.ok) return { error: started?.error };
  const job = await waitJob(popup, variant);
  const summary = job && {
    state: job.state,
    via: job.via,
    fallback: job.fallback,
    error: job.errorCode || null,
    bytes: job.bytesReceived,
    path: job.filename
  };
  if (job?.state !== "complete") return summary || { error: { message: "không thấy job" } };
  const bytes = await fs.readFile(job.filename).catch(() => null);
  if (!bytes) return { ...summary, error: { message: "không đọc lại được tệp đã lưu" } };
  return { ...summary, bytes: bytes.length, info: analyseMp4(bytes) };
}

// Chờ job tải xong hoặc dừng, đọc qua đúng trạng thái mà popup dùng.
// Khi job đang đổi tuyến sau lỗi 403 thì phải chờ tiếp thay vì kết luận.
async function waitJob(popup, variant, timeout = 90_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const status = await call(popup, "DOWNLOAD_STATUS");
    const job = (status?.data || []).find(entry => entry.variant === variant);
    if (job && job.state === "complete") return job;
    if (job && job.state === "interrupted") {
      const retrying = job.retryPending || (job.errorCode === "SERVER_FORBIDDEN" && !job.fallback);
      if (!retrying) return job;
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  return null;
}

(async () => {
  const harness = await h.launch({ routePage: false });
  const results = {};
  try {
    const page = await harness.context.newPage();
    console.log(`→ Mở ${START_URL}`);
    await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3_000);
    const finalUrl = page.url();
    console.log(`→ URL cuối: ${finalUrl}`);
    results.finalUrl = finalUrl;

    try {
      await page.locator("#tiktok-tools-control").waitFor({ state: "visible", timeout: 25_000 });
      results.controlVisible = true;
    } catch {
      results.controlVisible = false;
      fail("Không thấy nút điều khiển trên trang thật.");
      throw new Error("control-missing");
    }

    const popup = await h.openPopup(harness, page);
    const status = await h.send(harness, page, "PLAYER_STATUS");
    results.status = { available: status.available, enhanced: status.enhanced, rate: status.rate, visibility: status.visibility };
    console.log("→ PLAYER_STATUS:", JSON.stringify(results.status));
    if (!status.available) fail("Trạng thái báo không có video đang xem.");

    const mirrored = await h.send(harness, page, "MIRROR_TOGGLE");
    results.mirrored = mirrored.mirrored;
    console.log("→ Sau khi lật, mirrored =", mirrored.mirrored);
    if (!mirrored.mirrored) fail("Lật video không có tác dụng.");
    await h.send(harness, page, "MIRROR_TOGGLE");

    const speed = await h.send(harness, page, "SPEED_SET", { rate: 1.5 });
    results.rate = speed.rate;
    console.log("→ Tốc độ sau khi đặt:", speed.rate);
    if (Math.abs(speed.rate - 1.5) > 0.01) fail("Tốc độ không được áp dụng.");
    await h.send(harness, page, "SPEED_SET", { rate: 1 });

    try {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 25_000 }),
        h.send(harness, page, "CAPTURE_FRAME", {})
      ]);
      const saved = await h.waitForDownload(harness, download.suggestedFilename());
      const bytes = await fs.readFile(saved.path);
      results.capture = {
        file: saved.name,
        bytes: saved.bytes,
        png: bytes.subarray(1, 4).toString() === "PNG",
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20)
      };
      console.log("→ Ảnh chụp:", JSON.stringify(results.capture));
      if (!results.capture.png || results.capture.width < 100) fail("Ảnh chụp không hợp lệ.");
    } catch (error) {
      results.capture = { error: error.message };
      fail(`Chụp khung hình thất bại: ${error.message}`);
    }

    const resolved = await call(popup, "DOWNLOAD_RESOLVE", { url: finalUrl });
    if (!resolved?.ok) {
      results.resolve = { error: resolved?.error };
      fail(`Phân tích link thất bại: ${resolved?.error?.message}`);
    } else {
      const data = resolved.data;
      results.resolve = {
        videoId: data.videoId,
        author: data.author,
        source: data.source,
        availableCount: data.availableCount,
        defaultVariant: data.defaultVariant,
        rows: Object.fromEntries(Object.entries(data.rows).map(([key, row]) => [
          key,
          row.available ? `${row.label} · ${row.via} · ${row.sizeBytes ?? "?"} B` : `OFF: ${row.reason}`
        ]))
      };
      console.log("→ Phân tích:", JSON.stringify(results.resolve, null, 1));
      if (data.availableCount < 3) fail("Không đủ ba bản tải được từ nguồn thật.");
      if (!["hd", "noLogo"].includes(data.defaultVariant)) fail("Không có bản mặc định hợp lệ.");
      if (data.defaultVariant !== "hd") fail("Mặc định phải là bản HD khi video có bản HD.");

      // 1) Bản mặc định (HD, hdplay): tải được, có tiếng, và phải nét hơn bản chuẩn.
      results.hd = await downloadVariant(popup, data.videoId, "hd");
      console.log("→ Tải HD:", JSON.stringify(results.hd));
      if (results.hd.state !== "complete") fail(`Tải HD không xong: ${JSON.stringify(results.hd.error || results.hd)}`);
      else {
        const info = results.hd.info;
        if (!info.ftyp || !info.moov) fail("Tệp HD không phải MP4 hợp lệ.");
        if (!info.audio) fail("Tệp HD không có track âm thanh.");
      }

      // 2) Bản chuẩn (play): phải là H.264 để mở được trên máy không có HEVC.
      results.standard = await downloadVariant(popup, data.videoId, "noLogo");
      console.log("→ Tải bản chuẩn:", JSON.stringify(results.standard));
      if (results.standard.state !== "complete") fail(`Tải bản chuẩn không xong: ${JSON.stringify(results.standard.error || results.standard)}`);
      else if (results.standard.info?.codec !== "avc1") fail(`Bản chuẩn không phải H.264 (codec ${results.standard.info?.codec}).`);

      // 3) So sánh độ phân giải thật: HD phải nét hơn hoặc bằng bản chuẩn.
      const hdShort = Math.min(results.hd.info?.width || 0, results.hd.info?.height || 0);
      const standardShort = Math.min(results.standard.info?.width || 0, results.standard.info?.height || 0);
      results.comparison = { hdShort, standardShort };
      console.log("→ So sánh:", JSON.stringify(results.comparison));
      if (hdShort && standardShort && hdShort < standardShort) fail("Bản HD có phân giải thấp hơn bản chuẩn.");

      // 4) MP3: tệp âm thanh thật (ID3 hoặc frame sync), không phải HTML lỗi.
      results.mp3 = await downloadVariant(popup, data.videoId, "mp3");
      console.log("→ Tải MP3:", JSON.stringify(results.mp3));
      if (results.mp3.state !== "complete") {
        fail(`Tải MP3 không hoàn tất: ${JSON.stringify(results.mp3.error || results.mp3)}`);
      } else {
        const bytes = await fs.readFile(results.mp3.path).catch(() => null);
        if (!bytes) fail("Không đọc lại được tệp MP3.");
        else {
          const id3 = bytes.subarray(0, 3).toString() === "ID3";
          const frameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
          Object.assign(results.mp3, { id3, frameSync });
          if (!id3 && !frameSync) fail("Tệp MP3 không có magic của audio/mpeg.");
          if (bytes.length < 20_000) fail("Tệp MP3 nhỏ bất thường.");
        }
      }

      // 5) Bản có logo: chỉ kiểm tra khi hàng đó khả dụng.
      if (data.rows.logo.available) {
        results.logo = await downloadVariant(popup, data.videoId, "logo");
        console.log("→ Tải bản có logo:", JSON.stringify(results.logo));
        if (results.logo.state !== "complete") fail(`Tải bản logo không xong: ${JSON.stringify(results.logo.error || results.logo)}`);
        else if (!results.logo.info?.ftyp) fail("Tệp logo không phải MP4 hợp lệ.");
      } else {
        results.logo = { skipped: data.rows.logo.reason };
        console.log("→ Bỏ qua bản logo:", data.rows.logo.reason);
      }
    }
  } catch (error) {
    if (error.message !== "control-missing") fail(`Lỗi không mong đợi: ${error.message}`);
  } finally {
    console.log("\n=== TÓM TẮT ===");
    console.log(JSON.stringify(results, null, 2));
    await h.dispose(harness).catch(() => {});
  }
})();
