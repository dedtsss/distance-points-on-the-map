import { useEffect, useState } from 'react';
import PhotoViewerModal from './PhotoViewerModal.jsx';
import StatusChip from './StatusChip.jsx';
import { formatCoordinates, formatFileSize } from '../utils/format.js';

const isReserve = (photo) => String(photo?.workStatus || photo?.disposition || '').toLowerCase() === 'reserve';

export default function PhotoDossier({ open, photo, context = 'recognition', isBusy = false, onClose, onApplyIndex, onApplyCoordinates, onSwapCoordinates, onToggleReserve }) {
  const [indexValue, setIndexValue] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [error, setError] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);
  useEffect(() => {
    setIndexValue(photo?.indexFromOcr || '');
    setLatitude(photo?.coordinates?.latitude ?? '');
    setLongitude(photo?.coordinates?.longitude ?? '');
    setError('');
  }, [photo?.id, photo?.indexFromOcr, photo?.coordinates?.latitude, photo?.coordinates?.longitude]);
  useEffect(() => { if (!open) setViewerOpen(false); }, [open]);
  if (!open || !photo) return null;
  const reserve = isReserve(photo);
  const links = photo.uploadResult?.links || [];
  const submitIndex = (event) => { event.preventDefault(); const ok = onApplyIndex?.(photo.id, indexValue) !== false; setError(ok ? '' : 'Проверьте индекс.'); };
  const submitCoordinates = (event) => { event.preventDefault(); const ok = onApplyCoordinates?.(photo.id, latitude, longitude) !== false; setError(ok ? '' : 'Проверьте latitude и longitude.'); };
  return <>
    <button type="button" className="photo-dossier-backdrop" aria-label="Закрыть досье" onClick={onClose} />
    <aside className="photo-dossier" role="dialog" aria-modal="true" aria-label={`Досье фото ${photo.number || ''}`}>
      <header className="photo-dossier-header"><div><p className="page-eyebrow">Досье · {context === 'map' ? 'Карта и точки' : context === 'upload' ? 'Очистка и загрузка' : 'Распознавание'}</p><h2>Фото {photo.number || '—'}</h2><span>{photo.displayFileName || photo.internalName || photo.fileName}</span></div><button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть досье">×</button></header>
      <button type="button" className="photo-dossier-preview" onClick={() => setViewerOpen(true)} disabled={!photo.thumbnailDataUrl && !photo.stableFile && !photo.stableBlob}>{photo.thumbnailDataUrl ? <img src={photo.thumbnailDataUrl} alt={`Превью ${photo.fileName || ''}`} /> : <span>Превью недоступно</span>}<small>Открыть фото крупно</small></button>
      <div className="photo-dossier-statuses"><StatusChip tone={reserve ? 'warning' : 'success'}>{reserve ? 'RESERVE' : 'ACTIVE'}</StatusChip><StatusChip tone={photo.userError ? 'error' : ['low_precision', 'suspicious'].includes(photo.coordinateQuality) ? 'warning' : 'neutral'}>{photo.statusText || photo.status || 'выбрано'}</StatusChip></div>
      <dl className="photo-dossier-fields">
        <div><dt>Исходный файл</dt><dd>{photo.fileName || '—'}</dd></div><div><dt>Внутреннее имя</dt><dd>{photo.displayFileName || photo.internalName || '—'}</dd></div><div><dt>Размер</dt><dd>{formatFileSize(photo.size)}</dd></div><div><dt>Индекс</dt><dd>{photo.indexFromOcr || 'не найден'}</dd></div><div><dt>Координаты</dt><dd>{formatCoordinates(photo.coordinates)}</dd></div><div><dt>Источник</dt><dd>{photo.gpsSource || photo.ocrStatus || '—'}</dd></div><div><dt>Качество</dt><dd>{photo.coordinateQuality || 'missing'}</dd></div><div><dt>Конфликты</dt><dd>{photo.distanceConflicts?.length ? photo.distanceConflicts.join('; ') : 'нет'}</dd></div><div><dt>Cleanup</dt><dd>{photo.cleanupStatus || 'idle'}</dd></div><div><dt>Upload</dt><dd>{photo.uploadStatus || 'idle'}</dd></div><div><dt>Provider</dt><dd>{photo.uploadResult?.provider || photo.uploadResult?.primaryProvider || '—'}</dd></div>
      </dl>
      {context === 'recognition' && <div className="photo-dossier-editors"><form onSubmit={submitIndex}><label>Индекс<input value={indexValue} onChange={(event) => setIndexValue(event.target.value)} disabled={isBusy} /></label><button type="submit" className="button-secondary" disabled={isBusy}>Сохранить индекс</button></form><form onSubmit={submitCoordinates}><label>Latitude<input inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} disabled={isBusy} /></label><label>Longitude<input inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} disabled={isBusy} /></label><button type="submit" className="button-secondary" disabled={isBusy}>Сохранить координаты</button><button type="button" className="button-secondary" onClick={() => onSwapCoordinates?.(photo.id)} disabled={isBusy || !photo.coordinates}>Поменять lat/lon</button></form></div>}
      {context === 'map' && onToggleReserve && <button type="button" className="button-secondary" onClick={() => onToggleReserve(photo.id, !reserve)} disabled={isBusy}>{reserve ? 'Вернуть в ACTIVE' : 'В RESERVE'}</button>}
      {links.length > 0 && <section className="photo-dossier-links"><h3>Ссылки</h3>{links.map((link) => <a key={link.url || link} href={link.url || link} target="_blank" rel="noreferrer">{link.provider ? `${link.provider}: ` : ''}{link.url || link}</a>)}</section>}
      {photo.userError && <p className="card-error">{photo.userError}</p>}{error && <p className="coordinate-error">{error}</p>}
    </aside>
    <PhotoViewerModal open={viewerOpen} photo={photo} onClose={() => setViewerOpen(false)} />
  </>;
}
