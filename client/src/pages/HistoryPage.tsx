import { CalendarDays, Clock3, Filter, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import { useAuth } from "../contexts/AuthContext";
import { getMatchById, listMyMatches } from "../lib/social";
import type { MatchRow } from "../types";

export default function HistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [board, setBoard] = useState("all");
  const [result, setResult] = useState("all");
  const [selected, setSelected] = useState<MatchRow | null>(null);

  useEffect(() => {
    if (!user) return;
    void listMyMatches(user.id).then(setMatches);
  }, [user?.id]);

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (board !== "all" && m.board_size !== board) return false;
      if (result === "win" && m.winner_id !== user?.id) return false;
      if (result === "loss" && m.winner_id === user?.id) return false;
      return true;
    });
  }, [matches, board, result, user?.id]);

  const openDetail = async (id: string) => {
    const row = await getMatchById(id);
    if (row) setSelected(row);
  };

  return (
    <ScreenShell screenKey="history" className="history-screen">
      <header className="friends-head glass-panel">
        <h2>Match History</h2>
        <div className="friends-top-actions">
          <button className="secondary-neon-btn" onClick={() => navigate("/")}>Back</button>
        </div>
      </header>

      <section className="glass-panel history-filters">
        <div><Filter size={14} /> Filters</div>
        <select value={board} onChange={(e) => setBoard(e.target.value)}>
          <option value="all">All board sizes</option>
          <option value="4x4">4x4</option>
          <option value="6x6">6x6</option>
          <option value="8x8">8x8</option>
        </select>
        <select value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="all">All results</option>
          <option value="win">Wins</option>
          <option value="loss">Losses/Draws</option>
        </select>
      </section>

      <section className="glass-panel history-list">
        {filtered.map((m) => {
          const isWin = m.winner_id === user?.id;
          const myScore = m.scores_json?.[user?.id ?? ""] ?? 0;
          return (
            <article className="history-row" key={m.match_id} onClick={() => void openDetail(m.match_id)}>
              <div>
                <strong>{isWin ? "WIN" : m.winner_id ? "LOSS" : "DRAW"}</strong>
                <p>{m.board_size ?? "-"} • {m.theme ?? "-"}</p>
              </div>
              <div><Trophy size={14} /> {myScore}</div>
              <div><Clock3 size={14} /> {m.duration_seconds ?? 0}s</div>
              <div><CalendarDays size={14} /> {new Date(m.ended_at).toLocaleDateString()}</div>
            </article>
          );
        })}
        {!filtered.length && <p className="muted-line">No matches found.</p>}
      </section>

      {selected && (
        <section className="glass-panel history-detail">
          <header>
            <h3>Match Details</h3>
            <button className="ghost-btn" onClick={() => setSelected(null)}>Close</button>
          </header>
          <p>Match ID: {selected.match_id}</p>
          <p>Room: {selected.room_id}</p>
          <p>Board: {selected.board_size} | Theme: {selected.theme}</p>
          <p>Duration: {selected.duration_seconds}s</p>
          <p>Moves: {selected.moves_total ?? 0}</p>
          <p>Winner: {selected.winner_id ?? "Draw"}</p>
          <div className="score-row">
            {(selected.players_json ?? []).map((p) => (
              <div key={p.user_id} className="score-chip"><span>{p.username}</span><strong>{selected.scores_json?.[p.user_id] ?? 0}</strong></div>
            ))}
          </div>
        </section>
      )}
    </ScreenShell>
  );
}
