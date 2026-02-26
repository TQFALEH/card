import { gsap } from "gsap";
import { Bell, Check, Clock3, Search, Send, ShieldBan, UserPlus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScreenShell from "../components/ScreenShell";
import { useAuth } from "../contexts/AuthContext";
import { useConfig } from "../contexts/ConfigContext";
import { usePresence } from "../contexts/PresenceContext";
import {
  cancelFriendRequest,
  createInvitation,
  fetchProfiles,
  listFriendRelations,
  listPresence,
  respondFriendRequest,
  sendFriendRequest
} from "../lib/social";
import { supabase } from "../lib/supabase";
import type { FriendRelation, Profile } from "../types";

export default function FriendsPage() {
  const { user } = useAuth();
  const { config } = useConfig();
  const { onlineIds, statusMap } = usePresence();
  const navigate = useNavigate();
  const [relations, setRelations] = useState<FriendRelation[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [presenceRows, setPresenceRows] = useState<Map<string, { status: string }>>(new Map());
  const [search, setSearch] = useState("");
  const [boardSize, setBoardSize] = useState<string>(config.boardSizes[0]?.id ?? "6x6");
  const [theme, setTheme] = useState(config.themes[0]?.id ?? "neon");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [tab, setTab] = useState<"friends" | "requests">("friends");

  const load = async () => {
    if (!user) return;
    const rows = await listFriendRelations(user.id);
    setRelations(rows);

    const ids = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.requester_id, r.addressee_id])
          .filter((id) => id !== user.id)
      )
    );

    const [profileMap, presenceMap] = await Promise.all([fetchProfiles(ids), listPresence(ids)]);
    setProfiles(profileMap);
    setPresenceRows(presenceMap as any);
  };

  useEffect(() => {
    if (!user) return;
    void load();

    const invitesChannel = supabase.channel(`friends:${user.id}`, {
      config: { private: true, broadcast: { self: true } }
    });

    invitesChannel
      .on("broadcast", { event: "friends_changed" }, () => {
        void load();
      })
      .subscribe();

    const postgresChannel = supabase
      .channel(`friends-db:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "friends" }, () => void load())
      .subscribe();

    return () => {
      invitesChannel.unsubscribe();
      postgresChannel.unsubscribe();
    };
  }, [user?.id]);

  useLayoutEffect(() => {
    gsap.fromTo(".friends-panel", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.32, ease: "power2.out", stagger: 0.05 });
  }, [tab, relations.length]);

  const accepted = useMemo(
    () => relations.filter((r) => r.status === "accepted"),
    [relations]
  );
  const incoming = useMemo(
    () => relations.filter((r) => r.status === "pending" && r.addressee_id === user?.id),
    [relations, user?.id]
  );
  const outgoing = useMemo(
    () => relations.filter((r) => r.status === "pending" && r.requester_id === user?.id),
    [relations, user?.id]
  );

  const otherUser = (r: FriendRelation) => (r.requester_id === user?.id ? r.addressee_id : r.requester_id);

  const getPresenceText = (id: string) => {
    if (!onlineIds.has(id)) return "offline";
    return (statusMap.get(id) || (presenceRows.get(id) as any)?.status || "online").replace("_", " ");
  };

  const onSend = async () => {
    if (!search.trim()) return;
    setBusy(true);
    setInfo(null);
    try {
      await sendFriendRequest(search.trim());
      setInfo("Friend request sent");
      setSearch("");
      await load();
    } catch (err: any) {
      setInfo(err?.message ?? "Failed to send request");
    } finally {
      setBusy(false);
    }
  };

  const onInvite = async (friendId: string) => {
    setBusy(true);
    setInfo(null);
    try {
      await createInvitation(friendId, boardSize, theme);
      setInfo("Invitation sent");
    } catch (err: any) {
      setInfo(err?.message ?? "Invite failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell screenKey="friends" className="friends-screen">
      <header className="friends-head friends-panel glass-panel">
        <h2>Friends & Invites</h2>
        <div className="friends-top-actions">
          <button className={`secondary-neon-btn ${tab === "friends" ? "selected" : ""}`} onClick={() => setTab("friends")}><UserPlus size={16} /> Friends</button>
          <button className={`secondary-neon-btn ${tab === "requests" ? "selected" : ""}`} onClick={() => setTab("requests")}><Bell size={16} /> Requests</button>
          <button className="secondary-neon-btn" onClick={() => navigate("/")}>Back</button>
        </div>
      </header>

      <section className="friends-panel glass-panel friends-search-box">
        <div className="join-by-code">
          <input value={search} placeholder="Search username" onChange={(e) => setSearch(e.target.value)} />
          <button className="ghost-btn" onClick={onSend} disabled={busy}><Search size={14} /> Add Friend</button>
        </div>

        <div className="friends-config-row">
          <select value={boardSize} onChange={(e) => setBoardSize(e.target.value)}>
            {config.boardSizes.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
          </select>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {config.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {info && <div className="error-pill">{info}</div>}
      </section>

      {tab === "friends" && (
        <section className="friends-panel glass-panel">
          <h3>Accepted Friends</h3>
          <div className="friends-list">
            {accepted.map((r) => {
              const id = otherUser(r);
              const p = profiles.get(id);
              return (
                <article className="friend-row-card" key={r.id}>
                  <div>
                    <strong>{p?.username ?? id.slice(0, 8)}</strong>
                    <p>{getPresenceText(id)}</p>
                  </div>
                  <button className="primary-btn" onClick={() => void onInvite(id)} disabled={busy}><Send size={14} /> Invite</button>
                </article>
              );
            })}
            {!accepted.length && <p className="muted-line">No friends yet.</p>}
          </div>
        </section>
      )}

      {tab === "requests" && (
        <section className="friends-panel glass-panel friends-req-grid">
          <div>
            <h3>Incoming</h3>
            <div className="friends-list">
              {incoming.map((r) => {
                const p = profiles.get(r.requester_id);
                return (
                  <article className="friend-row-card" key={r.id}>
                    <div>
                      <strong>{p?.username ?? r.requester_id.slice(0, 8)}</strong>
                      <p>pending</p>
                    </div>
                    <div className="inline-btns">
                      <button className="ghost-btn" onClick={() => void respondFriendRequest(r.id, "accept").then(load)}><Check size={14} /></button>
                      <button className="ghost-btn" onClick={() => void respondFriendRequest(r.id, "reject").then(load)}><X size={14} /></button>
                      <button className="ghost-btn" onClick={() => void respondFriendRequest(r.id, "block").then(load)}><ShieldBan size={14} /></button>
                    </div>
                  </article>
                );
              })}
              {!incoming.length && <p className="muted-line">No incoming requests.</p>}
            </div>
          </div>

          <div>
            <h3>Outgoing</h3>
            <div className="friends-list">
              {outgoing.map((r) => {
                const p = profiles.get(r.addressee_id);
                return (
                  <article className="friend-row-card" key={r.id}>
                    <div>
                      <strong>{p?.username ?? r.addressee_id.slice(0, 8)}</strong>
                      <p><Clock3 size={12} /> pending</p>
                    </div>
                    <button className="ghost-btn" onClick={() => void cancelFriendRequest(r.id).then(load)}>Cancel</button>
                  </article>
                );
              })}
              {!outgoing.length && <p className="muted-line">No outgoing requests.</p>}
            </div>
          </div>
        </section>
      )}
    </ScreenShell>
  );
}
