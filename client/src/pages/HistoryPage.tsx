import {
  Activity,
  CheckCircle2,
  Clock3,
  Gauge,
  Lock,
  Share2,
  Shield,
  Sparkles,
  Star,
  Target,
  Trophy
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import { iconPool } from "../core/icons";
import { useAuth } from "../contexts/AuthContext";
import { getMatchById, listMyMatches } from "../lib/social";
import type { MatchRow } from "../types";

function hashSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function makeTrendPoints(turns: number, accuracy: number) {
  const maxX = Math.max(6, turns);
  const baseline = Math.max(0.2, Math.min(0.95, accuracy / 100));
  const values = [0.12, 0.22, 0.38, 0.56, 0.67, 0.61, 0.42, 0.31, 0.49, 0.86, baseline].map((v) => Math.min(0.95, Math.max(0.08, v + (baseline - 0.5) * 0.25)));
  return values.map((v, idx) => ({ x: (idx / (values.length - 1)) * maxX, y: v }));
}

function toSvgPath(points: { x: number; y: number }[], width: number, height: number, maxX: number) {
  if (!points.length) return "";
  const sx = (x: number) => (x / maxX) * width;
  const sy = (y: number) => height - y * height;
  let d = `M ${sx(points[0].x)} ${sy(points[0].y)}`;
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    d += ` L ${sx(p.x)} ${sy(p.y)}`;
  }
  return d;
}

