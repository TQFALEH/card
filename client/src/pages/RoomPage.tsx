import { RealtimeChannel } from "@supabase/supabase-js";
import { gsap } from "gsap";
import { Clipboard, Wifi, WifiOff } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import GameBoard from "../components/GameBoard";
import ScreenShell from "../components/ScreenShell";
import { useAuth } from "../contexts/AuthContext";
import {
  fetchPlayers,
  fetchRoom,
  fetchState,
  flipCard,
  joinRoom,
  rematchRoom,
  resolvePending,
  setReady,
  tryStart
} from "../lib/rooms";
import { supabase } from "../lib/supabase";
import type { CanonicalState, Room, RoomPlayer, RoomStateRow } from "../types";

interface Toast {
  id: number;
  text: string;
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
  const channelRef = useRef<RealtimeChannel | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);

  const addToast = (text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2500);
  };

  const myPlayer = useMemo(() => players.find((p) => p.user_id === user?.id), [players, user?.id]);
  const opponent = useMemo(() => players.find((p) => p.user_id !== user?.id), [players, user?.id]);

  const refresh = async () => {
    if (!roomId) return;
    const [nextRoom, nextPlayers, nextState] = await Promise.all([fetchRoom(roomId), fetchPlayers(roomId), fetchState(roomId)]);
    setRoom(nextRoom);
    setPlayers(nextPlayers);
    setRoomState(nextState);
  };

  useEffect(() => {
    if (!user || !roomId) return;
    void joinRoom(roomId).catch(() => {
      addToast("Room full or inaccessible");
      navigate("/");
    });
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
        await channelRef.current?.send({ type: "broadcast", event: "room_started", payload: {} });
        await refresh();
      })
      .catch(() => undefined);
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
        .catch(() => undefined);
    }, ms + 20);
    return () => window.clearTimeout(timeout);
  }, [roomState?.version, roomState?.state_json.pending?.resolve_after]);

  useLayoutEffect(() => {
    if (!screenRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".lobby-card, .match-card, .result-card",
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

  const onToggleReady = async () => {
    if (!room || !myPlayer) return;
    await setReady(room.room_id, !myPlayer.is_ready);
    await channelRef.current?.send({ type: "broadcast", event: "ready_changed", payload: {} });
    await refresh();
  };

  const onCopyInvite = async () => {
    if (!roomId) return;
    const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    await navigator.clipboard.writeText(`${appUrl}/join/${roomId}`);
    addToast("Invite link copied");
  };

  const onCardClick = async (index: number) => {
    if (!room || !roomState || !user) return;
    if (roomState.state_json.current_player !== user.id) return;
    const next: any = await flipCard(room.room_id, index, roomState.version);
    setRoomState({ room_id: room.room_id, state_json: next.state_json, version: next.version, updated_at: new Date().toISOString() });
    await channelRef.current?.send({ type: "broadcast", event: "state_updated", payload: { version: next.version } });
  };

  const onRematchSameRoom = async () => {
    if (!room) return;
    await rematchRoom(room.room_id);
    await channelRef.current?.send({ type: "broadcast", event: "room_rematch", payload: {} });
    addToast("Room reset to lobby");
    await refresh();
  };

  const scores = roomState?.state_json.scores ?? {};

  if (!room || !roomId) return <div className="loading-screen">Loading room...</div>;

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
        <div className="lobby-card glass-panel">
          <h1>Room Lobby</h1>
          <p>Room ID: <strong>{roomId}</strong></p>
          <button className="ghost-btn" onClick={onCopyInvite}><Clipboard size={15} /> Copy Invite Link</button>
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
          <button className="primary-btn" onClick={onToggleReady}>{myPlayer?.is_ready ? "Unready" : "Ready"}</button>
          <button className="ghost-btn" onClick={() => navigate("/")}>Back Home</button>
        </div>
      )}

      {room.status === "playing" && roomState && (
        <div className="match-card glass-panel">
          <header className="match-header">
            <h2>{roomState.state_json.current_player === user?.id ? "Your turn" : "Opponent turn"}</h2>
            <p>{opponent?.profile?.username ?? "Opponent"}: {onlineIds.includes(opponent?.user_id ?? "") ? "Online" : "Offline"}</p>
          </header>
          <div className="score-row">
            {players.map((p) => (
              <div key={p.user_id} className={`score-chip ${roomState.state_json.current_player === p.user_id ? "active" : ""}`}>
                <span>{p.profile?.username ?? "Player"}</span>
                <strong>{scores[p.user_id] ?? 0}</strong>
              </div>
            ))}
          </div>
          <GameBoard state={roomState.state_json} onCardClick={onCardClick} />
        </div>
      )}

      {room.status === "ended" && roomState && (
        <div className="result-card glass-panel">
          <h1>Match Finished</h1>
          <p>Moves: {roomState.state_json.moves} | Time: {Math.max(1, Math.floor((new Date(roomState.state_json.ended_at ?? new Date().toISOString()).getTime() - new Date(roomState.state_json.started_at).getTime()) / 1000))}s</p>
          <div className="score-row">
            {players.map((p) => (
              <div key={p.user_id} className="score-chip"><span>{p.profile?.username ?? "Player"}</span><strong>{scores[p.user_id] ?? 0}</strong></div>
            ))}
          </div>
          <div className="result-actions">
            <button className="primary-btn" onClick={onRematchSameRoom}>Rematch Same Room</button>
            <button className="ghost-btn" onClick={() => navigate("/")}>Rematch (New Room)</button>
          </div>
        </div>
      )}
      </div>
    </ScreenShell>
  );
}
