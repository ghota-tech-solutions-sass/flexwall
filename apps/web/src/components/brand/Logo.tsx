/** The wall mark: one wide tile and two small ones, as on a lock screen. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="currentColor" />
      <rect x="12" y="12" width="40" height="18" rx="5" fill="#2fb866" />
      <rect x="12" y="34" width="18" height="18" rx="5" fill="var(--bg)" />
      <rect x="34" y="34" width="18" height="18" rx="5" fill="var(--muted)" />
    </svg>
  );
}
