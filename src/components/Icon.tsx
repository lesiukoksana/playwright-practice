// Plain line icons (24×24, stroked with the current text colour), used instead of emoji.

const PATHS = {
  hint: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  docs: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  target: '<circle cx="12" cy="12" r="8"/><path d="M12 12h.01"/>',
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  practice: '<path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8L2 21.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z"/><path d="m15 5 4 4"/>',
  // Two theatre masks: comedy in front, tragedy behind.
  logo: '<path d="M14 13.79A5.5 5.5 0 0 0 21 8.5V2.5H10v6"/><path d="M3 8.5h11v6a5.5 5.5 0 0 1-11 0z"/><path d="M6.5 12h.01M10.5 12h.01M16.5 6h.01M19.5 6h.01"/><path d="M6.3 15.2q2.2 2 4.4 0"/><path d="M16.6 10.2q1.3-1.1 2.6 0"/>',
} as const;

export type IconName = keyof typeof PATHS;

/** The icon as an HTML string, for use inside Markdown. */
export function iconHtml(name: IconName) {
  return `<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}
