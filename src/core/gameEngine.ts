import { iconPool, tintPalette } from "./icons";
import type {
  BoardPreset,
  BoardSpec,
  GameCard,
  GameConfig,
  GameState,
  MatchStats,
  Player
} from "./types";

export const BOARD_SPECS: Record<BoardPreset, BoardSpec> = {
  "4x4": { rows: 4, cols: 4 },
  "6x6": { rows: 6, cols: 6 },
  "8x8": { rows: 8, cols: 8 }
};

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createPlayers(mode: GameConfig["mode"]): Player[] {
  if (mode === "solo") {
    return [
      { id: 0, name: "You", isAI: false, score: 0 },
      { id: 1, name: "Bot", isAI: true, score: 0 }
    ];
  }
  if (mode === "local4") {
    return [
      { id: 0, name: "P1", isAI: false, score: 0 },
      { id: 1, name: "P2", isAI: false, score: 0 },
      { id: 2, name: "P3", isAI: false, score: 0 },
      { id: 3, name: "P4", isAI: false, score: 0 }
    ];
  }
  return [
    { id: 0, name: "P1", isAI: false, score: 0 },
    { id: 1, name: "P2", isAI: false, score: 0 }
  ];
}

function buildDeck(totalPairs: number): GameCard[] {
  const pairs = Array.from({ length: totalPairs }, (_, pairIndex) => {
    const icon = iconPool[pairIndex % iconPool.length];
    const tint = tintPalette[pairIndex % tintPalette.length];
    const variant = Math.floor(pairIndex / iconPool.length);
    const pairId = `${icon.id}-${variant}`;
    return {
      pairId,
      iconId: icon.id,
      tint
    };
  });

  const cards = pairs.flatMap((pair) => [
    {
      pairId: pair.pairId,
      iconId: pair.iconId,
      tint: pair.tint,
      state: "hidden" as const,
      owner: null,
      matchedTurn: null
    },
    {
      pairId: pair.pairId,
      iconId: pair.iconId,
      tint: pair.tint,
      state: "hidden" as const,
      owner: null,
      matchedTurn: null
    }
  ]);

  return shuffle(cards).map((card, index) => ({ ...card, index }));
}

export function createInitialState(config: GameConfig): GameState {
  const { rows, cols } = BOARD_SPECS[config.board];
  const totalPairs = (rows * cols) / 2;
  return {
    rows,
    cols,
    cards: buildDeck(totalPairs),
    players: createPlayers(config.mode),
    currentPlayer: 0,
    selected: [],
    pendingOutcome: null,
    matchedPairs: 0,
    totalPairs,
    attempts: 0,
    moves: 0,
    isResolving: false,
    status: "playing",
    startedAt: Date.now(),
    endedAt: null,
    resolutionCounter: 0
  };
}

export function canFlipCard(state: GameState, index: number): boolean {
  if (state.status !== "playing" || state.isResolving) {
    return false;
  }
  const card = state.cards[index];
  return Boolean(card) && card.state === "hidden" && state.selected.length < 2;
}

export function flipCard(state: GameState, index: number): GameState {
  if (!canFlipCard(state, index)) {
    return state;
  }
  const cards = state.cards.map((card, i) =>
    i === index ? { ...card, state: "revealed" as const } : card
  );
  const selected = [...state.selected, index];

  if (selected.length < 2) {
    return { ...state, cards, selected };
  }

  const [a, b] = selected;
  const isMatch = cards[a].pairId === cards[b].pairId;

  return {
    ...state,
    cards,
    selected,
    isResolving: true,
    pendingOutcome: {
      id: state.resolutionCounter + 1,
      indices: [a, b],
      isMatch,
      playerId: state.currentPlayer,
      pairId: cards[a].pairId
    }
  };
}

function computeWinners(players: Player[]): number[] {
  const max = Math.max(...players.map((p) => p.score));
  return players.filter((p) => p.score === max).map((p) => p.id);
}

export function resolvePendingTurn(state: GameState): GameState {
  const pending = state.pendingOutcome;
  if (!pending || !state.isResolving) {
    return state;
  }

  const players = state.players.map((p) => ({ ...p }));
  const cards = state.cards.map((c) => ({ ...c }));
  const [a, b] = pending.indices;

  let matchedPairs = state.matchedPairs;
  let currentPlayer = state.currentPlayer;

  if (pending.isMatch) {
    cards[a].state = "matched";
    cards[b].state = "matched";
    cards[a].owner = pending.playerId;
    cards[b].owner = pending.playerId;
    cards[a].matchedTurn = pending.id;
    cards[b].matchedTurn = pending.id;
    players[pending.playerId].score += 1;
    matchedPairs += 1;
  } else {
    cards[a].state = "hidden";
    cards[b].state = "hidden";
    currentPlayer = (state.currentPlayer + 1) % players.length;
  }

  const attempts = state.attempts + 1;
  const moves = state.moves + 1;
  const finished = matchedPairs === state.totalPairs;

  return {
    ...state,
    cards,
    players,
    selected: [],
    pendingOutcome: null,
    isResolving: false,
    matchedPairs,
    attempts,
    moves,
    currentPlayer,
    status: finished ? "finished" : "playing",
    endedAt: finished ? Date.now() : null,
    resolutionCounter: pending.id
  };
}

export function getGameStats(state: GameState): MatchStats {
  const elapsedMs = (state.endedAt ?? Date.now()) - state.startedAt;
  return {
    moves: state.moves,
    attempts: state.attempts,
    accuracy: state.attempts === 0 ? 0 : (state.matchedPairs / state.attempts) * 100,
    elapsedMs,
    winnerIds: computeWinners(state.players)
  };
}

export function hiddenCardIndices(state: GameState): number[] {
  return state.cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.state === "hidden")
    .map(({ index }) => index);
}
