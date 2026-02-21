import { useState } from "react";
import { BarChart3, Bell, Coins, Cog, Gamepad2, Home, Play, Rocket, Search, Server, User, UserRound, Users, UsersRound, X } from "lucide-react";
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
  const [mode, setMode] = useState<"solo" | "duo">("duo");
  const [botLevel, setBotLevel] = useState<"easy" | "medium" | "hard">("medium");
  const [boardSize, setBoardSize] = useState<BoardSizeId>((config.boardSizes[0]?.id as BoardSizeId) ?? "4x4");
  const [theme, setTheme] = useState(config.themes[0]?.id ?? "neon");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const navigate = useNavigate();

  const selectedSize = config.boardSizes.find((b) => b.id === boardSize) ?? config.boardSizes[0];

  const onCreateRoom = async () => {
    if (mode === "solo") {
      navigate(`/solo?size=${boardSize}&bot=${botLevel}`);
      return;
    }
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
            <button className={`mission-card ${mode === "solo" ? "selected" : ""}`.trim()} onClick={() => setMode("solo")}>
              <span className="mission-icon"><User size={20} /></span>
              <strong>Solo Mission</strong>
              <p>Player vs Smart Bot</p>
              <small>{mode === "solo" ? "ACTIVE" : "STANDBY"}</small>
            </button>
            <button className={`mission-card ${mode === "duo" ? "selected" : ""}`.trim()} onClick={() => setMode("duo")}>
              <span className="mission-icon"><Users size={20} /></span>
              <strong>Duo Duel</strong>
              <p>Realtime 2 Players</p>
              <small>{mode === "duo" ? "ACTIVE" : "STANDBY"}</small>
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

            {mode === "solo" ? (
              <>
                <label className="setup-label" style={{ marginTop: 14, display: "block" }}>5. BOT DIFFICULTY</label>
                <div className="bot-difficulty-row">
                  <button className={`bot-btn ${botLevel === "easy" ? "selected" : ""}`.trim()} onClick={() => setBotLevel("easy")}>EASY</button>
                  <button className={`bot-btn ${botLevel === "medium" ? "selected" : ""}`.trim()} onClick={() => setBotLevel("medium")}>MEDIUM</button>
                  <button className={`bot-btn ${botLevel === "hard" ? "selected" : ""}`.trim()} onClick={() => setBotLevel("hard")}>HARD</button>
                </div>
              </>
            ) : (
              <>
                <label className="setup-label" style={{ marginTop: 14, display: "block" }}>5. JOIN BY CODE</label>
                <div className="join-by-code">
                  <input
                    placeholder="Paste room code (UUID)"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                  />
                  <button className="ghost-btn" onClick={onJoinRoom}>JOIN ROOM</button>
                </div>
              </>
            )}
          </div>
        </section>

        {error && <div className="error-pill">{error}</div>}

        <footer className="setup-footer">
          <button className="initialize-btn" onClick={onCreateRoom} disabled={creating}>
            {creating ? "INITIALIZING..." : mode === "solo" ? "START SOLO GAME" : "INITIALIZE GAME"} <Rocket size={18} />
          </button>
          <button className="reset-btn" onClick={() => { setBoardSize("6x6"); setTheme(config.themes[0]?.id ?? "neon"); }}>RESET</button>
        </footer>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell screenKey="home" className="noir-home">
      <aside className="noir-home-leftnav glass-panel">
        <button className="leftnav-icon active"><Home size={18} /></button>
        <button className="leftnav-icon"><Gamepad2 size={18} /></button>
        <button className="leftnav-icon"><BarChart3 size={18} /></button>
        <button className="leftnav-icon" onClick={() => navigate("/friends")}><Users size={18} /></button>
      </aside>

      <section className="noir-home-main">
        <header className="noir-home-topbar glass-panel">
          <strong>Good evening, {profile?.username ?? "Agent"}</strong>
          <div className="noir-home-top-actions">
            <label className="noir-search-pill">
              <Search size={15} />
              <input placeholder="Search games..." />
            </label>
            <button className="icon-square-btn"><Bell size={14} /></button>
            <button className="rank-avatar" onClick={() => navigate("/profile")}>
              {profile?.avatar_url ? <img src={profile.avatar_url} alt={profile.username} className="avatar-image" /> : <UserRound size={14} />}
            </button>
          </div>
        </header>

        <section className="noir-home-hero glass-panel">
          <p className="hero-chip">POPULAR CHOICE</p>
          <h1>Memory Match: Celestial Edition</h1>
          <p>Unlock ranked multiplayer, realtime duels, and cinematic memory battles.</p>
          <div className="hero-actions">
            <button className="play-now-btn" onClick={() => setShowSetup(true)}><Play size={18} fill="currentColor" /> Play Now</button>
            <button className="secondary-neon-btn" onClick={() => navigate("/history")}><BarChart3 size={16} /> View Details</button>
          </div>
        </section>

        <section className="noir-home-row">
          <header>
            <h3>New Games</h3>
            <button className="ghost-btn" onClick={() => navigate("/friends")}>Browse all</button>
          </header>
          <div className="noir-cards-grid">
            <article className="noir-game-card"><div /><h4>Cyber Quest 2077</h4><p>Action · RPG</p></article>
            <article className="noir-game-card"><div /><h4>Uncharted 4</h4><p>Adventure · Story</p></article>
            <article className="noir-game-card"><div /><h4>Nebula Logic</h4><p>Puzzle · Strategy</p></article>
          </div>
        </section>
      </section>

      <aside className="noir-home-right glass-panel">
        <h2>Activity</h2>
        <article className="activity-hours">
          <p>TOTAL HOURS PLAYED</p>
          <strong>12,340h</strong>
          <small>+12% this month</small>
        </article>
        <div className="activity-friends">
          <h4>Friends</h4>
          <div className="friend-mini"><span>Leo_Gamer</span><small>Playing</small></div>
          <div className="friend-mini"><span>SaraMatches</span><small>Online</small></div>
          <div className="friend-mini"><span>GhostRider</span><small>Offline</small></div>
          <button className="secondary-neon-btn" onClick={() => navigate("/friends")}><Users size={14} /> VIEW ALL FRIENDS</button>
        </div>
        <div className="home-system-status"><Server size={13} /> ONLINE // SUPABASE REALTIME</div>
        <div className="currency-pill"><Coins size={14} /> 12,450</div>
      </aside>
    </ScreenShell>
  );
}
