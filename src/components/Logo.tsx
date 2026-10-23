import { useId } from "react";

/** Message to Quote mark: two quotation sheets, the front one with its lines, on a cobalt tile.
    Same drawing as app/icon.svg (the favicon). */
export function LogoMark({ size = 34, className = "" }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={`shrink-0 ${className}`} role="img" aria-label="Message to Quote">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4B7BFF" />
          <stop offset="1" stopColor="#1A3FB8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${id})`} />
      <rect x="7" y="12" width="15" height="19" rx="3" fill="#fff" opacity=".5" />
      <rect x="15" y="8" width="17" height="22" rx="3" fill="#fff" />
      <path d="M19 14h9M19 18.5h9M19 23h5" stroke="#1F4FD8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Mark plus name. */
export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[15px] font-bold leading-none tracking-[-0.3px] text-[var(--q-text)]">Message to Quote</span>
    </span>
  );
}
