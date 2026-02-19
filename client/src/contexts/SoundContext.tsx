import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";

type SoundEvent = "ui" | "flip" | "match" | "mismatch" | "victory" | "start";
type MusicMode = "menu" | "game" | "victory";

interface SoundContextType {
  muted: boolean;
  toggleMute: () => void;
  play: (event: SoundEvent, volumeScale?: number) => void;
  setMusicMode: (mode: MusicMode) => void;
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
  const ctxRef = useRef<AudioContext | null>(null);
  const musicMasterRef = useRef<GainNode | null>(null);
  const musicTimerRef = useRef<number | null>(null);
  const musicModeRef = useRef<MusicMode>("menu");
  const musicBarRef = useRef(0);
  const audioPoolRef = useRef<Record<SoundEvent, HTMLAudioElement[]>>({
    ui: [],
    flip: [],
    match: [],
    mismatch: [],
    victory: [],
    start: []
  });

  const ensureCtx = () => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  };

  const ensureMusicMaster = () => {
    const ctx = ensureCtx();
    if (!ctx) return null;
    if (!musicMasterRef.current) {
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);
      musicMasterRef.current = gain;
    }
    return musicMasterRef.current;
  };

  const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

  const playTone = (ctx: AudioContext, master: GainNode, opts: { midi: number; when: number; dur: number; vol: number; type?: OscillatorType; lowpass?: number }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = opts.type ?? "sine";
    osc.frequency.value = midiToFreq(opts.midi);
    filter.type = "lowpass";
    filter.frequency.value = opts.lowpass ?? 2800;
    gain.gain.setValueAtTime(0.0001, opts.when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, opts.vol), opts.when + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, opts.when + opts.dur);
    osc.connect(filter).connect(gain).connect(master);
    osc.start(opts.when);
    osc.stop(opts.when + opts.dur + 0.02);
  };

  const stopMusicLoop = () => {
    if (musicTimerRef.current) {
      window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    }
  };

  const scheduleMusicBar = (mode: MusicMode) => {
    const ctx = ensureCtx();
    const master = ensureMusicMaster();
    if (!ctx || !master) return;

    const scene = {
      menu: { bpm: 92, progression: [57, 60, 64, 62], pad: 0.03, arp: 0.02, bass: 0.026, low: 1800 },
      game: { bpm: 108, progression: [55, 58, 62, 60], pad: 0.028, arp: 0.024, bass: 0.03, low: 2000 },
      victory: { bpm: 118, progression: [60, 64, 67, 69], pad: 0.034, arp: 0.03, bass: 0.024, low: 2600 }
    }[mode];

    const spb = 60 / scene.bpm;
    const barStart = ctx.currentTime + 0.06;
    const roots = scene.progression;
    const barIndex = musicBarRef.current;

    for (let beat = 0; beat < 4; beat += 1) {
      const root = roots[(barIndex + beat) % roots.length];
      const t = barStart + beat * spb;

      playTone(ctx, master, { midi: root - 12, when: t, dur: spb * 0.85, vol: scene.bass, type: "triangle", lowpass: 700 });
      playTone(ctx, master, { midi: root, when: t, dur: spb * 1.85, vol: scene.pad, type: "triangle", lowpass: scene.low });
      playTone(ctx, master, { midi: root + 4, when: t + spb * 0.33, dur: spb * 1.25, vol: scene.pad * 0.88, type: "sine", lowpass: scene.low + 400 });
      playTone(ctx, master, { midi: root + 7, when: t + spb * 0.66, dur: spb * 1.05, vol: scene.pad * 0.8, type: "sine", lowpass: scene.low + 650 });

      const arpPattern = mode === "victory" ? [12, 16, 19, 24] : [12, 15, 19, 22];
      arpPattern.forEach((offset, i) => {
        playTone(ctx, master, {
          midi: root + offset,
          when: t + i * (spb * 0.2),
          dur: spb * 0.21,
          vol: scene.arp,
          type: "sine",
          lowpass: 3600
        });
      });
    }

    musicBarRef.current += 1;
  };

  const startMusicLoop = (mode: MusicMode) => {
    stopMusicLoop();
    if (muted) return;
    const ctx = ensureCtx();
    const master = ensureMusicMaster();
    if (!ctx || !master) return;

    const target = mode === "victory" ? 0.22 : mode === "game" ? 0.19 : 0.16;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(target, ctx.currentTime + 0.22);

    const bpm = mode === "victory" ? 118 : mode === "game" ? 108 : 92;
    const barMs = (60 / bpm) * 4 * 1000;
    scheduleMusicBar(mode);
    musicTimerRef.current = window.setInterval(() => scheduleMusicBar(mode), barMs + 20);
  };

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

  const setMusicMode = (mode: MusicMode) => {
    musicModeRef.current = mode;
    startMusicLoop(mode);
  };

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem("memora_muted", next ? "1" : "0");
      const ctx = ctxRef.current;
      const master = musicMasterRef.current;
      if (ctx && master) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), ctx.currentTime);
        if (next) {
          master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
        } else {
          startMusicLoop(musicModeRef.current);
        }
      }
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

  useEffect(() => {
    if (!muted) startMusicLoop(musicModeRef.current);
    return () => {
      stopMusicLoop();
      if (ctxRef.current) {
        void ctxRef.current.close().catch(() => undefined);
        ctxRef.current = null;
      }
    };
  }, []);

  const value = useMemo(() => ({ muted, toggleMute, play, setMusicMode }), [muted]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound must be used inside SoundProvider");
  return ctx;
}
