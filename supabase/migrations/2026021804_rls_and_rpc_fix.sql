-- Ensure baseline config rows exist
insert into public.board_sizes (id, label, rows, cols, is_active, sort_order)
values
  ('4x4', 'Recruit', 4, 4, true, 1),
  ('6x6', 'Veteran', 6, 6, true, 2),
  ('8x8', 'Elite', 8, 8, true, 3)
on conflict (id) do update set label = excluded.label, rows = excluded.rows, cols = excluded.cols, is_active = excluded.is_active, sort_order = excluded.sort_order;

insert into public.themes (id, name, is_active, config_json)
values
  ('neon', 'Neon', true, '{"accent":"#29d8ff","panel":"#041f2b"}'::jsonb)
on conflict (id) do update set name = excluded.name, is_active = excluded.is_active, config_json = excluded.config_json;

-- Membership helper to avoid recursive RLS policies
create or replace function public.is_room_member(p_room_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.room_players rp
    where rp.room_id = p_room_id
      and rp.user_id = p_user_id
  );
$$;

grant execute on function public.is_room_member(uuid, uuid) to authenticated, anon;

-- Recreate room-related policies safely
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_state enable row level security;
alter table public.matches enable row level security;

drop policy if exists "rooms member read" on public.rooms;
drop policy if exists "rooms host insert" on public.rooms;
create policy "rooms member read" on public.rooms for select to authenticated using (public.is_room_member(room_id, auth.uid()));
create policy "rooms host insert" on public.rooms for insert to authenticated with check (host_id = auth.uid());

drop policy if exists "room players member read" on public.room_players;
drop policy if exists "room players self insert" on public.room_players;
drop policy if exists "room players self update" on public.room_players;
create policy "room players member read" on public.room_players for select to authenticated using (public.is_room_member(room_id, auth.uid()));
create policy "room players self insert" on public.room_players for insert to authenticated with check (user_id = auth.uid());
create policy "room players self update" on public.room_players for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "room state member read" on public.room_state;
drop policy if exists "room state member update" on public.room_state;
create policy "room state member read" on public.room_state for select to authenticated using (public.is_room_member(room_id, auth.uid()));
create policy "room state member update" on public.room_state for update to authenticated using (public.is_room_member(room_id, auth.uid()));

drop policy if exists "matches member insert" on public.matches;
drop policy if exists "matches member read" on public.matches;
create policy "matches member insert" on public.matches for insert to authenticated with check (public.is_room_member(room_id, auth.uid()));
create policy "matches member read" on public.matches for select to authenticated using (public.is_room_member(room_id, auth.uid()));

-- Ensure profile/stats policies are present
alter table public.profiles enable row level security;
alter table public.stats enable row level security;
drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "profiles self write" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "profiles self write" on public.profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "stats self read" on public.stats;
create policy "stats self read" on public.stats for select to authenticated using (auth.uid() = user_id);

-- Realtime topic policies (idempotent)
alter table realtime.messages enable row level security;
drop policy if exists "room members receive realtime" on realtime.messages;
drop policy if exists "room members send realtime" on realtime.messages;
create policy "room members receive realtime"
on realtime.messages
for select
using (
  realtime.topic() ~ '^room:[0-9a-fA-F-]{36}$'
  and public.is_room_member(split_part(realtime.topic(), ':', 2)::uuid, auth.uid())
);

create policy "room members send realtime"
on realtime.messages
for insert
with check (
  realtime.topic() ~ '^room:[0-9a-fA-F-]{36}$'
  and public.is_room_member(split_part(realtime.topic(), ':', 2)::uuid, auth.uid())
);

-- Ensure create_room validates config and always initializes room_state
create or replace function public.create_room(p_board_size text, p_theme text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_seed int;
  v_board text;
  v_theme text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_board from public.board_sizes where id = p_board_size and is_active = true;
  if v_board is null then
    v_board := '6x6';
  end if;

  select id into v_theme from public.themes where id = p_theme and is_active = true;
  if v_theme is null then
    v_theme := 'neon';
  end if;

  v_seed := floor(random() * 1000000)::int;

  insert into public.rooms (host_id, status, board_size, theme, seed)
  values (auth.uid(), 'lobby', v_board, v_theme, v_seed)
  returning room_id into v_room_id;

  insert into public.room_players (room_id, user_id, is_host, is_ready)
  values (v_room_id, auth.uid(), true, false)
  on conflict (room_id, user_id) do nothing;

  insert into public.room_state (room_id, state_json, version)
  values (v_room_id, '{}'::jsonb, 0)
  on conflict (room_id) do update set updated_at = now();

  return v_room_id;
end;
$$;

grant execute on function public.create_room(text, text) to authenticated;

notify pgrst, 'reload schema';
