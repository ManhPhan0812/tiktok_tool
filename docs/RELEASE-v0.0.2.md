# TikTok Tools v0.0.2

Bản sửa lỗi Equalizer. Toàn bộ chức năng của 0.0.1 được giữ nguyên; tùy chọn đã lưu không bị xoá.

## Sửa lỗi Equalizer

Trước bản này, chọn Bass / Vocal / Treble có thể ra "Không phản hồi · đang thử lại" rồi tự nhảy về Tắt.

- **Định tuyến lại lệnh nội bộ.** Vùng xử lý âm thanh (offscreen) nhận mọi thông điệp có tiền tố `EQ_`, kể cả lệnh dành cho background, nên hai nơi tranh trả lời. `EQ_STATUS`/`EQ_SET_PRESET`/`EQ_STOP` có thể nhận `{ code: "BAD_REQUEST", message: "Lệnh Equalizer không hợp lệ." }` từ offscreen và popup hiểu thành "không phản hồi". Nay thông điệp nội bộ mang `target: "offscreen"`; background bỏ qua target này và offscreen chỉ nhận đúng các lệnh của nó.
- **Stream ID lấy trong service worker**, đúng luồng `worker → offscreen` của Chrome 116+, thay vì lấy từ popup.
- **Đổi preset dùng lại luồng đang chạy** trong cùng tab; bật/tắt/đổi preset được xếp hàng, có timeout và khoá dropdown trong lúc chuyển trạng thái.
- **Không còn kẹt ở "Không phản hồi · đang thử lại".** Vòng poll 900 ms trước đây gộp trạng thái video và trạng thái Equalizer vào một khối `try`, nên chỉ cần trạng thái video lỗi là Equalizer không bao giờ được cập nhật lại. Nay hai phần độc lập; `EQ_STATUS` luôn trả được trạng thái kèm lý do (`readError`, `offscreenError`) thay vì hỏng cả phản hồi.
- **Chỉ báo "Đang bật" khi thật sự đang lọc**: `AudioContext` ở trạng thái `running` và audio track còn `live`. Khi track kết thúc, bộ lọc được dọn và popup trở về Tắt.
- **Limiter** hạn chế đỉnh âm khi tăng gain, tránh vỡ tiếng.
- Vùng offscreen "mồ côi" (còn sống sau khi tải lại extension nhưng không trả lời) được đóng ngay khi phát hiện.

## Cài đặt / cập nhật

1. Tải **tiktok-tools-v0.0.2.zip** ở mục Assets bên dưới và giải nén (nếu đã cài bản cũ, có thể dùng lại thư mục cũ và thay tệp).
2. Mở `chrome://extensions` hoặc `edge://extensions`.
3. Bật **Developer mode**; bấm **Load unpacked** và chọn thư mục có chứa trực tiếp `manifest.json`, hoặc bấm **Reload** trên TikTok Tools nếu đã cài.
4. Tải lại tab TikTok, bấm icon extension để mở popup. Popup phải hiện **v0.0.2**.

Nếu dùng mã nguồn Git, chọn thư mục `extension/` khi Load unpacked.

## Kiểm chứng và giới hạn

- **64/64 bài kiểm thử đạt** trên Edge/Chromium, gồm 3 bài tích hợp dùng offscreen thật và đồ thị Web Audio thật với nguồn âm tổng hợp 60/1000/12000 Hz (không dùng âm thanh hay phiên Chrome cá nhân). Đáp ứng đo được so với Normal: Bass +2,1 dB ở 60 Hz, Vocal +3,1 dB ở 1 kHz, Treble +2,3 dB ở 12 kHz.
- Equalizer vẫn là **tính năng thử nghiệm**: các phép đo trên không thay cho việc nghe thử bằng tai trên loa/tai nghe thật, và quyền thu âm tab cần được cấp bằng cách mở popup từ icon (Chrome/Edge 116 trở lên).
- Download gửi URL video tới **tikwm.com** để lấy link; không gửi cookie hay thông tin tài khoản. Khả năng tải phụ thuộc nguồn và tình trạng dịch vụ.
- Audio MP3 lấy từ trường `music` của TikTok, có thể khác phần lời thoại/nhạc ghép trong clip.
- Bản HD có thể dùng H.265/HEVC; chọn bản chuẩn (H.264) nếu máy không có bộ giải mã tương ứng.
