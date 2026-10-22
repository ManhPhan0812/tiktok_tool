# Phương án tải tệp (đang bị CDN chặn)

## Vấn đề

TikTok CDN chỉ trả nội dung khi request có `Referer` thuộc `tiktok.com`. Trong phạm vi API của extension, không đặt được header này:

| Cách | Kết quả |
| --- | --- |
| `chrome.downloads.download({ url })` | 403 `SERVER_FORBIDDEN` |
| `headers: [{ name: "Referer", … }]` trong downloads API | Chrome báo `Unsafe request header name` |
| `fetch` từ content script | 403 vì request kèm `Origin` |
| `fetch` từ trang extension (kể cả `referrer` + `referrerPolicy: unsafe-url`) | 403, extension không mạo danh được `Referer` |
| `declarativeNetRequest` `set referer` | Chrome không cho sửa `Referer`, quy tắc không có tác dụng |
| `<a download>` trên trang TikTok (cross-origin) | Thuộc tính `download` bị bỏ qua, trình duyệt mở tab phát |

Đo đầy đủ ở `docs/status.md` mục "Chặn kỹ thuật đã xác định".

## Hai hướng có thể làm

### A. Native messaging host (khuyến nghị nếu cần tải thật)

Extension gửi yêu cầu sang một tiến trình nhỏ trên máy; tiến trình này tự tải HTTP với `Referer` hợp lệ, ghi tệp, báo tiến trình về.

- Thành phần: `host/manifest.json` (native messaging), `host/index.js` (Node hoặc .NET), `extension/services/native-bridge.js`.
- Giao thức: đóng gói JSON theo chuẩn native messaging (`uint32` độ dài + JSON).
- Lệnh: `ping`, `download {url, filename, referer}`, `cancel {id}`, `status {id}`.
- Ưu điểm: giải quyết cả 403 lẫn MP3 (host có thể gọi ffmpeg/lame nếu máy có).
- Nhược điểm: người dùng phải cài thêm, cần đăng ký registry (Windows) hoặc thư mục `~/.config` (Linux/macOS); không còn là "chỉ cài extension".

### B. Chỉ hướng dẫn người dùng tải thủ công

Giữ nguyên extension, khi gặp 403 hiển thị hướng dẫn mở video và dùng nút tải của TikTok. Không cần cài thêm, nhưng không có tệp trong thư mục Downloads.

## Việc MP3 phụ thuộc vào lựa chọn nào

- Chọn A: host tải MP4 rồi chuyển mã bằng ffmpeg (nếu có) hoặc lamejs trong host; extension chỉ hiển thị tiến trình.
- Chọn B: MP3 tiếp tục bị khoá, ghi rõ "chưa khả dụng".

## Ước lượng

- Host tối thiểu (ping + download + cancel + progress): khoảng 200 dòng Node, 120 dòng phía extension, cộng manifest và script cài cho Windows.
- Kiểm thử tự động: giả lập host bằng một tiến trình Node trả JSON, kiểm tra đúng thư mục/tên tệp và hủy giữa chừng; không cần mạng TikTok.
- Chuyển mã MP3 thêm: 1 buổi nếu dùng ffmpeg có sẵn, lâu hơn nếu phải nhúng lamejs vào host.
