// The dunes drawn under the footer, as SVG so they are sharp at any size and need no image file.
// Deterministic, so server and browser always draw the same picture.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function DunesArt() {
  const r = rng(41);
  const dots = Array.from({ length: 34 }, () => ({ x: 40 + r() * 1120, y: 150 + r() * 100, r: 1 + r() * 1.8 }));
  const lines: [number, number][] = [];
  dots.forEach((a, n) => {
    const b = dots.findIndex((d, m) => m > n && Math.hypot(d.x - a.x, d.y - a.y) < 120);
    if (b > -1) lines.push([n, b]);
  });
  return (
    <svg viewBox="0 0 1200 260" preserveAspectRatio="xMidYMax slice" aria-hidden className="block h-56 w-full sm:h-64">
      <defs>
        <linearGradient id="dune-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd2b5" />
          <stop offset="1" stopColor="#ffab7a" />
        </linearGradient>
        <linearGradient id="dune-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a5c" />
          <stop offset="1" stopColor="#ff6d26" />
        </linearGradient>
        <linearGradient id="dune-c" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6d26" />
          <stop offset="1" stopColor="#c94006" />
        </linearGradient>
        <filter id="road-glow" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <circle cx="770" cy="74" r="20" fill="#ff7a33" />
      <path d="M0 120 C 160 70, 300 70, 430 110 S 700 150, 860 96 S 1100 60, 1200 100 V260 H0Z" fill="url(#dune-a)" />
      <path d="M0 170 C 140 130, 280 120, 420 160 S 700 210, 880 150 S 1110 120, 1200 150 V260 H0Z" fill="url(#dune-b)" />
      <path d="M0 220 C 200 180, 360 190, 520 214 S 860 250, 1020 206 S 1160 196, 1200 210 V260 H0Z" fill="url(#dune-c)" />
      <path d="M560 262 C 620 236, 520 214, 600 196 S 720 180, 690 156 S 640 128, 720 110" fill="none" stroke="#fff" strokeWidth="9" strokeOpacity="0.7" filter="url(#road-glow)" />
      <path d="M560 262 C 620 236, 520 214, 600 196 S 720 180, 690 156 S 640 128, 720 110" fill="none" stroke="#fff" strokeWidth="2" />
      <g stroke="#fff" strokeOpacity="0.35" strokeWidth="0.7">
        {lines.map(([a, b], n) => (
          <line key={n} x1={dots[a].x} y1={dots[a].y} x2={dots[b].x} y2={dots[b].y} />
        ))}
      </g>
      <g fill="#fff" fillOpacity="0.85">
        {dots.map((d, n) => (
          <circle key={n} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={d.r.toFixed(2)} />
        ))}
      </g>
    </svg>
  );
}
