// SPDX-License-Identifier: Apache-2.0
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** External or outbound destination. Example: <ArrowUpRight />. */
export function ArrowUpRight(props: IconProps) {
  return (
    <Icon className="icon-nudge-xy" {...props}>
      <path d="M5 11 11 5M6 5h5v5" />
    </Icon>
  );
}

/** Internal destination. Example: <ArrowRight />. */
export function ArrowRight(props: IconProps) {
  return (
    <Icon className="icon-nudge-x" {...props}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </Icon>
  );
}

/** Same-page destination below. Example: <ArrowDown />. */
export function ArrowDown(props: IconProps) {
  return (
    <Icon className="icon-nudge-y" {...props}>
      <path d="M8 3v10M4 9l4 4 4-4" />
    </Icon>
  );
}

export function ArrowLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 8H3M7 4 3 8l4 4" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3 3" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5.25" y="5.25" width="8" height="8" rx="1.5" />
      <path d="M10.75 5.25V3.5a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1v6.25a1 1 0 0 0 1 1h1.75" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3.25 8.5 3 3 6.5-7" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 5.5h11M2.5 10.5h11" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Icon>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </Icon>
  );
}

export function GitHubIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.67.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z" />
    </svg>
  );
}

/**
 * The flop-lab mark: three checked cells and one left open. Unverified stays visible.
 * Example: <Mark size={22} />.
 */
export function Mark({ size = 22, ...props }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--surface-raised)" stroke="var(--border-strong)" />
      <rect x="5" y="5" width="6.5" height="6.5" rx="1.6" fill="var(--accent)" />
      <rect x="12.5" y="5" width="6.5" height="6.5" rx="1.6" fill="var(--accent)" />
      <rect x="5" y="12.5" width="6.5" height="6.5" rx="1.6" fill="var(--accent)" />
      <rect x="13.1" y="13.1" width="5.3" height="5.3" rx="1.3" fill="none" stroke="var(--warning)" strokeWidth="1.2" />
    </svg>
  );
}
