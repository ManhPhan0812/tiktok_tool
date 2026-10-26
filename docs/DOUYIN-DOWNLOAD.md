# Tải video Douyin

Douyin trên web PC **không** cấp file mp4 nguyên khối: player dùng DASH, `<video>` là `blob:` và trang tải riêng luồng video (`media-video-avc1`) với luồng âm thanh (`media-audio-und-mp4a`). Vì vậy extension phải nhờ một dịch vụ đã ghép sẵn; nó không tự gộp DASH.

## Mặc định: qua seekin.ai

Không cần cấu hình gì. Khi bạn dán link Douyin và bấm **Phân tích**, extension gọi `https://download.seekin.ai/ikool/media/download` với thân `{"url": "<link Douyin>"}`, kèm chữ ký `sign`/`nonce`/`timestamp`/`lang` sinh tại máy (HMAC-SHA256 trên chính thân yêu cầu).

Những gì được gửi và không được gửi:

- **Gửi:** link Douyin bạn dán (kể cả `?modal_id=…`), và các header ký nói trên.
- **Không gửi:** cookie, token đăng nhập, hay dữ liệu tài khoản Douyin của bạn — request đặt `credentials: "omit"` và không có header `authorization` khi dùng Seekin.
- Chữ ký dùng tham số của web-client Seekin (quan sát từ frontend họ phát hành), không phải token tài khoản. Nếu Seekin đổi cách ký, tính năng này sẽ hỏng cho tới khi cập nhật — extension báo lỗi rõ chứ không treo.

Kết quả trả về (đo được với API này): `1080p` ở trạng thái `locked: true` và **không có link**, `720p` ~10,08 MB, `540p` ~10,15 MB. Popup hiện đúng như vậy: hàng 1080p bị khoá kèm lý do, 720p là lựa chọn chính.

## Đổi sang endpoint riêng

Nếu bạn muốn tự kiểm soát (hoặc không muốn gửi link tới Seekin), đặt endpoint của bạn trong `chrome.storage.local`:

```js
// chrome://extensions → Service worker → Console
chrome.storage.local.set({
  douyinEndpoint: "https://your-host.example/media/download",
  douyinToken: "Bearer …"   // bỏ trống nếu endpoint không cần
});
```

Endpoint của bạn phải trả JSON cùng hợp đồng:

```json
{
  "code": "0000",
  "data": {
    "title": "tiêu đề",
    "imageUrl": "https://…/cover.jpeg",
    "medias": [
      { "url": null,                  "quality": "1080p", "locked": true,  "fileSize": 13943633, "sizeStr": "13.30 MB" },
      { "url": "https://…/720.mp4",   "quality": "720p",  "locked": false, "fileSize": 10567934, "sizeStr": "10.08 MB" },
      { "url": "https://…/540.mp4",   "quality": "540p",  "locked": false, "fileSize": 10642817, "sizeStr": "10.15 MB" }
    ]
  }
}
```

- `code` khác `"0000"`/`0` → popup hiện đúng `msg`, không hiện hàng tải giả. Riêng `5016` của Seekin được dịch thành lời khuyên thử lại/phân tích lại.
- Endpoint riêng nhận cả `v.douyin.com/…` (link rút gọn) và link có `?modal_id=…`; extension chuyển nguyên link gốc.
- Endpoint ngoài `douyin.com` cần quyền: lần đầu gọi, Chrome sẽ hỏi đúng origin đó (`optional_host_permissions`). Từ chối thì popup báo `Chưa được cấp quyền truy cập https://…` và không gọi mạng.

## Giới hạn

- Link CDN Douyin có chữ ký và hết hạn nhanh; extension cache kết quả 60 giây (theo endpoint + video), nên phân tích xong tải ngay.
- Bản 1080p tuỳ tài khoản dịch vụ; extension không vượt khoá.
- Dùng Seekin nghĩa là bạn phụ thuộc dịch vụ bên thứ ba: họ có thể đổi API, chặn, hoặc tính phí. Extension không có cách nào đảm bảo thay họ.
