import EmptyState from './EmptyState.jsx';
import Icon from './Icon.jsx';
import PageHeader from './PageHeader.jsx';
import StatusChip from './StatusChip.jsx';

const pointCoordinates = (photo) => photo?.coordinates
  ? `${photo.coordinates.latitude}, ${photo.coordinates.longitude}`
  : 'координаты не найдены';

export default function ReserveScreen({ reserveItems, onActivate, onOpenSession, onOpenMap }) {
  return (
    <>
      <PageHeader
        eyebrow="Резерв"
        title="Логически исключённые точки"
        actions={<StatusChip tone={reserveItems.length ? 'warning' : 'success'}>{reserveItems.length} RESERVE</StatusChip>}
      >
        RESERVE не удаляет фото, ссылки или координаты: эти точки исключены только из ACTIVE-карты, результата и TXT-экспорта.
      </PageHeader>
      {reserveItems.length === 0 ? (
        <EmptyState title="Резерв пока пуст" icon="check">
          Когда точка переведена в RESERVE вручную или по рекомендации конфликтов, она появится здесь.
        </EmptyState>
      ) : (
        <section className="reserve-grid" aria-label="Резервные точки">
          {reserveItems.map(({ sessionId, sessionNumber, sessionTitle, photo }) => {
            const primaryLink = photo.uploadResult?.links?.[0]?.url || '';
            return (
              <article className="reserve-card" key={`${sessionId}-${photo.id || photo.photoId}`}>
                {photo.thumbnailDataUrl ? <img src={photo.thumbnailDataUrl} alt="Локальная миниатюра" /> : <div className="reserve-thumb"><Icon name="image" /></div>}
                <div className="reserve-card-content">
                  <div className="reserve-card-heading">
                    <div>
                      <p className="page-eyebrow">Сессия №{String(sessionNumber || 0).padStart(4, '0')}</p>
                      <h3>{photo.pointLabel || photo.indexFromOcr || `Фото ${photo.number}`}</h3>
                    </div>
                    <StatusChip tone="warning">RESERVE</StatusChip>
                  </div>
                  <p>{sessionTitle}</p>
                  <dl>
                    <div><dt>Координаты</dt><dd>{pointCoordinates(photo)}</dd></div>
                    <div><dt>Причина</dt><dd>{photo.reserveReason || 'Не указана'}</dd></div>
                  </dl>
                  <div className="reserve-card-actions">
                    <button type="button" onClick={() => onActivate?.(sessionId, photo.id || photo.photoId)}><Icon name="check" size={17} /> Вернуть в ACTIVE</button>
                    <button type="button" className="button-secondary" onClick={() => onOpenSession?.(sessionId)}>Открыть сессию</button>
                    <button type="button" className="button-secondary" onClick={() => onOpenMap?.(sessionId, photo.id || photo.photoId)}>Карта</button>
                    {primaryLink && <a className="button-link" href={primaryLink} target="_blank" rel="noreferrer">Фото</a>}
                    <button type="button" className="button-secondary" disabled title="Граница переноса подготовлена в домене; внешний UX будет добавлен отдельным потоком.">Перенести — скоро</button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
