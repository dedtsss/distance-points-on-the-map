import { useEffect, useState } from 'react';
import { PHOTO_PROGRESS_EVENT } from '../features/ui/mobileProcessingProgress.js';
import { indexDisplayText } from '../features/points/pointIdentity.js';
import { formatCoordinates, formatFileSize } from '../utils/format.js';
import Icon from './Icon.jsx';
import PhotoViewerModal from './PhotoViewerModal.jsx';
import StatusChip from './StatusChip.jsx';

const qualityTone = (quality) => {
  if (['confident', 'manual'].includes(quality)) return 'success';
  if (['low_precision', 'suspicious'].includes(quality)) return 'warning';
  if (quality === 'missing') return 'neutral';
  return 'neutral';
};

const statusTone = (photo) => {
  if (photo.status === 'failed' || photo.uploadStatus === 'failed') return 'error';
  if (photo.uploadStatus === 'done' || photo.status === 'uploaded') return 'success';
  if (photo.coordinateQuality === 'low_precision' || photo.coordinateQuality === 'suspicious') return 'warning';
  return 'neutral';
};

const coordinateLabel = (photo) => {
  if (photo.coordinateQuality === 'low_precision') return 'низкая точность';
  if (photo.coordinateQuality === 'suspicious') return 'требуется проверка';
  if (photo.manualCoordinates) return 'вручную';
  if (photo.coordinates) return 'найдены';
  return 'нет координат';
};

