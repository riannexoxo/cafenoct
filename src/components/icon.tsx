// Line icons used across CafeNoct (24×24, drawn with the current text color).
const PATHS = {
  apps: `<rect x="3.5" y="7" width="17" height="13" rx="3"/><path d="M8.5 7V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7M3.5 12.5h17"/>`,
  auto: `<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>`,
  bell: `<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 21h4"/>`,
  chat: `<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  clients: `<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.7 2.6 3 5.2"/>`,
  coin: `<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.9 2.6 2.1-1.1 2-2.6 2c-1.2 0-2.1-.5-2.6-1.3M12 6.5v11"/>`,
  content: `<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M8 14h3"/>`,
  copy: `<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>`,
  docs: `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/>`,
  expand: `<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`,
  file: `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>`,
  focus: `<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.2 1.6M9.5 2.5h5M12 2.5v3"/>`,
  left: `<path d="m15 5-7 7 7 7"/>`,
  link: `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
  money: `<rect x="2.5" y="6" width="19" height="12.5" rx="3"/><circle cx="12" cy="12.2" r="2.6"/><path d="M6 9.5v.01M18 15v.01"/>`,
  more: `<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>`,
  pause: `<path d="M8 5v14M16 5v14"/>`,
  play: `<path d="M7 4.5v15l12-7.5z"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  projects: `<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>`,
  repeat: `<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11.5V10a4 4 0 0 1 4-4h13M7 21.5 3.5 18 7 14.5"/><path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13"/>`,
  right: `<path d="m9 5 7 7-7 7"/>`,
  schedule: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3.5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4.8z"/>`,
  spark: `<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>`,
  stop: `<rect x="6" y="6" width="12" height="12" rx="2"/>`,
  sub: `<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/>`,
  tasks: `<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12 2.6 2.6L16 9.2"/>`,
  time: `<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>`,
  today: `<path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>`,
  updown: `<path d="m7 9 5-5 5 5M7 15l5 5 5-5"/>`,
  x: `<path d="M6 6l12 12M18 6 6 18"/>`,
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] }} />
  );
}
