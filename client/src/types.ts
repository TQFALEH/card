import type { User } from "@supabase/supabase-js";

export type BoardSizeId = "4x4" | "6x6" | "8x8";

export interface BoardSize {
  id: BoardSizeId;
  label: string;
  rows: number;
  cols: number;
  sort_order: number;
}

export interface ThemeConfig {
  id: string;
  name: string;
  config_json: Record<string, unknown>;
}

export interface AppConfig {
  boardSizes: BoardSize[];
  themes: ThemeConfig[];
}

export interface Profile {
  user_id: string;
  username: string;
  avatar_url: string | null;
}

export interface Stats {
  user_id: string;
  games_played: number;
  wins: number;
  losses: number;
  win_rate: number;
  streak_best?: number;
  streak_current?: number;
  avg_duration?: number;
}

export interface FriendRelation {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "rejected" | "blocked";
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  room_id: string | null;
  board_size: BoardSizeId;
  theme: string;
  seed: number | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface MatchRow {
  match_id: string;
  room_id: string;
  players_json: Array<{ user_id: string; username: string }>;
  winner_id: string | null;
  board_size: string | null;
  theme: string | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number | null;
  scores_json: Record<string, number>;
  moves_total: number | null;
  accuracy_json: Record<string, number>;
  disconnects_json: unknown[];
}

export interface Room {
  room_id: string;
  host_id: string;
  status: "lobby" | "playing" | "ended";
  board_size: BoardSizeId;
  theme: string;
  seed: number | null;
  created_at: string;
}

export interface RoomPlayer {
  room_id: string;
  user_id: string;
  is_ready: boolean;
  is_host: boolean;
  joined_at: string;
  profile?: Profile;
}

export interface GameCardState {
  index: number;
  pair_id: string;
  icon_id: string;
  tint: string;
  state: "hidden" | "revealed" | "matched";
  owner: string | null;
}

export interface PendingAction {
  type: "match" | "mismatch";
  indices: [number, number];
  resolve_after: string;
}

export interface CanonicalState {
  board_size: BoardSizeId;
  rows: number;
  cols: number;
  cards: GameCardState[];
  selected: number[];
  current_player: string;
  scores: Record<string, number>;
  input_locked: boolean;
  pending: PendingAction | null;
  matched_pairs: number;
  total_pairs: number;
  attempts: number;
  moves: number;
  status: "playing" | "ended";
  started_at: string;
  ended_at: string | null;
}

export interface RoomStateRow {
  room_id: string;
  state_json: CanonicalState;
  version: number;
  updated_at: string;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