export default function PhotoCard({
  photo,
  compact = false,
  editingDisabled,
  onRemove,
  onApplyCoordinates,
  onApplyIndex,
  onSwapCoordinates,
  onOpenOnMap,
}) {
  const [detailsOpen, setDetailsOpen] = useState(['low_precision', 'suspicious'].includes(photo.coordinateQuality));
  const [viewerOpen, setViewerOpen] = useState(false);
  const [latitude, setLatitude] = useState(photo.coordinates?.latitude ?? '');
  const [longitude, setLongitude] = useState(photo.coordinates?.longitude ?? '');
  const [indexValue, setIndexValue] = useState(photo.indexFromOcr || '');
  const [coordinateError, setCoordinateError] = useState('');
  const [indexError, setIndexError] = useState('');
  const viewerAvailable = Boolean(photo.stableFile || photo.stableBlob || photo.thumbnailDataUrl);

  useEffect(() => {
    setLatitude(photo.coordinates?.latitude ?? '');
    setLongitude(photo.coordinates?.longitude ?? '');
  }, [photo.coordinates?.latitude, photo.coordinates?.longitude]);

  useEffect(() => setIndexValue(photo.indexFromOcr || ''), [photo.indexFromOcr]);

  useEffect(() => {
    if (['low_precision', 'suspicious'].includes(photo.coordinateQuality)) setDetailsOpen(true);
  }, [photo.coordinateQuality]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
    window.dispatchEvent(new CustomEvent(PHOTO_PROGRESS_EVENT, {
      detail: {
        id: photo.id,
        number: photo.number,
        status: photo.status,
        statusText: photo.statusText || '',
        gpsStatus: photo.gpsStatus || '',
        cleanupStatus: photo.cleanupStatus || '',
        uploadStatus: photo.uploadStatus || '',
      },
    }));
  }, [
    photo.id,
    photo.number,
    photo.status,
    photo.statusText,
    photo.gpsStatus,
    photo.cleanupStatus,
    photo.uploadStatus,
  ]);

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
    <>
      <article
        id={`photo-${photo.id}`}
        className={`photo-card${compact ? ' photo-card-compact' : ''}`}
        data-photo-progress="true"
        data-photo-id={photo.id}
        data-photo-number={photo.number}
        data-photo-status={photo.status || ''}
        data-photo-status-text={photo.statusText || ''}
        data-photo-gps-status={photo.gpsStatus || ''}
        data-photo-cleanup-status={photo.cleanupStatus || ''}
        data-photo-upload-status={photo.uploadStatus || ''}
      >
        <div className="photo-card-preview">
          <button
            type="button"
            className="photo-preview-button"
            onClick={() => setViewerOpen(true)}
            disabled={!viewerAvailable}
            aria-label={`Открыть фотографию ${photo.number} в просмотрщике`}
          >
            {photo.thumbnailDataUrl
              ? <img src={photo.thumbnailDataUrl} alt={`Превью ${photo.fileName}`} />
              : <div className="photo-card-placeholder"><Icon name="image" size={24} /><span>Превью нет</span></div>}
            {viewerAvailable && (
              <span className="photo-preview-hint">
                <Icon name="search" size={14} />
                Открыть
              </span>
            )}
          </button>
        </div>
        <div className="photo-card-body">
          <header className="photo-card-header">
            <div>
              <p>Фото {photo.number}</p>
              <h3>{photo.displayFileName || photo.internalName || photo.fileName}</h3>
              <span>{photo.fileName}</span>
            </div>
            <StatusChip tone={statusTone(photo)}>{photo.statusText || photo.status || 'выбрано'}</StatusChip>
          </header>

          <dl className="photo-card-fields">
            <div><dt>Размер</dt><dd>{formatFileSize(photo.size)}</dd></div>
            <div><dt>Внутреннее имя</dt><dd>{photo.displayFileName || photo.internalName || 'ожидает индекса'}</dd></div>
            {photo.relativePath && <div><dt>Путь</dt><dd>{photo.relativePath}</dd></div>}
            <div><dt>Индекс</dt><dd>{indexDisplayText(photo)}</dd></div>
            <div><dt>Координаты</dt><dd>{formatCoordinates(photo.coordinates, {
              coordinateText: photo.coordinateQuality === 'low_precision' ? photo.coordinateText : null,
              coordinatePrecision: photo.coordinateQuality === 'low_precision' ? photo.coordinatePrecision : null,
            })}</dd></div>
            <div><dt>Точность</dt><dd><StatusChip tone={qualityTone(photo.coordinateQuality)}>{coordinateLabel(photo)}</StatusChip></dd></div>
            <div><dt>Загрузка</dt><dd>{photo.uploadStatus || 'не запускалась'}</dd></div>
          </dl>

          {photo.userError && <p className="card-error">{photo.userError}</p>}
          {photo.distanceStatus === 'too_close' && (
            <p className="card-warning">Конфликт расстояния: {photo.distanceConflicts?.join('; ')}</p>
          )}

          <div className="photo-card-actions">
            <button type="button" className="button-secondary compact-button" onClick={() => setDetailsOpen((value) => !value)}>
              <Icon name={detailsOpen ? 'chevronDown' : 'chevronRight'} size={16} />
              {detailsOpen ? 'Скрыть детали' : 'Детали'}
            </button>
            <button type="button" className="button-secondary compact-button" onClick={() => onOpenOnMap?.(photo.id)} disabled={!photo.coordinates}>
              <Icon name="map" size={16} />
              На карте
            </button>
            <button type="button" className="button-secondary compact-button danger-ghost-button" onClick={() => onRemove?.(photo.id)} disabled={editingDisabled}>
              <Icon name="trash" size={16} />
              Удалить
            </button>
          </div>

          {detailsOpen && (
            <div className="photo-card-details">
              <form className="inline-editor" onSubmit={applyIndex}>
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
                <button type="submit" className="button-secondary compact-button" disabled={editingDisabled}>Сохранить индекс</button>
                {indexError && <p className="coordinate-error">{indexError}</p>}
              </form>

              <form className="inline-editor coordinate-inline-editor" onSubmit={applyCoordinates}>
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
                <button type="submit" className="button-secondary compact-button" disabled={editingDisabled}>
                  {photo.coordinateQuality === 'low_precision' ? 'Подтвердить координаты' : 'Сохранить координаты'}
                </button>
                {(photo.swapSuggested || photo.coordinates) && (
                  <button type="button" className="button-secondary compact-button" disabled={editingDisabled} onClick={() => onSwapCoordinates?.(photo.id)}>
                    Поменять lat/lon
                  </button>
                )}
                {coordinateError && <p className="coordinate-error">{coordinateError}</p>}
              </form>
            </div>
          )}
        </div>
      </article>
      <PhotoViewerModal open={viewerOpen} photo={photo} onClose={() => setViewerOpen(false)} />
    </>
  );
}
