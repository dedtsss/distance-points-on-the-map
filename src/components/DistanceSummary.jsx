export default function DistanceSummary({ photos, thresholdMeters = 25 }) {
  if (photos.length === 0 || !photos.some((photo) => ['done', 'missing', 'suspicious', 'low_precision'].includes(photo.gpsStatus))) return null;
  const withCoordinates = photos.filter((photo) => ['confident', 'manual'].includes(photo.coordinateQuality)).length;
  const lowPrecision = photos.filter((photo) => photo.coordinateQuality === 'low_precision').length;
  const suspicious = photos.filter((photo) => photo.coordinateQuality === 'suspicious').length;
  const missing = photos.filter((photo) => photo.coordinateQuality === 'missing').length;
  const conflicts = photos.reduce((count, photo) => (
    photo.distanceStatus === 'too_close'
      ? count + (photo.distanceConflicts?.length || 0)
      : count
  ), 0) / 2;

  if (withCoordinates === 0) {
    if (lowPrecision > 0 || suspicious > 0) {
      return (
        <aside className="notice notice-warning">
          {lowPrecision > 0 && `Координаты с низкой точностью: ${lowPrecision}. Нужна ручная проверка; расстояния не рассчитаны.`}
          {suspicious > 0 && ` Подозрительные координаты: ${suspicious}.`}
          {missing > 0 && ` Без координат: ${missing}.`}
        </aside>
      );
    }
    return (
      <aside className="notice notice-neutral">
        Координаты не найдены. Фото будут загружены, но расчет расстояний невозможен.
      </aside>
    );
  }

  return (
    <aside className={`notice ${conflicts > 0 || lowPrecision > 0 || suspicious > 0 ? 'notice-warning' : 'notice-success'}`}>
      {conflicts > 0
        ? `Найдено близких пар: ${conflicts}. Порог — ${thresholdMeters} м.`
        : `Близких пар не найдено. Порог — ${thresholdMeters} м.`}
      {lowPrecision > 0 && ` Низкая точность: ${lowPrecision}; нужна ручная проверка перед строгим OK.`}
      {suspicious > 0 && ` Подозрительные координаты: ${suspicious}.`}
      {missing > 0 && ` Без координат: ${missing}.`}
    </aside>
  );
}
