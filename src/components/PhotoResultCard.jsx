import { useEffect, useState } from 'react';
import { photoLinksInRequestedOrder } from '../features/links/linkFormatter.js';
import { indexDisplayText } from '../features/points/pointIdentity.js';
import { formatCoordinates } from '../utils/format';
import StatusChip from './StatusChip.jsx';

const distanceText = (photo) => {
  if (photo.coordinateQuality === 'low_precision' || photo.distanceStatus === 'low_precision') return 'нужна ручная проверка';
  if (photo.coordinateQuality === 'suspicious') return 'Координаты подозрительные — нужна проверка';
  if (!photo.coordinates) return 'не участвует';
  if (photo.distanceStatus === 'too_close') return photo.distanceConflicts.join('; ');
  if (photo.distanceStatus === 'ok') return 'ОК';
  return 'ожидает расчёта';
};

const copyText = (value) => navigator.clipboard.writeText(value);

const coordinateQualityText = (photo) => {
  if (photo.coordinateQuality === 'low_precision') return 'Координаты найдены, но точность низкая — проверь вручную';
  if (photo.coordinateQuality === 'suspicious') return 'Координаты подозрительные — нужна проверка';
  if (photo.manualCoordinates || photo.gpsSource === 'manual') return 'Координаты заданы вручную';
  if (photo.gpsSource === 'exif') return 'Координаты найдены в EXIF';
  if (photo.ocrStatus === 'confident') return 'Координаты найдены уверенно';
  if (photo.ocrStatus === 'uncertain' && photo.coordinates) return 'Координаты найдены, но OCR не уверен';
  if (photo.ocrStatus === 'suspect' || photo.ocrStatus === 'error') return 'OCR дал подозрительный результат';
  return 'Координаты не найдены';
};

const indexStatusText = (photo) => {
  return indexDisplayText(photo);
};

const lowPrecisionHint = (photo) => {
  if (photo.coordinateQuality !== 'low_precision' || !photo.coordinates) return '';
  const latitudeDecimals = photo.coordinatePrecision?.latitude;
  const longitudeDecimals = photo.coordinatePrecision?.longitude;
  if (Number.isInteger(longitudeDecimals) && longitudeDecimals <= 2) {
    const value = photo.coordinateText?.longitude || String(photo.coordinates.longitude);
    return `Возможно, хвостовые нули скрыты: ${value} = ${Number(photo.coordinates.longitude).toFixed(5)}`;
  }
  if (Number.isInteger(latitudeDecimals) && latitudeDecimals <= 2) {
    const value = photo.coordinateText?.latitude || String(photo.coordinates.latitude);
    return `Возможно, хвостовые нули скрыты: ${value} = ${Number(photo.coordinates.latitude).toFixed(5)}`;
  }
  return '';
};

function LinkBlock({ label, url }) {
  if (!url) return null;
  return (
    <div className="full-link-block">
      <strong>{label}</strong>
      <code>{url}</code>
      <button type="button" className="button-secondary compact-button" onClick={() => copyText(url)}>Копировать</button>
    </div>
  );
}

const isOverlayAttempt = (attempt) => (
  attempt?.overlayDetected !== null
  && attempt?.overlayDetected !== undefined
) || String(attempt?.cropName || '').includes('overlay');

const boundsText = (attempt) => {
  const bounds = attempt?.cropBounds || attempt?.overlayDetection?.bounds;
  if (!bounds) return 'нет';
  return `x: ${bounds.x}, y: ${bounds.y}, width: ${bounds.width}, height: ${bounds.height}`;
};

const overlayStatusText = (attempt) => {
  if (attempt?.overlayDetected === true) return 'найден';
  if (attempt?.overlayDetected === false) return 'не найден';
  return 'не проверялся (статический crop)';
};

const debugWithoutPreviews = (debug) => JSON.stringify(debug, (key, value) => (
  key === 'cropPreview' || key === 'processedPreview'
    ? (value ? '[превью показано выше]' : '')
    : value
), 2);

