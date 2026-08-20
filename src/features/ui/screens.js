export const APP_SCREENS = Object.freeze([
  { id: 'dashboard', label: 'Дашборд', icon: 'dashboard' },
  { id: 'sessions', label: 'Сессии' },
  { id: 'upload', label: 'Обработка фото' },
  { id: 'reserve', label: 'Резерв' },
  { id: 'map', label: 'Карта' },
  { id: 'results', label: 'Результаты' },
  { id: 'journal', label: 'Журнал' },
  { id: 'settings', label: 'Настройки' },
]);

export const DEFAULT_SCREEN = 'dashboard';

export function normalizeScreen(value) {
  return APP_SCREENS.some((screen) => screen.id === value) ? value : DEFAULT_SCREEN;
}
