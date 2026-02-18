import { RealtimeChannel } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import { setPresence } from "../lib/social";

type PresenceStatus = "online" | "offline" | "in_lobby" | "in_match";

interface PresenceContextType {
  onlineIds: Set<string>;
  statusMap: Map<string, PresenceStatus>;
  announce: (status: PresenceStatus, roomId?: string | null) => Promise<void>;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

export function PresenceProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [statusMap, setStatusMap] = useState<Map<string, PresenceStatus>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastRouteRef = useRef<string>("");

  const syncTrack = (channel: RealtimeChannel, status: PresenceStatus, roomId: string | null = null) => {
    if (!user) return;
    void channel.track({ user_id: user.id, status, room_id: roomId, at: Date.now() });
  };

  const announce = async (status: PresenceStatus, roomId: string | null = null) => {
    if (!user) return;
    await setPresence(status, roomId);
    if (channelRef.current) syncTrack(channelRef.current, status, roomId);
  };

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel("presence:global", {
      config: {
        private: true,
        presence: { key: user.id },
        broadcast: { self: true }
      }
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        const statuses = new Map<string, PresenceStatus>();
        Object.values(state).forEach((entries: any) => {
          (entries as any[]).forEach((entry) => {
            if (!entry.user_id) return;
            ids.add(entry.user_id);
            if (entry.status) statuses.set(entry.user_id, entry.status as PresenceStatus);
          });
        });
        setOnlineIds(ids);
        setStatusMap(statuses);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          const route = window.location.pathname;
          const nextStatus: PresenceStatus = route.startsWith("/room/") ? "in_match" : route === "/" ? "in_lobby" : "online";
          syncTrack(channel, nextStatus, route.startsWith("/room/") ? route.split("/").pop() ?? null : null);
          void setPresence(nextStatus, route.startsWith("/room/") ? route.split("/").pop() ?? null : null).catch(() => undefined);
          lastRouteRef.current = route;
        }
      });

    channelRef.current = channel;

    const timer = window.setInterval(() => {
      const route = window.location.pathname;
      if (!user) return;
      const status: PresenceStatus = route.startsWith("/room/") ? "in_match" : route === "/" ? "in_lobby" : "online";
      const roomId = route.startsWith("/room/") ? route.split("/").pop() ?? null : null;

      if (route !== lastRouteRef.current) {
        syncTrack(channel, status, roomId);
        lastRouteRef.current = route;
      }
      void setPresence(status, roomId).catch(() => undefined);
    }, 15000);

    const onBeforeUnload = () => {
      void setPresence("offline", null).catch(() => undefined);
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void setPresence("offline", null).catch(() => undefined);
      channel.unsubscribe();
    };
  }, [user?.id]);

  const value = useMemo(() => ({ onlineIds, statusMap, announce }), [onlineIds, statusMap]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error("usePresence must be used inside PresenceProvider");
  return ctx;
}
