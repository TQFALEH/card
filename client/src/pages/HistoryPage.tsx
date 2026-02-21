import { Activity, Clock3, Filter, History, LogOut, Settings, Trophy, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import { useAuth } from "../contexts/AuthContext";
import { listMyMatches, listSoloMatchesForUser } from "../lib/social";
import type { MatchRow } from "../types";

function fmtDuration(sec: number | null) {
  const v = Math.max(0, sec ?? 0);
  const m = Math.floor(v / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(v % 60)
    .toString()
    .padStart(2, "0");
  return `${m}m ${s}s`;
}

export default function HistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchRow[]>([]);

  useEffect(() => {
    if (!user) return;
    void listMyMatches(user.id)
      .then((rows) => {
        const all = [...rows, ...listSoloMatchesForUser(user.id)].sort(
          (a, b) => new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime()
        );
        setMatches(all);
      })
      .catch(() => {
        setMatches(listSoloMatchesForUser(user.id));
      });
  }, [user?.id]);

  const stats = useMemo(() => {
    const total = matches.length;
    const wins = matches.filter((m) => m.winner_id && m.winner_id === user?.id).length;
    const winRate = total ? Math.round((wins / total) * 100) : 0;
    return { total, winRate };
  }, [matches, user?.id]);

  return (
    <ScreenShell screenKey="history-v2" className="noir-history-page">
      <aside className="history-left-rail glass-panel">
        <div className="archive-brand"><History size={17} /> ARCHIVES</div>
        <button className="rail-link" onClick={() => navigate("/profile")}><User size={15} /> Profile</button>
        <button className="rail-link" onClick={() => navigate("/")}><Activity size={15} /> Dashboard</button>
        <button className="rail-link active"><History size={15} /> History</button>
        <button className="rail-link"><Settings size={15} /> Settings</button>
        <button className="rail-link rail-logout" onClick={() => navigate("/")}><LogOut size={15} /> Logout</button>
      </aside>

      <section className="history-main-column">
        <header className="history-overview-row">
          <div>
            <h1>MATCH ARCHIVES</h1>
            <p>Detailed breakdown of your competitive performance.</p>
          </div>
          <div className="overview-pills">
            <article><span>LAST 30 DAYS</span><strong>{stats.winRate}%</strong><small>Win Rate</small></article>
            <article><span>MATCHES</span><strong>{stats.total}</strong><small>Total</small></article>
          </div>
        </header>

        <section className="history-filter-row">
          <button className="active">All Modes</button>
          <button>Ranked Blitz</button>
          <button>Casual</button>
          <button>Tournament</button>
          <button><Filter size={13} /> Filter</button>
        </section>

        <section className="history-list-v2">
          {matches.map((m) => {
            const win = m.winner_id === user?.id;
            const draw = !m.winner_id;
            const rp = win ? "+24 RP" : draw ? "0 RP" : "-12 RP";
            const title = `${m.board_size ?? "6x6"} - ${m.theme ?? "neon"}`;
            return (
              <article className={`history-card-v2 ${win ? "win" : draw ? "draw" : "loss"}`.trim()} key={m.match_id}>
                <div className="result-badge"><Trophy size={15} /></div>
                <div className="history-card-main">
                  <p>{new Date(m.ended_at).toLocaleString()} • {win ? "VICTORY" : draw ? "DRAW" : "DEFEAT"}</p>
                  <strong>{title}</strong>
                  <small><Activity size={12} /> {m.board_size ?? "--"} <Clock3 size={12} /> {fmtDuration(m.duration_seconds)}</small>
                </div>
                <div className="history-rp">
                  <strong>{rp}</strong>
                  <span>DETAILS</span>
                </div>
              </article>
            );
          })}
          {!matches.length && <p className="muted-line">No history records yet.</p>}
        </section>
      </section>

      <aside className="history-right-rail glass-panel">
        <h3>GLOBAL LEADERBOARD</h3>
        <div className="lb-row"><span>Xenon_Pulse</span><strong>#01</strong></div>
        <div className="lb-row"><span>Shadow_Reaper</span><strong>#02</strong></div>
        <div className="lb-row"><span>Nova_Protocol</span><strong>#03</strong></div>
        <section className="history-system-box">
          <h4>System Status</h4>
          <p>All archival nodes operational. Match data synced in real-time.</p>
        </section>
      </aside>
    </ScreenShell>
  );
}
