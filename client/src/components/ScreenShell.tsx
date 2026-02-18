import { gsap } from "gsap";
import { type PropsWithChildren, useLayoutEffect, useRef } from "react";

interface ScreenShellProps {
  screenKey: string;
  className?: string;
}

export default function ScreenShell({ screenKey, className, children }: PropsWithChildren<ScreenShellProps>) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        root,
        { autoAlpha: 0, y: 18, scale: 0.99 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.42, ease: "power3.out" }
      );
    }, root);
    return () => ctx.revert();
  }, [screenKey]);

  return (
    <section ref={rootRef} className={`screen-shell ${className ?? ""}`.trim()}>
      {children}
    </section>
  );
}
