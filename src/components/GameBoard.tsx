import { iconPool } from "../core/icons";
import type { GameState } from "../core/types";
import MemoryCard from "./MemoryCard";
import type { LucideIcon } from "lucide-react";

interface GameBoardProps {
  state: GameState;
  onCardClick: (index: number) => void;
}

const iconMap = new Map<string, LucideIcon>(iconPool.map((icon) => [icon.id, icon.component]));

export default function GameBoard({ state, onCardClick }: GameBoardProps) {
  return (
    <div
      className="board-grid"
      style={{
        gridTemplateColumns: `repeat(${state.cols}, minmax(0, 1fr))`
      }}
    >
      {state.cards.map((card, index) => {
        const Icon = iconMap.get(card.iconId) ?? iconPool[0].component;
        const pendingMismatchToken =
          state.pendingOutcome && !state.pendingOutcome.isMatch && state.pendingOutcome.indices.includes(index)
            ? state.pendingOutcome.id
            : 0;

        return (
          <MemoryCard
            key={`${card.pairId}-${index}`}
            icon={Icon}
            tint={card.tint}
            faceUp={card.state !== "hidden"}
            matched={card.state === "matched"}
            disabled={card.state !== "hidden" || state.isResolving || state.status === "finished"}
            onClick={() => onCardClick(index)}
            matchToken={card.matchedTurn ?? 0}
            mismatchToken={pendingMismatchToken}
            showCoin={card.state === "matched"}
          />
        );
      })}
    </div>
  );
}
