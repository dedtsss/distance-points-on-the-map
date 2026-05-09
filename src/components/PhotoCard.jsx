const formatCoordinate = (value) => Number(value).toFixed(6);

export default function PhotoCard({ photo, isProblem, isHighlighted, conflicts, onToggle }) {
  const expanded = photo.expanded;
  const conflictNumbers = conflicts.map((conflict) => (
    conflict.photoAId === photo.id ? conflict.photoBNumber : conflict.photoANumber
  ));

  return (
    <article className={`photo-card photo-card-compact ${isHighlighted && isProblem ? 'problem-highlight' : ''}`}>
      <button
        type="button"
        className="photo-summary"
        onClick={() => onToggle(photo.id)}
        aria-expanded={expanded}
      >
        <span className="photo-summary-title">Фото №{photo.number}</span>
        <span className={photo.gpsStatus === 'found' ? 'summary-pill success-pill' : 'summary-pill warning-pill'}>
          {photo.gpsStatusText}
        </span>
        <span className={isProblem ? 'summary-pill danger-pill' : 'summary-pill neutral-pill'}>
          {isProblem ? 'Есть нарушения' : 'Без нарушений'}
        </span>
        <span className="summary-pill neutral-pill">{photo.uploadStatus}</span>
        <span className="summary-caret">{expanded ? 'Свернуть' : 'Открыть'}</span>
      </button>

      {expanded && (
        <div className="photo-details-body">
          <img src={photo.previewUrl} alt={`Предпросмотр Фото №${photo.number}`} className="preview" loading="lazy" />

          <dl className="meta-list">
            <div>
              <dt>Файл</dt>
              <dd>{photo.originalName}</dd>
            </div>
            <div>
              <dt>GPS</dt>
              <dd className={photo.gpsStatus === 'found' ? 'success-text' : 'warning-text'}>{photo.gpsStatusText}</dd>
            </div>
            {photo.coordinates && (
              <div>
                <dt>Координаты</dt>
                <dd>{formatCoordinate(photo.coordinates.latitude)}, {formatCoordinate(photo.coordinates.longitude)}</dd>
              </div>
            )}
            <div>
              <dt>Очистка</dt>
              <dd>{photo.cleanStatus}</dd>
            </div>
            <div>
              <dt>Имя загрузки</dt>
              <dd>{photo.uploadFilename || 'будет создано перед загрузкой'}</dd>
            </div>
            <div>
              <dt>Загрузка</dt>
              <dd>{photo.uploadStatus}</dd>
            </div>
            <div>
              <dt>Хостинг</dt>
              <dd>{photo.hostingUsed || 'не выбран для загрузки'}</dd>
            </div>
          </dl>

          {photo.cleanWarnings.length > 0 && (
            <p className="warning small">Предупреждение: {photo.cleanWarnings.join('; ')}</p>
          )}
          {photo.uploadError && <p className="error small">{photo.uploadError}</p>}

          <div className="details">
            <h4>Подробности</h4>
            <p>
              Координаты: {photo.coordinates
                ? `${formatCoordinate(photo.coordinates.latitude)}, ${formatCoordinate(photo.coordinates.longitude)}`
                : photo.gpsStatusText}
            </p>
            <p>Загруженная ссылка: {photo.uploadedUrl || 'нет'}</p>
            <p>
              Конфликты: {conflictNumbers.length > 0
                ? conflictNumbers.map((number) => `Фото №${number}`).join(', ')
                : 'нет'}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
