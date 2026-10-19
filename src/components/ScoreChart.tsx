"use client";

import { useMemo, useRef, useState } from "react";

type Point = { t: number; score: number };
type Band = { min: number; label: string };

const W = 760;
const H = 270;
const pad = { left: 34, right: 78, top: 18, bottom: 30 };
const plotW = W - pad.left - pad.right;
const plotH = H - pad.top - pad.bottom;


function bandOf(score: number, bands: Band[]) {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return (sorted.find((b) => score >= b.min) ?? sorted[sorted.length - 1]).label;
}

export function ScoreChart({
  points,
  bands,
  label,
  timeZone,
}: {
  points: Point[];
  bands: Band[];
  label: string;
  timeZone: string;
}) {
  // A fixed time zone keeps the server render and the browser render identical.
  const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" });
  const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
  const day = (t: number) => dayFormat.format(t);
  const stamp = (t: number) => `${dayFormat.format(t)}, ${timeFormat.format(t)}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const t0 = points[0]?.t ?? 0;
    const t1 = points[points.length - 1]?.t ?? 1;
    const span = t1 - t0 || 1;
    const x = (t: number) => (points.length < 2 ? pad.left + plotW / 2 : pad.left + ((t - t0) / span) * plotW);
    const y = (s: number) => pad.top + (1 - s / 100) * plotH;
    const xy = points.map((p) => ({ ...p, x: x(p.t), y: y(p.score) }));
    // Smooth line through the points (monotone enough for scores that rarely swing hard).
    let line = "";
    xy.forEach((p, i) => {
      if (i === 0) line = `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      else {
        const prev = xy[i - 1];
        const cx = (prev.x + p.x) / 2;
        line += ` C${cx.toFixed(1)} ${prev.y.toFixed(1)}, ${cx.toFixed(1)} ${p.y.toFixed(1)}, ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      }
    });
    const base = pad.top + plotH;
    const area = xy.length > 1 ? `${line} L${xy[xy.length - 1].x.toFixed(1)} ${base} L${xy[0].x.toFixed(1)} ${base} Z` : "";
    const tickCount = Math.min(5, Math.max(points.length, 1));
    const ticks =
      points.length < 2
        ? points.map((p) => p.t)
        : Array.from({ length: tickCount }, (_, i) => t0 + (span * i) / (tickCount - 1));
    return { xy, line, area, y, x, ticks };
  }, [points]);

  const sortedBands = [...bands].sort((a, b) => a.min - b.min);
  const bandMids = sortedBands.map((b, i) => {
    const top = sortedBands[i + 1]?.min ?? 100;
    return { label: b.label, mid: (b.min + top) / 2 };
  });

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || geo.xy.length === 0) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    geo.xy.forEach((p, i) => {
      if (Math.abs(p.x - vx) < Math.abs(geo.xy[best].x - vx)) best = i;
    });
    setHover(best);
  }

  const last = geo.xy[geo.xy.length - 1];
  const active = hover !== null ? geo.xy[hover] : null;

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none select-none" role="img" aria-label={label}>
        <defs>
          <linearGradient id="score-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff5a14" stopOpacity="0.22" />
            <stop offset="1" stopColor="#ff5a14" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={pad.left + plotW} y1={geo.y(v)} y2={geo.y(v)} stroke="#e2ded9" strokeDasharray={v === 0 ? undefined : "3 5"} />
            <text x={pad.left - 10} y={geo.y(v) + 3.5} textAnchor="end" fontSize="10.5" fontFamily="var(--font-mono)" fill="#5f5b56">
              {v}
            </text>
          </g>
        ))}
        {bandMids.map((b) => (
          <text key={b.label} x={W - pad.right + 14} y={geo.y(b.mid) + 3.5} fontSize="10.5" fontFamily="var(--font-mono)" fill="#5f5b56">
            {b.label}
          </text>
        ))}
        {geo.ticks.map((t, i) => (
          <text
            key={i}
            x={geo.x(t)}
            y={H - 8}
            textAnchor={points.length < 2 ? "middle" : i === 0 ? "start" : i === geo.ticks.length - 1 ? "end" : "middle"}
            fontSize="10.5"
            fontFamily="var(--font-mono)"
            fill="#5f5b56"
          >
            {day(t)}
          </text>
        ))}

        {geo.area && <path d={geo.area} fill="url(#score-fill)" />}
        {geo.xy.length > 1 && <path d={geo.line} fill="none" stroke="#ff5a14" strokeWidth="2.2" strokeLinecap="round" />}
        {geo.xy.length <= 24 &&
          geo.xy.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.2" fill="#fff" stroke="#ff5a14" strokeWidth="1.8" />)}

        {active && (
          <g pointerEvents="none">
            <line x1={active.x} x2={active.x} y1={pad.top} y2={pad.top + plotH} stroke="#111" strokeOpacity="0.35" />
            <circle cx={active.x} cy={active.y} r="5.5" fill="#ff5a14" stroke="#fff" strokeWidth="2" />
          </g>
        )}

        {last && !active && (
          <g pointerEvents="none">
            <circle cx={last.x} cy={last.y} r="5.5" fill="#ff5a14" stroke="#fff" strokeWidth="2" />
            <rect x={last.x - 17} y={last.y - 30} width="34" height="20" rx="6" fill="#ff5a14" />
            <text
              x={last.x}
              y={last.y - 16}
              textAnchor="middle"
              fontSize="11.5"
              fontWeight="600"
              fill="#fff"
            >
              {last.score}
            </text>
          </g>
        )}

        <rect
          x={pad.left}
          y={pad.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {active && (
        <div
          role="status"
          className="pointer-events-none absolute top-2 z-10 w-max -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 shadow-[0_8px_24px_rgba(17,17,17,0.1)]"
          style={{ left: `${Math.min(88, Math.max(12, (active.x / W) * 100))}%` }}
        >
          <p className="font-mono text-[0.6875rem] text-ink-soft">{stamp(active.t)}</p>
          <p className="mt-0.5 text-sm">
            <span className="font-semibold">{active.score}</span>
            <span className="text-ink-soft"> / 100, {bandOf(active.score, bands)}</span>
          </p>
        </div>
      )}

      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.t}>
            {stamp(p.t)}: {p.score} out of 100
          </li>
        ))}
      </ul>
    </div>
  );
}
