// Small line icons, drawn on a 24 unit grid at a 1.6 stroke.
const paths: Record<string, React.ReactNode> = {
  home: <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />,
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  brain: (
    <>
      <path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 4.5 3 3 0 0 0 3 2.5V4.5z" />
      <path d="M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 4.5 3 3 0 0 1-3 2.5V4.5z" />
      <path d="M9 4.5h6M9 19.5h6" />
    </>
  ),
  inbox: <path d="M4 13l2.5-8h11L20 13v6H4v-6zM4 13h4.5l1 2.5h5l1-2.5H20" />,
  chat: <path d="M5 5h14v10H10l-4 4v-4H5V5z" />,
  megaphone: <path d="M4 10v4h3l8 4V6L7 10H4zM18 9.5a3 3 0 0 1 0 5" />,
  file: <path d="M7 3h7l4 4v14H7V3zM14 3v4h4M9.5 12h6M9.5 15.5h6" />,
  refresh: <path d="M19 8a7.5 7.5 0 1 0 1 6M19 3.5V8h-4.5" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17" />
    </>
  ),
  gauge: <path d="M4.5 17a8 8 0 1 1 15 0M12 13l4-4" />,
  layers: <path d="M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <path d="M12 4l9 16H3L12 4zM12 10v4.5M12 17.2v.3" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.3" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  logout: <path d="M14 4H6v16h8M10 12h10M17 8.5l3.5 3.5-3.5 3.5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};

export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] ?? paths.layers}
    </svg>
  );
}
