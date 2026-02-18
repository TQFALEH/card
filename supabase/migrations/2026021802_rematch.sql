create or replace function public.rematch_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_seed int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_room from public.rooms where room_id = p_room_id for update;
  if v_room.room_id is null then
    raise exception 'Room not found';
  end if;

  if not exists(select 1 from public.room_players where room_id = p_room_id and user_id = auth.uid()) then
    raise exception 'Not room member';
  end if;

  v_seed := floor(random() * 1000000)::int;

  update public.rooms
  set status = 'lobby', seed = v_seed
  where room_id = p_room_id;

  update public.room_players
  set is_ready = false
  where room_id = p_room_id;

  update public.room_state
  set state_json = '{}'::jsonb,
      version = version + 1,
      updated_at = now()
  where room_id = p_room_id;
end;
$$;

grant execute on function public.rematch_room(uuid) to authenticated;
