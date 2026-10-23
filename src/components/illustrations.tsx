// Illustrations in the house style: flat shapes, soft shadows, warm off white, charcoal and peach,
// with orange kept for the one thing that matters in each picture. Drawn as SVG, so they are sharp at
// any size, need no image files, and never contain words that would need translating.
// All are decorative: the text beside them carries the meaning, so they are hidden from screen readers.

const C = {
  ink: "#111111",
  soft: "#5f5b56",
  mist: "#ebe8e4",
  line: "#d9d4ce",
  white: "#ffffff",
  wash: "#ffede3",
  peach: "#ffbf99",
  orange: "#ff5a14",
  deep: "#d9470a",
};

const shadow = (cx: number, cy: number, rx: number, ry = 5) => <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={C.ink} fillOpacity="0.07" />;
const tick = (x: number, y: number, s = 1, stroke: string = C.white) => (
  <path d={`M${x} ${y} l${3 * s} ${3 * s} l${6 * s} ${-6 * s}`} fill="none" stroke={stroke} strokeWidth={1.8 * s} strokeLinecap="round" strokeLinejoin="round" />
);
const star = (cx: number, cy: number, r: number, fill: string) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  });
  return <polygon points={pts.join(" ")} fill={fill} />;
};
/** A white message card with an avatar and two lines of grey "text". */
const card = (x: number, y: number, w: number, h: number, hot = false) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx="8" fill={hot ? C.orange : C.white} stroke={hot ? "none" : C.line} />
    <circle cx={x + w / 2} cy={y + h * 0.32} r={w * 0.16} fill={hot ? C.white : C.mist} />
    <rect x={x + w * 0.2} y={y + h * 0.6} width={w * 0.6} height="4" rx="2" fill={hot ? C.white : C.mist} fillOpacity={hot ? 0.85 : 1} />
    <rect x={x + w * 0.28} y={y + h * 0.74} width={w * 0.44} height="4" rx="2" fill={hot ? C.white : C.mist} fillOpacity={hot ? 0.6 : 1} />
  </g>
);

function Frame({ box, className, children }: { box: string; className?: string; children: React.ReactNode }) {
  return (
    <svg viewBox={box} aria-hidden focusable="false" className={className ?? "h-auto w-full"}>
      {children}
    </svg>
  );
}

// What it does: four scenes for the landing page cards (4:3).

export function AnswerArt() {
  return (
    <Frame box="0 0 240 180">
      <path d="M200 20 a14 14 0 1 0 12 24 a11 11 0 1 1 -12 -24z" fill={C.peach} />
      <circle cx="176" cy="26" r="1.8" fill={C.soft} />
      <circle cx="222" cy="58" r="1.5" fill={C.soft} />
      <circle cx="160" cy="44" r="1.2" fill={C.soft} />
      {shadow(120, 160, 44)}
      <rect x="92" y="32" width="56" height="124" rx="12" fill={C.ink} />
      <rect x="97" y="42" width="46" height="104" rx="7" fill={C.white} />
      <rect x="112" y="36" width="16" height="2.5" rx="1.25" fill={C.soft} />
      <rect x="101" y="50" width="28" height="12" rx="6" fill={C.mist} />
      <rect x="111" y="68" width="28" height="12" rx="6" fill={C.orange} />
      <rect x="101" y="86" width="22" height="12" rx="6" fill={C.mist} />
      <rect x="111" y="104" width="28" height="12" rx="6" fill={C.orange} />
      <rect x="101" y="122" width="26" height="12" rx="6" fill={C.mist} />
      <g>
        <rect x="18" y="52" width="50" height="22" rx="11" fill={C.white} stroke={C.line} />
        <path d="M28 74 l-4 7 l10 -7" fill={C.white} stroke={C.line} strokeLinejoin="round" />
        <rect x="27" y="60" width="32" height="4" rx="2" fill={C.mist} />
        <rect x="30" y="98" width="40" height="20" rx="10" fill={C.white} stroke={C.line} />
        <rect x="38" y="106" width="24" height="4" rx="2" fill={C.mist} />
        <path d="M72 64 q10 0 16 8" fill="none" stroke={C.soft} strokeWidth="1.4" strokeDasharray="1 4" strokeLinecap="round" />
        <path d="M74 108 q8 0 14 -4" fill="none" stroke={C.soft} strokeWidth="1.4" strokeDasharray="1 4" strokeLinecap="round" />
      </g>
      <g>
        <path d="M152 92 q8 -6 14 -6" fill="none" stroke={C.orange} strokeWidth="1.4" strokeDasharray="1 4" strokeLinecap="round" />
        <rect x="168" y="76" width="54" height="24" rx="12" fill={C.orange} />
        <path d="M212 100 l4 7 l-10 -7" fill={C.orange} />
        {tick(189, 88, 1.1)}
      </g>
    </Frame>
  );
}

