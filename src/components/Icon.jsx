const ICONS = {
  dashboard: ['M3 13h8V3H3v10Z', 'M13 21h8V11h-8v10Z', 'M13 3v6h8V3h-8Z', 'M3 21h8v-6H3v6Z'],
  upload: ['M12 3v12', 'm7 7-7-7-7 7', 'M5 21h14'],
  map: ['M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z', 'M9 3v15', 'M15 6v15'],
  results: ['M4 5h16', 'M4 12h16', 'M4 19h16', 'M8 5v14'],
  sessions: ['M5 5h14v14H5z', 'M8 9h8', 'M8 13h8', 'M8 17h5'],
  journal: ['M12 8v5l3 2', 'M21 12a9 9 0 1 1-2.64-6.36', 'M21 4v6h-6'],
  settings: ['M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.08V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8.6 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.08-.4H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .4-1.08V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15.4 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.37.38.69.7.92.32.24.7.37 1.1.38H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51.7Z'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  chevronLeft: ['M15 18 9 12l6-6'],
  chevronRight: ['m9 18 6-6-6-6'],
  chevronDown: ['m6 9 6 6 6-6'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 15h10l1-15', 'M10 11v6', 'M14 11v6'],
  image: ['M4 5h16v14H4z', 'm4 10 3-3 3 3 2-2 4 4', 'M8.5 9.5h.01'],
  play: ['M8 5v14l11-7Z'],
  tune: ['M4 7h10', 'M18 7h2', 'M14 5v4', 'M4 17h2', 'M10 17h10', 'M8 15v4'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm21 21-4.35-4.35'],
  check: ['m20 6-11 11-5-5'],
  warning: ['M12 3 2 21h20L12 3Z', 'M12 9v5', 'M12 17h.01'],
  error: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M15 9l-6 6', 'm9 9 6 6'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 10v6', 'M12 7h.01'],
  copy: ['M8 8h11v11H8z', 'M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1'],
  external: ['M14 3h7v7', 'M10 14 21 3', 'M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6'],
  target: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z', 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6'],
  clock: ['M12 8v5l3 2', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'],
};

export default function Icon({ name, size = 20, className = '', title }) {
  const paths = ICONS[name] || ICONS.info;
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {paths.map((path) => <path key={path} d={path} />)}
    </svg>
  );
}
