import { Cpu, User } from "lucide-react";
import type { Player } from "../core/types";

interface HUDProps {
  players: Player[];
  currentPlayer: number;
}

export default function HUD({ players, currentPlayer }: HUDProps) {
  return (
    <header className="match-hud-frame">
      <div className="match-hud-titleblock">
        <Cpu size={14} />
        <span>MEMORY MATCH</span>
      </div>
      <div className="turn-pill">CURRENT TURN: {players[currentPlayer]?.name ?? "P1"}</div>
      <div className="match-players-strip">
        {players.map((player) => (
          <article
            key={player.id}
            className={`match-player-card ${player.id === currentPlayer ? "active" : ""}`.trim()}
          >
            <div className="match-player-meta">
              <User size={13} />
              <span>{player.name}</span>
            </div>
            <strong>{player.score.toString().padStart(2, "0")}</strong>
          </article>
        ))}
      </div>
    </header>
  );
}
