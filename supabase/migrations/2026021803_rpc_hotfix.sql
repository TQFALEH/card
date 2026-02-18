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
