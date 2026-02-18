-- Extensions
create extension if not exists pgcrypto;

-- Profiles and stats
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  games_played int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  win_rate numeric(5,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- Backend-driven config
create table if not exists public.board_sizes (
  id text primary key,
  label text not null,
  rows int not null,
  cols int not null,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.themes (
  id text primary key,
  name text not null,
  is_active boolean not null default true,
  config_json jsonb not null default '{}'::jsonb
);

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

-- Room system
create table if not exists public.rooms (
  room_id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('lobby', 'playing', 'ended')) default 'lobby',
  board_size text not null references public.board_sizes(id),
  theme text not null references public.themes(id),
  seed int,
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  room_id uuid not null references public.rooms(room_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  is_ready boolean not null default false,
  is_host boolean not null default false,
  primary key (room_id, user_id)
);

create table if not exists public.room_state (
  room_id uuid primary key references public.rooms(room_id) on delete cascade,
  state_json jsonb not null,
  version int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  match_id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(room_id) on delete cascade,
  players_json jsonb not null,
  winner_id uuid,
  scores_json jsonb not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Trigger to auto-profile
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'player_' || substr(new.id::text, 1, 6))
  )
  on conflict (user_id) do nothing;

  insert into public.stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

-- Helper: patch one card in json array
create or replace function public.patch_card(cards jsonb, idx int, patch jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_set(cards, array[idx::text], coalesce(cards->idx, '{}'::jsonb) || patch, false);
$$;

-- Build initial canonical game state
create or replace function public.build_initial_state(p_room_id uuid, p_board_size text, p_seed int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
  v_cols int;
  v_total_pairs int;
  v_icons text[] := array[
    'star','rocket','heart','sun','moon','flame','leaf','feather','gem','atom','crown','cloud','waves','mountain','trees','flower','zap','sparkles','cherry','camera','anchor','compass','diamond','trophy','hexagon','bell','bomb','swords','wheat','bot','orbit','fish'
  ];
  v_tints text[] := array['#00e7ff','#7cfb7f','#ffd56f','#ff8fab','#72a5ff','#c495ff','#6fffe9','#f7a072'];
  v_cards jsonb;
  v_players jsonb;
  v_scores jsonb;
  v_current_player uuid;
begin
  select rows, cols into v_rows, v_cols from public.board_sizes where id = p_board_size and is_active = true;
  if v_rows is null then
    raise exception 'Invalid board size';
  end if;

  v_total_pairs := (v_rows * v_cols) / 2;

  select jsonb_agg(
    jsonb_build_object(
      'index', idx,
      'pair_id', pair_id,
      'icon_id', split_part(pair_id, '-', 1),
      'tint', tint,
      'state', 'hidden',
      'owner', null
    )
    order by idx
  )
  into v_cards
  from (
    select row_number() over (order by md5((p_seed::text || '-' || gs::text || '-' || pair_id))) - 1 as idx,
           pair_id,
           tint
    from (
      select ((v_icons[((g-1) % array_length(v_icons,1)) + 1]) || '-' || ((g-1) / array_length(v_icons,1))) as pair_id,
             v_tints[((g-1) % array_length(v_tints,1)) + 1] as tint
      from generate_series(1, v_total_pairs) g
    ) pairs
    cross join generate_series(1,2) gs
  ) shuffled;

  select jsonb_agg(user_id order by joined_at),
         jsonb_object_agg(user_id::text, 0)
  into v_players, v_scores
  from public.room_players
  where room_id = p_room_id;

  v_current_player := (v_players->>0)::uuid;

  return jsonb_build_object(
    'board_size', p_board_size,
    'rows', v_rows,
    'cols', v_cols,
    'cards', v_cards,
    'selected', '[]'::jsonb,
    'current_player', v_current_player,
    'scores', v_scores,
    'input_locked', false,
    'pending', null,
    'matched_pairs', 0,
    'total_pairs', v_total_pairs,
    'attempts', 0,
    'moves', 0,
    'status', 'playing',
    'started_at', now(),
    'ended_at', null
  );
end;
$$;

create or replace function public.create_room(p_board_size text, p_theme text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_seed int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_seed := floor(random() * 1000000)::int;

  insert into public.rooms (host_id, status, board_size, theme, seed)
  values (auth.uid(), 'lobby', p_board_size, p_theme, v_seed)
  returning room_id into v_room_id;

  insert into public.room_players (room_id, user_id, is_host, is_ready)
  values (v_room_id, auth.uid(), true, false);

  insert into public.room_state (room_id, state_json, version)
  values (v_room_id, '{}'::jsonb, 0);

  return v_room_id;
end;
$$;

create or replace function public.join_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select status into v_status from public.rooms where room_id = p_room_id;
  if v_status is null then
    raise exception 'Room not found';
  end if;

  if v_status <> 'lobby' then
    raise exception 'Room already started';
  end if;

  select count(*) into v_count from public.room_players where room_id = p_room_id;
  if v_count >= 2 and not exists(select 1 from public.room_players where room_id = p_room_id and user_id = auth.uid()) then
    raise exception 'Room full';
  end if;

  insert into public.room_players (room_id, user_id, is_host, is_ready)
  values (p_room_id, auth.uid(), false, false)
  on conflict (room_id, user_id)
  do update set joined_at = now();
end;
$$;

create or replace function public.set_player_ready(p_room_id uuid, p_is_ready boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.room_players
  set is_ready = p_is_ready
  where room_id = p_room_id and user_id = auth.uid();

  if not found then
    raise exception 'Not in room';
  end if;
end;
$$;

create or replace function public.start_room_if_ready(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_total int;
  v_ready int;
  v_state jsonb;
begin
  select * into v_room from public.rooms where room_id = p_room_id for update;
  if v_room.room_id is null then
    raise exception 'Room not found';
  end if;

  if v_room.status <> 'lobby' then
    return;
  end if;

  select count(*), count(*) filter (where is_ready) into v_total, v_ready
  from public.room_players
  where room_id = p_room_id;

  if v_total <> 2 or v_ready <> 2 then
    return;
  end if;

  v_state := public.build_initial_state(p_room_id, v_room.board_size, coalesce(v_room.seed, 1));

  update public.rooms set status = 'playing' where room_id = p_room_id;
  update public.room_state set state_json = v_state, version = version + 1, updated_at = now() where room_id = p_room_id;
  update public.room_players set is_ready = false where room_id = p_room_id;
end;
$$;

create or replace function public.room_flip_card(p_room_id uuid, p_card_index int, p_expected_version int)
returns table(state_json jsonb, version int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.room_state%rowtype;
  v_state jsonb;
  v_cards jsonb;
  v_selected int[];
  v_new_selected int[];
  a int;
  b int;
  v_pair_a text;
  v_pair_b text;
  v_actor text;
  v_scores jsonb;
  v_moved int;
  v_attempts int;
  v_match bool;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists(select 1 from public.room_players where room_id = p_room_id and user_id = auth.uid()) then
    raise exception 'Not room member';
  end if;

  select * into v_row from public.room_state where room_id = p_room_id for update;
  if v_row.room_id is null then
    raise exception 'State not found';
  end if;

  if v_row.version <> p_expected_version then
    raise exception 'Version conflict';
  end if;

  v_state := v_row.state_json;

  if coalesce(v_state->>'status', '') <> 'playing' then
    raise exception 'Match not active';
  end if;

  if coalesce((v_state->>'input_locked')::boolean, false) then
    raise exception 'Input locked';
  end if;

  if v_state->>'current_player' <> auth.uid()::text then
    raise exception 'Not your turn';
  end if;

  v_cards := v_state->'cards';
  if (v_cards->p_card_index->>'state') <> 'hidden' then
    raise exception 'Card not available';
  end if;

  v_cards := public.patch_card(v_cards, p_card_index, '{"state":"revealed"}'::jsonb);

  select array_agg((x)::int) into v_selected
  from jsonb_array_elements_text(coalesce(v_state->'selected', '[]'::jsonb)) as t(x);

  v_new_selected := coalesce(v_selected, '{}'::int[]) || p_card_index;

  v_state := jsonb_set(v_state, '{cards}', v_cards, true);
  v_state := jsonb_set(v_state, '{selected}', to_jsonb(v_new_selected), true);

  if array_length(v_new_selected, 1) = 2 then
    a := v_new_selected[1];
    b := v_new_selected[2];
    v_pair_a := v_cards->a->>'pair_id';
    v_pair_b := v_cards->b->>'pair_id';
    v_scores := coalesce(v_state->'scores', '{}'::jsonb);
    v_actor := auth.uid()::text;
    v_moved := coalesce((v_state->>'moves')::int, 0) + 1;
    v_attempts := coalesce((v_state->>'attempts')::int, 0) + 1;
    v_match := v_pair_a = v_pair_b;

    if v_match then
      v_cards := public.patch_card(v_cards, a, jsonb_build_object('state', 'matched', 'owner', v_actor));
      v_cards := public.patch_card(v_cards, b, jsonb_build_object('state', 'matched', 'owner', v_actor));
      v_scores := jsonb_set(v_scores, array[v_actor], to_jsonb(coalesce((v_scores->>v_actor)::int, 0) + 1), true);

      v_state := jsonb_set(v_state, '{cards}', v_cards, true);
      v_state := jsonb_set(v_state, '{scores}', v_scores, true);
      v_state := jsonb_set(v_state, '{selected}', '[]'::jsonb, true);
      v_state := jsonb_set(v_state, '{pending}', jsonb_build_object('type', 'match', 'indices', to_jsonb(array[a,b]), 'resolve_after', (now() + interval '350 milliseconds')), true);
      v_state := jsonb_set(v_state, '{matched_pairs}', to_jsonb(coalesce((v_state->>'matched_pairs')::int, 0) + 1), true);
    else
      v_state := jsonb_set(v_state, '{pending}', jsonb_build_object('type', 'mismatch', 'indices', to_jsonb(array[a,b]), 'resolve_after', (now() + interval '1000 milliseconds')), true);
    end if;

    v_state := jsonb_set(v_state, '{moves}', to_jsonb(v_moved), true);
    v_state := jsonb_set(v_state, '{attempts}', to_jsonb(v_attempts), true);
    v_state := jsonb_set(v_state, '{input_locked}', 'true'::jsonb, true);
  end if;

  update public.room_state
  set state_json = v_state,
      version = version + 1,
      updated_at = now()
  where room_id = p_room_id
  returning state_json, version into state_json, version;

  return next;
end;
$$;

create or replace function public.resolve_pending(p_room_id uuid, p_expected_version int)
returns table(state_json jsonb, version int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.room_state%rowtype;
  v_state jsonb;
  v_pending jsonb;
  v_type text;
  idx_a int;
  idx_b int;
  v_cards jsonb;
  v_players uuid[];
  v_curr uuid;
  v_next uuid;
  v_total int;
  v_matched int;
  v_scores jsonb;
  v_max int;
  v_winner uuid;
  v_user uuid;
  v_value int;
begin
  select * into v_row from public.room_state where room_id = p_room_id for update;
  if v_row.room_id is null then
    raise exception 'State not found';
  end if;

  if v_row.version <> p_expected_version then
    raise exception 'Version conflict';
  end if;

  v_state := v_row.state_json;
  v_pending := v_state->'pending';

  if v_pending is null then
    return query select v_row.state_json, v_row.version;
    return;
  end if;

  if (v_pending->>'resolve_after')::timestamptz > now() then
    return query select v_row.state_json, v_row.version;
    return;
  end if;

  v_cards := v_state->'cards';
  v_type := v_pending->>'type';
  idx_a := (v_pending->'indices'->>0)::int;
  idx_b := (v_pending->'indices'->>1)::int;

  if v_type = 'mismatch' then
    v_cards := public.patch_card(v_cards, idx_a, '{"state":"hidden"}'::jsonb - 'owner');
    v_cards := public.patch_card(v_cards, idx_b, '{"state":"hidden"}'::jsonb - 'owner');

    select array_agg(user_id order by joined_at) into v_players from public.room_players where room_id = p_room_id;
    v_curr := (v_state->>'current_player')::uuid;
    if array_length(v_players, 1) = 2 then
      if v_players[1] = v_curr then v_next := v_players[2]; else v_next := v_players[1]; end if;
      v_state := jsonb_set(v_state, '{current_player}', to_jsonb(v_next), true);
    end if;
  end if;

  v_state := jsonb_set(v_state, '{cards}', v_cards, true);
  v_state := jsonb_set(v_state, '{pending}', 'null'::jsonb, true);
  v_state := jsonb_set(v_state, '{input_locked}', 'false'::jsonb, true);
  v_state := jsonb_set(v_state, '{selected}', '[]'::jsonb, true);

  v_total := coalesce((v_state->>'total_pairs')::int, 0);
  v_matched := coalesce((v_state->>'matched_pairs')::int, 0);

  if v_total > 0 and v_matched = v_total then
    v_state := jsonb_set(v_state, '{status}', '"ended"'::jsonb, true);
    v_state := jsonb_set(v_state, '{ended_at}', to_jsonb(now()), true);
    update public.rooms set status = 'ended' where room_id = p_room_id;

    v_scores := coalesce(v_state->'scores', '{}'::jsonb);
    v_max := null;
    v_winner := null;

    for v_user, v_value in
      select key::uuid, value::int from jsonb_each_text(v_scores)
    loop
      if v_max is null or v_value > v_max then
        v_max := v_value;
        v_winner := v_user;
      elsif v_value = v_max then
        v_winner := null;
      end if;
    end loop;

    insert into public.matches (room_id, players_json, winner_id, scores_json, started_at, ended_at)
    values (
      p_room_id,
      (select jsonb_agg(user_id order by joined_at) from public.room_players where room_id = p_room_id),
      v_winner,
      v_scores,
      coalesce((v_state->>'started_at')::timestamptz, now()),
      now()
    );

    for v_user in
      select user_id from public.room_players where room_id = p_room_id
    loop
      update public.stats
      set games_played = games_played + 1,
          wins = wins + case when v_winner is not null and v_user = v_winner then 1 else 0 end,
          losses = losses + case when v_winner is not null and v_user <> v_winner then 1 else 0 end,
          win_rate = case when games_played + 1 = 0 then 0 else round(((wins + case when v_winner is not null and v_user = v_winner then 1 else 0 end)::numeric / (games_played + 1)::numeric) * 100, 2) end,
          updated_at = now()
      where user_id = v_user;
    end loop;
  end if;

  update public.room_state
  set state_json = v_state,
      version = version + 1,
      updated_at = now()
  where room_id = p_room_id
  returning state_json, version into state_json, version;

  return next;
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.stats enable row level security;
alter table public.board_sizes enable row level security;
alter table public.themes enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_state enable row level security;
alter table public.matches enable row level security;

create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "profiles self write" on public.profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "stats self read" on public.stats for select to authenticated using (auth.uid() = user_id);

create policy "board sizes public read" on public.board_sizes for select to anon, authenticated using (is_active = true);
create policy "themes public read" on public.themes for select to anon, authenticated using (is_active = true);

create policy "rooms member read" on public.rooms for select to authenticated using (
  exists(select 1 from public.room_players rp where rp.room_id = rooms.room_id and rp.user_id = auth.uid())
);
create policy "rooms host insert" on public.rooms for insert to authenticated with check (host_id = auth.uid());

create policy "room players member read" on public.room_players for select to authenticated using (
  exists(select 1 from public.room_players rp where rp.room_id = room_players.room_id and rp.user_id = auth.uid())
);
create policy "room players self insert" on public.room_players for insert to authenticated with check (user_id = auth.uid());
create policy "room players self update" on public.room_players for update to authenticated using (user_id = auth.uid());

create policy "room state member read" on public.room_state for select to authenticated using (
  exists(select 1 from public.room_players rp where rp.room_id = room_state.room_id and rp.user_id = auth.uid())
);
create policy "room state member update" on public.room_state for update to authenticated using (
  exists(select 1 from public.room_players rp where rp.room_id = room_state.room_id and rp.user_id = auth.uid())
);

create policy "matches member insert" on public.matches for insert to authenticated with check (
  exists(select 1 from public.room_players rp where rp.room_id = matches.room_id and rp.user_id = auth.uid())
);
create policy "matches member read" on public.matches for select to authenticated using (
  exists(select 1 from public.room_players rp where rp.room_id = matches.room_id and rp.user_id = auth.uid())
);

-- Realtime channel authorization (room members only)
alter table realtime.messages enable row level security;

create policy "room members receive realtime"
on realtime.messages
for select
using (
  realtime.topic() ~ '^room:[0-9a-fA-F-]{36}$'
  and exists (
    select 1 from public.room_players rp
    where rp.room_id = split_part(realtime.topic(), ':', 2)::uuid
      and rp.user_id = auth.uid()
  )
);

create policy "room members send realtime"
on realtime.messages
for insert
with check (
  realtime.topic() ~ '^room:[0-9a-fA-F-]{36}$'
  and exists (
    select 1 from public.room_players rp
    where rp.room_id = split_part(realtime.topic(), ':', 2)::uuid
      and rp.user_id = auth.uid()
  )
);

-- Grants
grant usage on schema public to authenticated, anon;
grant select on public.board_sizes, public.themes to authenticated, anon;
grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room(uuid) to authenticated;
grant execute on function public.set_player_ready(uuid, boolean) to authenticated;
grant execute on function public.start_room_if_ready(uuid) to authenticated;
grant execute on function public.room_flip_card(uuid, int, int) to authenticated;
grant execute on function public.resolve_pending(uuid, int) to authenticated;
