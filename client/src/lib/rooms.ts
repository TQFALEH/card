import { supabase } from "./supabase";
import type { CanonicalState, Room, RoomPlayer, RoomStateRow } from "../types";

export async function createRoom(boardSize: string, theme: string) {
  const { data, error } = await supabase.rpc("create_room", { p_board_size: boardSize, p_theme: theme });
  if (error) throw error;
  return data as string;
}

export async function joinRoom(roomId: string) {
  const { error } = await supabase.rpc("join_room", { p_room_id: roomId });
  if (error) throw error;
}

export async function setReady(roomId: string, ready: boolean) {
  const { error } = await supabase.rpc("set_player_ready", { p_room_id: roomId, p_is_ready: ready });
  if (error) throw error;
}

export async function tryStart(roomId: string) {
  const { error } = await supabase.rpc("start_room_if_ready", { p_room_id: roomId });
  if (error) throw error;
}

export async function fetchRoom(roomId: string): Promise<Room | null> {
  const { data, error } = await supabase.from("rooms").select("*").eq("room_id", roomId).maybeSingle();
  if (error) throw error;
  return (data as Room | null) ?? null;
}

export async function fetchPlayers(roomId: string): Promise<RoomPlayer[]> {
  const { data, error } = await supabase
    .from("room_players")
    .select("room_id,user_id,is_ready,is_host,joined_at,profiles(user_id,username,avatar_url)")
    .eq("room_id", roomId)
    .order("joined_at");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...row, profile: row.profiles })) as RoomPlayer[];
}

export async function fetchState(roomId: string): Promise<RoomStateRow | null> {
  const { data, error } = await supabase.from("room_state").select("*").eq("room_id", roomId).maybeSingle();
  if (error) throw error;
  return (data as RoomStateRow | null) ?? null;
}

export async function flipCard(roomId: string, index: number, expectedVersion: number) {
  const { data, error } = await supabase.rpc("room_flip_card", {
    p_room_id: roomId,
    p_card_index: index,
    p_expected_version: expectedVersion
  });
  if (error) throw error;
  return data as { state_json: CanonicalState; version: number };
}

export async function resolvePending(roomId: string, expectedVersion: number) {
  const { data, error } = await supabase.rpc("resolve_pending", {
    p_room_id: roomId,
    p_expected_version: expectedVersion
  });
  if (error) throw error;
  return data as { state_json: CanonicalState; version: number };
}
