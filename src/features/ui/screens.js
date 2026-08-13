export const APP_SCREENS = Object.freeze([
  { id: 'overview', label: 'Обзор', icon: 'dashboard' },
  { id: 'session', label: 'Сессия', icon: 'upload' },
  { id: 'history', label: 'История', icon: 'sessions' },
  { id: 'map', label: 'Карта' },
  { id: 'settings', label: 'Настройки' },
]);

export const DEFAULT_SCREEN = 'overview';

const LEGACY_SCREEN_ALIASES = Object.freeze({
  dashboard: 'overview', upload: 'session', results: 'session', sessions: 'history', reserve: 'history', journal: 'history',
});

export function normalizeScreen(value) {
  const normalized = LEGACY_SCREEN_ALIASES[value] || value;
  return APP_SCREENS.some((screen) => screen.id === normalized) ? normalized : DEFAULT_SCREEN;
}
