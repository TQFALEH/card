-- Allow host to update board/theme while room is in lobby.

create or replace function public.update_room_settings(p_room_id uuid, p_board_size text, p_theme text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_board text;
  v_theme text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_room from public.rooms where room_id = p_room_id for update;
  if v_room.room_id is null then
    raise exception 'Room not found';
  end if;

  if v_room.host_id <> auth.uid() then
    raise exception 'Only host can edit settings';
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'Room already started';
  end if;

  select id into v_board from public.board_sizes where id = p_board_size and is_active = true;
  if v_board is null then
    raise exception 'Invalid board size';
  end if;

  select id into v_theme from public.themes where id = p_theme and is_active = true;
  if v_theme is null then
    raise exception 'Invalid theme';
  end if;

  update public.rooms
  set board_size = v_board,
      theme = v_theme,
      seed = floor(random() * 1000000)::int
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

grant execute on function public.update_room_settings(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
