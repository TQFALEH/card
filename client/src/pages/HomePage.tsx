import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import ScreenShell from "../components/ScreenShell";
import { useAuth } from "../contexts/AuthContext";
import { useConfig } from "../contexts/ConfigContext";
import { createRoom } from "../lib/rooms";

export default function HomePage() {
  const { profile, signOut } = useAuth();
  const { config } = useConfig();
  const [boardSize, setBoardSize] = useState(config.boardSizes[0]?.id ?? "4x4");
  const [theme, setTheme] = useState(config.themes[0]?.id ?? "neon");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

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

  return (
    <ScreenShell screenKey="home" className="home-online glass-panel">
      <header className="topbar">
        <div>
          <h1>Memory Match Online</h1>
          <p>Realtime multiplayer via Supabase</p>
        </div>
        <div className="top-actions">
          <Link className="ghost-btn" to="/profile">Profile</Link>
          <button className="ghost-btn" onClick={() => void signOut()}>Logout</button>
        </div>
      </header>

      <section className="setup-grid">
        <article className="glass-panel setup-box">
          <h2>Create Room</h2>
          <label>Board Size</label>
          <select value={boardSize} onChange={(e) => setBoardSize(e.target.value as any)}>
            {config.boardSizes.map((s) => (
              <option key={s.id} value={s.id}>{s.label} ({s.rows}x{s.cols})</option>
            ))}
          </select>
          <label>Theme</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {config.themes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {error && <div className="error-pill">{error}</div>}
          <button className="primary-btn" onClick={onCreateRoom} disabled={creating}>{creating ? "Creating..." : "Create Invite Room"}</button>
        </article>

        <article className="glass-panel setup-box">
          <h2>Welcome</h2>
          <p>Logged in as <strong>{profile?.username ?? "Player"}</strong></p>
          <p>Create a room, share the invite link, and play realtime with authoritative DB state.</p>
        </article>
      </section>
    </ScreenShell>
  );
}
