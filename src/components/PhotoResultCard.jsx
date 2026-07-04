import { formatCoordinates } from '../utils/format';

const distanceText = (photo) => {
  if (!photo.coordinates) return 'не участвует';
  if (photo.distanceStatus === 'too_close') return photo.distanceConflicts.join('; ');
  if (photo.distanceStatus === 'ok') return 'ОК';
  return 'ожидает расчёта';
};

const copyLinks = async (photo) => {
  const links = photo.uploadResult?.links?.map((link) => link.url).filter(Boolean) || [];
  if (links.length > 0) await navigator.clipboard.writeText(links.join('\n'));
};

export default function PhotoResultCard({ photo, debugMode }) {
  const result = photo.uploadResult;
  const fallbackReplaces = result?.links
    ?.find((link) => link.provider === 'x0')
    ?.replaces || [];

  return (
    <article className={`photo-result ${photo.status === 'failed' ? 'photo-result-error' : ''}`}>
      <header className="photo-result-header">
        <div>
          <p className="photo-number">Фото {photo.number}</p>
          <h3>{photo.fileName}</h3>
        </div>
        <span className={`status-label status-${photo.status}`}>{photo.statusText}</span>
      </header>

      <dl className="result-fields">
        <div>
          <dt>Координаты</dt>
          <dd>{formatCoordinates(photo.coordinates)}</dd>
        </div>
        <div>
          <dt>Расстояние</dt>
          <dd>{distanceText(photo)}</dd>
        </div>
        <div>
          <dt>Загрузка</dt>
          <dd className="provider-statuses">
            <span>Freeimage: {result?.freeimageUrl ? 'загружено' : fallbackReplaces.includes('freeimage') ? 'заменён на x0.at' : 'нет ссылки'}</span>
            <span>Ninjabox: {result?.ninjaboxUrl ? 'загружено' : fallbackReplaces.includes('ninjabox') ? 'заменён на x0.at' : 'нет ссылки'}</span>
          </dd>
        </div>
      </dl>

      {photo.userError && <p className="card-error">{photo.userError}</p>}
      {result?.uploadWarnings?.map((warning) => (
        <p className="card-warning" key={warning}>{warning}</p>
      ))}

      {result?.links?.length > 0 && (
        <div className="card-links">
          {result.freeimageUrl && <a href={result.freeimageUrl} target="_blank" rel="noreferrer">Freeimage</a>}
          {result.ninjaboxUrl && <a href={result.ninjaboxUrl} target="_blank" rel="noreferrer">Ninjabox</a>}
          {result.fallbackUrl && <a href={result.fallbackUrl} target="_blank" rel="noreferrer">x0.at</a>}
          {result.ninjaboxGalleryUrl && <a href={result.ninjaboxGalleryUrl} target="_blank" rel="noreferrer">Галерея</a>}
        </div>
      )}

      <div className="card-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => copyLinks(photo)}
          disabled={!result?.links?.length}
        >
          Скопировать ссылки
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
