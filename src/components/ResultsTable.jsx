import { useEffect, useState } from 'react';
import { photoLinksInRequestedOrder } from '../features/links/linkFormatter.js';
import { indexDisplayText } from '../features/points/pointIdentity.js';
import { formatCoordinates } from '../utils/format.js';
import { statusLabel, statusTone } from '../utils/statusLabels.js';
import StatusChip from './StatusChip.jsx';

const distanceText = (photo) => {
  if (photo.coordinateQuality === 'low_precision' || photo.distanceStatus === 'low_precision') return 'low_precision';
  if (photo.coordinateQuality === 'suspicious') return 'suspicious';
  if (!photo.coordinates) return 'missing_coordinates';
  return photo.distanceStatus || 'pending';
};

function InlineIndexEditor({ photo, onApplyIndex }) {
  const [value, setValue] = useState(photo.indexFromOcr || '');
  useEffect(() => setValue(photo.indexFromOcr || ''), [photo.indexFromOcr]);
  return (
    <form className="table-index-editor" onSubmit={(event) => {
      event.preventDefault();
      onApplyIndex?.(photo.id, value);
    }}>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={`Индекс фото ${photo.number}`}
      />
      <button type="submit" className="compact-button button-secondary">OK</button>
    </form>
  );
}

export default function ResultsTable({
  photos,
  providerSettings,
  onApplyIndex,
  onOpenOnMap,
  onOpenPhoto,
}) {
  if (photos.length === 0) return null;

  const copyLinks = (photo) => {
    const links = photoLinksInRequestedOrder(photo, providerSettings);
    const values = [...links, photo.uploadResult?.ninjaboxGalleryUrl].filter(Boolean);
    return navigator.clipboard.writeText([...new Set(values)].join('\n'));
  };

  return (
    <section className="results-table-section">
      <div className="results-table-wrap">
        <table>
          <thead>
            <tr>
              <th>№ фото</th>
              <th>Файл</th>
              <th>Внутреннее имя</th>
              <th>Индекс</th>
              <th>Координаты</th>
              <th>Качество</th>
              <th>Статус расстояния</th>
              <th>Статус загрузки</th>
              <th>Ссылки</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {photos.map((photo) => (
              <tr key={photo.id}>
                <th scope="row">{photo.number}</th>
                <td className="result-file-cell">{photo.fileName || 'без имени'}</td>
                <td className="result-file-cell">{photo.displayFileName || photo.internalName || 'ожидает индекса'}</td>
                <td>
                  <div className="table-index-cell">
                    <span>{indexDisplayText(photo)}</span>
                    <InlineIndexEditor photo={photo} onApplyIndex={onApplyIndex} />
                  </div>
                </td>
                <td>{formatCoordinates(photo.coordinates)}</td>
                <td><StatusChip tone={statusTone(photo.coordinateQuality || 'missing')}>{statusLabel(photo.coordinateQuality, 'Не найдено')}</StatusChip></td>
                <td>{statusLabel(distanceText(photo))}</td>
                <td>{statusLabel(photo.uploadStatus)}</td>
                <td>{photo.uploadResult?.links?.length || 0}</td>
                <td>
                  <div className="table-actions">
                    <button type="button" className="compact-button button-secondary" onClick={() => onOpenPhoto?.(photo.id)}>Фото</button>
                    <button type="button" className="compact-button button-secondary" onClick={() => onOpenOnMap?.(photo.id)} disabled={!photo.coordinates}>Карта</button>
                    <button type="button" className="compact-button button-secondary" onClick={() => copyLinks(photo)} disabled={!photo.uploadResult?.links?.length}>Ссылки</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
