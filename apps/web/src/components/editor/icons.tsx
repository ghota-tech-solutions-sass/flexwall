// Rendered inside the Editor client boundary.
import type { ReactNode } from "react";

/** Line icons drawn on a 20 grid, 1.5 stroke, so they sit at the same weight as 14px text. */
function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { size?: number };

export const TrashIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h5.6a1.5 1.5 0 0 0 1.5-1.4l.7-10" />
  </Icon>
);
export const CopyIcon = (p: P) => (
  <Icon {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
  </Icon>
);
export const EyeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M1.8 10S4.8 4.5 10 4.5 18.2 10 18.2 10 15.2 15.5 10 15.5 1.8 10 1.8 10Z" />
    <circle cx="10" cy="10" r="2.5" />
  </Icon>
);
export const EyeOffIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8.2 4.7A8 8 0 0 1 10 4.5c5.2 0 8.2 5.5 8.2 5.5a14 14 0 0 1-2.2 2.8M5.3 6.2A13.6 13.6 0 0 0 1.8 10s3 5.5 8.2 5.5a7.6 7.6 0 0 0 3.6-.9M3 3l14 14M8.3 8.3a2.5 2.5 0 0 0 3.4 3.4" />
  </Icon>
);
export const CloseIcon = (p: P) => (
  <Icon {...p}>
    <path d="m5 5 10 10M15 5 5 15" />
  </Icon>
);
export const PlusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10 4v12M4 10h12" />
  </Icon>
);
export const SearchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13 13 4 4" />
  </Icon>
);
export const ChevronIcon = (p: P) => (
  <Icon {...p}>
    <path d="m6 8 4 4 4-4" />
  </Icon>
);
export const CheckIcon = (p: P) => (
  <Icon {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
);
export const ExternalIcon = (p: P) => (
  <Icon {...p}>
    <path d="M11 3.5h5.5V9M16.5 3.5 9 11M14 12v3.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H8" />
  </Icon>
);
export const SettingsIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 6h8M15 6h2M3 14h2M9 14h8" />
    <circle cx="13" cy="6" r="2" />
    <circle cx="7" cy="14" r="2" />
  </Icon>
);
export const KeyIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="7" cy="12.5" r="3.5" />
    <path d="m9.5 10 7-7M14 5.5l2 2M12 7.5l1.5 1.5" />
  </Icon>
);
export const TypeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 5.5V4h12v1.5M10 4v12M7.5 16h5" />
  </Icon>
);
export const LinkIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.8.8M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.8-.8" />
  </Icon>
);
export const LockIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="9" width="12" height="8" rx="2" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </Icon>
);

/** One glyph per widget category, used by the library and the inspector header. */
export function CategoryIcon({ category, size }: { category: string; size?: number }) {
  switch (category) {
    case "numbers":
      return (
        <Icon size={size}>
          <path d="M7.5 3.5 6 16.5M14 3.5l-1.5 13M3.5 7.5h13M3 12.5h13" />
        </Icon>
      );
    case "charts":
      return (
        <Icon size={size}>
          <path d="M3 14.5 7.5 9.5l3 3L17 5.5M13 5.5h4v4" />
        </Icon>
      );
    case "progress":
      return (
        <Icon size={size}>
          <rect x="2.5" y="7.5" width="15" height="5" rx="2.5" />
          <path d="M5 10h6" />
        </Icon>
      );
    case "time":
      return (
        <Icon size={size}>
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6v4l2.5 2" />
        </Icon>
      );
    default:
      return (
        <Icon size={size}>
          <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" />
          <path d="M7 8h6M7 11h4" />
        </Icon>
      );
  }
}
