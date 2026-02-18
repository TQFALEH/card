import { gsap } from "gsap";
import type { LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";

interface MemoryCardProps {
  icon: LucideIcon;
  tint: string;
  faceUp: boolean;
  matched: boolean;
  disabled: boolean;
  onClick: () => void;
  matchToken: number;
  mismatchToken: number;
  showCoin: boolean;
}

export default function MemoryCard({
  icon: Icon,
  tint,
  faceUp,
  matched,
  disabled,
  onClick,
  matchToken,
  mismatchToken,
  showCoin
}: MemoryCardProps) {
  const rootRef = useRef<HTMLButtonElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const coinRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) {
      return;
    }
    gsap.set(inner, { transformStyle: "preserve-3d", rotationY: 0, force3D: true });
  }, []);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) {
      return;
    }
    gsap.to(inner, {
      rotationY: faceUp ? 180 : 0,
      duration: 0.45,
      ease: "power2.out",
      overwrite: true,
      force3D: true
    });
  }, [faceUp]);

  useEffect(() => {
    if (!matchToken) {
      return;
    }
    const root = rootRef.current;
    const coin = coinRef.current;
    if (!root || !coin) {
      return;
    }

    const tl = gsap.timeline();
    tl.fromTo(
      root,
      { boxShadow: "0 0 0px rgba(0,231,255,0)" },
      {
        boxShadow: "0 0 28px rgba(0,231,255,0.5)",
        duration: 0.22,
        yoyo: true,
        repeat: 1,
        ease: "power1.inOut"
      }
    ).fromTo(
      coin,
      { y: -26, scale: 0.1, autoAlpha: 0 },
      { y: 0, scale: 1, autoAlpha: 1, duration: 0.52, ease: "bounce.out" },
      "<"
    );

    return () => {
      tl.kill();
    };
  }, [matchToken]);

  useEffect(() => {
    if (!mismatchToken || matched) {
      return;
    }
    const root = rootRef.current;
    if (!root) {
      return;
    }
    gsap.fromTo(
      root,
      { x: -5 },
      {
        x: 5,
        repeat: 5,
        yoyo: true,
        duration: 0.055,
        ease: "power1.inOut",
        onComplete: () => {
          gsap.set(root, { x: 0 });
        }
      }
    );
  }, [mismatchToken, matched]);

  return (
    <button
      ref={rootRef}
      className={`memory-card ${matched ? "is-matched" : ""}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-label="Memory card"
      type="button"
    >
      <div className="memory-card-inner" ref={innerRef}>
        <div className="memory-face memory-back" />
        <div className="memory-face memory-front" style={{ ["--card-tint" as string]: tint }}>
          <Icon size={34} strokeWidth={2.2} />
          <span ref={coinRef} className={`coin-marker ${showCoin ? "visible" : ""}`.trim()} />
        </div>
      </div>
    </button>
  );
}
