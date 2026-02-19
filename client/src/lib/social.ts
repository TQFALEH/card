import { supabase } from "./supabase";
import type { FriendRelation, Invitation, MatchRow, Profile } from "../types";
import type { User } from "@supabase/supabase-js";

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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeMatchRow(row: any): MatchRow {
  const playersRaw = Array.isArray(row?.players_json) ? row.players_json : [];
  const players_json = playersRaw.map((entry: any) => {
    if (typeof entry === "string") {
      return { user_id: entry, username: entry.slice(0, 8) };
    }
    return {
      user_id: String(entry?.user_id ?? ""),
      username: String(entry?.username ?? String(entry?.user_id ?? "Player").slice(0, 8))
    };
  });

  const startedAt = row?.started_at ? new Date(row.started_at).toISOString() : new Date().toISOString();
  const endedAt = row?.ended_at ? new Date(row.ended_at).toISOString() : startedAt;
  const duration =
    typeof row?.duration_seconds === "number"
      ? row.duration_seconds
      : Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));

  const scores = row?.scores_json && typeof row.scores_json === "object" ? row.scores_json : {};
  const attempts = typeof row?.accuracy_json?.attempts === "number" ? row.accuracy_json.attempts : 0;
  const matchedPairs = typeof row?.accuracy_json?.matched_pairs === "number" ? row.accuracy_json.matched_pairs : 0;
  const inferredMoves = typeof row?.moves_total === "number" ? row.moves_total : attempts;

  return {
    match_id: String(row?.match_id ?? row?.id ?? crypto.randomUUID()),
    room_id: String(row?.room_id ?? "solo"),
    players_json,
    winner_id: row?.winner_id ? String(row.winner_id) : null,
    board_size: row?.board_size ? String(row.board_size) : null,
    theme: row?.theme ? String(row.theme) : null,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: duration,
    scores_json: scores,
    moves_total: inferredMoves,
    accuracy_json: row?.accuracy_json && typeof row.accuracy_json === "object" ? row.accuracy_json : { attempts, matched_pairs: matchedPairs },
    disconnects_json: Array.isArray(row?.disconnects_json) ? row.disconnects_json : []
  };
}

function extractPlayerIds(match: MatchRow): string[] {
  return (match.players_json ?? [])
    .map((p) => p.user_id)
    .filter((id) => typeof id === "string" && (id.startsWith("local:") || isUuid(id)));
}

export async function listMyMatches(userId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("ended_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return ((data ?? []).map(normalizeMatchRow) as MatchRow[]).filter((m) => extractPlayerIds(m).includes(userId));
}

export async function getMatchById(matchId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .or(`match_id.eq.${matchId},id.eq.${matchId}`)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeMatchRow(data) : null;
}

const SOLO_HISTORY_KEY = "memora_solo_history_v1";

interface SaveSoloMatchInput {
  user: User;
  username: string;
  boardSize: string;
  theme: string;
  startedAt: number;
  endedAt: number;
  moves: number;
  attempts: number;
  matchedPairs: number;
  playerScore: number;
  botScore: number;
  winner: "player" | "bot" | "draw";
}

export function saveSoloMatch(input: SaveSoloMatchInput) {
  const raw = localStorage.getItem(SOLO_HISTORY_KEY);
  const list: MatchRow[] = raw ? (JSON.parse(raw) as MatchRow[]) : [];
  const winnerId = input.winner === "player" ? input.user.id : input.winner === "bot" ? "local:bot" : null;
  const row: MatchRow = {
    match_id: `solo-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    room_id: "solo",
    players_json: [
      { user_id: input.user.id, username: input.username || "You" },
      { user_id: "local:bot", username: "BOT" }
    ],
    winner_id: winnerId,
    board_size: input.boardSize,
    theme: input.theme,
    started_at: new Date(input.startedAt).toISOString(),
    ended_at: new Date(input.endedAt).toISOString(),
    duration_seconds: Math.max(0, Math.floor((input.endedAt - input.startedAt) / 1000)),
    scores_json: { [input.user.id]: input.playerScore, "local:bot": input.botScore },
    moves_total: input.moves,
    accuracy_json: { attempts: input.attempts, matched_pairs: input.matchedPairs },
    disconnects_json: []
  };

  const next = [row, ...list].slice(0, 200);
  localStorage.setItem(SOLO_HISTORY_KEY, JSON.stringify(next));
  return row;
}

export function listSoloMatchesForUser(userId: string): MatchRow[] {
  const raw = localStorage.getItem(SOLO_HISTORY_KEY);
  if (!raw) return [];
  const list = (JSON.parse(raw) as MatchRow[]).map(normalizeMatchRow);
  return list.filter((m) => extractPlayerIds(m).includes(userId));
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
