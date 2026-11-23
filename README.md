# AllStack

Website hỗ trợ học tập và công việc: lịch cá nhân, nhập lịch bằng chat (không dùng AI), biên bản họp, ghi chú.
Các phần Nhóm, Công cụ, Khóa học, Pomodoro sẽ làm ở các giai đoạn sau.

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
