// Small server rendered charts. Every one sits beside its numbers in text, so colour never carries meaning alone.
import type { CheckStatus } from "@/lib/health";

export const statusColour: Record<CheckStatus, string> = {
  working: "#111111",
  leaking: "#ff5a14",
  waiting: "#c9c3bc",
};

export const statusLabel: Record<CheckStatus, string> = {
  working: "Working",
  leaking: "Leaking",
  waiting: "Waiting",
};

export function Sparkline({ values, tone = "accent", label }: { values: number[]; tone?: "accent" | "ink"; label: string }) {
  const w = 120;
  const h = 40;
  const colour = tone === "accent" ? "#ff5a14" : "#111111";
  if (values.length < 2) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-28" role="img" aria-label={`${label}: not enough checks for a trend yet`}>
        <line x1="2" x2={w - 2} y1={h / 2} y2={h / 2} stroke="#c9c3bc" strokeDasharray="3 4" />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (w - 4), 4 + (1 - (v - min) / range) * (h - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const id = `spark-${label.replace(/\W/g, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-28" role="img" aria-label={`${label} over the last ${values.length} checks`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colour} stopOpacity="0.18" />
          <stop offset="1" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${pts[pts.length - 1][0]} ${h} L${pts[0][0]} ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={colour} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={colour} />
    </svg>
  );
}

/** Half circle gauge from 0 to 100, with a needle on the score. */
export function Gauge({ score, label }: { score: number; label: string }) {
  const cx = 130;
  const cy = 128;
  const r = 100;
  const angle = (s: number) => Math.PI * (1 - s / 100);
  const point = (s: number, radius = r) => [cx + radius * Math.cos(angle(s)), cy - radius * Math.sin(angle(s))] as const;
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const clamped = Math.max(0, Math.min(100, score));
  const [nx, ny] = point(clamped, r - 30);
  return (
    <svg viewBox="0 0 260 150" className="h-auto w-full max-w-[300px]" role="img" aria-label={label}>
      <defs>
        <linearGradient id="gauge-fill" gradientUnits="userSpaceOnUse" x1={cx - r} y1="0" x2={cx + r} y2="0">
          <stop offset="0" stopColor="#ffbf99" />
          <stop offset="0.55" stopColor="#ff5a14" />
          <stop offset="1" stopColor="#111111" />
        </linearGradient>
      </defs>
      <path d={arc(0, 100)} fill="none" stroke="#ebe8e4" strokeWidth="16" strokeLinecap="round" />
      {clamped > 0 && <path d={arc(0, clamped)} fill="none" stroke="url(#gauge-fill)" strokeWidth="16" strokeLinecap="round" />}
      {[25, 50, 75].map((t) => {
        const [x1, y1] = point(t, r + 12);
        const [x2, y2] = point(t, r + 17);
        return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c9c3bc" strokeWidth="1.5" />;
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#111" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="7" fill="#111" />
      <circle cx={cx} cy={cy} r="2.5" fill="#fff" />
      <text x={cx - r} y={cy + 20} textAnchor="middle" fontSize="10.5" fontFamily="var(--font-mono)" fill="#5f5b56">
        0
      </text>
      <text x={cx + r} y={cy + 20} textAnchor="middle" fontSize="10.5" fontFamily="var(--font-mono)" fill="#5f5b56">
        100
      </text>
    </svg>
  );
}

export function Donut({ segments, label, centre }: { segments: { status: CheckStatus; value: number }[]; label: string; centre: string }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 4 : 0;
  let offset = 0;
  return (
    <svg viewBox="0 0 160 160" className="h-36 w-36 shrink-0" role="img" aria-label={label}>
      <g transform="rotate(-90 80 80)">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#ebe8e4" strokeWidth="20" />
        {segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const len = (s.value / total) * c;
            const dash = Math.max(0, len - gap);
            const el = (
              <circle
                key={s.status}
                cx="80"
                cy="80"
                r={r}
                fill="none"
                stroke={statusColour[s.status]}
                strokeWidth="20"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              >
                <title>{`${statusLabel[s.status]}: ${s.value}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
      </g>
      <text x="80" y="80" textAnchor="middle" fontSize="28" fontWeight="600" fill="#111" letterSpacing="-1">
        {centre}
      </text>
      <text x="80" y="98" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="#5f5b56">
        CHECKS
      </text>
    </svg>
  );
}

/** One dot per recent check, oldest on the left. */
export function HistoryStrip({ history, name }: { history: CheckStatus[]; name: string }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${name} over the last ${history.length} checks: ${history.map((h) => statusLabel[h]).join(", ")}`}>
      {history.map((h, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: statusColour[h] }} title={statusLabel[h]} />
      ))}
    </span>
  );
}
