import { Clock3, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { fetchProfiles, listPendingInvitesForUser, respondInvitation } from "../lib/social";
import { supabase } from "../lib/supabase";
import type { Invitation, Profile } from "../types";

export default function InviteInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());

  const load = async () => {
    if (!user) return;
    const rows = await listPendingInvitesForUser(user.id);
    setInvites(rows);
    const ids = Array.from(new Set(rows.map((r) => r.from_user_id)));
    setProfiles(await fetchProfiles(ids));
  };

  useEffect(() => {
    if (!user) return;
    void load();

    const channel = supabase.channel(`invites:${user.id}`, {
      config: { private: true, broadcast: { self: true } }
    });
    channel.on("broadcast", { event: "invite_created" }, () => void load()).subscribe();

    const db = supabase
      .channel(`invites-db:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invitations", filter: `to_user_id=eq.${user.id}` }, () => void load())
      .subscribe();

    const timer = window.setInterval(() => void load(), 10000);

    return () => {
      window.clearInterval(timer);
      channel.unsubscribe();
      db.unsubscribe();
    };
  }, [user?.id]);

  const active = useMemo(() => invites.find((i) => new Date(i.expires_at).getTime() > Date.now()) ?? null, [invites]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (!user || !active) return null;

  const sender = profiles.get(active.from_user_id);
  const sec = Math.max(0, Math.floor((new Date(active.expires_at).getTime() - now) / 1000));

  return (
    <div className="invite-overlay">
      <section className="invite-modal glass-panel">
        <header>
          <h3>Game Invitation</h3>
          <button className="icon-square-btn" onClick={() => void respondInvitation(active.id, "reject")}><X size={14} /></button>
        </header>
        <p><strong>{sender?.username ?? "Friend"}</strong> invited you to play.</p>
        <p>Settings: {active.board_size} • {active.theme}</p>
        <p><Clock3 size={14} /> Expires in {sec}s</p>
        <div className="victory-ctas">
          <button
            className="victory-play-btn"
            onClick={() => void respondInvitation(active.id, "accept").then((roomId) => roomId && navigate(`/room/${roomId}`))}
          >Accept</button>
          <button className="victory-menu-btn" onClick={() => void respondInvitation(active.id, "reject")}>Reject</button>
        </div>
      </section>
    </div>
  );
}
