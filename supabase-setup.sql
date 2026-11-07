-- =====================================================
-- 찰칵함 Supabase 설정 (SQL Editor에 통째로 붙여넣고 Run)
-- =====================================================
create extension if not exists pgcrypto with schema extensions;

-- 1) 결혼식(앨범) -------------------------------------------------
create table if not exists public.events (
  slug         text primary key check (slug ~ '^[a-z0-9-]{3,40}$'),
  groom        text not null check (char_length(groom) <= 20),
  bride        text not null check (char_length(bride) <= 20),
  wedding_date date,
  admin_hash   text not null,
  created_at   timestamptz not null default now()
);
alter table public.events enable row level security;
-- events 테이블은 직접 읽기 불가(비밀번호 해시 보호). 공개 정보는 아래 뷰로만.
create or replace view public.public_events as
  select slug, groom, bride, wedding_date from public.events;
grant select on public.public_events to anon, authenticated;

-- 이벤트 존재 확인 (events 테이블은 비공개라 함수로 확인)
create or replace function public.event_exists(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from events where slug = p_slug);
$$;
grant execute on function public.event_exists to anon, authenticated;

-- 2) 사진 ---------------------------------------------------------
create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  event_slug  text not null references public.events(slug) on delete cascade,
  path        text not null,
  kind        text not null check (kind in ('image','video')),
  guest_name  text check (char_length(guest_name) <= 20),
  hidden      boolean not null default false,
  like_count  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists photos_event_idx on public.photos(event_slug, created_at desc);
alter table public.photos enable row level security;

drop policy if exists "guests read visible" on public.photos;
create policy "guests read visible" on public.photos
  for select to anon, authenticated using (hidden = false);

drop policy if exists "guests add photo" on public.photos;
create policy "guests add photo" on public.photos
  for insert to anon, authenticated
  with check (hidden = false and like_count = 0 and path like event_slug || '/%'
              and public.event_exists(event_slug));

-- 좋아요 ------------------------------------------------------------
alter table public.photos add column if not exists like_count integer not null default 0;
create or replace function public.like_photo(p_id uuid, p_delta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update photos set like_count = greatest(0, like_count + sign(p_delta)::int)
   where id = p_id and hidden = false returning like_count into n;
  return coalesce(n, 0);
end $$;
grant execute on function public.like_photo to anon, authenticated;

-- 3) 관리자 함수 (비밀번호 확인) ----------------------------------
create or replace function public.create_event(p_slug text, p_groom text, p_bride text, p_date date, p_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if char_length(p_code) < 4 then raise exception 'code too short'; end if;
  insert into events(slug, groom, bride, wedding_date, admin_hash)
  values (lower(p_slug), p_groom, p_bride, p_date, crypt(p_code, gen_salt('bf')));
end $$;

create or replace function public.check_admin(p_slug text, p_code text)
returns boolean language sql security definer set search_path = public, extensions as $$
  select exists (select 1 from events where slug = p_slug and admin_hash = crypt(p_code, admin_hash));
$$;

create or replace function public.admin_list_photos(p_slug text, p_code text)
returns setof public.photos language plpgsql security definer set search_path = public, extensions as $$
begin
  if not check_admin(p_slug, p_code) then raise exception 'unauthorized'; end if;
  return query select * from photos where event_slug = p_slug order by created_at desc;
end $$;

create or replace function public.set_photo_hidden(p_slug text, p_code text, p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not check_admin(p_slug, p_code) then raise exception 'unauthorized'; end if;
  update photos set hidden = p_hidden where id = p_id and event_slug = p_slug;
end $$;

grant execute on function public.create_event, public.check_admin,
  public.admin_list_photos, public.set_photo_hidden to anon, authenticated;

-- 4) 사진 저장소 (공개 버킷, 50MB, 사진·영상만) --------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wedding-photos', 'wedding-photos', true, 52428800, array['image/*','video/*'])
on conflict (id) do update set public = true, file_size_limit = 52428800,
  allowed_mime_types = array['image/*','video/*'];

drop policy if exists "guests upload" on storage.objects;
create policy "guests upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'wedding-photos'
              and public.event_exists((storage.foldername(name))[1]));

-- 5) 실시간 (새 사진이 바로 뜨게) ---------------------------------
do $$ begin
  alter publication supabase_realtime add table public.photos;
exception when duplicate_object then null; end $$;

-- 6) 우리 결혼식 앨범 만들기 ---------------------------------------
--    '관리비밀번호'를 원하는 비밀번호로 바꾼 뒤 실행하세요.
--    'our-wedding'은 config.js의 EVENT_SLUG와 같아야 해요.
select public.create_event('our-wedding', '규동', '은주', '2026-12-06', '관리비밀번호');
