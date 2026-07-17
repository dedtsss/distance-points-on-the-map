import { useMemo, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import FilterBar from './FilterBar.jsx';
import Icon from './Icon.jsx';
import PageHeader from './PageHeader.jsx';
import PhotoCard from './PhotoCard.jsx';
import ResultsSummary from './ResultsSummary.jsx';
import ResultsTable from './ResultsTable.jsx';
import StatCard from './StatCard.jsx';

const conflictCount = (photos) => photos.reduce((sum, photo) => (
  photo.distanceStatus === 'too_close' ? sum + (photo.distanceConflicts?.length || 0) : sum
), 0) / 2;

const matchesFilter = (photo, filter) => {
  if (filter === 'success') return Boolean(photo.coordinates) && ['confident', 'manual'].includes(photo.coordinateQuality);
  if (filter === 'low_precision') return photo.coordinateQuality === 'low_precision';
  if (filter === 'confirmation') return ['low_precision', 'suspicious'].includes(photo.coordinateQuality) || photo.indexStatus === 'uncertain';
  if (filter === 'missing_coordinates') return !photo.coordinates || photo.coordinateQuality === 'missing';
  if (filter === 'missing_index') return !photo.indexFromOcr;
  if (filter === 'conflicts') return photo.distanceStatus === 'too_close';
  return true;
};

export default function ResultsScreen({
  photos,
  providerSettings,
  isBusy,
  onClear,
  onApplyIndex,
  onApplyCoordinates,
  onSwapCoordinates,
  onOpenOnMap,
  onOpenPhoto,
  onRemovePhoto,
  onNavigateUpload,
}) {
  const [filter, setFilter] = useState('all');
  const stats = useMemo(() => ({
    processed: photos.filter((photo) => !['buffered', 'idle'].includes(photo.status)).length,
    recognized: photos.filter((photo) => Boolean(photo.coordinates)).length,
    lowPrecision: photos.filter((photo) => photo.coordinateQuality === 'low_precision').length,
    missingCoordinates: photos.filter((photo) => !photo.coordinates || photo.coordinateQuality === 'missing').length,
    indexes: photos.filter((photo) => Boolean(photo.indexFromOcr)).length,
    conflicts: conflictCount(photos),
  }), [photos]);
  const options = [
    ['all', 'Все', photos.length],
    ['success', 'Успешно', photos.filter((photo) => matchesFilter(photo, 'success')).length],
    ['low_precision', 'Низкая точность', stats.lowPrecision],
    ['confirmation', 'Требует подтверждения', photos.filter((photo) => matchesFilter(photo, 'confirmation')).length],
    ['missing_coordinates', 'Координаты не найдены', stats.missingCoordinates],
    ['missing_index', 'Индекс не найден', photos.filter((photo) => matchesFilter(photo, 'missing_index')).length],
    ['conflicts', 'Конфликты', stats.conflicts],
  ].map(([value, label, count]) => ({ value, label, count }));
  const filtered = photos.filter((photo) => matchesFilter(photo, filter));

  if (photos.length === 0) {
    return (
      <EmptyState
        title="Результатов пока нет"
        icon="results"
        actions={<button type="button" onClick={onNavigateUpload}><Icon name="upload" size={18} /> Перейти к загрузке</button>}
      >
        Сначала выберите фотографии и запустите OCR, cleanup или полную обработку.
      </EmptyState>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Результаты"
        title="Сводка текущей проверки"
        actions={<button type="button" className="button-secondary" onClick={onClear}><Icon name="trash" size={18} /> Очистить результат</button>}
      >
        Таблица и карточки показывают реальные данные текущей сессии: координаты, индекс, internal name, качество OCR, upload и конфликты расстояний.
      </PageHeader>

      <section className="results-stat-grid">
        <StatCard label="Обработано" value={stats.processed} helper={`${photos.length} фото в сессии`} icon="image" tone="info" />
        <StatCard label="Координаты найдены" value={stats.recognized} helper="OCR или EXIF" icon="target" tone="success" />
        <StatCard label="Low precision" value={stats.lowPrecision} helper="Нужна ручная проверка" icon="warning" tone={stats.lowPrecision ? 'warning' : 'success'} />
        <StatCard label="Без координат" value={stats.missingCoordinates} helper="Не участвуют в расстояниях" icon="error" tone={stats.missingCoordinates ? 'warning' : 'success'} />
        <StatCard label="Индексы найдены" value={stats.indexes} helper="OCR или ручной ввод" icon="file" tone="neutral" />
        <StatCard label="Конфликты" value={stats.conflicts} helper="Пары ближе порога" icon="error" tone={stats.conflicts ? 'error' : 'success'} />
      </section>

      <ResultsSummary photos={photos} providerSettings={providerSettings} onClear={onClear} />

      <section className="surface-panel">
        <FilterBar label="Фильтр результатов" options={options} value={filter} onChange={setFilter} />
        {filtered.length === 0 ? (
          <EmptyState title="Нет результатов выбранного типа" icon="search">
            Измените фильтр или вернитесь к полному списку.
          </EmptyState>
        ) : (
          <>
            <ResultsTable
              photos={filtered}
              providerSettings={providerSettings}
              onApplyIndex={onApplyIndex}
              onOpenOnMap={onOpenOnMap}
              onOpenPhoto={onOpenPhoto}
            />
            <div className="result-card-list">
              {filtered.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  compact
                  editingDisabled={isBusy}
                  onRemove={onRemovePhoto}
                  onApplyCoordinates={onApplyCoordinates}
                  onApplyIndex={onApplyIndex}
                  onSwapCoordinates={onSwapCoordinates}
                  onOpenOnMap={onOpenOnMap}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
