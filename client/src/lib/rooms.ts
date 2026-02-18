import { supabase } from "./supabase";
import type { CanonicalState, Room, RoomPlayer, RoomStateRow } from "../types";

function normalizeStateRpcResult(data: unknown): { state_json: CanonicalState; version: number } {
  if (Array.isArray(data)) {
    const row = data[0] as { state_json?: CanonicalState; version?: number } | undefined;
    if (!row?.state_json || typeof row.version !== "number") {
      throw new Error("Invalid room state response");
    }
    return { state_json: row.state_json, version: row.version };
  }

  const row = data as { state_json?: CanonicalState; version?: number } | null;
  if (!row?.state_json || typeof row.version !== "number") {
    throw new Error("Invalid room state response");
  }
  return { state_json: row.state_json, version: row.version };
}

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
    .select("room_id,user_id,is_ready,is_host,joined_at")
    .eq("room_id", roomId)
    .order("joined_at");
  if (error) throw error;

  const players = (data ?? []) as RoomPlayer[];
  const userIds = players.map((p) => p.user_id);
  if (!userIds.length) {
    return players;
  }

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("user_id,username,avatar_url")
    .in("user_id", userIds);

  const profileMap = new Map((profileRows ?? []).map((p: any) => [p.user_id, p]));
  return players.map((p) => ({ ...p, profile: profileMap.get(p.user_id) }));
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
  return normalizeStateRpcResult(data);
}

export async function resolvePending(roomId: string, expectedVersion: number) {
  const { data, error } = await supabase.rpc("resolve_pending", {
    p_room_id: roomId,
    p_expected_version: expectedVersion
  });
  if (error) throw error;
  return normalizeStateRpcResult(data);
}

export async function rematchRoom(roomId: string) {
  const { error } = await supabase.rpc("rematch_room", { p_room_id: roomId });
  if (error) throw error;
}
