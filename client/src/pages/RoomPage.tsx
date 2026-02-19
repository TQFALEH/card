import { RealtimeChannel } from "@supabase/supabase-js";
import { gsap } from "gsap";
import {
  Clipboard,
  Cog,
  Grid2X2,
  Menu,
  RotateCcw,
  Rocket,
  Timer,
  UserRound,
  Wifi,
  WifiOff,
  Zap
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import GameBoard from "../components/GameBoard";
import ScreenShell from "../components/ScreenShell";
import { useAuth } from "../contexts/AuthContext";
import { usePresence } from "../contexts/PresenceContext";
import { useSound } from "../contexts/SoundContext";
import {
  fetchPlayers,
  fetchRoom,
  fetchState,
  flipCard,
  joinRoom,
  rematchRoom,
  resolvePending,
  setReady,
  tryStart,
  updateRoomSettings
} from "../lib/rooms";
import { finalizeMatch } from "../lib/social";
import { supabase } from "../lib/supabase";
import type { Room, RoomPlayer, RoomStateRow } from "../types";

interface Toast {
  id: number;
  text: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function RoomPage() {
  const { roomId } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [roomState, setRoomState] = useState<RoomStateRow | null>(null);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lobbyBoardSize, setLobbyBoardSize] = useState<string>("6x6");
  const [lobbyTheme, setLobbyTheme] = useState<string>("neon");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);

  const myPlayer = useMemo(() => players.find((p) => p.user_id === user?.id), [players, user?.id]);
  const opponent = useMemo(() => players.find((p) => p.user_id !== user?.id), [players, user?.id]);
  const scores = roomState?.state_json.scores ?? {};
  const winner = roomState ? [...players].sort((a, b) => (scores[b.user_id] ?? 0) - (scores[a.user_id] ?? 0))[0] : null;
  const { play } = useSound();
  const { announce } = usePresence();
  const prevStatusRef = useRef<Room["status"] | null>(null);
  const finalizedRef = useRef<string | null>(null);

  const addToast = (text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  };

  const refresh = async (): Promise<boolean> => {
    if (!roomId) return false;
    try {
      const [nextRoom, nextPlayers, nextState] = await Promise.all([fetchRoom(roomId), fetchPlayers(roomId), fetchState(roomId)]);
      setRoom(nextRoom);
      setPlayers(nextPlayers);
      setRoomState(nextState);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (!user || !roomId) return;
    void announce("in_match", roomId);
    let active = true;
    void (async () => {
      try {
        await joinRoom(roomId);
      } catch {
        const ok = await refresh();
        if (!active) return;
        let isAlreadyMember = false;
        if (ok) {
          try {
            const currentPlayers = await fetchPlayers(roomId);
            isAlreadyMember = currentPlayers.some((p) => p.user_id === user.id);
          } catch {
            isAlreadyMember = false;
          }
        }
        if (!isAlreadyMember) {
          addToast("Room full or inaccessible");
          navigate("/");
        }
      }
    })();
    return () => {
      active = false;
      void announce("online", null);
    };
  }, [user?.id, roomId]);

  useEffect(() => {
    if (!user || !roomId) return;

    void refresh();

    const channel = supabase.channel(`room:${roomId}`, {
      config: {
        private: true,
        presence: { key: user.id },
        broadcast: { self: true }
      }
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const ids = Object.values(state)
          .flat()
          .map((entry: any) => entry.user_id);
        setOnlineIds(Array.from(new Set(ids)));
      })
      .on("broadcast", { event: "player_joined" }, (payload) => {
        if (payload.payload.user_id !== user.id) addToast("Player joined");
        void refresh();
      })
      .on("broadcast", { event: "ready_changed" }, () => void refresh())
      .on("broadcast", { event: "room_started" }, () => {
        addToast("Match started");
        play("start");
        void refresh();
      })
      .on("broadcast", { event: "room_rematch" }, () => {
        addToast("Rematch requested");
        void refresh();
      })
      .on("broadcast", { event: "state_updated" }, () => void refresh())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setReconnecting(false);
          void channel.track({ user_id: user.id, username: profile?.username ?? "Player", ready: Boolean(myPlayer?.is_ready) });
          void channel.send({ type: "broadcast", event: "player_joined", payload: { user_id: user.id } });
          return;
        }
        setReconnecting(true);
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [user?.id, roomId]);

  useEffect(() => {
    if (!channelRef.current || !user) return;
    void channelRef.current.track({ user_id: user.id, username: profile?.username ?? "Player", ready: Boolean(myPlayer?.is_ready) });
  }, [myPlayer?.is_ready, profile?.username]);

  useEffect(() => {
    if (!room || room.status !== "lobby") return;
    if (players.length !== 2 || !players.every((p) => p.is_ready)) return;
    if (room.host_id !== user?.id) return;

    void tryStart(room.room_id)
      .then(async () => {
        play("start");
        await channelRef.current?.send({ type: "broadcast", event: "room_started", payload: {} });
        await refresh();
      })
      .catch((err: any) => addToast(err?.message ?? "Unable to start room"));
  }, [room?.status, players.map((p) => p.is_ready).join("|"), user?.id]);

  useEffect(() => {
    if (!roomState?.state_json.pending || !roomId) return;
    const ms = Math.max(0, new Date(roomState.state_json.pending.resolve_after).getTime() - Date.now());
    const timeout = window.setTimeout(() => {
      void resolvePending(roomId, roomState.version)
        .then(async (next: any) => {
          setRoomState({ room_id: roomId, state_json: next.state_json, version: next.version, updated_at: new Date().toISOString() });
          await channelRef.current?.send({ type: "broadcast", event: "state_updated", payload: { version: next.version } });
        })
        .catch(async () => {
          await refresh();
        });
    }, ms + 20);
    return () => window.clearTimeout(timeout);
  }, [roomState?.version, roomState?.state_json.pending?.resolve_after]);

  useLayoutEffect(() => {
    if (!screenRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".setup-screen, .arena-screen, .victory-screen",
        { autoAlpha: 0, y: 20, scale: 0.985 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.42, ease: "power3.out" }
      );
    }, screenRef);
    return () => ctx.revert();
  }, [room?.status]);

  useLayoutEffect(() => {
    if (!toasts.length) return;
    gsap.fromTo(
      ".toast-item",
      { autoAlpha: 0, x: 14, scale: 0.96 },
      { autoAlpha: 1, x: 0, scale: 1, duration: 0.25, stagger: 0.05, ease: "power2.out" }
    );
  }, [toasts.length]);

  useEffect(() => {
    if (!room?.status) return;
    const prev = prevStatusRef.current;
    if (prev && prev !== room.status) {
      if (room.status === "ended") play("victory");
      if (room.status === "playing") play("start");
    }
    prevStatusRef.current = room.status;
  }, [room?.status]);

  useEffect(() => {
    if (!roomId || room?.status !== "ended") return;
    if (finalizedRef.current === roomId) return;
    finalizedRef.current = roomId;
    void finalizeMatch(roomId).catch(() => {
      finalizedRef.current = null;
    });
  }, [room?.status, roomId]);

  const onToggleReady = async () => {
    if (!room || !myPlayer) return;
    await setReady(room.room_id, !myPlayer.is_ready);
    await channelRef.current?.send({ type: "broadcast", event: "ready_changed", payload: {} });
    await refresh();
  };

  useEffect(() => {
    if (!room) return;
    setLobbyBoardSize(room.board_size);
    setLobbyTheme(room.theme);
  }, [room?.board_size, room?.theme, room?.room_id]);

  const onUpdateRoomSettings = async () => {
    if (!room) return;
    try {
      await updateRoomSettings(room.room_id, lobbyBoardSize, lobbyTheme);
      await channelRef.current?.send({ type: "broadcast", event: "state_updated", payload: { settings: true } });
      addToast("Room settings updated");
      await refresh();
    } catch (err: any) {
      addToast(err?.message ?? "Failed to update settings");
    }
  };

  const onCopyInvite = async () => {
    if (!roomId) return;
    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    await navigator.clipboard.writeText(`${appUrl}/join/${roomId}`);
    addToast("Invite link copied");
  };

  const onCardClick = async (index: number) => {
    if (!room || !roomState || !user) return;
    if (roomState.state_json.current_player !== user.id) {
      addToast("Wait for your turn");
      return;
    }
    try {
      play("flip");
      const next: any = await flipCard(room.room_id, index, roomState.version);
      if (next?.state_json?.pending?.type === "match") play("match");
      if (next?.state_json?.pending?.type === "mismatch") play("mismatch");
      setRoomState({ room_id: room.room_id, state_json: next.state_json, version: next.version, updated_at: new Date().toISOString() });
      await channelRef.current?.send({ type: "broadcast", event: "state_updated", payload: { version: next.version } });
    } catch (err: any) {
      addToast(err?.message ?? "Flip rejected");
      await refresh();
    }
  };

  const onRematchSameRoom = async () => {
    if (!room) return;
    try {
      await rematchRoom(room.room_id);
      await channelRef.current?.send({ type: "broadcast", event: "room_rematch", payload: {} });
      addToast("Room reset to lobby");
      await refresh();
    } catch (err: any) {
      addToast(err?.message ?? "Rematch failed");
    }
  };

  const onManualStart = async () => {
    if (!room) return;
    try {
      await tryStart(room.room_id);
      await channelRef.current?.send({ type: "broadcast", event: "room_started", payload: {} });
      await refresh();
    } catch (err: any) {
      addToast(err?.message ?? "Start failed");
    }
  };

  if (!room || !roomId) return <div className="loading-screen">Loading room...</div>;

  const elapsedMs = roomState?.state_json.started_at
    ? Math.max(0, (roomState.state_json.ended_at ? new Date(roomState.state_json.ended_at).getTime() : Date.now()) - new Date(roomState.state_json.started_at).getTime())
    : 0;
  const accuracy = roomState?.state_json.attempts ? Math.round((roomState.state_json.matched_pairs / roomState.state_json.attempts) * 100) : 0;

  return (
    <ScreenShell screenKey={`room-${room.status}`} className="room-screen">
      <div ref={screenRef}>
        {reconnecting && <div className="reconnect-overlay">Reconnecting...</div>}
        <div className="toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className="toast-item">{t.text}</div>
          ))}
        </div>

        {room.status === "lobby" && (
          <section className="setup-screen glass-panel">
            <header className="setup-header">
              <div className="setup-title-wrap">
                <span className="setup-icon"><Rocket size={18} /></span>
                <div>
                  <h2>ONLINE LOBBY</h2>
                  <p>ROOM READY // WAITING FOR PLAYERS</p>
                </div>
              </div>
              <button className="icon-square-btn" onClick={() => navigate("/")}><Menu size={18} /></button>
            </header>

            <section>
              <h3 className="setup-label">1. ROOM INFORMATION</h3>
              <div className="mission-grid">
                <article className="mission-card selected">
                  <strong>Room ID</strong>
                  <p>{roomId}</p>
                  <button className="ghost-btn" onClick={onCopyInvite}><Clipboard size={15} /> Copy Invite</button>
                </article>
                <article className="mission-card">
                  <strong>Board</strong>
                  <p>{room.board_size}</p>
                  <small>{room.theme.toUpperCase()}</small>
                </article>
                <article className="mission-card">
                  <strong>Status</strong>
                  <p>{room.status.toUpperCase()}</p>
                  <small>{players.length}/2 PLAYERS</small>
                </article>
              </div>
            </section>

            {room.host_id === user?.id && (
              <section>
                <h3 className="setup-label">HOST SETTINGS</h3>
                <div className="friends-config-row">
                  <select value={lobbyBoardSize} onChange={(e) => setLobbyBoardSize(e.target.value)}>
                    <option value="4x4">4x4</option>
                    <option value="6x6">6x6</option>
                    <option value="8x8">8x8</option>
                  </select>
                  <select value={lobbyTheme} onChange={(e) => setLobbyTheme(e.target.value)}>
                    <option value="neon">Neon</option>
                  </select>
                </div>
                <div style={{ marginTop: 10 }}>
                  <button className="ghost-btn" onClick={onUpdateRoomSettings}>Apply Settings</button>
                </div>
              </section>
            )}

            <section>
              <h3 className="setup-label">2. PLAYERS</h3>
              <div className="lobby-players">
                {players.map((p) => (
                  <article key={p.user_id} className="lobby-player glass-panel">
                    <div>
                      <strong>{p.profile?.username ?? p.user_id.slice(0, 6)}</strong>
                      <p>{p.is_host ? "Host" : "Guest"}</p>
                    </div>
                    <div className="presence-pill">
                      {onlineIds.includes(p.user_id) ? <Wifi size={14} /> : <WifiOff size={14} />}
                      {p.is_ready ? "Ready" : "Not Ready"}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <footer className="setup-footer">
              <button className="initialize-btn" onClick={onToggleReady}>{myPlayer?.is_ready ? "UNREADY" : "READY"}</button>
              {room.host_id === user?.id && players.length === 2 && players.every((p) => p.is_ready) ? (
                <button className="reset-btn" onClick={onManualStart}>START</button>
              ) : (
                <button className="reset-btn" onClick={() => navigate("/")}>EXIT</button>
              )}
            </footer>
          </section>
        )}

        {room.status === "playing" && roomState && (
          <section className="arena-screen">
            <header className="match-hud-frame">
              <div className="match-hud-main">
                <article className={`match-player-card ${roomState.state_json.current_player === myPlayer?.user_id ? "active" : ""}`}>
                  <div className="match-player-meta">
                    <span className="match-player-avatar">
                      {myPlayer?.profile?.avatar_url ? <img src={myPlayer.profile.avatar_url} className="avatar-image" alt={myPlayer.profile.username} /> : <UserRound size={13} />}
                    </span>
                    <span>{myPlayer?.profile?.username ?? "PLAYER 1"}</span>
                  </div>
                  <strong>{scores[myPlayer?.user_id ?? ""] ?? 0}</strong>
                </article>

                <div className="match-hud-center">
                  <div className="match-hud-titleblock">
                    <Cog size={14} />
                    <span>MEMORY MATCH</span>
                  </div>
                  <div className="turn-pill">{roomState.state_json.current_player === user?.id ? "CURRENT TURN: YOU" : "CURRENT TURN: OPPONENT"}</div>
                </div>

                <article className={`match-player-card ${roomState.state_json.current_player === opponent?.user_id ? "active" : ""}`}>
                  <div className="match-player-meta">
                    <span className="match-player-avatar">
                      {opponent?.profile?.avatar_url ? <img src={opponent.profile.avatar_url} className="avatar-image" alt={opponent.profile.username} /> : <UserRound size={13} />}
                    </span>
                    <span>{opponent?.profile?.username ?? "PLAYER 2"}</span>
                  </div>
                  <strong>{scores[opponent?.user_id ?? ""] ?? 0}</strong>
                </article>
              </div>
            </header>

            <section className="arena-board-stage">
              <GameBoard state={roomState.state_json} onCardClick={onCardClick} />
            </section>

            <footer className="arena-footer-bar">
              <div className="arena-metric"><span>SESSION TIME</span><strong>{formatDuration(elapsedMs)}</strong></div>
              <div className="arena-metric"><span>TOTAL MOVES</span><strong><Grid2X2 size={14} /> {roomState.state_json.moves}</strong></div>
              <button className="footer-control-btn"><Cog size={16} /> Settings</button>
              <button className="footer-main-btn" onClick={() => navigate("/")}><RotateCcw size={16} /> RESTART GAME</button>
            </footer>
          </section>
        )}

        {room.status === "ended" && roomState && (
          <section className="victory-screen">
            <header className="victory-topbar">
              <div className="victory-brand">
                <span className="victory-brand-icon"><Zap size={15} /></span>
                <strong>Memory Match</strong>
              </div>
              <div className="victory-top-actions">
                <button className="icon-square-btn"><Cog size={17} /></button>
                <div className="rank-pill">
                  <span>RANK</span>
                  <strong>Online Duel</strong>
                </div>
                <button className="rank-avatar" onClick={() => navigate("/profile")}>
                  {profile?.avatar_url ? <img src={profile.avatar_url} alt={profile.username ?? "Player"} className="avatar-image" /> : <UserRound size={14} />}
                </button>
              </div>
            </header>

            <section className="victory-hero">
              <p>MATCH COMPLETED</p>
              <h2>RESULTS</h2>
            </section>

            <section className="victory-main-grid">
              <article className="winner-panel glass-panel">
                <div className="winner-avatar-ring">
                  <div className="winner-avatar-core">
                    {winner?.profile?.avatar_url ? <img src={winner.profile.avatar_url} className="avatar-image" alt={winner.profile.username} /> : (winner?.profile?.username?.[0] ?? "P").toUpperCase()}
                  </div>
                  <span className="winner-badge">MVP</span>
                </div>
                <h3>{winner?.profile?.username ?? "Winner"}</h3>
                <p>GLOBAL LEADERBOARD #{1200 + Math.max(1, roomState.state_json.moves)}</p>
                <div className="xp-panel">
                  <div className="xp-row"><span>XP EARNED</span><strong>+{Math.max(850, accuracy * 22)} XP</strong></div>
                  <div className="xp-bar"><span style={{ width: `${Math.min(96, accuracy)}%` }} /></div>
                  <small>LEVEL 42 · 450 XP TO LEVEL 43</small>
                </div>
              </article>

              <div className="victory-right">
                <div className="victory-stats-grid">
                  <article className="victory-stat-card glass-panel"><p><Zap size={13} /> MOVES</p><strong>{roomState.state_json.moves}</strong><small>BEST: {Math.max(8, roomState.state_json.moves - 3)}</small></article>
                  <article className="victory-stat-card glass-panel"><p><Timer size={13} /> TIME</p><strong>{formatDuration(elapsedMs)}</strong><small>AVG: 01:55</small></article>
                  <article className="victory-stat-card glass-panel"><p><Cog size={13} /> ACCURACY</p><strong>{accuracy}%</strong><small>WORLD AVG: 78%</small></article>
                </div>

                <div className="score-row">
                  {players.map((p) => (
                    <div key={p.user_id} className="score-chip"><span>{p.profile?.username ?? "Player"}</span><strong>{scores[p.user_id] ?? 0}</strong></div>
                  ))}
                </div>

                <div className="victory-ctas">
                  <button className="victory-play-btn" onClick={onRematchSameRoom}><RotateCcw size={17} /> REMATCH SAME ROOM</button>
                  <button className="victory-menu-btn" onClick={() => navigate("/")}><Menu size={17} /> BACK TO HOME</button>
                </div>
              </div>
            </section>
          </section>
        )}
      </div>
    </ScreenShell>
  );
}
