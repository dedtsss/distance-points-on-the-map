import EmptyState from './EmptyState.jsx';
import Icon from './Icon.jsx';
import PageHeader from './PageHeader.jsx';
import SessionList from './SessionList.jsx';
import StatCard from './StatCard.jsx';
import StatusChip from './StatusChip.jsx';
import { getSessionMetrics } from '../features/session/sessionDomain.js';

const isToday = (value) => {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
};

const conflictCount = (photos) => photos.reduce((sum, photo) => (
  photo.distanceStatus === 'too_close' ? sum + (photo.distanceConflicts?.length || 0) : sum
), 0) / 2;

export default function Dashboard({
  photos,
  sessions,
  journal,
  onNavigate,
  onOpenSession,
  onRunFullCheck,
  canRunFullCheck,
  isBusy,
}) {
  const allPhotos = sessions.flatMap((session) => session.photos || []);
  const activeSessionToday = sessions.some((session) => isToday(session.createdAt || session.updatedAt));
  const totals = getSessionMetrics(allPhotos);
  const conflicts = conflictCount(allPhotos);
  const recentIssues = [
    ...allPhotos.filter((photo) => photo.userError || photo.distanceStatus === 'too_close' || photo.coordinateQuality === 'low_precision').map((photo) => ({
      id: `photo-${photo.id}`,
      tone: photo.userError ? 'error' : photo.distanceStatus === 'too_close' ? 'error' : 'warning',
      title: photo.displayFileName || photo.fileName || `Фото ${photo.number}`,
      text: photo.userError || (photo.distanceStatus === 'too_close' ? photo.distanceConflicts?.join('; ') : 'Координаты требуют ручного подтверждения'),
    })),
    ...journal.filter((entry) => ['warning', 'error'].includes(entry.type)).slice(-4).map((entry) => ({
      id: entry.id,
      tone: entry.type,
      title: entry.time,
      text: entry.message,
    })),
  ].slice(-5).reverse();

  return (
    <>
      <PageHeader
        eyebrow="Панель мониторинга"
        title="Обзор текущей проверки"
        actions={(
          <>
            <button type="button" onClick={() => onNavigate('upload')}>
              <Icon name="upload" size={18} />
              Загрузить фото
            </button>
            <button type="button" className="button-secondary" onClick={() => onNavigate('map')}>
              <Icon name="map" size={18} />
              Открыть карту
            </button>
          </>
        )}
      >
        Метрики строятся только из сохранённых сессий Dark Cat CRM — без декоративных графиков и fake data.
      </PageHeader>

      <section className="dashboard-grid">
        <StatCard label="Всего сессий" value={sessions.length} helper={activeSessionToday ? 'Есть активность сегодня' : 'Нет активности сегодня'} tone="primary" icon="sessions" />
        <StatCard label="Фото обработано" value={totals.processedPhotoCount} helper={`${totals.totalPhotoCount} всего`} tone="info" icon="image" />
        <StatCard label="Индексы / координаты" value={`${totals.recognizedIndexCount} / ${totals.recognizedCoordinateCount}`} helper={`${totals.uploadedCount} загружено`} tone="success" icon="target" />
        <StatCard label="ACTIVE / RESERVE" value={`${totals.activeCount} / ${totals.reserveCount}`} helper={`${totals.errorCount || conflicts} требуют внимания`} tone={totals.errorCount || conflicts ? 'warning' : 'success'} icon="warning" />
      </section>

      <section className="dashboard-main">
        <article className="surface-panel quick-check-panel">
          <div>
            <p className="page-eyebrow">Быстрое действие</p>
            <h3>Загрузка и проверка фотографий</h3>
            <p>OCR координат, индекс точки, cleanup, upload через `/api/upload` и карта остаются в существующем pipeline и сохраняются в выбранной сессии.</p>
          </div>
          <div className="quick-actions">
            <button type="button" onClick={() => onNavigate('upload')}>
              <Icon name="plus" size={18} />
              Выбрать фотографии
            </button>
            <button type="button" className="button-secondary" onClick={onRunFullCheck} disabled={isBusy || !canRunFullCheck}>
              <Icon name="play" size={18} />
              Запустить полную проверку
            </button>
          </div>
        </article>

        <article className="surface-panel">
          <div className="panel-heading">
            <div>
              <p className="page-eyebrow">Последние сессии</p>
              <h3>Сохранённая история</h3>
            </div>
            <button type="button" className="button-secondary compact-button" onClick={() => onNavigate('sessions')}>Все сессии</button>
          </div>
          {sessions.length > 0 ? (
            <SessionList sessions={sessions.slice(0, 3)} onOpen={onOpenSession || (() => onNavigate('sessions'))} />
          ) : (
            <EmptyState title="История пока отсутствует" icon="sessions">
              Создайте первую сессию: здесь появятся реальные показатели обработки.
            </EmptyState>
          )}
        </article>

        <article className="surface-panel">
          <div className="panel-heading">
            <div>
              <p className="page-eyebrow">Недавние ошибки и конфликты</p>
              <h3>Что требует внимания</h3>
            </div>
            <button type="button" className="button-secondary compact-button" onClick={() => onNavigate('journal')}>Журнал</button>
          </div>
          {recentIssues.length > 0 ? (
            <ul className="issue-list">
              {recentIssues.map((issue) => (
                <li key={issue.id}>
                  <StatusChip tone={issue.tone === 'error' ? 'error' : 'warning'}>{issue.tone}</StatusChip>
                  <div>
                    <strong>{issue.title}</strong>
                    <span>{issue.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Нет ошибок или конфликтов" icon="check">
              Для текущей сессии нет предупреждений, требующих действия.
            </EmptyState>
          )}
        </article>
      </section>
    </>
  );
}
