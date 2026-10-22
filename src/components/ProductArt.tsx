import type { ArtKind, Tone } from "@/lib/catalogue/types";

/**
 * Stand-in product artwork in the style of Drezzy's flyers: a tonal DREZZY watermark with the item on top.
 * Replaced by real 4:5 photography (PRD section 23) by rendering <Image> instead when product.images exists.
 */

const backgrounds: Record<Tone, { from: string; to: string; mark: string; dark: boolean }> = {
  navy: { from: "#00115b", to: "#0020a9", mark: "#ffffff", dark: true },
  grey: { from: "#e3e4ea", to: "#d5d5d9", mark: "#00115b", dark: false },
  blue: { from: "#0036ff", to: "#0024b3", mark: "#ffffff", dark: true },
  red: { from: "#a10000", to: "#6e0000", mark: "#ffffff", dark: true },
  charcoal: { from: "#404040", to: "#0a0a0a", mark: "#ffffff", dark: true },
};

function Sneaker({ upper, accent, soleFill }: { upper: string; accent: string; soleFill: string }) {
  return (
    <g transform="translate(40 150)">
      <ellipse cx="170" cy="168" rx="150" ry="9" fill="#000" opacity="0.18" />
      {/* upper */}
      <path
        d="M22 106 L28 30 C30 14 44 8 58 10 L98 16 C112 18 120 6 138 12 C154 44 176 60 206 68 L274 82 C306 90 320 100 322 112 L322 106 Z"
        fill={upper}
      />
      {/* toe cap */}
      <path d="M244 78 L274 82 C306 90 320 100 322 112 L322 106 L236 106 C240 96 242 88 244 78 Z" fill="#000" opacity="0.12" />
      {/* heel counter */}
      <path d="M22 106 L28 30 C30 14 44 8 58 10 L62 40 C54 60 50 84 52 106 Z" fill="#000" opacity="0.14" />
      {/* collar */}
      <path d="M58 10 L98 16 C112 18 120 6 138 12 L132 26 C118 22 108 32 94 30 L60 26 Z" fill="#000" opacity="0.22" />
      {/* accent stripe */}
      <path d="M70 92 C110 70 166 76 214 100" stroke={accent} strokeWidth="11" strokeLinecap="round" fill="none" />
      {/* laces */}
      <g stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.85">
        <path d="M122 26 L140 44" />
        <path d="M142 34 L160 52" />
        <path d="M162 43 L180 60" />
        <path d="M182 52 L200 66" />
      </g>
      {/* sole */}
      <path
        d="M2 124 C2 112 10 106 22 106 L304 106 C320 106 326 116 324 128 C322 142 310 150 296 150 L28 150 C12 150 2 140 2 124 Z"
        fill={soleFill}
      />
      <path d="M8 138 C60 144 260 144 318 136" stroke="#000" strokeWidth="3" opacity="0.15" fill="none" />
    </g>
  );
}

function Apparel({ upper, accent }: { upper: string; accent: string }) {
  return (
    <g transform="translate(70 120)">
      <ellipse cx="130" cy="262" rx="110" ry="8" fill="#000" opacity="0.18" />
      <path
        d="M60 8 C80 28 180 28 200 8 L258 40 L238 96 L204 84 L204 254 L56 254 L56 84 L22 96 L2 40 Z"
        fill={upper}
      />
      <path d="M60 8 C80 28 180 28 200 8 L186 4 C160 20 100 20 74 4 Z" fill="#000" opacity="0.2" />
      <g stroke={accent} strokeWidth="9" opacity="0.9">
        <path d="M56 130 H204" />
        <path d="M56 160 H204" />
      </g>
      <path d="M130 22 V70" stroke={accent} strokeWidth="5" strokeLinecap="round" />
    </g>
  );
}