export function HotLeadsArt() {
  return (
    <Frame box="0 0 240 180">
      <circle cx="120" cy="88" r="54" fill={C.wash} />
      {[14, 56, 146, 188].map((x) => (
        <g key={x}>
          {shadow(x + 19, 150, 18, 3.5)}
          {card(x, 96, 38, 48)}
        </g>
      ))}
      {shadow(120, 150, 24, 4)}
      <g>
        {card(98, 66, 44, 58, true)}
        <path d="M108 54 l12 -10 l12 10" fill="none" stroke={C.orange} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M112 40 l8 -7 l8 7" fill="none" stroke={C.peach} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Frame>
  );
}

export function BookingArt() {
  const cols = [62, 90, 118, 146];
  const rows = [72, 94, 116];
  return (
    <Frame box="0 0 240 180">
      {shadow(112, 156, 62)}
      <rect x="50" y="34" width="124" height="116" rx="12" fill={C.white} stroke={C.line} />
      <path d="M50 46 a12 12 0 0 1 12 -12 h100 a12 12 0 0 1 12 12 v12 h-124 z" fill={C.ink} />
      <rect x="78" y="24" width="7" height="18" rx="3.5" fill={C.soft} />
      <rect x="139" y="24" width="7" height="18" rx="3.5" fill={C.soft} />
      {rows.map((y, r) =>
        cols.map((x, c) =>
          r === 1 && c === 2 ? null : <rect key={`${r}${c}`} x={x} y={y} width="22" height="14" rx="4" fill={C.mist} />,
        ),
      )}
      <rect x="114" y="90" width="30" height="22" rx="6" fill={C.orange} />
      {tick(123, 101, 1.1)}
      <g>
        <path d="M186 84 h28 l-4 -6 v-12 a10 10 0 0 0 -20 0 v12 z" fill={C.peach} />
        <circle cx="200" cy="86.5" r="3" fill={C.ink} />
        <circle cx="200" cy="54" r="2.5" fill={C.deep} />
        <path d="M220 54 q5 6 0 14 M180 54 q-5 6 0 14" fill="none" stroke={C.soft} strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </Frame>
  );
}

export function FollowUpArt() {
  return (
    <Frame box="0 0 240 180">
      {shadow(178, 152, 40)}
      <rect x="150" y="40" width="56" height="110" rx="4" fill={C.wash} stroke={C.line} />
      <path d="M150 40 L180 50 L180 140 L150 150 Z" fill={C.white} stroke={C.line} strokeLinejoin="round" />
      <circle cx="172" cy="96" r="2.5" fill={C.soft} />
      {star(222, 34, 9, C.orange)}
      <path
        d="M24 132 C 44 70, 96 52, 108 82 S 82 118, 124 104"
        fill="none"
        stroke={C.soft}
        strokeWidth="1.6"
        strokeDasharray="1 6"
        strokeLinecap="round"
      />
      <g>
        <path d="M126 104 L158 88 L140 114 Z" fill={C.white} stroke={C.ink} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M140 114 L142 100 L158 88" fill="none" stroke={C.ink} strokeWidth="1.4" strokeLinejoin="round" />
      </g>
    </Frame>
  );
}

export const featureArt = { answer: AnswerArt, hot: HotLeadsArt, booking: BookingArt, followup: FollowUpArt } as const;

// Empty states inside the app (4:3, small and quiet).

export function EmptyInboxArt({ className }: { className?: string }) {
  return (
    <Frame box="0 0 200 150" className={className}>
      {shadow(104, 134, 58)}
      <rect x="90" y="104" width="9" height="30" rx="2" fill={C.soft} />
      <path d="M60 106 V82 a22 22 0 0 1 22 -22 h52 a4 4 0 0 1 4 4 v42 z" fill={C.white} stroke={C.line} />
      <path d="M60 82 a22 22 0 0 1 44 0 v24 h-44 z" fill={C.mist} />
      <rect x="70" y="88" width="24" height="4" rx="2" fill={C.line} />
      <rect x="140" y="78" width="3.5" height="26" rx="1.5" fill={C.soft} />
      <rect x="143" y="96" width="14" height="8" rx="2" fill={C.orange} />
      <rect x="150" y="116" width="16" height="18" rx="3" fill={C.peach} />
      <path d="M166 120 q7 0 7 6 t-7 6" fill="none" stroke={C.peach} strokeWidth="2.5" />
      <path d="M155 110 q-3 -4 0 -8 M161 110 q-3 -4 0 -8" fill="none" stroke={C.line} strokeWidth="1.5" strokeLinecap="round" />
    </Frame>
  );
}

