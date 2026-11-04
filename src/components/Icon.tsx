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
  bell: <><path d="M6 16.5V11a6 6 0 1 1 12 0v5.500l1.500 1.500h-15L6 16.500Z" /><path d="M10 20.500a2.200 2.200 0 0 0 4 0" /></>,
  sneaker: <path d="M3 9.500c2 .800 3.500.800 5-.500l3.500 3.500c2 1.500 5 1.800 7.500 2.200 1.200.200 2 1 2 2.300H3v-7.500Zm0 7.500v1.500h18V17" />,
  box: <><path d="m12 3 8 4.500v9L12 21l-8-4.500v-9L12 3Z" /><path d="m4 7.500 8 4.500 8-4.500M12 12v9" /></>,
  people: <><circle cx="9" cy="8" r="3.200" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.200a3.200 3.200 0 0 1 0 5.600M18 14.500A6 6 0 0 1 21 20" /></>,
  target: <><circle cx="12" cy="12" r="8.500" /><circle cx="12" cy="12" r="4.500" /><circle cx="12" cy="12" r="1" /></>,
  card: <><rect x="3" y="5.500" width="18" height="13" rx="2" /><path d="M3 10h18" /></>,
  chart: <path d="M4 4v16h16M8 16v-5M12 16V8M16 16v-3" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100" /></>,
  download: <path d="M12 4v11m-4.500-4.500L12 15l4.500-4.500M5 20h14" />,
  inbox: <path d="M4 13 6.500 5h11L20 13v6H4v-6Zm0 0h5a3 3 0 0 0 6 0h5" />,
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
