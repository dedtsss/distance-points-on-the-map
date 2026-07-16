export const APP_SCREENS = Object.freeze([
  { id: 'upload', label: 'Загрузка и проверка' },
  { id: 'map', label: 'Карта' },
  { id: 'results', label: 'Результаты' },
  { id: 'settings', label: 'Настройки' },
]);

export const DEFAULT_SCREEN = 'upload';

export function normalizeScreen(value) {
  return APP_SCREENS.some((screen) => screen.id === value) ? value : DEFAULT_SCREEN;
}
