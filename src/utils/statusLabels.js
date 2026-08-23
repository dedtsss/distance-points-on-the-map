const LABELS = {
  active: 'Активная точка', reserve: 'В резерве', confident: 'Координаты подтверждены', manual: 'Проверено вручную',
  low_precision: 'Низкая точность', suspicious: 'Нужна проверка', missing: 'Не найдено', missing_coordinates: 'Координаты не найдены',
  pending: 'Ожидает обработки', idle: 'Ожидает обработки', processing: 'Обрабатывается', done: 'Готово', failed: 'Ошибка', skipped: 'Пропущено', too_close: 'Конфликт расстояния',
};

export function statusLabel(value, fallback = 'Ожидает обработки') {
  return LABELS[String(value || '').toLowerCase()] || fallback;
}

export function statusTone(value) {
  const normalized = String(value || '').toLowerCase();
  if (['failed', 'error', 'too_close'].includes(normalized)) return 'error';
  if (['low_precision', 'suspicious'].includes(normalized)) return 'warning';
  if (['done', 'confident', 'manual', 'active'].includes(normalized)) return 'success';
  return 'neutral';
}
