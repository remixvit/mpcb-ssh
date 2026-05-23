const ICONS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
  server: <><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><circle cx="7" cy="7" r="0.6" fill="currentColor"/><circle cx="7" cy="17" r="0.6" fill="currentColor"/><path d="M11 7h6M11 17h6"/></>,
  key: <><circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M16 6l3 3M14 8l3 3"/></>,
  tunnel: <><path d="M3 14c0-5 4-9 9-9s9 4 9 9"/><path d="M3 14v6h18v-6"/><path d="M7 14v4M12 14v4M17 14v4"/></>,
  agent: <><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M9 20h6M12 16v4"/></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.69V4.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  search: <><circle cx="11" cy="11" r="6"/><path d="M21 21l-4.3-4.3"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-7 8-7s7 3 8 7"/></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>,
  arrow: <><path d="M5 12h14M13 5l7 7-7 7"/></>,
  arrowR: <><path d="M9 6l6 6-6 6"/></>,
  power: <><path d="M12 3v9"/><path d="M6 7a8 8 0 1 0 12 0"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
  edit: <><path d="M4 20h4l11-11-4-4L4 16z"/><path d="M14 6l4 4"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></>,
  upload: <><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></>,
  download: <><path d="M12 4v12M6 12l6 6 6-6"/><path d="M4 20h16"/></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></>,
  bolt: <><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></>,
  filter: <><path d="M4 5h16M7 12h10M10 19h4"/></>,
  more: <><circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11 7"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7L13 17"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z"/></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></>,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h11"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  check: <><path d="M5 12l4 4 10-10"/></>,
  x: <><path d="M6 6l12 12M18 6L6 18"/></>,
  play: <><path d="M7 5v14l12-7z" fill="currentColor"/></>,
  stop: <><rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>,
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.3"/></>,
  doc: <><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v6h6"/></>,
};

export default function Icon({ name, className = 'ico', style }) {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  );
}

export const BrandMark = ({ size = 28 }) => (
  <div className="brand-mark" style={{ width: size, height: size, fontSize: size * 0.4 }}>M</div>
);

export const ColorDot = ({ color }) => (
  <span className="row-tag-dot" style={{ background: color, boxShadow: `0 0 8px ${color}66` }} />
);

export const LABEL_COLORS = [
  { name: 'teal',   value: '#80cbc4' },
  { name: 'blue',   value: '#89ddff' },
  { name: 'green',  value: '#c3e88d' },
  { name: 'amber',  value: '#ffcb6b' },
  { name: 'coral',  value: '#f07178' },
  { name: 'purple', value: '#c792ea' },
  { name: 'indigo', value: '#82aaff' },
  { name: 'slate',  value: '#546e7a' },
];
