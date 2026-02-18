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
