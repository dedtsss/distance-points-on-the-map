const formatCoordinate = (value) => (
  Number.isFinite(Number(value)) ? Number(value).toFixed(6) : ''
);

const formatDistance = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return numeric < 100 ? numeric.toFixed(1) : numeric.toFixed(0);
};

const GPS_SOURCE_LABELS = {
  ocr: 'OCR',
  exif: 'EXIF',
  manual: 'manual',
  missing: 'missing',
};

const OCR_STATUS_LABELS = {
  pending: 'OCR ожидает',
  processing: 'OCR идет',
  found: 'OCR найден',
  suspect: 'OCR сомнительный',
  missing: 'OCR не найден',
  error: 'OCR ошибка',
};

const DISTANCE_STATUS_LABELS = {
  ok: 'Дистанция ок',
  too_close: 'Ближе порога',
  missing_coordinates: 'Нет координат',
};

const WARNING_LABELS = {
  coordinates_not_found: 'координаты не найдены',
  coordinates_invalid: 'координаты невалидны',
  coordinates_swapped: 'координаты поменяны местами по эвристике',
  exif_coordinates_not_found: 'EXIF fallback не нашел координаты',
  missing_coordinates: 'нет координат для расчета',
  ocr_error: 'ошибка OCR',
  ocr_text_empty: 'OCR вернул пустой текст',
  only_one_coordinate_found: 'найдена только одна координата',
  low_confidence: 'низкая уверенность OCR parser',
  zero_zero_placeholder: '0,0 похоже на placeholder',
  outside_expected_region: 'координаты вне ожидаемого региона',
};

const formatWarning = (warning) => WARNING_LABELS[warning] || warning;

