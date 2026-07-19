import { useEffect, useMemo, useState } from 'react';
import {
  clearOcrDiagnostics,
  downloadOcrDiagnosticReport,
  getOcrDiagnostics,
  subscribeOcrDiagnostics,
} from '../features/diagnostics/ocrDiagnostics.js';
import EmptyState from './EmptyState.jsx';
import FilterBar from './FilterBar.jsx';
import Icon from './Icon.jsx';
import PageHeader from './PageHeader.jsx';
import StatusChip from './StatusChip.jsx';

const FILTERS = [
  { value: 'all', label: 'Все' },
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

const toneForType = (type) => {
  if (type === 'success') return 'success';
  if (type === 'warning') return 'warning';
  if (type === 'error') return 'error';
  return 'neutral';
};

const formatElapsed = (value) => {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return '—';
  return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(1)} с` : `${Math.round(milliseconds)} мс`;
};

const formatCoordinates = (coordinates) => {
  if (!coordinates) return 'не распознаны';
  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'не распознаны';
  return `${latitude.toFixed(7)}, ${longitude.toFixed(7)}`;
};

const attemptTone = (attempt) => {
  if (attempt.rejectionReason) return 'warning';
  if (Number(attempt.score) >= 0.75) return 'success';
  return 'neutral';
};

function AttemptDetails({ attempt, index, kind }) {
  const title = attempt.name || `${kind} попытка ${index + 1}`;
  return (
    <details>
      <summary>
        {index + 1}. {title} — <StatusChip tone={attemptTone(attempt)}>{attempt.rejectionReason ? 'отклонено' : 'проверено'}</StatusChip>
      </summary>
      <dl className="settings-list">
        <div><dt>Область</dt><dd>{attempt.cropName || '—'}</dd></div>
        <div><dt>Детектор</dt><dd>{attempt.detectorName || 'фиксированная ROI'}</dd></div>
        <div><dt>Overlay</dt><dd>{attempt.overlayDetected === true ? 'найден' : attempt.overlayDetected === false ? 'не найден' : 'не применялся'}</dd></div>
        <div><dt>Обработка</dt><dd>{attempt.preprocessingMethod || '—'}</dd></div>
        <div><dt>PSM</dt><dd>{attempt.pageSegMode || '—'}</dd></div>
        <div><dt>OCR confidence</dt><dd>{attempt.ocrConfidence == null ? '—' : Number(attempt.ocrConfidence).toFixed(3)}</dd></div>
        <div><dt>Parser confidence</dt><dd>{attempt.parserConfidence == null ? '—' : Number(attempt.parserConfidence).toFixed(3)}</dd></div>
        <div><dt>Score</dt><dd>{attempt.score == null ? '—' : Number(attempt.score).toFixed(3)}</dd></div>
        <div><dt>Причина отклонения</dt><dd>{attempt.rejectionReason || 'нет'}</dd></div>
      </dl>
      <p className="page-eyebrow">Сырой OCR-текст</p>
      <pre className="session-debug">{attempt.rawText || '[пусто]'}</pre>
      {attempt.normalizedText && attempt.normalizedText !== attempt.rawText && (
        <>
          <p className="page-eyebrow">Нормализованный текст</p>
          <pre className="session-debug">{attempt.normalizedText}</pre>
        </>
      )}
      {attempt.warnings?.length > 0 && <p>Предупреждения: {attempt.warnings.join(', ')}</p>}
    </details>
  );
}

function PhotoDiagnostics({ item }) {
  const coordinateAttempts = item.ocr?.attempts || [];
  const indexAttempts = item.ocr?.indexAttempts || [];
  const overlayFound = [...coordinateAttempts, ...indexAttempts].some((attempt) => attempt.overlayDetected === true);
  const resultTone = item.result?.found ? 'success' : 'error';

  return (
    <details className="surface-panel">
      <summary>
        <strong>{item.file?.name || 'Фотография'}</strong>{' '}
        <StatusChip tone={resultTone}>{item.result?.found ? 'координаты найдены' : 'координаты не найдены'}</StatusChip>
      </summary>
      <dl className="settings-list">
        <div><dt>Блок справа снизу</dt><dd>{overlayFound ? 'найден' : 'не подтверждён'}</dd></div>
        <div><dt>Координаты</dt><dd>{formatCoordinates(item.result?.coordinates)}</dd></div>
        <div><dt>Индекс</dt><dd>{item.result?.indexFromOcr || 'не распознан'}</dd></div>
        <div><dt>Статус индекса</dt><dd>{item.result?.indexStatus || 'missing'}</dd></div>
        <div><dt>Источник</dt><dd>{item.result?.source || 'нет'}</dd></div>
        <div><dt>Качество</dt><dd>{item.result?.coordinateQuality || item.result?.ocrStatus || 'missing'}</dd></div>
        <div><dt>Время</dt><dd>{formatElapsed(item.elapsedMs)}</dd></div>
        <div><dt>Попытки координат</dt><dd>{coordinateAttempts.length}</dd></div>
        <div><dt>Попытки индекса</dt><dd>{indexAttempts.length}</dd></div>
        <div><dt>Размер файла</dt><dd>{item.file?.size ? `${Math.round(item.file.size / 1024)} КБ` : '—'}</dd></div>
      </dl>

      {item.result?.warnings?.length > 0 && (
        <aside className="notice notice-warning">Предупреждения: {item.result.warnings.join(', ')}</aside>
      )}
      {(item.errors?.ocr || item.errors?.exif) && (
        <aside className="notice notice-warning">
          {item.errors.ocr && <p>OCR: {item.errors.ocr}</p>}
          {item.errors.exif && <p>EXIF: {item.errors.exif}</p>}
        </aside>
      )}

      <h4>Попытки распознавания координат</h4>
      {coordinateAttempts.length === 0
        ? <p>Подробные попытки отсутствуют.</p>
        : coordinateAttempts.map((attempt, index) => <AttemptDetails key={`${attempt.name}-${index}`} attempt={attempt} index={index} kind="OCR" />)}

      <h4>Попытки распознавания индекса</h4>
      {indexAttempts.length === 0
        ? <p>Отдельные попытки индекса отсутствуют.</p>
        : indexAttempts.map((attempt, index) => <AttemptDetails key={`${attempt.name}-${index}`} attempt={attempt} index={index} kind="Индекс" />)}
    </details>
  );
}

export default function JournalScreen({ entries, activeSince, onClear }) {
  const [filter, setFilter] = useState('all');
  const [diagnostics, setDiagnostics] = useState(() => getOcrDiagnostics());
  const [exportMessage, setExportMessage] = useState('');

  useEffect(() => subscribeOcrDiagnostics(setDiagnostics), []);

  const filtered = entries.filter((entry) => filter === 'all' || entry.type === filter);
  const options = FILTERS.map((item) => ({
    ...item,
    count: item.value === 'all' ? entries.length : entries.filter((entry) => entry.type === item.value).length,
  }));
  const summary = useMemo(() => ({
    total: diagnostics.length,
    coordinatesFound: diagnostics.filter((item) => item.result?.found).length,
    indexesFound: diagnostics.filter((item) => item.result?.indexFromOcr).length,
  }), [diagnostics]);

  const handleExport = () => {
    try {
      const fileName = downloadOcrDiagnosticReport({ journalEntries: entries });
      setExportMessage(`Скачан файл ${fileName}`);
    } catch (error) {
      setExportMessage(`Не удалось скачать отчёт: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleClear = () => {
    clearOcrDiagnostics();
    onClear();
    setExportMessage('');
  };

  return (
    <>
      <PageHeader
        eyebrow="Журнал"
        title="События и диагностика OCR"
        actions={(
          <div className="run-actions">
            <button type="button" className="button-secondary" onClick={handleExport} disabled={diagnostics.length === 0 && entries.length === 0}>
              <Icon name="file" size={18} />
              Скачать диагностику JSON
            </button>
            <button type="button" className="button-secondary" onClick={handleClear} disabled={diagnostics.length === 0 && entries.length === 0}>
              <Icon name="trash" size={18} />
              Очистить журнал
            </button>
          </div>
        )}
      >
        По каждой фотографии сохраняются области OCR, способы обработки, сырой текст, confidence, кандидаты и причины отказа. Исходные фотографии, бинарные данные, пароли и API-ключи в экспорт не включаются.
      </PageHeader>

      {activeSince && (
        <aside className="notice notice-warning">
          Текущий шаг выполняется. Журнал обновляется по мере обработки фотографий.
        </aside>
      )}

      {exportMessage && <aside className="notice notice-neutral">{exportMessage}</aside>}

      <section className="surface-panel">
        <p className="page-eyebrow">Сводка OCR</p>
        <dl className="settings-list">
          <div><dt>Обработано фотографий</dt><dd>{summary.total}</dd></div>
          <div><dt>Координаты найдены</dt><dd>{summary.coordinatesFound} из {summary.total}</dd></div>
          <div><dt>Индексы найдены</dt><dd>{summary.indexesFound} из {summary.total}</dd></div>
          <div><dt>Хранение</dt><dd>локально в этом браузере, максимум 40 фотографий</dd></div>
        </dl>
      </section>

      {diagnostics.length === 0 ? (
        <EmptyState title="Диагностика OCR пока отсутствует" icon="journal">
          Запусти «Только OCR» или полную обработку. После каждого файла здесь появится подробный отчёт.
        </EmptyState>
      ) : (
        <section aria-label="Диагностика OCR по фотографиям">
          {diagnostics.slice().reverse().map((item) => <PhotoDiagnostics key={item.id} item={item} />)}
        </section>
      )}

      <section className="surface-panel">
        <FilterBar label="Уровень журнала" options={options} value={filter} onChange={setFilter} />
        {filtered.length === 0 ? (
          <EmptyState title={entries.length === 0 ? 'Журнал событий пуст' : 'Нет записей выбранного уровня'} icon="journal">
            Пользовательские события появятся после выбора файлов или запуска обработки.
          </EmptyState>
        ) : (
          <ol className="journal-timeline">
            {filtered.map((entry) => (
              <li key={entry.id} className={`journal-entry journal-entry-${entry.type || 'info'}`}>
                <time>{entry.time}</time>
                <StatusChip tone={toneForType(entry.type)}>{entry.type || 'info'}</StatusChip>
                <span>{entry.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