export default function HistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MatchRow | null>(null);

  useEffect(() => {
    if (!user) return;
    void listMyMatches(user.id).then((rows) => {
      setMatches(rows);
      const first = rows[0] ?? null;
      setSelectedId(first?.match_id ?? null);
      setSelected(first);
    });
  }, [user?.id]);

  useEffect(() => {
    if (!selectedId) return;
    void getMatchById(selectedId).then((row) => row && setSelected(row));
  }, [selectedId]);

  const model = useMemo(() => {
    if (!selected || !user) return null;

    const attempts = Number(selected.accuracy_json?.attempts ?? 0);
    const matchedPairs = Number(selected.accuracy_json?.matched_pairs ?? 0);
    const accuracy = attempts > 0 ? Math.round((matchedPairs / attempts) * 100) : 0;
    const moves = selected.moves_total ?? 0;
    const duration = selected.duration_seconds ?? 0;
    const mins = Math.floor(duration / 60).toString().padStart(2, "0");
    const secs = Math.floor(duration % 60).toString().padStart(2, "0");
    const myScore = selected.scores_json?.[user.id] ?? 0;
    const points = Math.round(myScore * 1000 + accuracy * 85 + Math.max(0, 2000 - duration * 4));
    const isWin = selected.winner_id === user.id || selected.winner_id === null;

    const seed = hashSeed(selected.match_id);
    const boardIcons = Array.from({ length: 16 }).map((_, i) => {
      const idx = (seed + i * 7) % iconPool.length;
      const Icon = iconPool[idx].component;
      return { id: `${i}-${idx}`, Icon };
    });

    const trend = makeTrendPoints(moves, accuracy);

    const achievements = [
      { id: "sharp", title: "SHARP EYE", text: "Perfect match first 5 turns", unlocked: accuracy >= 90, icon: Target },
      { id: "speed", title: "SPEED DEMON", text: "Finished under 2 minutes", unlocked: duration < 120, icon: Gauge },
      { id: "chain", title: "PERFECT CHAIN", text: "Reached 10x multiplier", unlocked: matchedPairs >= 10, icon: Sparkles },
      { id: "god", title: "GOD MODE", text: "Locked", unlocked: false, icon: Lock }
    ];

    return { accuracy, moves, durationText: `${mins}:${secs}`, myScore, points, isWin, trend, boardIcons, achievements };
  }, [selected, user?.id]);

  const onShare = async () => {
    if (!selected || !model) return;
    const txt = `Mission Debrief\nMatch: ${selected.match_id}\nScore: ${model.myScore}\nAccuracy: ${model.accuracy}%\nMoves: ${model.moves}\nTime: ${model.durationText}`;
    await navigator.clipboard.writeText(txt);
  };

  if (!selected || !model) {
    return (
      <ScreenShell screenKey="history-empty" className="history-screen">
        <section className="glass-panel history-empty-box">
          <h2>Mission Debrief</h2>
          <p className="muted-line">No history records yet.</p>
          <button className="primary-btn" onClick={() => navigate("/")}>Back Home</button>
        </section>
      </ScreenShell>
    );
  }

  const chartW = 680;
  const chartH = 280;
  const maxX = Math.max(6, model.moves);
  const path = toSvgPath(model.trend, chartW, chartH, maxX);

  return (
    <ScreenShell screenKey="history-debrief" className="debrief-screen">
      <header className="debrief-topbar glass-panel">
        <div className="debrief-brand">
          <span className="victory-brand-icon"><Activity size={15} /></span>
          <div>
            <p>SYSTEM STATUS: ONLINE</p>
            <h2>MISSION DEBRIEF</h2>
          </div>
        </div>
        <div className="debrief-actions">
          <button className="ghost-btn" onClick={() => navigate("/")}>BACK TO HISTORY</button>
          <button className="primary-btn" onClick={onShare}><Share2 size={14} /> SHARE RESULTS</button>
        </div>
      </header>

      <section className="debrief-hero-grid">
        <article className="debrief-rank-box">
          <div className="debrief-grade-ring"><span>{model.accuracy >= 95 ? "S" : model.accuracy >= 85 ? "A" : "B"}</span></div>
          <h3>OPERATION: MEMORY RECALL</h3>
          <p><CheckCircle2 size={14} /> {model.isWin ? "MISSION SUCCESS" : "MISSION FAILED"}</p>
        </article>

        <article className="debrief-score-box glass-panel">
          <p>FINAL PERFORMANCE METRIC</p>
          <h3>{model.points.toLocaleString()} <span>PTS</span></h3>
          <div className="debrief-xp-row"><span>EXPERIENCE GAINED</span><strong>+{Math.round(model.points * 0.05)} XP</strong></div>
          <div className="xp-bar"><span style={{ width: `${Math.min(96, model.accuracy)}%` }} /></div>
          <small>LEVEL 24 · 450 XP TO NEXT RANK</small>
        </article>
      </section>

      <section className="debrief-kpi-grid">
        <article className="glass-panel debrief-kpi"><p>ACCURACY</p><strong>{model.accuracy}%</strong></article>
        <article className="glass-panel debrief-kpi"><p>TOTAL MOVES</p><strong>{model.moves}</strong></article>
        <article className="glass-panel debrief-kpi"><p>COMPLETION TIME</p><strong>{model.durationText}</strong></article>
        <article className="glass-panel debrief-kpi"><p>COMBO STREAK</p><strong>{Math.max(2, Math.round(model.accuracy / 9))}x</strong></article>
      </section>

      <section className="debrief-mid-grid">
        <article className="glass-panel debrief-chart-card">
          <header><h4><Activity size={14} /> ACCURACY TREND</h4></header>
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="debrief-chart-svg" role="img" aria-label="Accuracy trend chart">
            <line x1="0" y1={chartH} x2={chartW} y2={chartH} />
            <line x1="0" y1={chartH * 0.5} x2={chartW} y2={chartH * 0.5} />
            <path d={path} />
          </svg>
          <div className="debrief-chart-axis">
            <span>TURN 0</span><span>TURN {Math.max(6, Math.round(maxX * 0.25))}</span><span>TURN {Math.max(12, Math.round(maxX * 0.5))}</span><span>TURN {Math.max(18, Math.round(maxX * 0.75))}</span><span>TURN {maxX}</span>
          </div>
        </article>

        <article className="glass-panel debrief-board-card">
          <header><h4><Shield size={14} /> FINAL BOARD STATE</h4></header>
          <div className="debrief-final-grid">
            {model.boardIcons.map(({ id, Icon }) => (
              <span key={id}><Icon size={13} /></span>
            ))}
          </div>
        </article>
      </section>

      <section className="glass-panel debrief-achievements">
        <h4><Trophy size={14} /> ACHIEVEMENTS UNLOCKED</h4>
        <div className="debrief-ach-grid">
          {model.achievements.map((a) => (
            <article key={a.id} className={`debrief-ach-item ${a.unlocked ? "" : "locked"}`.trim()}>
              <span className="debrief-ach-icon"><a.icon size={15} /></span>
              <div>
                <strong>{a.title}</strong>
                <p>{a.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-panel debrief-history-rail">
        <h4><Clock3 size={14} /> RECENT OPERATIONS</h4>
        <div className="debrief-history-list">
          {matches.slice(0, 8).map((m) => (
            <button
              key={m.match_id}
              className={`debrief-history-chip ${selectedId === m.match_id ? "selected" : ""}`.trim()}
              onClick={() => setSelectedId(m.match_id)}
            >
              <span>{m.board_size ?? "--"}</span>
              <strong>{m.winner_id === user?.id ? "WIN" : m.winner_id ? "LOSS" : "DRAW"}</strong>
              <small>{new Date(m.ended_at).toLocaleDateString()}</small>
            </button>
          ))}
        </div>
      </section>

      <footer className="debrief-footer-id">MATCH ID: #{selected.match_id}</footer>
    </ScreenShell>
  );
}
