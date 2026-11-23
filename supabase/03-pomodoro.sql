-- AllStack, phần 2: Pomodoro, thống kê học, thư viện âm thanh/ảnh nền.
-- Cách dùng: Supabase > SQL Editor > New query > dán toàn bộ file này > Run.
-- Chạy lại nhiều lần không sao. Không động tới bảng cũ.

-- ---------- Quản trị viên ----------
-- Danh sách người được tải âm thanh/ảnh lên. Chỉ thêm được bằng SQL Editor (xem README).
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "admin xem chinh minh" on public.admins;
create policy "admin xem chinh minh" on public.admins
  for select using (auth.uid() = user_id);

-- Nếu sau này có hàm is_admin() ở phần khác thì thống nhất lại một hàm.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Phiên học ----------
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  subject text not null default '',
  started_at timestamptz not null,
  minutes integer not null check (minutes >= 1),
  completed boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists study_sessions_user_start on public.study_sessions (user_id, started_at);
alter table public.study_sessions enable row level security;
drop policy if exists "own study_sessions" on public.study_sessions;
create policy "own study_sessions" on public.study_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Thư viện âm thanh / ảnh nền ----------
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sound', 'image')),
  title text not null check (length(trim(title)) > 0),
  source text not null check (length(trim(source)) > 0),   -- nguồn (trang/tác giả)
  license text not null check (length(trim(license)) > 0), -- CC0, Pixabay License...
  path text not null,  -- đường dẫn file trong bucket "media"
  url text not null,   -- địa chỉ công khai
  created_at timestamptz not null default now()
);
alter table public.media enable row level security;
drop policy if exists "media ai cung doc" on public.media;
create policy "media ai cung doc" on public.media for select using (true);
drop policy if exists "media admin them" on public.media;
create policy "media admin them" on public.media for insert with check (public.is_admin());
drop policy if exists "media admin sua" on public.media;
create policy "media admin sua" on public.media for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "media admin xoa" on public.media;
create policy "media admin xoa" on public.media for delete using (public.is_admin());

-- ---------- Kho file (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 20971520) -- tối đa 20 MB mỗi file
on conflict (id) do update set public = true, file_size_limit = 20971520;

drop policy if exists "media file ai cung xem" on storage.objects;
create policy "media file ai cung xem" on storage.objects
  for select using (bucket_id = 'media');
drop policy if exists "media file admin tai len" on storage.objects;
create policy "media file admin tai len" on storage.objects
  for insert with check (bucket_id = 'media' and public.is_admin());
drop policy if exists "media file admin sua" on storage.objects;
create policy "media file admin sua" on storage.objects
  for update using (bucket_id = 'media' and public.is_admin());
drop policy if exists "media file admin xoa" on storage.objects;
create policy "media file admin xoa" on storage.objects
  for delete using (bucket_id = 'media' and public.is_admin());
