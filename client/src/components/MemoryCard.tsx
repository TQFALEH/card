import { gsap } from "gsap";
import type { LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";

interface Props {
  icon: LucideIcon;
  tint: string;
  faceUp: boolean;
  matched: boolean;
  disabled: boolean;
  onClick: () => void;
  matchToken: number;
  mismatchToken: number;
}

export default function MemoryCard({
  icon: Icon,
  tint,
  faceUp,
  matched,
  disabled,
  onClick,
  matchToken,
  mismatchToken
}: Props) {
  const rootRef = useRef<HTMLButtonElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const coinRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    if (!innerRef.current) return;
    gsap.set(innerRef.current, { transformStyle: "preserve-3d", rotationY: 0, force3D: true });
  }, []);

  useEffect(() => {
    if (!innerRef.current) return;
    gsap.to(innerRef.current, {
      rotationY: faceUp ? 180 : 0,
      duration: 0.4,
      ease: "power2.out",
      overwrite: true,
      force3D: true
    });
  }, [faceUp]);

  useEffect(() => {
    if (!matchToken || !rootRef.current || !coinRef.current) return;
    const tl = gsap.timeline();
    tl.fromTo(
      rootRef.current,
      { boxShadow: "0 0 0px rgba(0,231,255,0)" },
      { boxShadow: "0 0 26px rgba(0,231,255,0.5)", duration: 0.2, yoyo: true, repeat: 1 }
    ).fromTo(
      coinRef.current,
      { y: -16, scale: 0.1, autoAlpha: 0 },
      { y: 0, scale: 1, autoAlpha: 1, duration: 0.5, ease: "bounce.out" },
      "<"
    );
    return () => {
      tl.kill();
    };
  }, [matchToken]);

  useEffect(() => {
    if (!mismatchToken || !rootRef.current || matched) return;
    gsap.fromTo(rootRef.current, { x: -5 }, {
      x: 5,
      repeat: 5,
      yoyo: true,
      duration: 0.05,
      onComplete: () => {
        gsap.set(rootRef.current, { x: 0 });
      }
    });
  }, [mismatchToken, matched]);

  return (
    <button ref={rootRef} className={`memory-card ${matched ? "is-matched" : ""}`.trim()} onClick={onClick} disabled={disabled}>
      <div className="memory-card-inner" ref={innerRef}>
        <div className="memory-face memory-back" />
        <div className="memory-face memory-front" style={{ ["--card-tint" as string]: tint }}>
          <Icon size={28} strokeWidth={2.1} />
          <span ref={coinRef} className={`coin-marker ${matched ? "visible" : ""}`.trim()} />
        </div>
      </div>
    </button>
  );
}
