import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import type { Stats } from "../types";

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
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
    <ScreenShell screenKey="profile" className="profile-card glass-panel">
      <h1>Profile</h1>
      <label>Username</label>
      <input value={username} onChange={(e) => setUsername(e.target.value)} />
      <button className="primary-btn" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
      <div className="stats-mini">
        <span>Games: {stats?.games_played ?? 0}</span>
        <span>Wins: {stats?.wins ?? 0}</span>
        <span>Losses: {stats?.losses ?? 0}</span>
        <span>Win Rate: {Math.round(stats?.win_rate ?? 0)}%</span>
      </div>
      <button className="ghost-btn" onClick={() => navigate("/")}>Back</button>
    </ScreenShell>
  );
}
