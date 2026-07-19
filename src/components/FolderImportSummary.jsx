import {
  FOLDER_IMPORT_STATUSES,
  folderReportReasonRows,
} from '../features/files/folderPicker.js';
import Icon from './Icon.jsx';

const STATUS_TEXT = {
  [FOLDER_IMPORT_STATUSES.SELECTING]: 'Выбор папки',
  [FOLDER_IMPORT_STATUSES.SCANNING]: 'Сканирование папки',
  [FOLDER_IMPORT_STATUSES.ADDING]: 'Добавление фотографий',
  [FOLDER_IMPORT_STATUSES.DONE]: 'Готово',
  [FOLDER_IMPORT_STATUSES.ERROR]: 'Ошибка',
  [FOLDER_IMPORT_STATUSES.CANCELLED]: 'Отменено',
};

const statusTone = (status) => {
  if (status === FOLDER_IMPORT_STATUSES.ERROR) return 'error';
  if (status === FOLDER_IMPORT_STATUSES.CANCELLED) return 'warning';
  if (status === FOLDER_IMPORT_STATUSES.DONE) return 'success';
  return 'neutral';
};

export default function FolderImportSummary({
  status,
  report,
  error,
  onCancel,
}) {
  if (!status || status === FOLDER_IMPORT_STATUSES.IDLE) return null;

  const reasonRows = folderReportReasonRows(report);
  const canCancel = [
    FOLDER_IMPORT_STATUSES.SELECTING,
    FOLDER_IMPORT_STATUSES.SCANNING,
    FOLDER_IMPORT_STATUSES.ADDING,
  ].includes(status);

  return (
    <aside className={`folder-import-summary folder-import-summary-${statusTone(status)}`} aria-live="polite">
      <div className="folder-import-summary-head">
        <div>
          <p className="section-kicker">Папка</p>
          <h3>{STATUS_TEXT[status] || 'Импорт папки'}</h3>
        </div>
        {canCancel && (
          <button type="button" className="button-secondary compact-button" onClick={onCancel}>
            <Icon name="close" size={16} />
            Отменить
          </button>
        )}
      </div>

      {report && (
        <dl className="folder-import-stats">
          <div><dt>Папка</dt><dd>{report.folderName}</dd></div>
          <div><dt>Найдено файлов</dt><dd>{report.foundFiles}</dd></div>
          <div><dt>Добавлено фотографий</dt><dd>{report.addedPhotos}</dd></div>
          <div><dt>Пропущено</dt><dd>{report.skippedFiles}</dd></div>
          <div><dt>Вложенных папок</dt><dd>{report.nestedFolders}</dd></div>
        </dl>
      )}

      {reasonRows.length > 0 && (
        <ul className="folder-import-reasons" aria-label="Причины пропуска">
          {reasonRows.map((row) => (
            <li key={row.reason}>
              <span>{row.label}</span>
              <strong>{row.count}</strong>
            </li>
          ))}
        </ul>
      )}

      {report?.skipExamples?.length > 0 && (
        <ul className="folder-import-examples" aria-label="Примеры пропущенных файлов">
          {report.skipExamples.map((item) => (
            <li key={`${item.reason}-${item.path}`}>{item.message}</li>
          ))}
        </ul>
      )}

      {error && <p className="folder-import-error">{error}</p>}
    </aside>
  );
}
