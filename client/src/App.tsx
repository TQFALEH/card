import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import AnimatedBackground from "./components/AnimatedBackground";
import { useAuth } from "./contexts/AuthContext";
import { useSound } from "./contexts/SoundContext";
import AuthPage from "./pages/AuthPage";
import FriendsPage from "./pages/FriendsPage";
import HistoryPage from "./pages/HistoryPage";
import HomePage from "./pages/HomePage";
import JoinPage from "./pages/JoinPage";
import ProfilePage from "./pages/ProfilePage";
import RoomPage from "./pages/RoomPage";
import SoloPage from "./pages/SoloPage";
import { Volume2, VolumeX } from "lucide-react";
import InviteInbox from "./components/InviteInbox";

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="loading-screen">Loading session...</div>;
  if (!user) return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

function MusicRouteSync() {
  const location = useLocation();
  const { setMusicMode } = useSound();

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/room/") || path.startsWith("/solo")) {
      setMusicMode("game");
      return;
    }
    setMusicMode("menu");
  }, [location.pathname, setMusicMode]);

  return null;
}

export default function App() {
  const { muted, toggleMute } = useSound();

  return (
    <Router>
      <main className="app-root">
        <AnimatedBackground />
        <button className="sound-fab" onClick={toggleMute} title={muted ? "Unmute" : "Mute"}>
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <MusicRouteSync />
        <InviteInbox />
        <div className="app-shell">
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/join/:roomId" element={<JoinPage />} />
            <Route path="/" element={<Protected><HomePage /></Protected>} />
            <Route path="/solo" element={<Protected><SoloPage /></Protected>} />
            <Route path="/friends" element={<Protected><FriendsPage /></Protected>} />
            <Route path="/history" element={<Protected><HistoryPage /></Protected>} />
            <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
            <Route path="/room/:roomId" element={<Protected><RoomPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </Router>
  );
}
