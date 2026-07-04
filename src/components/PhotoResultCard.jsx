import { photoLinksInRequestedOrder } from '../features/links/linkFormatter.js';
import { formatCoordinates } from '../utils/format';

const distanceText = (photo) => {
  if (!photo.coordinates) return 'не участвует';
  if (photo.distanceStatus === 'too_close') return photo.distanceConflicts.join('; ');
  if (photo.distanceStatus === 'ok') return 'ОК';
  return 'ожидает расчёта';
};

const copyText = (value) => navigator.clipboard.writeText(value);

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

export default function PhotoResultCard({ photo, debugMode, providerSettings }) {
  const result = photo.uploadResult;
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

  return (
    <article className={`photo-result ${photo.status === 'failed' ? 'photo-result-error' : ''}`}>
      <header className="photo-result-header">
        <div className="photo-heading">
          {photo.thumbnailDataUrl
            ? <img className="photo-thumbnail" src={photo.thumbnailDataUrl} alt={`Превью ${photo.fileName}`} />
            : <div className="photo-thumbnail-placeholder">Без превью</div>}
          <div>
            <p className="photo-number">Фото {photo.number}</p>
            <h3>{photo.fileName}</h3>
          </div>
        </div>
        <span className={`status-label status-${photo.status}`}>{photo.statusText}</span>
      </header>

      <dl className="result-fields">
        <div><dt>Координаты</dt><dd>{formatCoordinates(photo.coordinates)}</dd></div>
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

      {photo.userError && <p className="card-error">{photo.userError}</p>}
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
          <details className="debug-details">
            <summary>Подробнее</summary>
            <pre>{JSON.stringify(photo.debug, null, 2)}</pre>
          </details>
        )}
      </div>
    </article>
  );
}
