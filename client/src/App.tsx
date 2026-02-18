import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from "react-router-dom";
import AnimatedBackground from "./components/AnimatedBackground";
import { useAuth } from "./contexts/AuthContext";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import JoinPage from "./pages/JoinPage";
import ProfilePage from "./pages/ProfilePage";
import RoomPage from "./pages/RoomPage";

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="loading-screen">Loading session...</div>;
  if (!user) return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

export default function App() {
  return (
    <Router>
      <main className="app-root">
        <AnimatedBackground />
        <div className="app-shell">
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/join/:roomId" element={<JoinPage />} />
            <Route path="/" element={<Protected><HomePage /></Protected>} />
            <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
            <Route path="/room/:roomId" element={<Protected><RoomPage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </Router>
  );
}
