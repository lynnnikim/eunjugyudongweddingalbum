-- 이미 supabase-setup.sql을 실행했다면 이 파일만 실행하세요 (좋아요 기능 추가)

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

drop policy if exists "guests add photo" on public.photos;
create policy "guests add photo" on public.photos
  for insert to anon, authenticated
  with check (hidden = false and like_count = 0 and path like event_slug || '/%'
              and public.event_exists(event_slug));
