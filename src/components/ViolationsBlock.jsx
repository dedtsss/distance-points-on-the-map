import { formatDistanceMeters } from '../utils/geoDistance';

export default function ViolationsBlock({ violations, recommendation, pointStats, thresholdMeters }) {
  const hasPhotos = pointStats.totalCount > 0;
  const hasValidPoints = pointStats.validCount > 0;

  return (
    <section className="panel">
      <h2>Нарушения дистанции</h2>

      <div className="stats-grid">
        <div>
          <strong>{pointStats.totalCount}</strong>
          <span>фото всего</span>
        </div>
        <div>
          <strong>{pointStats.validCount}</strong>
          <span>валидных точек</span>
        </div>
        <div>
          <strong>{pointStats.missingCount}</strong>
          <span>без координат</span>
        </div>
        <div>
          <strong>{pointStats.violationCount}</strong>
          <span>нарушений</span>
        </div>
      </div>

      {!hasPhotos && <p className="muted">Выберите фотографии для расчёта.</p>}
      {hasPhotos && !hasValidPoints && <p className="warning">Нет валидных координат. Расчёт расстояний невозможен.</p>}
      {hasValidPoints && violations.length === 0 && (
        <p className="success">Все валидные точки дальше {formatDistanceMeters(thresholdMeters)} м.</p>
      )}
      {pointStats.missingCount > 0 && (
        <p className="warning">Расчёт выполнен только по {pointStats.validCount} валидным точкам.</p>
      )}

      {violations.length > 0 && (
        <ul className="violation-list">
          {violations.map((violation) => (
            <li key={`${violation.pointAId}-${violation.pointBId}`}>
              {violation.pointALabel} и {violation.pointBLabel} — {formatDistanceMeters(violation.distanceMeters)} м,
              порог {formatDistanceMeters(violation.thresholdMeters)} м
            </li>
          ))}
        </ul>
      )}

      {hasValidPoints && (
        <div className="recommendation">
          <strong>{recommendation.message}</strong>
          {recommendation.maxConflicts > 0 && (
            <p>
              Причина: {recommendation.tie ? 'каждый кандидат участвует' : 'участвует'} в {recommendation.maxConflicts} нарушениях.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
