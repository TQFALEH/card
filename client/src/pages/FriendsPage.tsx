import { gsap } from "gsap";
import { Bell, Check, Clock3, MessageCircle, MoreVertical, Search, Send, ShieldBan, Slash, UserPlus, Users, X } from "lucide-react";
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
    <ScreenShell screenKey="friends" className="noir-friends-page">
      <header className="friends-head friends-panel glass-panel noir-friends-header">
        <div className="friends-brand">
          <Users size={18} />
          <h2>Nexus Friends</h2>
        </div>
        <div className="friends-top-actions">
          <label className="noir-search-pill">
            <Search size={14} />
            <input value={search} placeholder="Search friends..." onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button className="icon-square-btn" onClick={onSend} disabled={busy}><UserPlus size={15} /></button>
          <button className="icon-square-btn"><Bell size={14} /></button>
        </div>
      </header>

      <section className="noir-friends-body">
        <aside className="friends-panel glass-panel noir-friends-left">
          <button className={`friend-filter-row ${tab === "friends" ? "active" : ""}`} onClick={() => setTab("friends")}><UserPlus size={15} /> Online <span>{accepted.length}</span></button>
          <button className="friend-filter-row"><Slash size={15} /> Offline <span>{Math.max(0, accepted.length - onlineIds.size)}</span></button>
          <button className={`friend-filter-row ${tab === "requests" ? "active" : ""}`} onClick={() => setTab("requests")}><Bell size={15} /> Requests <span>{incoming.length}</span></button>
          <button className="friend-filter-row"><ShieldBan size={15} /> Blocked <span>0</span></button>
          <div className="grow-circle-card">
            <h4>Grow your circle</h4>
            <p>Connect with more users across the network.</p>
            <button className="ghost-btn" onClick={() => navigate("/profile")}>Find People</button>
          </div>
        </aside>

        <section className="friends-panel glass-panel noir-friends-main">
          <div className="friends-main-head">
            <h3>{tab === "friends" ? "Online Friends" : "Friend Requests"} <span className="dot-online" /></h3>
            <div className="friends-config-row">
              <select value={boardSize} onChange={(e) => setBoardSize(e.target.value)}>
                {config.boardSizes.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
              </select>
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                {config.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {info && <div className="error-pill">{info}</div>}

          {tab === "friends" && (
            <div className="noir-friend-cards">
              {accepted.map((r) => {
                const id = otherUser(r);
                const p = profiles.get(id);
                return (
                  <article className="noir-friend-card" key={r.id}>
                    <div className="friend-row-main">
                      <div className={`friend-avatar-ring ${onlineIds.has(id) ? "online" : ""}`}>
                        {p?.avatar_url ? <img src={p.avatar_url} className="avatar-image" alt={p.username} /> : <span>{(p?.username ?? "P")[0]}</span>}
                      </div>
                      <div>
                        <strong>{p?.username ?? id.slice(0, 8)}</strong>
                        <p>{getPresenceText(id)}</p>
                      </div>
                    </div>
                    <div className="friend-row-actions">
                      <button className="ghost-btn" onClick={() => void onInvite(id)} disabled={busy}><Send size={13} /> Invite</button>
                      <button className="icon-square-btn"><MessageCircle size={13} /></button>
                      <button className="icon-square-btn"><MoreVertical size={13} /></button>
                    </div>
                  </article>
                );
              })}
              {!accepted.length && <p className="muted-line">No friends yet.</p>}
            </div>
          )}

          {tab === "requests" && (
            <div className="friends-req-grid">
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
            </div>
          )}
        </section>
      </section>
    </ScreenShell>
  );
}