export function EmptyHotArt({ className }: { className?: string }) {
  return (
    <Frame box="0 0 200 150" className={className}>
      {shadow(100, 136, 56)}
      <rect x="66" y="24" width="18" height="86" rx="9" fill={C.white} stroke={C.line} />
      <circle cx="75" cy="116" r="13" fill={C.peach} />
      <rect x="72" y="88" width="6" height="28" rx="3" fill={C.peach} />
      {[40, 52, 64, 76].map((y) => (
        <rect key={y} x="88" y={y} width="7" height="2" rx="1" fill={C.line} />
      ))}
      <path d="M112 110 h40 l-5 -7 v-17 a15 15 0 0 0 -30 0 v17 z" fill={C.white} stroke={C.line} strokeLinejoin="round" />
      <circle cx="132" cy="70" r="3.5" fill={C.soft} />
      <circle cx="132" cy="115" r="5" fill={C.orange} />
    </Frame>
  );
}

export function EmptyBookingsArt({ className }: { className?: string }) {
  return (
    <Frame box="0 0 200 150" className={className}>
      {shadow(96, 136, 56)}
      <rect x="44" y="40" width="104" height="92" rx="10" fill={C.white} stroke={C.line} />
      <path d="M44 50 a10 10 0 0 1 10 -10 h84 a10 10 0 0 1 10 10 v10 h-104 z" fill={C.ink} />
      <rect x="66" y="32" width="6" height="15" rx="3" fill={C.soft} />
      <rect x="120" y="32" width="6" height="15" rx="3" fill={C.soft} />
      {[70, 90, 110].map((y) =>
        [54, 78, 102, 126].map((x) => <rect key={`${x}${y}`} x={x} y={y} width="14" height="12" rx="3" fill={C.mist} />),
      )}
      <path d="M133 30 a11 11 0 0 1 11 11 c0 9 -11 19 -11 19 s-11 -10 -11 -19 a11 11 0 0 1 11 -11 z" fill={C.orange} />
      <circle cx="133" cy="41" r="4" fill={C.white} />
      <path d="M133 63 v4" stroke={C.soft} strokeWidth="1.4" strokeLinecap="round" />
    </Frame>
  );
}

export function EmptyCampaignsArt({ className }: { className?: string }) {
  return (
    <Frame box="0 0 200 150" className={className}>
      <rect x="26" y="116" width="148" height="5" rx="2.5" fill={C.line} />
      {shadow(94, 118, 34, 3)}
      <path d="M64 114 L128 92 L96 116 Z" fill={C.white} stroke={C.ink} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M96 116 L102 104 L128 92" fill="none" stroke={C.ink} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M120 95 L128 92 L123 99 Z" fill={C.orange} />
      <path d="M134 86 C 150 70, 154 56, 174 40" fill="none" stroke={C.soft} strokeWidth="1.6" strokeDasharray="1 6" strokeLinecap="round" />
      {star(180, 34, 5, C.peach)}
    </Frame>
  );
}

export function EmptyResultsArt({ className }: { className?: string }) {
  return (
    <Frame box="0 0 200 150" className={className}>
      {shadow(100, 136, 60)}
      {[
        { x: 112, h: 30 },
        { x: 134, h: 46 },
        { x: 156, h: 64 },
      ].map((b) => (
        <rect key={b.x} x={b.x} y={132 - b.h} width="15" height={b.h} rx="3" fill="none" stroke={C.line} strokeWidth="1.6" strokeDasharray="3 4" />
      ))}
      <path d="M72 110 C 72 96, 70 84, 72 68" fill="none" stroke={C.soft} strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="60" cy="88" rx="12" ry="6" transform="rotate(-30 60 88)" fill={C.white} stroke={C.line} />
      <ellipse cx="84" cy="80" rx="12" ry="6" transform="rotate(30 84 80)" fill={C.white} stroke={C.line} />
      <ellipse cx="74" cy="60" rx="7" ry="11" transform="rotate(15 74 60)" fill={C.orange} />
      <path d="M54 108 h38 l-5 26 h-28 z" fill={C.peach} />
      <rect x="51" y="104" width="44" height="8" rx="3" fill={C.deep} fillOpacity="0.85" />
    </Frame>
  );
}

/** A quiet empty state: a small picture above the explanation. */
export function EmptyState({ art: Art, children, size = "md" }: { art: (p: { className?: string }) => React.ReactNode; children: React.ReactNode; size?: "sm" | "md" }) {
  return (
    <div className="flex flex-col items-center px-4 py-6 text-center">
      <Art className={size === "sm" ? "h-auto w-32" : "h-auto w-44"} />
      <div className="mt-3 max-w-sm text-[0.9375rem] text-ink-soft">{children}</div>
    </div>
  );
}
