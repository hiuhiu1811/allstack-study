-- AllStack, phần Nền tảng: hồ sơ + vai trò, nhắc việc, bot Telegram.
-- Cách dùng: Supabase > SQL Editor > New query > dán toàn bộ file này > Run.
-- Chạy lại nhiều lần không sao. Không làm mất dữ liệu cũ.

-- ============ 1. Hồ sơ người dùng ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  role text not null default 'member' check (role in ('member', 'moderator', 'admin')),
  telegram_chat_id bigint,
  notify_email boolean not null default true,
  notify_telegram boolean not null default true,
  digest_enabled boolean not null default true,
  digest_hour integer not null default 7 check (digest_hour between 0 and 23),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now()
);
-- Một tài khoản Telegram chỉ gắn với một người dùng
create unique index if not exists profiles_telegram_chat on public.profiles (telegram_chat_id)
  where telegram_chat_id is not null;

-- Tự tạo hồ sơ khi có người đăng ký
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Tạo hồ sơ cho những người đã đăng ký từ trước
insert into public.profiles (id, email, display_name)
select u.id, coalesce(u.email, ''),
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(coalesce(u.email, ''), '@', 1))
from auth.users u
on conflict (id) do nothing;

-- Bảng admins của phần Pomodoro (giữ lại để quản trị viên cũ vẫn còn quyền)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "admin xem chinh minh" on public.admins;
create policy "admin xem chinh minh" on public.admins
  for select using (auth.uid() = user_id);

-- Hàm dùng chung cho mọi phần: là quản trị viên khi role = 'admin' trong hồ sơ (hoặc có trong bảng admins cũ)
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    return true;
  end if;
  return exists (select 1 from public.admins where user_id = auth.uid());
end;
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- Bảo mật hồ sơ: ai cũng xem và sửa được hồ sơ của mình,
-- nhưng chỉ sửa được các cột cài đặt. role và telegram_chat_id chỉ máy chủ/SQL Editor mới đổi được.
alter table public.profiles enable row level security;
drop policy if exists "xem ho so cua minh" on public.profiles;
create policy "xem ho so cua minh" on public.profiles for select using (auth.uid() = id);
drop policy if exists "sua ho so cua minh" on public.profiles;
create policy "sua ho so cua minh" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, notify_email, notify_telegram, digest_enabled, digest_hour, timezone)
  on public.profiles to authenticated;

-- ============ 2. Nhắc việc ============
-- Ghi lại những lần đã nhắc để không gửi trùng.
-- kind = 'event' (ref = id sự kiện) hoặc 'digest' (ref = ngày YYYY-MM-DD) hoặc kiểu khác ở các phần sau.
create table if not exists public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
alter table public.reminder_log enable row level security; -- không có policy: chỉ máy chủ (service role) dùng

-- ============ 3. Bot Telegram ============
-- Mã kết nối dùng một lần (hết hạn sau 10 phút)
create table if not exists public.telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.telegram_link_codes enable row level security;

-- Bản nháp lịch đang chờ bấm Lưu / Bỏ (xóa sau khi xử lý hoặc sau 1 ngày)
create table if not exists public.telegram_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.telegram_drafts enable row level security;

-- ============ 4. AI dự phòng (tùy chọn, mặc định tắt) ============
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

-- ============ 5. Hẹn giờ gọi nhắc việc mỗi 5 phút (pg_cron + pg_net) ============
-- Vercel bản miễn phí chỉ cho chạy cron mỗi ngày một lần, nên Supabase sẽ gọi web mỗi 5 phút.
create table if not exists public.app_config (
  key text primary key,
  value text not null
);
alter table public.app_config enable row level security; -- không có policy: chỉ SQL Editor xem được

do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'Chưa bật được pg_cron/pg_net: vào Database > Extensions bật 2 mục này rồi chạy lại file. Lỗi: %', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'allstack-nhac';
    perform cron.schedule(
      'allstack-nhac',
      '*/5 * * * *',
      $job$
      select net.http_post(
        url := c.url,
        headers := jsonb_build_object('Authorization', 'Bearer ' || c.secret, 'Content-Type', 'application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      )
      from (
        select (select value from public.app_config where key = 'cron_url') as url,
               (select value from public.app_config where key = 'cron_secret') as secret
      ) c
      where c.url is not null and c.secret is not null;
      $job$
    );
  end if;
end $$;

-- SAU KHI chạy file này, chạy THÊM đúng 1 câu sau (đổi 2 giá trị rồi Run), để bật nhắc việc:
--
--   insert into public.app_config (key, value) values
--     ('cron_url',    'https://allstack-study.vercel.app/api/cron/nhac'),
--     ('cron_secret', 'CHUOI-BI-MAT-GIONG-HET-BIEN-CRON_SECRET-TREN-VERCEL')
--   on conflict (key) do update set value = excluded.value;
--
-- Cấp quyền quản trị viên cho email của bạn (đăng nhập web một lần trước):
--
--   update public.profiles set role = 'admin' where email = 'email-cua-ban@gmail.com';
