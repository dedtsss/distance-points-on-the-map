export default function DistanceSummary({ photos, thresholdMeters = 25 }) {
  if (photos.length === 0 || !photos.some((photo) => ['done', 'missing'].includes(photo.gpsStatus))) return null;
  const withCoordinates = photos.filter((photo) => photo.coordinates).length;
  const conflicts = photos.reduce((count, photo) => (
    photo.distanceStatus === 'too_close'
      ? count + (photo.distanceConflicts?.length || 0)
      : count
  ), 0) / 2;

  if (withCoordinates === 0) {
    return (
      <aside className="notice notice-neutral">
        Координаты не найдены. Фото будут загружены, но расчет расстояний невозможен.
      </aside>
    );
  }

  return (
    <aside className={`notice ${conflicts > 0 ? 'notice-warning' : 'notice-success'}`}>
      {conflicts > 0
        ? `Найдено близких пар: ${conflicts}. Порог — ${thresholdMeters} м.`
        : `Близких пар не найдено. Порог — ${thresholdMeters} м.`}
      {withCoordinates < photos.length && ` Без координат: ${photos.length - withCoordinates}.`}
    </aside>
  );
}
