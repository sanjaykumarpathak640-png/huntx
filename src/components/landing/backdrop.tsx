/** Animated exploration backdrop: contour lines, coordinate grid, radar sweep. Pure SVG/CSS. */
export function MapBackdrop() {
  const contours = Array.from({ length: 9 }, (_, i) => i);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <svg className="absolute -right-40 -top-40 h-[900px] w-[900px] opacity-[0.22]" viewBox="0 0 900 900">
        {contours.map((i) => (
          <path
            key={i}
            d={`M ${450 - (i + 1) * 45} 450 C ${450 - (i + 1) * 45} ${330 - i * 38}, ${560 + i * 30} ${300 - i * 42}, ${450 + (i + 1) * 47} ${430 - i * 6} S ${470 + i * 20} ${620 + i * 40}, ${450 - (i + 1) * 45} 450 Z`}
            fill="none"
            stroke={i % 3 === 0 ? "#39ff88" : "#22d3ee"}
            strokeWidth={i % 3 === 0 ? 1.2 : 0.7}
            strokeDasharray={i % 2 ? "2 6" : undefined}
          />
        ))}
      </svg>
      <svg className="absolute -bottom-52 -left-52 h-[700px] w-[700px] opacity-[0.14]" viewBox="0 0 700 700">
        {contours.slice(0, 7).map((i) => (
          <ellipse key={i} cx="350" cy="350" rx={60 + i * 42} ry={40 + i * 36} fill="none" stroke="#22d3ee" strokeWidth="0.8" transform={`rotate(${i * 7} 350 350)`} />
        ))}
      </svg>
      {/* drifting coordinate column */}
      <div className="absolute right-6 top-0 hidden h-[200%] animate-drift flex-col gap-6 font-mono text-[10px] text-cyan/25 lg:flex">
        {Array.from({ length: 40 }, (_, i) => (
          <span key={i}>
            {(25.53 + ((i * 37) % 97) / 10000).toFixed(4)}°N {(84.85 + ((i * 53) % 89) / 10000).toFixed(4)}°E
          </span>
        ))}
      </div>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neon/40 to-transparent" />
      <div className="absolute left-1/2 top-[-30%] h-[60%] w-[70%] -translate-x-1/2 rounded-full bg-neon/[0.05] blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[50%] w-[50%] rounded-full bg-cyan/[0.06] blur-3xl" />
    </div>
  );
}

export function Radar({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="relative aspect-square w-full">
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
          {[90, 66, 42, 18].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="rgba(57,255,136,.18)" strokeWidth="1" />
          ))}
          <path d="M100 10v180M10 100h180" stroke="rgba(57,255,136,.12)" />
        </svg>
        <div className="absolute inset-0 animate-sweep rounded-full" style={{ background: "conic-gradient(from 0deg, rgba(57,255,136,.35), transparent 22%)" }} />
        {[
          [28, 34],
          [64, 58],
          [42, 72],
          [74, 26],
        ].map(([x, y], i) => (
          <span key={i} className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <span className="absolute inset-0 rounded-full bg-neon shadow-[0_0_10px_#39ff88]" />
            <span className="absolute inset-0 animate-pulseRing rounded-full border border-neon" style={{ animationDelay: `${i * 0.6}s` }} />
          </span>
        ))}
      </div>
    </div>
  );
}
