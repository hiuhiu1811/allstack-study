# AllStack

Website hỗ trợ học tập và công việc: lịch cá nhân, nhập lịch bằng chat (không dùng AI), biên bản họp, ghi chú.
Có đăng nhập Google, hồ sơ/vai trò, nhắc việc qua email và Telegram, bot Telegram. Các phần Nhóm, Công cụ, Khóa học sẽ làm ở các giai đoạn sau.

Web chạy tại: https://allstack-study.vercel.app

## Công nghệ
- Next.js (giao diện + máy chủ), chạy trên Vercel
- Supabase (cơ sở dữ liệu + đăng nhập Google/email)

## Chạy thử trên máy
```bash
npm install
npm run dev     # mở http://localhost:3000
npm test        # chạy bộ câu thử của bộ đọc lịch
```
Chưa điền biến môi trường thì web chạy ở **chế độ thử**: dữ liệu lưu trong trình duyệt.

## Nối Supabase
1. Tạo dự án trên supabase.com.
2. SQL Editor > dán toàn bộ `supabase/schema.sql` > Run.
3. Lấy `Project URL` và `anon public key` (Project Settings > API), điền vào Vercel > Settings > Environment Variables:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Rồi Redeploy.
4. Authentication > URL Configuration: Site URL = địa chỉ .vercel.app của web.

## Thư mục chính
- `lib/parser.ts`: bộ đọc lịch theo mẫu (giờ, ngày, loại việc, địa điểm, lặp, nhắc)
- `lib/events.ts`: thêm/sửa/hủy/xóa sự kiện, sự kiện lặp
- `lib/store.ts`: lưu dữ liệu (Supabase hoặc trình duyệt)
- `app/lich`, `app/nhap-lich`, `app/ghi-chu`: các trang

## Pomodoro và thống kê học (/pomodoro)
- Đồng hồ đếm theo mốc giờ thật, chuông Web Audio, tiếng ồn trắng/hồng/nâu tạo bằng code, chế độ toàn màn hình (⛶), thống kê 7 ngày, theo môn, chuỗi ngày.
- Sau phiên học, phiên nghỉ tự chạy; hết nghỉ thì chờ bấm Bắt đầu. Chỉ phiên học được ghi (bảng `study_sessions`); bỏ giữa chừng vẫn ghi nếu đã học từ 1 phút.
- Cần chạy `supabase/03-pomodoro.sql` (Supabase > SQL Editor). Chế độ thử vẫn dùng được, phiên học lưu trong trình duyệt; thư viện âm thanh/ảnh chỉ có khi nối Supabase.

## Quản trị âm thanh và ảnh nền (/quan-tri/am-thanh)
Chỉ quản trị viên. Tự thêm mình: đăng nhập web một lần, rồi trong Supabase > SQL Editor chạy
(thay email bằng email đăng nhập của bạn):

    insert into public.admins (user_id) select id from auth.users where email = 'email-cua-ban@gmail.com' on conflict do nothing;

Mỗi file phải có Tên, Nguồn, Giấy phép (CC0 hoặc Pixabay License). Gợi ý nơi lấy file: Pixabay, Freesound (lọc CC0), Wikimedia Commons, Free Music Archive (lọc CC0).

## Nền tảng: đăng nhập Google, nhắc việc, bot Telegram
File SQL: `supabase/02-nen-tang.sql` (chạy một lần, chạy lại không sao). Tạo bảng `profiles` (hồ sơ + vai trò member/moderator/admin), `reminder_log`, `telegram_link_codes`, `telegram_drafts`, `ai_usage`, `app_config`, hàm `is_admin()` dùng chung và lịch gọi nhắc việc mỗi 5 phút bằng pg_cron + pg_net.

Biến môi trường mới (ghi chú cách lấy trong `.env.example`): `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_TELEGRAM_BOT_NAME`. Tùy chọn: `GEMINI_API_KEY` (AI dự phòng, mặc định tắt), `SITE_URL`.

- **/cai-dat**: kênh nhắc (email, Telegram), email tóm tắt buổi sáng, kết nối/ngắt Telegram, tải dữ liệu JSON, xóa tài khoản (xác nhận 2 lần).
- **/api/cron/nhac** (cần `Authorization: Bearer <CRON_SECRET>`): nhắc sự kiện có "Nhắc trước" đến giờ, mỗi sự kiện đúng một lần (ghi `reminder_log`); gửi email tóm tắt lịch hôm nay khi đến giờ đã chọn (chỉ gửi nếu hôm đó có lịch; lỡ lượt quét thì gửi bù trong 2 tiếng). `lib/notify.ts` có hàm `sendReminder(userId, text)` để phần Nhóm dùng lại.
- **Bot Telegram** (`/api/telegram`): nhắn câu tự nhiên → tóm tắt + nút Lưu / Sửa trên web / Bỏ (báo trùng giờ); gửi file .docx → lưu biên bản và chọn mốc đưa vào lịch; lệnh `/homnay`, `/tuan` (7 ngày tới), `/viec`. Kết nối bằng nút ở /cai-dat (mã dùng một lần, hết hạn 10 phút). Đăng ký webhook: quản trị viên bấm nút ở /cai-dat, hoặc mở `/api/telegram/dang-ky?khoa=<TELEGRAM_WEBHOOK_SECRET>` một lần.
- Giờ nhắc và giờ trong bot tính theo múi giờ trong hồ sơ (mặc định Asia/Ho_Chi_Minh), không phụ thuộc giờ máy chủ.
- Cấp quyền admin cho mình: `update public.profiles set role = 'admin' where email = 'email-cua-ban@gmail.com';`
- Chạy lại bước hẹn giờ/đổi khóa: `insert into public.app_config (key, value) values ('cron_url','https://<web>/api/cron/nhac'), ('cron_secret','<CRON_SECRET>') on conflict (key) do update set value = excluded.value;`
