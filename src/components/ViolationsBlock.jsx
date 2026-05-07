export default function ViolationsBlock({ violations, recommendation, hasGpsPhotos }) {
  return (
    <section className="panel">
      <h2>Нарушения дистанции</h2>
      {!hasGpsPhotos && <p className="warning">Нет фотографий с GPS. Расчёт расстояний невозможен.</p>}
      {hasGpsPhotos && violations.length === 0 && <p className="success">Нарушений нет</p>}
      {violations.length > 0 && (
        <ul className="violation-list">
          {violations.map((violation) => (
            <li key={`${violation.photoAId}-${violation.photoBId}`}>
              Фото №{violation.photoANumber} и Фото №{violation.photoBNumber} — {violation.distance.toFixed(1)} м
            </li>
          ))}
        </ul>
      )}

      <div className="recommendation">
        <strong>{recommendation.message}</strong>
        {recommendation.maxConflicts > 0 && (
          <p>
            Причина: {recommendation.tie ? 'каждый кандидат участвует' : 'участвует'} в {recommendation.maxConflicts} нарушениях.
          </p>
        )}
      </div>
    </section>
  );
}
