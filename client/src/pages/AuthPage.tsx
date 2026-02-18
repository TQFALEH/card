import { FormEvent, useState } from "react";
import { AtSign, Cpu, Eye, EyeOff, Lock, Zap } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);

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
    <ScreenShell screenKey="auth" className="auth-shell">
      <div className="auth-brand">
        <span className="auth-brand-icon"><Cpu size={15} /></span>
        <span>MEMORA PRO</span>
      </div>

      <section className="auth-card glass-panel">
        <header className="auth-header">
          <h1>IDENTITY VERIFICATION</h1>
          <p>SECURE NODE ACCESS REQUIRED</p>
        </header>

        <form onSubmit={onSubmit} className="auth-form">
          {mode === "signup" && (
            <>
              <label>CALLSIGN (USERNAME)</label>
              <div className="auth-input-wrap">
                <AtSign size={18} />
                <input placeholder="commander_x" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
            </>
          )}

          <label>GRID IDENTIFIER (EMAIL)</label>
          <div className="auth-input-wrap">
            <AtSign size={18} />
            <input type="email" placeholder="commander@nexus.gg" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="auth-pass-row">
            <label>CIPHER (PASSWORD)</label>
            <button type="button" className="auth-link-mini">FORGOT SEQUENCE?</button>
          </div>
          <div className="auth-input-wrap">
            <Lock size={18} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <button type="button" className="eye-btn" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && <div className="error-pill">{error}</div>}

          <button className="auth-main-btn" disabled={loading}>
            {loading ? "PROCESSING..." : mode === "login" ? "INITIALIZE SESSION" : "CREATE ACCOUNT"} <Zap size={16} />
          </button>
        </form>

        <div className="auth-alt">
          <span>ALTERNATE NODES</span>
          <div className="auth-alt-row">
            <button type="button" className="auth-alt-btn">DISCORD</button>
            <button type="button" className="auth-alt-btn">GOOGLE</button>
          </div>
        </div>

        <p className="auth-switch">
          {mode === "login" ? "New to the network?" : "Already authenticated?"}{" "}
          <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "CREATE ACCOUNT" : "SIGN IN"}
          </button>
        </p>
      </section>

      <footer className="auth-footer">
        <span>PROTOCOL STATUS: ONLINE</span>
        <span>TERMS OF ENGAGEMENT</span>
        <span>PRIVACY ENCRYPTION</span>
      </footer>
      <small className="auth-build">© 2026 NEXUS INTERACTIVE | MEMORA PRO V2.4.0</small>
    </ScreenShell>
  );
}