export default function PhotoCard({
  photo,
  isProblem,
  isHighlighted,
  conflicts,
  onToggle,
  onCoordinateChange,
  onDescriptionChange,
  debugMode = false,
}) {
  const expanded = photo.expanded;
  const conflictLabels = conflicts.map((conflict) => {
    const otherLabel = conflict.pointAId === photo.id ? conflict.pointBLabel : conflict.pointALabel;
    return `${otherLabel} — ${formatDistance(conflict.distanceMeters)} м`;
  });
  const cleanWarnings = photo.cleanWarnings || [];
  const gpsWarnings = photo.gpsWarnings || [];
  const distanceWarnings = photo.distanceWarnings || [];
  const coordinateText = photo.coordinates
    ? `${formatCoordinate(photo.latitude)}, ${formatCoordinate(photo.longitude)}`
    : 'нет координат';
  const participatesInDistance = photo.distanceStatus !== 'missing_coordinates';
  const debugAttempts = photo.ocrAttempts || [];
  const debugCandidates = photo.ocrCandidates || [];

  return (
    <article className={`photo-card photo-card-compact ${isHighlighted && isProblem ? 'problem-highlight' : ''}`}>
      <button
        type="button"
        className="photo-summary"
        onClick={() => onToggle(photo.id)}
        aria-expanded={expanded}
      >
        <span className="photo-summary-title">Фото {photo.displayIndex || `№${photo.number}`}</span>
        <span className={photo.gpsStatus === 'found' ? 'summary-pill success-pill' : 'summary-pill warning-pill'}>
          {GPS_SOURCE_LABELS[photo.gpsSource] || photo.gpsSource}
        </span>
        <span className={photo.ocrStatus === 'found' ? 'summary-pill success-pill' : 'summary-pill neutral-pill'}>
          {OCR_STATUS_LABELS[photo.ocrStatus] || photo.ocrStatus}
        </span>
        <span className={isProblem ? 'summary-pill danger-pill' : 'summary-pill neutral-pill'}>
          {DISTANCE_STATUS_LABELS[photo.distanceStatus] || 'Без нарушений'}
        </span>
        <span className="summary-pill neutral-pill">{photo.uploadStatus}</span>
        <span className="summary-caret">{expanded ? 'Свернуть' : 'Открыть'}</span>
      </button>

      {expanded && (
        <div className="photo-details-body">
          <img src={photo.previewUrl} alt={`Предпросмотр Фото ${photo.displayIndex || photo.number}`} className="preview" loading="lazy" />

          <dl className="meta-list">
            <div>
              <dt>Файл</dt>
              <dd>{photo.fileName || photo.originalName}</dd>
            </div>
            <div>
              <dt>Индекс OCR</dt>
              <dd>{photo.indexFromOcr || 'нет'}</dd>
            </div>
            <div>
              <dt>Координаты</dt>
              <dd className={photo.gpsStatus === 'found' ? 'success-text' : 'warning-text'}>{coordinateText}</dd>
            </div>
            <div>
              <dt>Расчёт</dt>
              <dd className={participatesInDistance ? 'success-text' : 'warning-text'}>
                {participatesInDistance ? 'участвует' : 'не участвует в расчёте'}
              </dd>
            </div>
            <div>
              <dt>Источник</dt>
              <dd>{GPS_SOURCE_LABELS[photo.gpsSource] || photo.gpsSource}</dd>
            </div>
            <div>
              <dt>OCR</dt>
              <dd>{photo.gpsStatusText}</dd>
            </div>
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
              <dt>Ссылка</dt>
              <dd>
                {photo.uploadedUrl ? (
                  <a href={photo.uploadedUrl} target="_blank" rel="noreferrer">{photo.uploadedUrl}</a>
                ) : 'нет'}
              </dd>
            </div>
          </dl>

          <div className="coordinate-editor">
            <label className="field">
              Latitude
              <input
                type="number"
                step="0.000001"
                min="-90"
                max="90"
                value={photo.latitude ?? ''}
                onChange={(event) => onCoordinateChange(photo.id, 'latitude', event.target.value)}
              />
            </label>
            <label className="field">
              Longitude
              <input
                type="number"
                step="0.000001"
                min="-180"
                max="180"
                value={photo.longitude ?? ''}
                onChange={(event) => onCoordinateChange(photo.id, 'longitude', event.target.value)}
              />
            </label>
          </div>

          <label className="field description-field">
            Описание
            <textarea
              value={photo.description || ''}
              onChange={(event) => onDescriptionChange(photo.id, event.target.value)}
              rows={4}
            />
          </label>

          {gpsWarnings.length > 0 && (
            <p className="warning small">GPS: {gpsWarnings.map(formatWarning).join('; ')}</p>
          )}
          {distanceWarnings.length > 0 && (
            <p className="error small">Дистанции: {distanceWarnings.join('; ')}</p>
          )}
          {cleanWarnings.length > 0 && (
            <p className="warning small">Очистка: {cleanWarnings.join('; ')}</p>
          )}
          {photo.uploadError && <p className="error small">{photo.uploadError}</p>}

          <div className="details">
            <h4>Точка</h4>
            <p>Индекс/номер: {photo.displayIndex || photo.indexFromOcr || photo.number}</p>
            <p>Координаты: {coordinateText}</p>
            <p>Расчёт расстояний: {participatesInDistance ? 'участвует' : 'не участвует'}</p>
            <p>Ссылка на фото: {photo.uploadedUrl || 'нет'}</p>
            <p>Описание: {photo.description || 'нет'}</p>
            <p>
              Конфликты: {conflictLabels.length > 0
                ? conflictLabels.join(', ')
                : 'нет'}
            </p>
          </div>

          <details className="debug-block">
            <summary>Raw OCR text</summary>
            <pre>{photo.rawOcrText || 'нет текста'}</pre>
            {photo.normalizedOcrText && <pre>{photo.normalizedOcrText}</pre>}
            {photo.ocrChosenCandidate && (
              <pre>{JSON.stringify({ chosenCandidate: photo.ocrChosenCandidate }, null, 2)}</pre>
            )}
            {debugCandidates.length > 0 && (
              <pre>{JSON.stringify({ candidates: debugCandidates }, null, 2)}</pre>
            )}
          </details>

          {debugMode && (
            <details className="debug-block" open>
              <summary>OCR debug</summary>
              {photo.ocrCropPreview && (
                <div className="ocr-debug-images">
                  <figure>
                    <figcaption>Crop</figcaption>
                    <img src={photo.ocrCropPreview} alt="OCR crop" />
                  </figure>
                  {photo.ocrProcessedPreview && (
                    <figure>
                      <figcaption>Processed</figcaption>
                      <img src={photo.ocrProcessedPreview} alt="OCR processed crop" />
                    </figure>
                  )}
                </div>
              )}
              {debugAttempts.length > 0 && (
                <ol className="ocr-attempts">
                  {debugAttempts.map((attempt) => (
                    <li key={attempt.name}>
                      <strong>{attempt.name}</strong>
                      {' '}
                      {attempt.ok ? 'ok' : 'rejected'}
                      {' '}
                      parser={Number(attempt.parserConfidence || 0).toFixed(2)}
                      {' '}
                      ocr={Number(attempt.ocrConfidence || 0).toFixed(2)}
                      {attempt.warnings?.length > 0 && (
                        <span> warnings: {attempt.warnings.map(formatWarning).join('; ')}</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </details>
          )}
        </div>
      )}
    </article>
  );
}
