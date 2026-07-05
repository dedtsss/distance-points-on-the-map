export default function DistanceSummary({ photos, thresholdMeters = 25 }) {
  if (photos.length === 0 || !photos.some((photo) => ['done', 'missing', 'suspicious'].includes(photo.gpsStatus))) return null;
  const withCoordinates = photos.filter((photo) => ['confident', 'manual'].includes(photo.coordinateQuality)).length;
  const suspicious = photos.filter((photo) => photo.coordinateQuality === 'suspicious').length;
  const conflicts = photos.reduce((count, photo) => (
    photo.distanceStatus === 'too_close'
      ? count + (photo.distanceConflicts?.length || 0)
      : count
  ), 0) / 2;

  if (withCoordinates === 0) {
    return (
      <aside className="notice notice-neutral">
        {suspicious > 0
          ? `Подозрительные координаты: ${suspicious}. Нужна ручная проверка; расстояния не рассчитаны.`
          : 'Координаты не найдены. Фото будут загружены, но расчет расстояний невозможен.'}
      </aside>
    );
  }

  return (
    <aside className={`notice ${conflicts > 0 ? 'notice-warning' : 'notice-success'}`}>
      {conflicts > 0
        ? `Найдено близких пар: ${conflicts}. Порог — ${thresholdMeters} м.`
        : `Близких пар не найдено. Порог — ${thresholdMeters} м.`}
      {suspicious > 0 && ` Подозрительные координаты: ${suspicious}.`}
      {withCoordinates + suspicious < photos.length && ` Без координат: ${photos.length - withCoordinates - suspicious}.`}
    </aside>
  );
}
