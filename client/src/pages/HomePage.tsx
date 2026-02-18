import { useState } from "react";
import { BarChart3, Coins, Cog, Play, Rocket, Server, User, UserRound, Users, UsersRound, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import { useAuth } from "../contexts/AuthContext";
import { useConfig } from "../contexts/ConfigContext";
import { createRoom } from "../lib/rooms";
import type { BoardSizeId } from "../types";

const boardTitles: Record<string, string> = {
  "4x4": "Recruit",
  "6x6": "Veteran",
  "8x8": "Elite"
};

export default function HomePage() {
  const { profile } = useAuth();
  const { config } = useConfig();
  const [showSetup, setShowSetup] = useState(false);
  const [boardSize, setBoardSize] = useState<BoardSizeId>((config.boardSizes[0]?.id as BoardSizeId) ?? "4x4");
  const [theme, setTheme] = useState(config.themes[0]?.id ?? "neon");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const navigate = useNavigate();

  const selectedSize = config.boardSizes.find((b) => b.id === boardSize) ?? config.boardSizes[0];

  const onCreateRoom = async () => {
    setCreating(true);
    setError(null);
    try {
      const roomId = await createRoom(boardSize, theme);
      navigate(`/room/${roomId}`);
    } catch (err: any) {
      setError(err.message ?? "Room create failed");
    } finally {
      setCreating(false);
    }
  };

  const onJoinRoom = () => {
    const code = joinCode.trim();
    if (!code) {
      setError("Enter invite code first");
      return;
    }
    navigate(`/join/${code}`);
  };

  if (showSetup) {
    return (
      <ScreenShell screenKey="setup" className="setup-screen glass-panel">
        <header className="setup-header">
          <div className="setup-title-wrap">
            <span className="setup-icon"><BarChart3 size={19} /></span>
            <div>
              <h2>GAME CONFIGURATION</h2>
              <p>SYSTEM READY // ONLINE MODE</p>
            </div>
          </div>
          <button className="icon-square-btn" onClick={() => setShowSetup(false)}>
            <X size={20} />
          </button>
        </header>

        <section>
          <h3 className="setup-label">1. SELECT MISSION TYPE</h3>
          <div className="mission-grid">
            <button className="mission-card">
              <span className="mission-icon"><User size={20} /></span>
              <strong>Solo Mission</strong>
              <p>Offline practice</p>
              <small>STANDBY</small>
            </button>
            <button className="mission-card selected">
              <span className="mission-icon"><Users size={20} /></span>
              <strong>Duo Duel</strong>
              <p>Realtime 2 Players</p>
              <small>ACTIVE</small>
            </button>
            <button className="mission-card">
              <span className="mission-icon"><UsersRound size={20} /></span>
              <strong>Squad Clash</strong>
              <p>4 Players Local</p>
              <small>STANDBY</small>
            </button>
          </div>
        </section>

        <section className="setup-split">
          <div>
            <h3 className="setup-label">2. COMPLEXITY LEVEL</h3>
            <div className="level-list">
              {config.boardSizes.map((size) => (
                <button key={size.id} className={`level-row ${boardSize === size.id ? "selected" : ""}`} onClick={() => setBoardSize(size.id as BoardSizeId)}>
                  <span className="radio-dot" />
                  <div>
                    <strong>{boardTitles[size.id] ?? size.label}</strong>
                    <p>{size.rows} X {size.cols} GRID · {(size.rows * size.cols) / 2} PAIRS</p>
                  </div>
                  <span className="edge-notch" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="setup-label">3. BOARD LAYOUT</h3>
            <div className="board-preview-box">
              <div className={`board-preview-grid grid-${boardSize.replace("x", "-")}`}>
                {Array.from({ length: selectedSize ? selectedSize.rows * selectedSize.cols : 16 }).map((_, i) => (
                  <span key={i} className={`preview-cell ${i % 7 === 0 ? "active" : ""}`} />
                ))}
              </div>
              <p>THEME: {theme.toUpperCase()}</p>
            </div>

            <label className="setup-label" style={{ marginTop: 10, display: "block" }}>4. THEME PACK</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              {config.themes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            <label className="setup-label" style={{ marginTop: 14, display: "block" }}>5. JOIN BY CODE</label>
            <div className="join-by-code">
              <input
                placeholder="Paste room code (UUID)"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
              />
              <button className="ghost-btn" onClick={onJoinRoom}>JOIN ROOM</button>
            </div>
          </div>
        </section>

        {error && <div className="error-pill">{error}</div>}

        <footer className="setup-footer">
          <button className="initialize-btn" onClick={onCreateRoom} disabled={creating}>
            {creating ? "INITIALIZING..." : "INITIALIZE GAME"} <Rocket size={18} />
          </button>
          <button className="reset-btn" onClick={() => { setBoardSize("6x6"); setTheme(config.themes[0]?.id ?? "neon"); }}>RESET</button>
        </footer>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell screenKey="home" className="home-screen">
      <header className="home-topbar">
        <div className="status-chip">
          <Server size={14} />
          <div>
            <p>SYSTEM STATUS</p>
            <strong>ONLINE // V2.0.4</strong>
          </div>
        </div>

        <div className="home-top-actions">
          <div className="currency-pill"><Coins size={14} /> 12,450</div>
          <div className="currency-pill">480</div>
          <button className="rank-avatar" onClick={() => navigate("/profile")}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt={profile.username} className="avatar-image" /> : <UserRound size={14} />}
          </button>
        </div>
      </header>

      <div className="home-center">
        <div className="home-side-left">
          <article className="home-stat-card"><span>GLOBAL RANK</span><strong>#1,242</strong></article>
          <article className="home-stat-card"><span>TOTAL WINS</span><strong>154</strong></article>
        </div>

        <section className="home-hero">
          <p className="home-hero-tag">ULTRA HD EXPERIENCE</p>
          <h1 className="home-title">
            <span>NEON</span>
            <em className="home-title-neon">MEMORY</em>
          </h1>
          <button className="play-now-btn" onClick={() => setShowSetup(true)}>
            <Play size={18} fill="currentColor" />
            PLAY NOW
          </button>
          <div className="home-secondary-actions">
            <button className="secondary-neon-btn" onClick={() => navigate("/history")}><BarChart3 size={16} />HISTORY</button>
            <button className="secondary-neon-btn" onClick={() => navigate("/friends")}><Cog size={16} />FRIENDS</button>
          </div>
        </section>

        <div className="home-side-right">
          <article className="home-stat-card"><span>HIGH SCORE</span><strong>98,420</strong></article>
          <article className="home-stat-card"><span>CURRENT EVENT</span><strong>NEON SUMMER '24</strong></article>
        </div>
      </div>

      <footer className="home-footer">
        <p>PATCH NOTES</p>
        <p>SERVER: SUPABASE WS</p>
      </footer>
    </ScreenShell>
  );
}
