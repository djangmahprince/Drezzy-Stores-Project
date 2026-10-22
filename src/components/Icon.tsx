const paths = {
  bag: <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  home: <path d="m4 11 8-7 8 7v9H4v-9Zm6 9v-5h4v5" />,
  shop: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
  book: <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5v-14Zm0 14A1.5 1.5 0 0 0 6.5 21H19v-3" />,
  truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17" r="1.8" /><circle cx="17" cy="17" r="1.8" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chat: <path d="M5 18.5 6 15a7.5 7.5 0 1 1 3 3l-4 .5Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  pin: <><path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" /><circle cx="12" cy="11" r="2.2" /></>,
  shield: <path d="M12 3 5 6v6c0 4.2 3 7.4 7 9 4-1.600 7-4.800 7-9V6l-7-3Zm-3 9 2.500 2.500L15.500 10" />,
  phone: <path d="M6 4h3l1.500 4-2 1.500a11 11 0 0 0 5 5L15 12.500l4 1.500v3a2 2 0 0 1-2 2A13 13 0 0 1 4 6a2 2 0 0 1 2-2Z" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4.500l3 1.500" /></>,
  spark: <path d="m12 3 1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800L12 3Z" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, className = "", filled = false }: { name: IconName; size?: number; className?: string; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {paths[name]}
    </svg>
  );
}