function OverlayOcrDebug({ attempts }) {
  const overlayAttempts = (attempts || []).filter(isOverlayAttempt);
  return (
    <details className="debug-details overlay-debug-details">
      <summary>Overlay OCR debug ({overlayAttempts.length})</summary>
      {overlayAttempts.length === 0 && <p className="debug-empty">Overlay-попытки отсутствуют.</p>}
      <div className="overlay-debug-attempts">
        {overlayAttempts.map((attempt, index) => (
          <section className="overlay-debug-attempt" key={`${attempt.name || 'overlay'}-${index}`}>
            <h4>{attempt.name || `Overlay попытка ${index + 1}`}</h4>
            <dl className="overlay-debug-fields">
              <div><dt>Detector</dt><dd>{attempt.detectorName || attempt.overlayDetection?.detectorName || 'нет'}</dd></div>
              <div><dt>Overlay ROI</dt><dd>{overlayStatusText(attempt)}</dd></div>
              <div><dt>Crop</dt><dd>{boundsText(attempt)}</dd></div>
              <div><dt>Preprocessing</dt><dd>{attempt.preprocessingMethod || 'нет'}</dd></div>
              <div><dt>PSM</dt><dd>{attempt.pageSegMode || 'нет'}</dd></div>
            </dl>
            <div className="overlay-debug-previews">
              <figure>
                <figcaption>Исходный crop</figcaption>
                {attempt.cropPreview
                  ? <img src={attempt.cropPreview} alt={`Исходный overlay crop: ${attempt.name}`} />
                  : <span>Превью нет</span>}
              </figure>
              <figure>
                <figcaption>Processed crop</figcaption>
                {attempt.processedPreview
                  ? <img src={attempt.processedPreview} alt={`Processed overlay crop: ${attempt.name}`} />
                  : <span>Превью нет</span>}
              </figure>
            </div>
            <div className="overlay-debug-text">
              <strong>Raw OCR text</strong>
              <pre>{attempt.rawText || '[пусто]'}</pre>
              <strong>Normalized OCR text</strong>
              <pre>{attempt.normalizedText || '[пусто]'}</pre>
              <strong>Parser candidates</strong>
              <pre>{JSON.stringify(attempt.parsed?.candidates || [], null, 2)}</pre>
              <strong>Rejection reason</strong>
              <pre>{attempt.rejectionReason || 'нет — попытка принята'}</pre>
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}

export default function PhotoResultCard({
  photo,
  debugMode,
  providerSettings,
  onApplyCoordinates,
  onApplyIndex,
  onSwapCoordinates,
  editingDisabled,
}) {
  const [latitude, setLatitude] = useState(photo.coordinates?.latitude ?? '');
  const [longitude, setLongitude] = useState(photo.coordinates?.longitude ?? '');
  const [indexValue, setIndexValue] = useState(photo.indexFromOcr || '');
  const [coordinateError, setCoordinateError] = useState('');
  const [indexError, setIndexError] = useState('');
  const [editorOpen, setEditorOpen] = useState(['suspicious', 'low_precision'].includes(photo.coordinateQuality));
  const [indexEditorOpen, setIndexEditorOpen] = useState(photo.indexStatus === 'uncertain');
  const result = photo.uploadResult;
  const needsLowPrecisionConfirmation = photo.coordinateQuality === 'low_precision';
  const coordinateHint = lowPrecisionHint(photo);
  const fallbackReplaces = result?.links?.find((link) => link.provider === 'x0')?.replaces || [];
  const requestedProviders = result?.requestedProviders || [
    ...(providerSettings?.freeimage !== false ? ['freeimage'] : []),
    ...(providerSettings?.ninjabox !== false ? ['ninjabox'] : []),
  ];
  const copyPhotoLinks = () => {
    const providerLinks = photoLinksInRequestedOrder(photo, providerSettings);
    const values = [...providerLinks, result?.ninjaboxGalleryUrl].filter(Boolean);
    return copyText([...new Set(values)].join('\n'));
  };

  useEffect(() => {
    setLatitude(photo.coordinates?.latitude ?? '');
    setLongitude(photo.coordinates?.longitude ?? '');
  }, [photo.coordinates?.latitude, photo.coordinates?.longitude]);

  useEffect(() => {
    setIndexValue(photo.indexFromOcr || '');
  }, [photo.indexFromOcr]);

  useEffect(() => {
    if (['suspicious', 'low_precision'].includes(photo.coordinateQuality)) setEditorOpen(true);
  }, [photo.coordinateQuality]);

  useEffect(() => {
    if (photo.indexStatus === 'uncertain') setIndexEditorOpen(true);
  }, [photo.indexStatus]);

  const applyCoordinates = (event) => {
    event.preventDefault();
    const applied = onApplyCoordinates?.(photo.id, latitude, longitude);
    setCoordinateError(applied ? '' : 'Введите корректные latitude и longitude.');
  };

  const applyIndex = (event) => {
    event.preventDefault();
    const applied = onApplyIndex?.(photo.id, indexValue) !== false;
    setIndexError(applied ? '' : 'Введите корректный номер индекса.');
  };

  return (
    <article id={`photo-${photo.id}`} className={`photo-result ${photo.status === 'failed' ? 'photo-result-error' : ''}`}>
      <header className="photo-result-header">
        <div className="photo-heading">
          {photo.thumbnailDataUrl
            ? <img className="photo-thumbnail" src={photo.thumbnailDataUrl} alt={`Превью ${photo.fileName}`} />
            : <div className="photo-thumbnail-placeholder">Превью недоступно</div>}
          <div>
            <p className="photo-number">Фото {photo.number}</p>
            <h3>{photo.displayFileName || photo.fileName}</h3>
            <p className="photo-original-name">{photo.fileName}</p>
          </div>
        </div>
        <StatusChip tone={photo.status === 'uploaded' ? 'success' : photo.status === 'failed' ? 'error' : 'neutral'}>{photo.statusText}</StatusChip>
      </header>

      <dl className="result-fields">
        <div>
          <dt>Индекс</dt>
          <dd>
            {indexStatusText(photo)}
            <span className={`coordinate-quality quality-${photo.indexStatus || 'missing'}`}>Внутреннее имя: {photo.displayFileName}</span>
          </dd>
        </div>
        <div>
          <dt>Координаты</dt>
          <dd>
            {formatCoordinates(photo.coordinates, {
              coordinateText: needsLowPrecisionConfirmation ? photo.coordinateText : null,
              coordinatePrecision: needsLowPrecisionConfirmation ? photo.coordinatePrecision : null,
            })}
            <span className={`coordinate-quality quality-${photo.coordinateQuality || photo.ocrStatus || 'missing'}`}>{coordinateQualityText(photo)}</span>
            {coordinateHint && <span className="coordinate-hint">{coordinateHint}</span>}
          </dd>
        </div>
        <div><dt>Расстояние</dt><dd>{distanceText(photo)}</dd></div>
        <div>
          <dt>Загрузка</dt>
          <dd className="provider-statuses">
            {requestedProviders.includes('freeimage') && <span>Freeimage: {result?.freeimageUrl ? 'загружено' : fallbackReplaces.includes('freeimage') ? 'заменён на x0.at' : 'нет ссылки'}</span>}
            {requestedProviders.includes('ninjabox') && <span>Ninjabox: {result?.ninjaboxUrl ? 'загружено' : fallbackReplaces.includes('ninjabox') ? 'заменён на x0.at' : 'нет ссылки'}</span>}
            {(result?.includeX0 || providerSettings?.includeX0) && <span>x0.at: {result?.x0Url ? 'загружено' : 'нет ссылки'}</span>}
          </dd>
        </div>
      </dl>

      <button type="button" className="button-secondary coordinate-edit-toggle" onClick={() => setIndexEditorOpen((value) => !value)}>
        {indexEditorOpen ? 'Скрыть редактор индекса' : photo.indexFromOcr ? 'Исправить индекс' : 'Ввести индекс'}
      </button>
      {indexEditorOpen && <form className="coordinate-editor" onSubmit={applyIndex}>
        <div className="coordinate-inputs index-inputs">
          <label>
            Номер индекса
            <input
              type="text"
              inputMode="numeric"
              value={indexValue}
              onChange={(event) => setIndexValue(event.target.value)}
              disabled={editingDisabled}
              aria-label={`Индекс фото ${photo.number}`}
            />
          </label>
        </div>
        <button type="submit" className="button-secondary" disabled={editingDisabled}>Сохранить индекс</button>
        {indexError && <p className="coordinate-error">{indexError}</p>}
      </form>}

      <button type="button" className="button-secondary coordinate-edit-toggle" onClick={() => setEditorOpen((value) => !value)}>
        {editorOpen ? 'Скрыть редактор координат' : needsLowPrecisionConfirmation ? 'Подтвердить координаты' : 'Исправить координаты'}
      </button>
      {editorOpen && <form className="coordinate-editor" onSubmit={applyCoordinates}>
        <div className="coordinate-inputs">
          <label>
            Latitude
            <input
              type="text"
              inputMode="decimal"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              disabled={editingDisabled}
              aria-label={`Latitude фото ${photo.number}`}
            />
          </label>
          <label>
            Longitude
            <input
              type="text"
              inputMode="decimal"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              disabled={editingDisabled}
              aria-label={`Longitude фото ${photo.number}`}
            />
          </label>
        </div>
        <button type="submit" className="button-secondary" disabled={editingDisabled}>{needsLowPrecisionConfirmation ? 'Подтвердить координаты' : 'Применить координаты'}</button>
        {(photo.swapSuggested || photo.coordinates) && (
          <button type="button" className="button-secondary" disabled={editingDisabled} onClick={() => onSwapCoordinates?.(photo.id)}>
            Поменять местами lat/lon
          </button>
        )}
        {coordinateError && <p className="coordinate-error">{coordinateError}</p>}
      </form>}

      {photo.userError && <p className="card-error">{photo.userError}</p>}
      {photo.userWarnings?.map((warning) => <p className="card-warning" key={warning}>{warning}</p>)}
      {result?.uploadWarnings?.map((warning) => <p className="card-warning" key={warning}>{warning}</p>)}

      {result?.links?.length > 0 && (
        <div className="full-links-list">
          <LinkBlock label="Freeimage" url={result.freeimageUrl} />
          <LinkBlock label="Ninjabox" url={result.ninjaboxUrl} />
          <LinkBlock label="Ninjabox gallery" url={result.ninjaboxGalleryUrl} />
          <LinkBlock label="x0.at" url={result.x0Url || result.fallbackUrl} />
        </div>
      )}

      <div className="card-actions">
        <button type="button" className="button-secondary" onClick={copyPhotoLinks} disabled={!result?.links?.length}>
          Скопировать ссылки фото
        </button>
        {debugMode && (
          <>
            <OverlayOcrDebug attempts={photo.debug?.gps?.ocr?.attempts} />
            <details className="debug-details">
              <summary>Полный debug</summary>
              <pre>{debugWithoutPreviews(photo.debug)}</pre>
            </details>
          </>
        )}
      </div>
    </article>
  );
}
