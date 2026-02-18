import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import { useAuth } from "../contexts/AuthContext";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        await signUp(email, password, username);
      }
      const redirect = new URLSearchParams(location.search).get("redirect");
      navigate(redirect || "/", { replace: true });
    } catch (err: any) {
      setError(err.message ?? "Auth error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell screenKey="auth" className="auth-card glass-panel">
      <h1>Neon Memory Online</h1>
      <p>{mode === "login" ? "Sign in to play online rooms" : "Create an account to start"}</p>
      <form onSubmit={onSubmit} className="auth-form">
        {mode === "signup" && <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {error && <div className="error-pill">{error}</div>}
        <button className="primary-btn" disabled={loading}>{loading ? "Please wait..." : mode === "login" ? "Login" : "Sign up"}</button>
      </form>
      <button className="ghost-btn" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Need account? Sign up" : "Have account? Login"}</button>
    </ScreenShell>
  );
}
