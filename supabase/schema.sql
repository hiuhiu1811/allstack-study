-- Cơ sở dữ liệu AllStack, giai đoạn 1 (Lịch).
-- Cách dùng: Supabase > SQL Editor > New query > dán toàn bộ file này > Run.
-- Chạy lại nhiều lần không sao.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  location text not null default '',
  note text not null default '',
  kind text not null default 'cn' check (kind in ('hop', 'hoc', 'han', 'cn')),
  remind_minutes integer,
  cancelled boolean not null default false,
  done boolean not null default false,
  series_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists events_user_start on public.events (user_id, start_at);
create index if not exists events_series on public.events (series_id);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  type text not null default 'note' check (type in ('note', 'minutes')),
  subject text not null default '',
  title text not null default '',
  content text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists notes_user_date on public.notes (user_id, date);

-- Bảo mật: mỗi người chỉ đọc/sửa được dữ liệu của chính mình.
alter table public.events enable row level security;
alter table public.notes enable row level security;

drop policy if exists "own events" on public.events;
create policy "own events" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
