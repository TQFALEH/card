import type { AIDifficulty, GameState } from "./types";

export interface AIMemory {
  byPair: Map<string, Set<number>>;
  byIndex: Map<number, string>;
}

export function createAIMemory(): AIMemory {
  return {
    byPair: new Map(),
    byIndex: new Map()
  };
}

export function rememberCard(memory: AIMemory, index: number, pairId: string): void {
  memory.byIndex.set(index, pairId);
  if (!memory.byPair.has(pairId)) {
    memory.byPair.set(pairId, new Set());
  }
  memory.byPair.get(pairId)!.add(index);
}

export function forgetMatchedPair(memory: AIMemory, pairId: string): void {
  const known = memory.byPair.get(pairId);
  if (!known) {
    return;
  }
  known.forEach((index) => {
    memory.byIndex.delete(index);
  });
  memory.byPair.delete(pairId);
}

function availableHidden(state: GameState): number[] {
  return state.cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card.state === "hidden")
    .map(({ index }) => index);
}

function randomPick(list: number[]): number {
  return list[Math.floor(Math.random() * list.length)];
}

function knownPairs(memory: AIMemory, hiddenSet: Set<number>): [number, number][] {
  const pairs: [number, number][] = [];
  memory.byPair.forEach((indices) => {
    const filtered = [...indices].filter((idx) => hiddenSet.has(idx));
    if (filtered.length >= 2) {
      pairs.push([filtered[0], filtered[1]]);
    }
  });
  return pairs;
}

function knownSingle(memory: AIMemory, hiddenSet: Set<number>): number[] {
  return [...memory.byIndex.keys()].filter((idx) => hiddenSet.has(idx));
}

export function pickAIMove(state: GameState, memory: AIMemory, difficulty: AIDifficulty): [number, number] {
  const hidden = availableHidden(state);
  const hiddenSet = new Set(hidden);
  const pairs = knownPairs(memory, hiddenSet);
  const known = knownSingle(memory, hiddenSet);

  if (hidden.length < 2) {
    throw new Error("AI called without enough hidden cards");
  }

  const chooseKnownPair = (): [number, number] | null => {
    if (!pairs.length) {
      return null;
    }
    return pairs[Math.floor(Math.random() * pairs.length)];
  };

  const chooseMixed = (): [number, number] | null => {
    if (!known.length) {
      return null;
    }
    const first = randomPick(known);
    const pairId = memory.byIndex.get(first);
    if (!pairId) {
      return null;
    }
    const knownPartner = [...(memory.byPair.get(pairId) ?? [])].find((idx) => idx !== first && hiddenSet.has(idx));
    if (knownPartner !== undefined) {
      return [first, knownPartner];
    }
    const secondCandidates = hidden.filter((idx) => idx !== first);
    return [first, randomPick(secondCandidates)];
  };

  let roll = Math.random();
  if (difficulty === "hard") {
    if (roll < 0.94) {
      const knownPair = chooseKnownPair();
      if (knownPair) {
        return knownPair;
      }
    }
    if (roll < 0.99) {
      const mixed = chooseMixed();
      if (mixed) {
        return mixed;
      }
    }
  }

  if (difficulty === "medium") {
    if (roll < 0.65) {
      const knownPair = chooseKnownPair();
      if (knownPair) {
        return knownPair;
      }
    }
    if (roll < 0.85) {
      const mixed = chooseMixed();
      if (mixed) {
        return mixed;
      }
    }
  }

  if (difficulty === "easy") {
    if (roll < 0.28) {
      const knownPair = chooseKnownPair();
      if (knownPair) {
        return knownPair;
      }
    }
    if (roll < 0.5) {
      const mixed = chooseMixed();
      if (mixed) {
        return mixed;
      }
    }
  }

  const first = randomPick(hidden);
  const secondCandidates = hidden.filter((idx) => idx !== first);
  return [first, randomPick(secondCandidates)];
}
