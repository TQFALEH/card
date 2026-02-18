import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";

type SoundEvent = "ui" | "flip" | "match" | "mismatch" | "victory" | "start";

interface SoundContextType {
  muted: boolean;
  toggleMute: () => void;
  play: (event: SoundEvent, volumeScale?: number) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

const SOUND_FILES: Record<SoundEvent, string> = {
  ui: "/sfx/ui_click.wav",
  flip: "/sfx/card_flip.wav",
  match: "/sfx/match_ok.wav",
  mismatch: "/sfx/match_wrong.wav",
  victory: "/sfx/victory.wav",
  start: "/sfx/game_start.wav"
};

const BASE_VOLUME: Record<SoundEvent, number> = {
  ui: 0.35,
  flip: 0.38,
  match: 0.52,
  mismatch: 0.48,
  victory: 0.62,
  start: 0.5
};

export function SoundProvider({ children }: PropsWithChildren) {
  const [muted, setMuted] = useState(() => localStorage.getItem("memora_muted") === "1");
  const audioPoolRef = useRef<Record<SoundEvent, HTMLAudioElement[]>>({
    ui: [],
    flip: [],
    match: [],
    mismatch: [],
    victory: [],
    start: []
  });

  const ensurePool = (event: SoundEvent) => {
    const pool = audioPoolRef.current[event];
    if (pool.length) return pool;
    const base = new Audio(SOUND_FILES[event]);
    base.preload = "auto";
    pool.push(base);
    return pool;
  };

  const play = (event: SoundEvent, volumeScale = 1) => {
    if (muted) return;
    const pool = ensurePool(event);
    let audio = pool.find((a) => a.paused || a.ended);
    if (!audio) {
      audio = pool[0].cloneNode(true) as HTMLAudioElement;
      audio.preload = "auto";
      pool.push(audio);
    }
    audio.currentTime = 0;
    audio.volume = Math.min(1, Math.max(0, BASE_VOLUME[event] * volumeScale));
    void audio.play().catch(() => undefined);
  };

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem("memora_muted", next ? "1" : "0");
      return next;
    });
  };

  useEffect(() => {
    (Object.keys(SOUND_FILES) as SoundEvent[]).forEach((event) => {
      const pool = ensurePool(event);
      pool[0].load();
    });
  }, []);

  useEffect(() => {
    const onPointerDown = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".memory-card")) return;
      if (target.closest("button, a, input, select, textarea, label, [role='button']")) {
        play("ui", 0.9);
      }
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [muted]);

  const value = useMemo(() => ({ muted, toggleMute, play }), [muted]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used inside SoundProvider");
  return ctx;
}
