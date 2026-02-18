import type { LucideIcon } from "lucide-react";
import { iconPool } from "../core/icons";
import type { CanonicalState } from "../types";
import MemoryCard from "./MemoryCard";

interface Props {
  state: CanonicalState;
  onCardClick: (index: number) => void;
}

const iconMap = new Map<string, LucideIcon>(iconPool.map((i) => [i.id, i.component]));

export default function GameBoard({ state, onCardClick }: Props) {
  return (
    <div className="board-grid" style={{ gridTemplateColumns: `repeat(${state.cols}, minmax(0,1fr))` }}>
      {state.cards.map((card, index) => (
        <MemoryCard
          key={index}
          icon={iconMap.get(card.icon_id) ?? iconPool[0].component}
          tint={card.tint}
          faceUp={card.state !== "hidden"}
          matched={card.state === "matched"}
          disabled={card.state !== "hidden" || state.input_locked || state.status !== "playing"}
          onClick={() => onCardClick(index)}
          matchToken={card.state === "matched" ? 1 : 0}
          mismatchToken={state.pending && state.pending.type === "mismatch" && state.pending.indices.includes(index) ? 1 : 0}
        />
      ))}
    </div>
  );
}
