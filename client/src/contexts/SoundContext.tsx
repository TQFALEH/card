import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";

type SoundEvent = "ui" | "flip" | "match" | "mismatch" | "victory" | "start";

interface SoundContextType {
  muted: boolean;
  toggleMute: () => void;
  play: (event: SoundEvent, volumeScale?: number) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const bufferSize = Math.floor(ctx.sampleRate * 0.06);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  return buffer;
}

export function SoundProvider({ children }: PropsWithChildren) {
  const [muted, setMuted] = useState(() => localStorage.getItem("memora_muted") === "1");
  const ctxRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);

  const ensureAudio = () => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new Ctx();
      noiseRef.current = createNoiseBuffer(ctxRef.current);
    }
    if (ctxRef.current?.state === "suspended") {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  };

  const pulse = (ctx: AudioContext, opts: { type?: OscillatorType; f0: number; f1?: number; dur: number; volume: number; when?: number }) => {
    const when = opts.when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.f0, when);
    if (opts.f1) osc.frequency.exponentialRampToValueAtTime(opts.f1, when + opts.dur);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(opts.volume, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + opts.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(when);
    osc.stop(when + opts.dur + 0.02);
  };

  const hiss = (ctx: AudioContext, volume: number, dur = 0.06) => {
    if (!noiseRef.current) return;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = noiseRef.current;
    gain.gain.value = volume;
    src.connect(gain).connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + dur);
  };

  const play = (event: SoundEvent, volumeScale = 1) => {
    if (muted) return;
    const ctx = ensureAudio();
    if (!ctx) return;

    switch (event) {
      case "ui":
        pulse(ctx, { type: "triangle", f0: 640, f1: 520, dur: 0.05, volume: 0.03 * volumeScale });
        break;
      case "flip":
        hiss(ctx, 0.008 * volumeScale, 0.03);
        pulse(ctx, { type: "square", f0: 410, f1: 220, dur: 0.07, volume: 0.035 * volumeScale });
        break;
      case "match":
        pulse(ctx, { type: "triangle", f0: 540, f1: 740, dur: 0.11, volume: 0.06 * volumeScale });
        pulse(ctx, { type: "sine", f0: 740, f1: 980, dur: 0.12, volume: 0.055 * volumeScale, when: ctx.currentTime + 0.07 });
        break;
      case "mismatch":
        pulse(ctx, { type: "sawtooth", f0: 340, f1: 170, dur: 0.12, volume: 0.05 * volumeScale });
        pulse(ctx, { type: "triangle", f0: 220, f1: 120, dur: 0.13, volume: 0.03 * volumeScale, when: ctx.currentTime + 0.07 });
        break;
      case "victory":
        pulse(ctx, { type: "triangle", f0: 440, f1: 660, dur: 0.16, volume: 0.07 * volumeScale });
        pulse(ctx, { type: "triangle", f0: 660, f1: 880, dur: 0.16, volume: 0.07 * volumeScale, when: ctx.currentTime + 0.12 });
        pulse(ctx, { type: "sine", f0: 880, f1: 1320, dur: 0.22, volume: 0.08 * volumeScale, when: ctx.currentTime + 0.24 });
        break;
      case "start":
        pulse(ctx, { type: "square", f0: 220, f1: 430, dur: 0.14, volume: 0.05 * volumeScale });
        pulse(ctx, { type: "triangle", f0: 430, f1: 620, dur: 0.12, volume: 0.05 * volumeScale, when: ctx.currentTime + 0.1 });
        break;
      default:
        break;
    }
  };

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem("memora_muted", next ? "1" : "0");
      return next;
    });
  };

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
