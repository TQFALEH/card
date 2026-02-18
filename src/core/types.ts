export type Screen = "home" | "mode" | "ai" | "board" | "game" | "results";

export type GameMode = "solo" | "local2" | "local4";

export type AIDifficulty = "easy" | "medium" | "hard";

export type BoardPreset = "4x4" | "6x6" | "8x8";

export interface BoardSpec {
  rows: number;
  cols: number;
}

export type CardState = "hidden" | "revealed" | "matched";

export interface GameCard {
  index: number;
  pairId: string;
  iconId: string;
  tint: string;
  state: CardState;
  owner: number | null;
  matchedTurn: number | null;
}

export interface Player {
  id: number;
  name: string;
  isAI: boolean;
  score: number;
}

export interface PendingOutcome {
  id: number;
  indices: [number, number];
  isMatch: boolean;
  playerId: number;
  pairId: string;
}

export interface GameState {
  rows: number;
  cols: number;
  cards: GameCard[];
  players: Player[];
  currentPlayer: number;
  selected: number[];
  pendingOutcome: PendingOutcome | null;
  matchedPairs: number;
  totalPairs: number;
  attempts: number;
  moves: number;
  isResolving: boolean;
  status: "playing" | "finished";
  startedAt: number;
  endedAt: number | null;
  resolutionCounter: number;
}

export interface MatchStats {
  moves: number;
  attempts: number;
  accuracy: number;
  elapsedMs: number;
  winnerIds: number[];
}

export interface GameConfig {
  mode: GameMode;
  board: BoardPreset;
}
