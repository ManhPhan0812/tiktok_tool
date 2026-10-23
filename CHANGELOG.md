# Changelog

## 0.0.2 — 2026-10-23

### Sửa lỗi

- **Equalizer không còn báo nhầm "Trình duyệt không hỗ trợ".** Trước đây chỉ cần `EQ_STATUS` không phản hồi một lần là popup gán `supported = false`, hiện đúng thông báo "không hỗ trợ" và khoá ô Equalizer vĩnh viễn. Nay lỗi trao đổi thông điệp chỉ được đánh dấu là "Không phản hồi · đang thử lại", giữ nguyên kết luận đã biết và không khoá ô điều khiển.
- Báo riêng từng khả năng thay cho một cờ chung: `offscreen` và `tabCapture` trong service worker; kèm tên API còn thiếu và phiên bản trình duyệt trong tooltip.
- Phân biệt rõ `UNSUPPORTED` (thiếu API) với `BLOCKED` (chưa được cấp quyền `activeTab`).
- Định tuyến riêng các lệnh nội bộ tới offscreen. Trước đây offscreen trả lời nhầm `EQ_STATUS`/`EQ_START`/`EQ_STOP` của popup, gây lỗi "Lệnh Equalizer không hợp lệ" và nhãn "Không phản hồi".
- Service worker tạo stream ID để offscreen sử dụng đúng phạm vi Chrome 116+; popup không lấy stream ID nữa. Đổi preset trong cùng tab dùng lại luồng đang chạy.
- Tuần tự hóa bật/tắt/đổi preset và khóa dropdown lúc chuyển trạng thái; phản hồi polling cũ không kéo lựa chọn về Tắt.
- Chỉ báo đang bật khi AudioContext thật sự chạy và có audio track còn hoạt động; dọn track/bộ lọc khi kết thúc. Thêm limiter để hạn chế đỉnh âm khi tăng gain.
- **Ô Equalizer không còn kẹt ở "Không phản hồi · đang thử lại".** Hai nguyên nhân: (1) `refreshEq()` nằm chung khối `try` với `PLAYER_STATUS` trong vòng poll 900 ms, nên chỉ cần trạng thái video lỗi là trạng thái Equalizer không bao giờ được cập nhật lại — nay hai phần độc lập; (2) `eqStatus()` gọi thẳng `readSettings()` nên nếu bước đọc tùy chọn ném lỗi thì cả thông điệp `EQ_STATUS` hỏng theo — nay đã bọc lại, luôn trả trạng thái kèm lý do (`readError`, `offscreenError`) thay vì làm hỏng cả phản hồi.
- Vùng xử lý âm thanh "mồ côi" (còn sống sau khi extension được tải lại nhưng không trả lời) được đóng ngay khi phát hiện, để lần bật sau dựng vùng mới thay vì kẹt vĩnh viễn.
- Khi lỗi, tooltip ô Equalizer ghi rõ thông báo lỗi thật và hướng dẫn, thay vì câu chung chung.

### Kiểm thử

- Thêm 5 bài hồi quy trạng thái Equalizer và 3 bài tích hợp dùng offscreen thật, bộ lọc Web Audio thật, nguồn âm tổng hợp 60/1000/12000 Hz. Kiểm tra gain từng preset, dùng lại luồng, giữ lựa chọn khi polling/đóng mở popup và dọn khi audio track kết thúc.

## 0.0.1 — 2026-10-22

Bản phát hành GitHub đầu tiên; gom toàn bộ mã của các bản thử nghiệm nội bộ đến 0.2.2 và đặt lại số phiên bản thành 0.0.1.

### Chức năng

- Lật ngang từng video hoặc tự lật, nút nổi và phím tắt; hỗ trợ trình phát canvas của TikTok.
- Tốc độ 0,5×–4×, Clean Video Mode và phát nền có tôn trọng pause của người dùng.
- Chụp khung hình PNG theo chiều lật đang xem; phương án chụp vùng khi không đọc được frame.
- Phân tích URL qua TikWM; tải HD, không logo, có logo và MP3 theo nguồn khả dụng. Mặc định chỉ chọn bản không logo.
- Nhận link chuẩn, /video/ID, /t/, mobile/embed, ID và link trong văn bản chia sẻ.
- EQ 5 dải qua tabCapture/offscreen với Normal, Bass Boost, Vocal, Treble Boost (thử nghiệm).
- Popup sáng/tối, lưu settings cục bộ, logo TikTok Aesthetic Brown cho giao diện và thanh công cụ.

### Sửa lỗi đã tích hợp

- Nhận diện video trong suốt có renderer canvas, không vô hiệu hóa sai nút lật.
- Giữ transform gốc, xử lý thay renderer và nguồn video.
- Giữ thông báo lỗi phân tích, bỏ phản hồi cũ khi URL thay đổi và ngăn gửi trùng.
- Xử lý HTTP 429, lỗi mạng/timeout, URL nguồn tương đối và kiểm tra video ID của API.
- Migrate tùy chọn cũ, áp dụng tốc độ đã lưu và sửa dung lượng tiến trình tải.

### Kiểm chứng và giới hạn

- 56 bài kiểm thử tự động; các công cụ live kiểm tra API, popup và media thật.
- Download phụ thuộc TikWM và gửi URL video tới dịch vụ đó, không gửi cookie/tài khoản.
- MP3 là audio nguồn TikTok; có thể khác âm thanh đã ghép trong clip.
- HD có thể yêu cầu bộ giải mã HEVC. EQ cần nghe thử trên máy thật.
- Các số 0.1.x/0.2.x trong tài liệu khảo sát là mốc thử nghiệm, không phải release đã xuất bản.
