import { supabase } from "./supabase";
import type { FriendRelation, Invitation, MatchRow, Profile } from "../types";

export async function setPresence(status: "online" | "offline" | "in_lobby" | "in_match", roomId: string | null = null) {
  const { error } = await supabase.rpc("set_presence", { p_status: status, p_room_id: roomId });
  if (error) throw error;
}

export async function sendFriendRequest(username: string) {
  const { data, error } = await supabase.rpc("send_friend_request", { p_username: username });
  if (error) throw error;
  return data as string;
}

export async function respondFriendRequest(friendId: string, action: "accept" | "reject" | "block") {
  const { error } = await supabase.rpc("respond_friend_request", { p_friend_id: friendId, p_action: action });
  if (error) throw error;
}

export async function cancelFriendRequest(friendId: string) {
  const { error } = await supabase.rpc("cancel_friend_request", { p_friend_id: friendId });
  if (error) throw error;
}

export async function listFriendRelations(userId: string) {
  const { data, error } = await supabase
    .from("friends")
    .select("id,requester_id,addressee_id,status,created_at,updated_at")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FriendRelation[];
}

export async function fetchProfiles(userIds: string[]) {
  if (!userIds.length) return new Map<string, Profile>();
  const { data, error } = await supabase.from("profiles").select("user_id,username,avatar_url").in("user_id", userIds);
  if (error) throw error;
  return new Map((data ?? []).map((row: any) => [row.user_id, row as Profile]));
}

export async function createInvitation(toUserId: string, boardSize: string, theme: string) {
  const { data, error } = await supabase.rpc("create_invitation", {
    p_to_user_id: toUserId,
    p_board_size: boardSize,
    p_theme: theme
  });
  if (error) throw error;
  return data as string;
}

export async function respondInvitation(inviteId: string, action: "accept" | "reject") {
  const { data, error } = await supabase.rpc("respond_invitation", { p_invite_id: inviteId, p_action: action });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function cancelInvitation(inviteId: string) {
  const { error } = await supabase.rpc("cancel_invitation", { p_invite_id: inviteId });
  if (error) throw error;
}

export async function expireInvitations() {
  await supabase.rpc("expire_invitations");
}

export async function listPendingInvitesForUser(userId: string) {
  const { data, error } = await supabase
    .from("invitations")
    .select("id,from_user_id,to_user_id,status,room_id,board_size,theme,seed,expires_at,created_at,updated_at")
    .eq("to_user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Invitation[];
}

export async function listOutgoingInvites(userId: string) {
  const { data, error } = await supabase
    .from("invitations")
    .select("id,from_user_id,to_user_id,status,room_id,board_size,theme,seed,expires_at,created_at,updated_at")
    .eq("from_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as Invitation[];
}

export async function finalizeMatch(roomId: string) {
  const { data, error } = await supabase.rpc("finalize_match", { p_room_id: roomId });
  if (error) throw error;
  return data as string;
}

export async function listMyMatches(userId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select("match_id,room_id,players_json,winner_id,board_size,theme,started_at,ended_at,duration_seconds,scores_json,moves_total,accuracy_json,disconnects_json")
    .contains("players_json", [{ user_id: userId }])
    .order("ended_at", { ascending: false })
    .limit(100);

  if (error) {
    const { data: fallback, error: fallbackError } = await supabase
      .from("matches")
      .select("match_id,room_id,players_json,winner_id,board_size,theme,started_at,ended_at,duration_seconds,scores_json,moves_total,accuracy_json,disconnects_json")
      .order("ended_at", { ascending: false })
      .limit(100);
    if (fallbackError) throw fallbackError;
    return ((fallback ?? []) as MatchRow[]).filter((m) => (m.players_json ?? []).some((p) => p.user_id === userId));
  }

  return (data ?? []) as MatchRow[];
}

export async function getMatchById(matchId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select("match_id,room_id,players_json,winner_id,board_size,theme,started_at,ended_at,duration_seconds,scores_json,moves_total,accuracy_json,disconnects_json")
    .eq("match_id", matchId)
    .maybeSingle();
  if (error) throw error;
  return (data as MatchRow | null) ?? null;
}

export async function listPresence(userIds: string[]) {
  if (!userIds.length) return new Map<string, { status: string; current_room_id: string | null; last_seen: string }>();
  const { data, error } = await supabase
    .from("user_presence")
    .select("user_id,status,current_room_id,last_seen")
    .in("user_id", userIds);
  if (error) throw error;
  return new Map((data ?? []).map((row: any) => [row.user_id, row]));
}
