# Changelog

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
