// Brand artwork, drawn as SVG so it is sharp at any size and needs no image files.
// Grey blocks are scattered enquiries; as they move right they turn orange and flow into a network of captured leads.
// Everything is deterministic, so server and browser always draw the same picture.

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const grey = { top: "#e4e1dd", left: "#c3bfba", right: "#a7a39d" };
const peach = { top: "#ffe4d3", left: "#ffbf99", right: "#f39c6b" };
const orange = { top: "#ffb48a", left: "#ff7a33", right: "#e2500c" };

/** Three clean tones rather than a blend, which turns muddy between grey and orange. */
function tone(t: number) {
  if (t < 0.45) return grey;
  if (t < 0.7) return peach;
  return orange;
}

type Cube = { i: number; j: number; k: number; t: number };

/** Draws unit cubes on an isometric grid, back to front. t = 0 is grey concrete, t = 1 is orange. */
function IsoCubes({ cubes, x0, y0, s, keyPrefix }: { cubes: Cube[]; x0: number; y0: number; s: number; keyPrefix: string }) {
  const cx = s * 0.866;
  const p = (a: number, b: number, c: number) => `${(x0 + (a - b) * cx).toFixed(1)},${(y0 + (a + b) * s * 0.5 - c * s).toFixed(1)}`;
  const sorted = [...cubes].sort((u, v) => u.i + u.j + u.k - (v.i + v.j + v.k) || u.k - v.k);
  return (
    <g>
      {sorted.map(({ i, j, k, t }) => {
        const { top, left, right } = tone(t);
        return (
          <g key={`${keyPrefix}${i}.${j}.${k}`} stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" strokeLinejoin="round">
            <polygon points={`${p(i, j, k + 1)} ${p(i + 1, j, k + 1)} ${p(i + 1, j + 1, k + 1)} ${p(i, j + 1, k + 1)}`} fill={top} />
            <polygon points={`${p(i, j + 1, k)} ${p(i + 1, j + 1, k)} ${p(i + 1, j + 1, k + 1)} ${p(i, j + 1, k + 1)}`} fill={left} />
            <polygon points={`${p(i + 1, j, k)} ${p(i + 1, j + 1, k)} ${p(i + 1, j + 1, k + 1)} ${p(i + 1, j, k + 1)}`} fill={right} />
          </g>
        );
      })}
    </g>
  );
}

function heroBlock(): Cube[] {
  const r = rng(7);
  const cubes: Cube[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        // Thin the block out towards the right and top, so it reads as breaking apart.
        const breakUp = (i - j + 3) / 6;
        if (r() < 0.12 + breakUp * 0.35 + k * 0.05) continue;
        cubes.push({ i, j, k, t: smooth((i - j + 1.4) / 4 + k * 0.08) });
      }
    }
  }
  return cubes;
}

type Node = { x: number; y: number; r: number };

function network(cx: number, cy: number, rx: number, ry: number, count: number, seed: number): { nodes: Node[]; edges: [Node, Node][] } {
  const r = rng(seed);
  const nodes: Node[] = [];
  let guard = 0;
  while (nodes.length < count && guard++ < 2000) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * d;
    const y = cy + Math.sin(a) * ry * d;
    if (nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 22)) continue;
    nodes.push({ x, y, r: 2.6 + r() * 4.2 });
  }
  const edges: [Node, Node][] = [];
  for (let a = 0; a < nodes.length; a++) {
    const near = nodes
      .map((n, b) => ({ b, d: Math.hypot(n.x - nodes[a].x, n.y - nodes[a].y) }))
      .filter((o) => o.b > a && o.d < 62)
      .sort((u, v) => u.d - v.d)
      .slice(0, 3);
    for (const o of near) edges.push([nodes[a], nodes[o.b]]);
  }
  return { nodes, edges };
}

