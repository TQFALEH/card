-- Fix ambiguous output-column references in RPC functions.

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
  v_out_state jsonb;
  v_out_version int;
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

  update public.room_state rs
  set state_json = v_state,
      version = rs.version + 1,
      updated_at = now()
  where rs.room_id = p_room_id
  returning rs.state_json, rs.version into v_out_state, v_out_version;

  return query select v_out_state, v_out_version;
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
  v_out_state jsonb;
  v_out_version int;
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

  update public.room_state rs
  set state_json = v_state,
      version = rs.version + 1,
      updated_at = now()
  where rs.room_id = p_room_id
  returning rs.state_json, rs.version into v_out_state, v_out_version;

  return query select v_out_state, v_out_version;
end;
$$;

notify pgrst, 'reload schema';
