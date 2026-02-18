-- Full RPC fix to guarantee online gameplay functions exist and are valid.

create or replace function public.patch_card(cards jsonb, idx int, patch jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_set(cards, array[idx::text], coalesce(cards->idx, '{}'::jsonb) || patch, false);
$$;

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
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select status into v_status from public.rooms where room_id = p_room_id;
  if v_status is null then raise exception 'Room not found'; end if;
  if v_status <> 'lobby' then raise exception 'Room already started'; end if;

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
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  update public.room_players
  set is_ready = p_is_ready
  where room_id = p_room_id and user_id = auth.uid();

  if not found then raise exception 'Not in room'; end if;
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
  if v_room.room_id is null then raise exception 'Room not found'; end if;
  if v_room.status <> 'lobby' then return; end if;

  select count(*), count(*) filter (where is_ready) into v_total, v_ready
  from public.room_players where room_id = p_room_id;

  if v_total <> 2 or v_ready <> 2 then return; end if;

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
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_room_member(p_room_id, auth.uid()) then raise exception 'Not room member'; end if;

  select * into v_row from public.room_state where room_id = p_room_id for update;
  if v_row.room_id is null then raise exception 'State not found'; end if;
  if v_row.version <> p_expected_version then raise exception 'Version conflict'; end if;

  v_state := v_row.state_json;
  if coalesce(v_state->>'status', '') <> 'playing' then raise exception 'Match not active'; end if;
  if coalesce((v_state->>'input_locked')::boolean, false) then raise exception 'Input locked'; end if;
  if v_state->>'current_player' <> auth.uid()::text then raise exception 'Not your turn'; end if;

  v_cards := v_state->'cards';
  if (v_cards->p_card_index->>'state') <> 'hidden' then raise exception 'Card not available'; end if;

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
begin
  select * into v_row from public.room_state where room_id = p_room_id for update;
  if v_row.room_id is null then raise exception 'State not found'; end if;
  if v_row.version <> p_expected_version then raise exception 'Version conflict'; end if;

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

grant execute on function public.join_room(uuid) to authenticated;
grant execute on function public.set_player_ready(uuid, boolean) to authenticated;
grant execute on function public.start_room_if_ready(uuid) to authenticated;
grant execute on function public.room_flip_card(uuid, int, int) to authenticated;
grant execute on function public.resolve_pending(uuid, int) to authenticated;

notify pgrst, 'reload schema';