export function HeroArt({
  labels,
  sideList,
  title,
}: {
  labels: [string, string, string];
  sideList: string[];
  title: string;
}) {
  const net = network(548, 214, 104, 112, 30, 11);
  const r = rng(23);
  const flows = Array.from({ length: 18 }, (_, n) => {
    const y1 = 168 + n * 5.2;
    const target = net.nodes[Math.floor(r() * net.nodes.length)];
    const c1 = 380 + r() * 40;
    const c2 = 430 + r() * 50;
    return {
      d: `M300 ${y1.toFixed(1)} C ${c1.toFixed(1)} ${(y1 + (r() - 0.5) * 70).toFixed(1)}, ${c2.toFixed(1)} ${(target.y + (r() - 0.5) * 60).toFixed(1)}, ${target.x.toFixed(1)} ${target.y.toFixed(1)}`,
      o: 0.25 + r() * 0.5,
    };
  });
  const loose: { x: number; y: number; s: number }[] = [
    { x: 302, y: 150, s: 11 },
    { x: 330, y: 186, s: 9 },
    { x: 318, y: 238, s: 12 },
    { x: 352, y: 214, s: 7 },
    { x: 360, y: 160, s: 6 },
    { x: 384, y: 236, s: 6 },
    { x: 296, y: 270, s: 9 },
  ];
  const calloutX = [196, 400, 560];
  return (
    <svg viewBox="0 0 680 420" role="img" aria-label={title} className="hero-art h-auto w-full overflow-visible">
      <defs>
        <radialGradient id="hero-haze" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff5a14" stopOpacity="0.28" />
          <stop offset="0.55" stopColor="#ff8a4d" stopOpacity="0.1" />
          <stop offset="1" stopColor="#ff8a4d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hero-node" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffb98f" />
          <stop offset="0.6" stopColor="#ff5a14" />
          <stop offset="1" stopColor="#d9470a" />
        </radialGradient>
      </defs>

      <ellipse cx="520" cy="214" rx="210" ry="190" fill="url(#hero-haze)" />

      <g fill="none" stroke="#ff5a14" strokeWidth="0.9" strokeLinecap="round">
        {flows.map((f, n) => (
          <path key={n} d={f.d} strokeOpacity={f.o} />
        ))}
      </g>

      <IsoCubes cubes={heroBlock()} x0={196} y0={168} s={30} keyPrefix="h" />

      {loose.map((c, n) => (
        <IsoCubes key={n} cubes={[{ i: 0, j: 0, k: 0, t: 0.85 + (n % 3) * 0.05 }]} x0={c.x} y0={c.y} s={c.s} keyPrefix={`l${n}`} />
      ))}

      <g stroke="#ff5a14" strokeOpacity="0.55" strokeWidth="0.9">
        {net.edges.map(([a, b], n) => (
          <line key={n} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        ))}
      </g>
      {net.nodes.map((n, k) => (
        <circle key={k} cx={n.x} cy={n.y} r={n.r} fill="url(#hero-node)" />
      ))}

      <g fontFamily="var(--font-mono)" fontSize="10.5" letterSpacing="0.6" fill="#111">
        {labels.map((label, n) => (
          <g key={label}>
            <text x={calloutX[n]} y="14" textAnchor="middle">
              {label.toUpperCase()}
            </text>
            <line x1={calloutX[n]} y1="24" x2={calloutX[n]} y2={n === 0 ? 78 : n === 1 ? 118 : 104} stroke="#111" strokeWidth="0.8" />
            <circle cx={calloutX[n]} cy={n === 0 ? 80 : n === 1 ? 120 : 106} r="2.6" fill="#111" />
          </g>
        ))}
      </g>

      <g fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="0.6" fill="#5f5b56">
        {sideList.map((item, n) => (
          <text key={item} x="604" y={340 + n * 13}>
            {item.toUpperCase()}
          </text>
        ))}
      </g>
    </svg>
  );
}

