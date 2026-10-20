import type { ReactElement } from 'react';

/** 線画アイコン（SVG）。絵文字は端末ごとに見た目が変わるため使わない */
export type IconName = 'table' | 'settle' | 'history' | 'settings' | 'help' | 'overview';

const PATHS: Record<IconName, ReactElement> = {
  table: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
    </>
  ),
  settle: (
    <>
      <path d="M12 3v18M7 21h10" />
      <path d="M5 7h14" />
      <path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" />
    </>
  ),
  history: (
    <>
      <path d="M6 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z" />
      <path d="M6 3a2 2 0 0 0-2 2v2h2M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6M12 17.2v.3" />
    </>
  ),
  overview: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
