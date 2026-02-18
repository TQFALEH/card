import {
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  Clock3,
  CreditCard,
  Globe,
  LogOut,
  MapPin,
  MessageSquare,
  Shield,
  Trophy,
  User,
  UserRound,
  Zap
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import type { Stats } from "../types";

export default function ProfilePage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [username, setUsername] = useState(profile?.username ?? "");
  const [stats, setStats] = useState<Stats | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    void supabase.from("stats").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => setStats(data as Stats | null));
  }, [user?.id]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from("profiles").upsert({ user_id: user.id, username });
    await refreshProfile();
    setSaving(false);
  };

  return (
    <ScreenShell screenKey="profile" className="profile-screen">
      <header className="profile-topbar">
        <div className="profile-brand">
          <span className="victory-brand-icon"><Trophy size={15} /></span>
          <strong>ArenaProfile</strong>
        </div>
        <div className="profile-top-actions">
          <button className="icon-square-btn" onClick={() => navigate("/")}><UserRound size={16} /></button>
        </div>
      </header>

      <section className="profile-main-grid">
        <div className="profile-left">
          <section className="profile-hero glass-panel">
            <div className="winner-avatar-ring">
              <div className="winner-avatar-core">{(profile?.username?.[0] ?? "P").toUpperCase()}</div>
              <span className="winner-badge">GRANDMASTER</span>
            </div>
            <div className="profile-hero-text">
              <h2>{profile?.username ?? "Player"}</h2>
              <p>Level 42 · Elite Tactician</p>
              <div className="profile-meta">
                <span><CalendarDays size={13} /> Joined Online</span>
                <span><MapPin size={13} /> Supabase Region</span>
              </div>
              <div className="profile-actions">
                <button className="victory-play-btn" onClick={save} disabled={saving}><User size={15} /> {saving ? "Saving..." : "Edit Profile"}</button>
                <button className="victory-menu-btn"><Shield size={15} /> Security</button>
              </div>
            </div>
          </section>

          <section className="profile-stats-grid">
            <article className="profile-stat glass-panel"><p>TOTAL WINS</p><strong>{stats?.wins ?? 0}</strong><small className="up">+12%</small></article>
            <article className="profile-stat glass-panel"><p>GLOBAL RANK</p><strong>#{Math.max(50, 1000 - (stats?.wins ?? 0))}</strong><small className="up">↑5</small></article>
            <article className="profile-stat glass-panel"><p>WIN RATE</p><strong>{Math.round(stats?.win_rate ?? 0)}%</strong><small className="down">-2%</small></article>
            <article className="profile-stat glass-panel"><p>TOTAL XP</p><strong>{((stats?.games_played ?? 0) * 120).toLocaleString()}</strong><small className="up">+1.2k</small></article>
          </section>

          <section className="profile-achievements glass-panel">
            <div className="profile-section-head"><h3>Achievements</h3></div>
            <div className="ach-grid">
              <article className="ach-item"><Zap size={18} /><strong>Speed Demon</strong></article>
              <article className="ach-item"><BadgeCheck size={18} /><strong>Memory Master</strong></article>
              <article className="ach-item"><Trophy size={18} /><strong>Veteran</strong></article>
              <article className="ach-item muted"><Shield size={18} /><strong>Immortal</strong></article>
            </div>
          </section>
        </div>

        <aside className="profile-right">
          <section className="profile-side-card glass-panel">
            <h4>Friends Online</h4>
            <div className="friend-row"><span>CyberKnight</span><MessageSquare size={14} /></div>
            <div className="friend-row"><span>NeonRider</span><MessageSquare size={14} /></div>
            <div className="friend-row"><span>GlitchBox</span><Clock3 size={14} /></div>
            <button className="victory-menu-btn full">FIND MORE PLAYERS</button>
          </section>

          <button className="profile-link-btn glass-panel"><CreditCard size={16} /> Subscription & Billing <ChevronRight size={14} /></button>
          <button className="profile-link-btn glass-panel"><Globe size={16} /> Language & Region <ChevronRight size={14} /></button>
          <button className="profile-link-btn glass-panel danger" onClick={() => void signOut().then(() => navigate("/auth", { replace: true }))}><LogOut size={16} /> Log Out</button>

          <section className="profile-side-card glass-panel">
            <h4>Edit Username</h4>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </section>
        </aside>
      </section>
    </ScreenShell>
  );
}