export function SphereArt() {
  const cx = 210;
  const cy = 150;
  const R = 118;
  const tilt = 0.38;
  const dots: { x: number; y: number; r: number; o: number }[] = [];
  for (let lat = -84; lat <= 84; lat += 7) {
    const phi = (lat * Math.PI) / 180;
    const ring = Math.max(1, Math.round(Math.cos(phi) * 48));
    for (let n = 0; n < ring; n++) {
      const lam = (n / ring) * Math.PI * 2 + lat * 0.03;
      const x = Math.cos(phi) * Math.cos(lam);
      const y0 = Math.sin(phi);
      const z0 = Math.cos(phi) * Math.sin(lam);
      const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
      const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
      if (z <= 0.04) continue;
      dots.push({ x: cx + R * x, y: cy - R * y, r: 0.8 + 3.1 * z, o: 0.2 + 0.65 * z });
    }
  }
  return (
    <svg viewBox="0 0 420 300" aria-hidden className="h-auto w-full overflow-visible">
      <defs>
        <radialGradient id="sphere-fill" cx="0.36" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#ffc29b" />
          <stop offset="0.45" stopColor="#ff6d26" />
          <stop offset="1" stopColor="#b83a04" />
        </radialGradient>
        <filter id="trail-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      <path d="M-40 330 C 60 300, 40 250, 120 236 S 170 262, 150 210" fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="7" filter="url(#trail-glow)" />
      <path d="M-40 330 C 60 300, 40 250, 120 236 S 170 262, 150 210" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx={cx} cy={cy} r={R} fill="url(#sphere-fill)" />
      <g fill="#4a1500">
        {dots.map((d, n) => (
          <circle key={n} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={d.r.toFixed(2)} fillOpacity={d.o.toFixed(2)} />
        ))}
      </g>
    </svg>
  );
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

const nicheScenes: Record<string, Cube[]> = {
  // Two towers on a plot.
  real_estate: [
    ...[0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => ({ i, j, k: 0, t: 0 }))),
    { i: 0, j: 0, k: 1, t: 0 },
    { i: 0, j: 0, k: 2, t: 0.1 },
    { i: 0, j: 0, k: 3, t: 1 },
    { i: 2, j: 1, k: 1, t: 0 },
    { i: 2, j: 1, k: 2, t: 1 },
  ],
  // A cross.
  clinic: [
    { i: 1, j: 0, k: 0, t: 0 },
    { i: 0, j: 1, k: 0, t: 0 },
    { i: 1, j: 1, k: 0, t: 0 },
    { i: 2, j: 1, k: 0, t: 0 },
    { i: 1, j: 2, k: 0, t: 0 },
    { i: 1, j: 1, k: 1, t: 1 },
  ],
  // A row of teeth with one bright.
  dental: [
    { i: 0, j: 1, k: 0, t: 0 },
    { i: 1, j: 1, k: 0, t: 0 },
    { i: 2, j: 1, k: 0, t: 0 },
    { i: 3, j: 1, k: 0, t: 0 },
    { i: 0, j: 1, k: 1, t: 0 },
    { i: 3, j: 1, k: 1, t: 0 },
    { i: 1, j: 1, k: 1, t: 1 },
  ],
  // A shopfront with a lit sign.
  general: [
    ...[0, 1, 2].flatMap((i) => [{ i, j: 0, k: 0, t: 0 }, { i, j: 1, k: 0, t: 0 }]),
    { i: 0, j: 1, k: 1, t: 0 },
    { i: 1, j: 1, k: 1, t: 0 },
    { i: 2, j: 1, k: 1, t: 1 },
  ],
};

export function NicheArt({ id }: { id: string }) {
  const cubes = nicheScenes[id] ?? nicheScenes.general;
  return (
    <svg viewBox="0 0 220 150" aria-hidden className="h-auto w-full">
      <defs>
        <radialGradient id={`niche-haze-${id}`} cx="0.5" cy="0.62" r="0.5">
          <stop offset="0" stopColor="#ff5a14" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ff5a14" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="110" cy="96" rx="100" ry="54" fill={`url(#niche-haze-${id})`} />
      <IsoCubes cubes={cubes} x0={110} y0={62} s={20} keyPrefix={id} />
    </svg>
  );
}