function Watch({ upper, accent }: { upper: string; accent: string }) {
  return (
    <g transform="translate(200 250)">
      <ellipse cx="0" cy="170" rx="90" ry="8" fill="#000" opacity="0.2" />
      <rect x="-34" y="-150" width="68" height="110" rx="16" fill={upper} />
      <rect x="-34" y="40" width="68" height="110" rx="16" fill={upper} />
      <circle r="84" fill="#c9ccd8" />
      <circle r="74" fill="#0a0a0a" />
      <circle r="66" fill={accent} opacity="0.95" />
      <g stroke="#0a0a0a" strokeWidth="4" strokeLinecap="round">
        <path d="M0 -58 V-46" /><path d="M0 58 V46" /><path d="M-58 0 H-46" /><path d="M58 0 H46" />
      </g>
      <path d="M0 0 L0 -38" stroke="#0a0a0a" strokeWidth="5" strokeLinecap="round" />
      <path d="M0 0 L26 14" stroke="#0a0a0a" strokeWidth="4" strokeLinecap="round" />
      <circle r="5" fill="#0a0a0a" />
    </g>
  );
}

function Slide({ upper, accent }: { upper: string; accent: string }) {
  return (
    <g transform="translate(60 170)">
      <ellipse cx="140" cy="150" rx="130" ry="9" fill="#000" opacity="0.18" />
      <path d="M10 110 C10 90 30 84 60 84 L250 84 C280 84 292 100 290 118 C288 136 270 142 250 142 L50 142 C26 142 10 134 10 110 Z" fill={accent} />
      <path d="M40 84 C60 20 150 14 214 54 C238 70 252 78 262 84 Z" fill={upper} />
      <path d="M96 84 C110 54 170 52 200 84" stroke="#fff" strokeWidth="4" fill="none" opacity="0.4" strokeLinecap="round" />
    </g>
  );
}

function Cap({ upper, accent }: { upper: string; accent: string }) {
  return (
    <g transform="translate(60 160)">
      <ellipse cx="140" cy="178" rx="120" ry="9" fill="#000" opacity="0.2" />
      <path d="M30 140 C30 60 80 20 140 20 C200 20 250 60 250 140 Z" fill={upper} />
      <path d="M140 20 V140" stroke="#000" strokeWidth="3" opacity="0.18" />
      <path d="M88 32 C100 70 100 110 92 140" stroke="#000" strokeWidth="3" opacity="0.14" fill="none" />
      <path d="M192 32 C180 70 180 110 188 140" stroke="#000" strokeWidth="3" opacity="0.14" fill="none" />
      <path d="M20 140 H250 C300 140 316 160 306 170 C280 182 200 172 20 156 Z" fill={upper} />
      <path d="M20 140 H250 C300 140 316 160 306 170" stroke="#000" strokeWidth="3" opacity="0.2" fill="none" />
      <circle cx="140" cy="20" r="7" fill={accent} />
      <rect x="112" y="80" width="56" height="10" rx="5" fill={accent} />
    </g>
  );
}

export function ProductArt({
  kind,
  tone,
  upper,
  accent,
  label,
  className = "",
}: {
  kind: ArtKind;
  tone: Tone;
  upper: string;
  accent: string;
  label: string;
  className?: string;
}) {
  const bg = backgrounds[tone];
  const id = `g-${tone}`;
  return (
    <svg
      viewBox="0 0 400 500"
      role="img"
      aria-label={label}
      className={`block h-full w-full ${className}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={bg.from} />
          <stop offset="1" stopColor={bg.to} />
        </linearGradient>
      </defs>
      <rect width="400" height="500" fill={`url(#${id})`} />
      <text
        x="200"
        y="205"
        textAnchor="middle"
        fontSize="132"
        fontWeight="800"
        letterSpacing="-6"
        fill={bg.mark}
        opacity={bg.dark ? 0.07 : 0.1}
        fontFamily="var(--font-lexend), system-ui, sans-serif"
      >
        DREZZY
      </text>
      <text
        x="200"
        y="345"
        textAnchor="middle"
        fontSize="132"
        fontWeight="800"
        letterSpacing="-6"
        fill={bg.mark}
        opacity={bg.dark ? 0.05 : 0.07}
        fontFamily="var(--font-lexend), system-ui, sans-serif"
      >
        DREZZY
      </text>
      {kind === "sneaker" && <Sneaker upper={upper} accent={accent} soleFill={bg.dark ? "#f2f3f8" : "#ffffff"} />}
      {kind === "apparel" && <Apparel upper={upper} accent={accent} />}
      {kind === "watch" && <Watch upper={upper} accent={accent} />}
      {kind === "slide" && <Slide upper={upper} accent={accent} />}
      {kind === "cap" && <Cap upper={upper} accent={accent} />}
    </svg>
  );
}
