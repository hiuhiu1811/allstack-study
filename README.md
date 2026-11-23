# AllStack

Website hỗ trợ học tập và công việc: lịch cá nhân, nhập lịch bằng chat (không dùng AI), biên bản họp, ghi chú.
Các phần Nhóm, Công cụ, Khóa học sẽ làm ở các giai đoạn sau.

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
