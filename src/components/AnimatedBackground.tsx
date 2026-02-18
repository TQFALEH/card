export default function AnimatedBackground() {
  return (
    <div className="animated-bg" aria-hidden="true">
      <div className="nebula nebula-a" />
      <div className="nebula nebula-b" />
      <div className="nebula nebula-c" />
      <div className="grid-overlay" />
      {Array.from({ length: 24 }).map((_, i) => (
        <span key={i} className="particle" style={{ ["--i" as string]: i }} />
      ))}
    </div>
  );
}
