import { useState } from 'react';
import { loadExportDescription, saveExportDescription } from '../features/export/exportPreferences.js';
import BuildInfo from './BuildInfo.jsx';
import Icon from './Icon.jsx';
import PageHeader from './PageHeader.jsx';
import ProviderSettings from './ProviderSettings.jsx';
import StatusChip from './StatusChip.jsx';
import { MAP_LAYER_OPTIONS } from '../features/map/baseLayers.js';

export default function SettingsScreen({
  providerSettings,
  onProviderSettingsChange,
  regionMode,
  onRegionModeChange,
  thresholdMeters,
  onThresholdMetersChange,
  processingSettings,
  onProcessingSettingsChange,
  mapLayerId,
  onMapLayerChange,
  storageDiagnostics,
  debugMode,
  isBusy,
  onRequestClearSession,
}) {
  const [exportDescription, setExportDescription] = useState(() => loadExportDescription());

  const handleExportDescriptionChange = (value) => {
    const saved = saveExportDescription(value);
    setExportDescription(saved);
  };

  return (
    <>
      <PageHeader eyebrow="Настройки" title="Параметры проверки">
        Настройки обработки применяются к текущей локальной сессии. Общее описание экспорта хранится отдельно и не удаляется при очистке сессии.
      </PageHeader>

      <section className="settings-grid">
        <article className="settings-group">
          <h3>Фотографии</h3>
          <p>Исходные файлы на устройстве не изменяются. Управляются только реально поддержанные этапы pipeline. Если cleanup выключен, полная обработка не отправляет raw-файл; сначала выполните очистку отдельной кнопкой.</p>
          <label className="region-setting">
            <input type="checkbox" checked={processingSettings?.metadataCleanup !== false} onChange={(event) => onProcessingSettingsChange?.({ ...processingSettings, metadataCleanup: event.target.checked })} disabled={isBusy} />
            Очищать metadata перед upload
          </label>
          <label className="region-setting">
            <input type="checkbox" checked={processingSettings?.renameFiles !== false} onChange={(event) => onProcessingSettingsChange?.({ ...processingSettings, renameFiles: event.target.checked })} disabled={isBusy} />
            Применять безопасное имя `gps-###.jpg`
          </label>
          <StatusChip tone={isBusy ? 'warning' : 'success'}>{isBusy ? 'processing' : 'ready'}</StatusChip>
        </article>

        <article className="settings-group">
          <h3>OCR</h3>
          <p>Multi-pass OCR координат и индекса включён в текущем pipeline. Debug-подробности доступны только через `?debug=1`.</p>
          <label className="region-setting">
            <input type="checkbox" checked={processingSettings?.metadataFirst !== false} onChange={(event) => onProcessingSettingsChange?.({ ...processingSettings, metadataFirst: event.target.checked })} disabled={isBusy} />
            Сначала GPS metadata, затем OCR fallback
          </label>
          <StatusChip tone={debugMode ? 'warning' : 'neutral'}>{debugMode ? 'debug включён' : 'debug выключен'}</StatusChip>
        </article>

        <article className="settings-group">
          <h3>Карта</h3>
          <p>Leaflet использует ACTIVE-точки для конфликтов; RESERVE остаётся видимым, но не участвует в расчёте.</p>
          <label className="setting-field">
            Базовый слой
            <select value={mapLayerId || 'hybrid'} onChange={(event) => onMapLayerChange?.(event.target.value)} disabled={isBusy}>
              {MAP_LAYER_OPTIONS.map((layer) => <option key={layer.id} value={layer.id}>{layer.label}</option>)}
            </select>
          </label>
          <StatusChip tone="success">Leaflet активен</StatusChip>
        </article>

        <article className="settings-group">
          <h3>Расстояния</h3>
          <label className="setting-field">
            Порог, метры
            <input
              type="number"
              min="1"
              max="1000"
              value={thresholdMeters}
              onChange={(event) => onThresholdMetersChange(event.target.value)}
              disabled={isBusy}
            />
          </label>
        </article>

        <article className="settings-group">
          <h3>Загрузка</h3>
          <p>Frontend отправляет только очищенные generic-файлы через same-origin `/api/upload`. Порядок fallback можно менять ниже.</p>
          <StatusChip tone={processingSettings?.metadataCleanup === false ? 'warning' : 'success'}>{processingSettings?.metadataCleanup === false ? 'cleanup выключен' : 'metadata cleanup включён'}</StatusChip>
        </article>

        <article className="settings-group settings-group-wide">
          <ProviderSettings value={providerSettings} onChange={onProviderSettingsChange} disabled={isBusy} />
        </article>

        <article className="settings-group">
          <h3>Регион</h3>
          <label className="region-setting">
            <input
              type="checkbox"
              checked={regionMode === 'karelia'}
              onChange={(event) => onRegionModeChange(event.target.checked ? 'karelia' : 'auto')}
              disabled={isBusy}
            />
            Ожидаемый регион: Карелия/рядом
          </label>
          <p>Если выключено, sanity-проверка использует авто-кластер текущей пачки.</p>
        </article>

        <article className="settings-group">
          <h3>Интерфейс</h3>
          <p>Тёмная Material 3-like тема включена по умолчанию. Внешние шрифты и CDN не используются.</p>
          <StatusChip tone="neutral">системный стек шрифтов</StatusChip>
        </article>

        <article className="settings-group settings-group-wide export-description-setting">
          <h3>Общее описание результата</h3>
          <p>Это default для новых сессий. Текущий комментарий сессии редактируется в мастере и сохраняется вместе с ней.</p>
          <label className="setting-field">
            Текст описания
            <textarea
              rows="5"
              maxLength="4000"
              value={exportDescription}
              onChange={(event) => handleExportDescriptionChange(event.target.value)}
              placeholder="Например: Опоры линии электропередачи, участок № 4"
            />
          </label>
          <p className="setting-helper">Сохранено автоматически · {exportDescription.length} из 4000 символов</p>
        </article>

        <article className="settings-group danger-zone">
          <h3>Данные сессии</h3>
          <p>Очистка удалит текущий результат и последнюю локально сохранённую сессию из браузера. Общее описание сохранится.</p>
          <button type="button" className="danger-button" onClick={onRequestClearSession} disabled={isBusy}>
            <Icon name="trash" size={18} />
            Очистить сессию
          </button>
        </article>

        <article className="settings-group settings-group-wide">
          <BuildInfo />
          {storageDiagnostics && <p className="setting-helper">Хранилище: {storageDiagnostics.backend} · sync: {storageDiagnostics.syncState || 'local'} · сессий: {storageDiagnostics.sessionCount ?? 0} · schema v{storageDiagnostics.schemaVersion ?? '—'}</p>}
        </article>
      </section>
    </>
  );
}
