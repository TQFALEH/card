-- Friends + Invitations + Match History + Presence

create extension if not exists pgcrypto;

-- rooms private invite support
alter table if exists public.rooms
  add column if not exists is_private boolean not null default false,
  add column if not exists invited_user_id uuid references auth.users(id);

-- ensure username constraints
alter table if exists public.profiles
  alter column username set not null;
create unique index if not exists profiles_username_unique_idx on public.profiles (lower(username));

-- richer stats fields
alter table if exists public.stats
  add column if not exists streak_best int not null default 0,
  add column if not exists streak_current int not null default 0,
  add column if not exists avg_duration numeric(10,2) not null default 0;

-- Friends
create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending','accepted','rejected','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index if not exists friends_requester_addressee_uq on public.friends(requester_id, addressee_id);
create unique index if not exists friends_pair_unique_idx on public.friends(least(requester_id::text, addressee_id::text), greatest(requester_id::text, addressee_id::text));

-- Invitations
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending','accepted','rejected','expired','cancelled')) default 'pending',
  room_id uuid references public.rooms(room_id) on delete set null,
  board_size text not null default '6x6',
  theme text not null default 'neon',
  seed int,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);

create index if not exists invitations_to_user_status_idx on public.invitations(to_user_id, status);
create index if not exists invitations_from_user_status_idx on public.invitations(from_user_id, status);

-- Presence (durable status)
create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('online','offline','in_lobby','in_match')) default 'online',
  current_room_id uuid references public.rooms(room_id) on delete set null,
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Extend matches for full history
alter table if exists public.matches
  add column if not exists board_size text,
  add column if not exists theme text,
  add column if not exists duration_seconds int,
  add column if not exists moves_total int,
  add column if not exists accuracy_json jsonb not null default '{}'::jsonb,
  add column if not exists disconnects_json jsonb not null default '[]'::jsonb;

create unique index if not exists matches_room_id_unique_idx on public.matches(room_id);

-- update timestamp helper
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_friends_updated_at on public.friends;
create trigger trg_friends_updated_at before update on public.friends
for each row execute function public.touch_updated_at();

drop trigger if exists trg_invitations_updated_at on public.invitations;
create trigger trg_invitations_updated_at before update on public.invitations
for each row execute function public.touch_updated_at();

drop trigger if exists trg_user_presence_updated_at on public.user_presence;
create trigger trg_user_presence_updated_at before update on public.user_presence
for each row execute function public.touch_updated_at();

-- Helper: accepted friend check
create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friends f
    where ((f.requester_id = p_a and f.addressee_id = p_b)
       or  (f.requester_id = p_b and f.addressee_id = p_a))
      and f.status = 'accepted'
  );
$$;

grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- Presence upsert RPC
create or replace function public.set_presence(p_status text, p_room_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_status not in ('online','offline','in_lobby','in_match') then
    raise exception 'Invalid presence status';
  end if;

  insert into public.user_presence(user_id, status, current_room_id, last_seen)
  values (auth.uid(), p_status, p_room_id, now())
  on conflict (user_id)
  do update set status = excluded.status,
                current_room_id = excluded.current_room_id,
                last_seen = now(),
                updated_at = now();
end;
$$;

grant execute on function public.set_presence(text, uuid) to authenticated;

-- Friend request RPCs
create or replace function public.send_friend_request(p_username text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_row public.friends%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_target
  from public.profiles
  where lower(username) = lower(trim(p_username));

  if v_target is null then
    raise exception 'User not found';
  end if;

  if v_target = auth.uid() then
    raise exception 'Cannot add yourself';
  end if;

  select * into v_row
  from public.friends f
  where least(f.requester_id::text, f.addressee_id::text) = least(auth.uid()::text, v_target::text)
    and greatest(f.requester_id::text, f.addressee_id::text) = greatest(auth.uid()::text, v_target::text)
  limit 1;

  if v_row.id is not null then
    if v_row.status = 'accepted' then raise exception 'Already friends'; end if;
    if v_row.status = 'pending' then raise exception 'Request already pending'; end if;
    if v_row.status = 'blocked' then raise exception 'Cannot send request'; end if;

    update public.friends
    set requester_id = auth.uid(),
        addressee_id = v_target,
        status = 'pending',
        updated_at = now()
    where id = v_row.id
    returning id into v_id;

    return v_id;
  end if;

  insert into public.friends(requester_id, addressee_id, status)
  values (auth.uid(), v_target, 'pending')
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.send_friend_request(text) to authenticated;

create or replace function public.respond_friend_request(p_friend_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.friends%rowtype;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_row from public.friends where id = p_friend_id for update;
  if v_row.id is null then raise exception 'Request not found'; end if;

  if auth.uid() not in (v_row.requester_id, v_row.addressee_id) then
    raise exception 'Forbidden';
  end if;

  v_status := case lower(trim(p_action))
    when 'accept' then 'accepted'
    when 'reject' then 'rejected'
    when 'block' then 'blocked'
    else null
  end;

  if v_status is null then raise exception 'Invalid action'; end if;

  if v_status in ('accepted','rejected') and auth.uid() <> v_row.addressee_id then
    raise exception 'Only addressee can accept/reject';
  end if;

  update public.friends set status = v_status, updated_at = now() where id = p_friend_id;
end;
$$;

grant execute on function public.respond_friend_request(uuid, text) to authenticated;

create or replace function public.cancel_friend_request(p_friend_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.friends%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from public.friends where id = p_friend_id for update;
  if v_row.id is null then raise exception 'Request not found'; end if;
  if v_row.requester_id <> auth.uid() then raise exception 'Only requester can cancel'; end if;
  if v_row.status <> 'pending' then raise exception 'Only pending can be cancelled'; end if;
  update public.friends set status = 'rejected', updated_at = now() where id = p_friend_id;
end;
$$;

grant execute on function public.cancel_friend_request(uuid) to authenticated;

-- Invitation RPCs
create or replace function public.create_invitation(p_to_user_id uuid, p_board_size text, p_theme text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id uuid;
  v_busy text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_to_user_id = auth.uid() then raise exception 'Cannot invite yourself'; end if;

  if not public.are_friends(auth.uid(), p_to_user_id) then
    raise exception 'Invite only friends';
  end if;

  select status into v_busy from public.user_presence where user_id = p_to_user_id;
  if v_busy = 'in_match' then raise exception 'User is busy in a match'; end if;

  update public.invitations
  set status = 'expired', updated_at = now()
  where status = 'pending' and expires_at <= now();

  if exists (
    select 1 from public.invitations
    where from_user_id = auth.uid()
      and to_user_id = p_to_user_id
      and status = 'pending'
      and expires_at > now()
  ) then
    raise exception 'Pending invitation already exists';
  end if;

  insert into public.invitations(from_user_id, to_user_id, status, board_size, theme, seed, expires_at)
  values (auth.uid(), p_to_user_id, 'pending', coalesce(p_board_size, '6x6'), coalesce(p_theme, 'neon'), floor(random() * 1000000)::int, now() + interval '5 minutes')
  returning id into v_invite_id;

  return v_invite_id;
end;
$$;

grant execute on function public.create_invitation(uuid, text, text) to authenticated;

create or replace function public.respond_invitation(p_invite_id uuid, p_action text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invitations%rowtype;
  v_room_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_row from public.invitations where id = p_invite_id for update;
  if v_row.id is null then raise exception 'Invite not found'; end if;
  if v_row.to_user_id <> auth.uid() then raise exception 'Only receiver can respond'; end if;
  if v_row.status <> 'pending' then return v_row.room_id; end if;

  if v_row.expires_at <= now() then
    update public.invitations set status = 'expired', updated_at = now() where id = p_invite_id;
    raise exception 'Invite expired';
  end if;

  if lower(trim(p_action)) = 'reject' then
    update public.invitations set status = 'rejected', updated_at = now() where id = p_invite_id;
    return null;
  end if;

  if lower(trim(p_action)) <> 'accept' then
    raise exception 'Invalid action';
  end if;

  insert into public.rooms(host_id, status, board_size, theme, seed, is_private, invited_user_id)
  values (v_row.from_user_id, 'lobby', v_row.board_size, v_row.theme, coalesce(v_row.seed, floor(random() * 1000000)::int), true, v_row.to_user_id)
  returning room_id into v_room_id;

  insert into public.room_players(room_id, user_id, is_host, is_ready)
  values
    (v_room_id, v_row.from_user_id, true, false),
    (v_room_id, v_row.to_user_id, false, false)
  on conflict (room_id, user_id) do nothing;

  insert into public.room_state(room_id, state_json, version)
  values (v_room_id, '{}'::jsonb, 0)
  on conflict (room_id) do nothing;

  update public.invitations
  set status = 'accepted', room_id = v_room_id, updated_at = now()
  where id = p_invite_id;

  return v_room_id;
end;
$$;

grant execute on function public.respond_invitation(uuid, text) to authenticated;

create or replace function public.cancel_invitation(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from public.invitations where id = p_invite_id for update;
  if v_row.id is null then raise exception 'Invite not found'; end if;
  if v_row.from_user_id <> auth.uid() then raise exception 'Only sender can cancel'; end if;
  if v_row.status <> 'pending' then return; end if;
  update public.invitations set status = 'cancelled', updated_at = now() where id = p_invite_id;
end;
$$;

grant execute on function public.cancel_invitation(uuid) to authenticated;

create or replace function public.expire_invitations()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.invitations
  set status = 'expired', updated_at = now()
  where status = 'pending' and expires_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.expire_invitations() to authenticated;

-- Update join_room for private rooms
create or replace function public.join_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_status text;
  v_private boolean;
  v_invited uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select status, is_private, invited_user_id into v_status, v_private, v_invited
  from public.rooms
  where room_id = p_room_id;

  if v_status is null then raise exception 'Room not found'; end if;
  if v_status <> 'lobby' then raise exception 'Room already started'; end if;

  if coalesce(v_private, false)
     and auth.uid() <> (select host_id from public.rooms where room_id = p_room_id)
     and auth.uid() <> v_invited then
    raise exception 'Private room';
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

-- Match finalization + stats aggregation
create or replace function public.finalize_match(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_state public.room_state%rowtype;
  v_match_id uuid;
  v_players jsonb;
  v_scores jsonb;
  v_attempts int;
  v_duration int;
  v_started timestamptz;
  v_ended timestamptz;
  v_moves int;
  v_winner uuid;
  v_top int := -1;
  v_tie boolean := false;
  v_uid uuid;
  v_score int;
  v_games int;
  v_wins int;
  v_losses int;
  v_avg numeric;
  v_streak int;
begin
  select * into v_room from public.rooms where room_id = p_room_id for update;
  select * into v_state from public.room_state where room_id = p_room_id for update;

  if v_room.room_id is null or v_state.room_id is null then
    raise exception 'Room/state not found';
  end if;

  if coalesce(v_state.state_json->>'status','') <> 'ended' then
    raise exception 'Match not ended yet';
  end if;

  select match_id into v_match_id from public.matches where room_id = p_room_id;
  if v_match_id is not null then
    return v_match_id;
  end if;

  select jsonb_agg(jsonb_build_object(
    'user_id', rp.user_id,
    'username', coalesce(p.username, rp.user_id::text)
  ))
  into v_players
  from public.room_players rp
  left join public.profiles p on p.user_id = rp.user_id
  where rp.room_id = p_room_id
  order by rp.joined_at;

  v_scores := coalesce(v_state.state_json->'scores', '{}'::jsonb);
  v_attempts := coalesce((v_state.state_json->>'attempts')::int, 0);
  v_moves := coalesce((v_state.state_json->>'moves')::int, 0);
  v_started := (v_state.state_json->>'started_at')::timestamptz;
  v_ended := coalesce((v_state.state_json->>'ended_at')::timestamptz, now());
  v_duration := greatest(0, extract(epoch from (v_ended - v_started))::int);

  for v_uid in select rp.user_id from public.room_players rp where rp.room_id = p_room_id loop
    v_score := coalesce((v_scores->>(v_uid::text))::int, 0);
    if v_score > v_top then
      v_top := v_score;
      v_winner := v_uid;
      v_tie := false;
    elsif v_score = v_top then
      v_tie := true;
    end if;
  end loop;

  if v_tie then
    v_winner := null;
  end if;

  insert into public.matches(
    room_id,
    players_json,
    winner_id,
    scores_json,
    board_size,
    theme,
    started_at,
    ended_at,
    duration_seconds,
    moves_total,
    accuracy_json,
    disconnects_json
  ) values (
    p_room_id,
    coalesce(v_players, '[]'::jsonb),
    v_winner,
    v_scores,
    v_room.board_size,
    v_room.theme,
    v_started,
    v_ended,
    v_duration,
    v_moves,
    jsonb_build_object('attempts', v_attempts, 'matched_pairs', coalesce((v_state.state_json->>'matched_pairs')::int, 0)),
    '[]'::jsonb
  ) returning match_id into v_match_id;

  for v_uid in select rp.user_id from public.room_players rp where rp.room_id = p_room_id loop
    insert into public.stats(user_id) values (v_uid) on conflict (user_id) do nothing;

    select games_played, wins, losses, avg_duration, streak_current
    into v_games, v_wins, v_losses, v_avg, v_streak
    from public.stats
    where user_id = v_uid
    for update;

    v_games := coalesce(v_games, 0) + 1;
    if v_winner is not null and v_uid = v_winner then
      v_wins := coalesce(v_wins, 0) + 1;
      v_streak := coalesce(v_streak, 0) + 1;
    else
      v_losses := coalesce(v_losses, 0) + case when v_winner is null then 0 else 1 end;
      v_streak := case when v_winner is null then coalesce(v_streak, 0) else 0 end;
    end if;

    v_avg := ((coalesce(v_avg, 0) * (v_games - 1)) + v_duration)::numeric / v_games;

    update public.stats
    set games_played = v_games,
        wins = coalesce(v_wins, 0),
        losses = coalesce(v_losses, 0),
        win_rate = case when v_games = 0 then 0 else round((coalesce(v_wins,0)::numeric / v_games) * 100, 2) end,
        streak_current = v_streak,
        streak_best = greatest(coalesce(streak_best,0), v_streak),
        avg_duration = round(v_avg, 2),
        updated_at = now()
    where user_id = v_uid;
  end loop;

  return v_match_id;
end;
$$;

grant execute on function public.finalize_match(uuid) to authenticated;

-- RLS
alter table public.friends enable row level security;
alter table public.invitations enable row level security;
alter table public.user_presence enable row level security;

-- profiles: readable auth users, writable owner
alter table public.profiles enable row level security;
drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "profiles self write" on public.profiles;
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "profiles self write" on public.profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- friends
create policy "friends read involved" on public.friends
for select to authenticated
using (auth.uid() in (requester_id, addressee_id));

create policy "friends insert requester" on public.friends
for insert to authenticated
with check (requester_id = auth.uid() and status = 'pending');

create policy "friends update involved" on public.friends
for update to authenticated
using (auth.uid() in (requester_id, addressee_id))
with check (auth.uid() in (requester_id, addressee_id));

-- invitations
create policy "invites read involved" on public.invitations
for select to authenticated
using (auth.uid() in (from_user_id, to_user_id));

create policy "invites insert sender" on public.invitations
for insert to authenticated
with check (from_user_id = auth.uid());

create policy "invites update involved" on public.invitations
for update to authenticated
using (auth.uid() in (from_user_id, to_user_id))
with check (auth.uid() in (from_user_id, to_user_id));

-- user presence
create policy "presence read auth" on public.user_presence
for select to authenticated
using (true);

create policy "presence write self" on public.user_presence
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- matches readable only by players
alter table public.matches enable row level security;
drop policy if exists "matches member read" on public.matches;
create policy "matches member read" on public.matches
for select to authenticated
using (
  exists (
    select 1
    from jsonb_array_elements(players_json) p
    where (p->>'user_id')::uuid = auth.uid()
  )
);

-- stats self read
alter table public.stats enable row level security;
drop policy if exists "stats self read" on public.stats;
create policy "stats self read" on public.stats for select to authenticated using (auth.uid() = user_id);

-- Realtime channel policies for invites/friends and presence
alter table realtime.messages enable row level security;

drop policy if exists "invites channel read own" on realtime.messages;
create policy "invites channel read own"
on realtime.messages
for select
using (
  realtime.topic() ~ '^invites:[0-9a-fA-F-]{36}$'
  and split_part(realtime.topic(), ':', 2)::uuid = auth.uid()
);

drop policy if exists "invites channel send auth" on realtime.messages;
create policy "invites channel send auth"
on realtime.messages
for insert
to authenticated
with check (realtime.topic() ~ '^invites:[0-9a-fA-F-]{36}$');

drop policy if exists "friends channel read own" on realtime.messages;
create policy "friends channel read own"
on realtime.messages
for select
using (
  realtime.topic() ~ '^friends:[0-9a-fA-F-]{36}$'
  and split_part(realtime.topic(), ':', 2)::uuid = auth.uid()
);

drop policy if exists "friends channel send auth" on realtime.messages;
create policy "friends channel send auth"
on realtime.messages
for insert
to authenticated
with check (realtime.topic() ~ '^friends:[0-9a-fA-F-]{36}$');

drop policy if exists "global presence read" on realtime.messages;
create policy "global presence read"
on realtime.messages
for select
using (realtime.topic() = 'presence:global');

drop policy if exists "global presence send" on realtime.messages;
create policy "global presence send"
on realtime.messages
for insert to authenticated
with check (realtime.topic() = 'presence:global');

notify pgrst, 'reload schema';
