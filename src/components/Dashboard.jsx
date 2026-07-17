import EmptyState from './EmptyState.jsx';
import Icon from './Icon.jsx';
import PageHeader from './PageHeader.jsx';
import SessionList from './SessionList.jsx';
import StatCard from './StatCard.jsx';
import StatusChip from './StatusChip.jsx';

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
  onRunFullCheck,
  canRunFullCheck,
  isBusy,
}) {
  const activeSessionToday = sessions.some((session) => isToday(session.createdAt || session.updatedAt));
  const processed = photos.filter((photo) => !['buffered', 'idle'].includes(photo.status)).length;
  const lowPrecision = photos.filter((photo) => photo.coordinateQuality === 'low_precision').length;
  const conflicts = conflictCount(photos);
  const recentIssues = [
    ...photos.filter((photo) => photo.userError || photo.distanceStatus === 'too_close' || photo.coordinateQuality === 'low_precision').map((photo) => ({
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
        Статистика строится по текущей или восстановленной локальной сессии. Полная история сессий пока не подключена.
      </PageHeader>

      <section className="dashboard-grid">
        <StatCard label="Сессий сегодня" value={activeSessionToday ? 1 : 0} helper="Только локальная последняя сессия" tone="primary" icon="sessions" />
        <StatCard label="Фото обработано" value={processed} helper={`${photos.length} выбрано`} tone="info" icon="image" />
        <StatCard label="Низкая точность" value={lowPrecision} helper="Требует подтверждения" tone={lowPrecision ? 'warning' : 'success'} icon="warning" />
        <StatCard label="Конфликты расстояний" value={conflicts} helper="По текущему порогу" tone={conflicts ? 'error' : 'success'} icon="error" />
      </section>

      <section className="dashboard-main">
        <article className="surface-panel quick-check-panel">
          <div>
            <p className="page-eyebrow">Быстрое действие</p>
            <h3>Загрузка и проверка фотографий</h3>
            <p>OCR координат, индекс точки, очистка metadata, upload через `/api/upload` и расчёт расстояний остаются в существующем pipeline.</p>
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
              <h3>Локальное хранилище</h3>
            </div>
            <button type="button" className="button-secondary compact-button" onClick={() => onNavigate('sessions')}>Все сессии</button>
          </div>
          {sessions.length > 0 ? (
            <SessionList sessions={sessions.slice(0, 3)} onOpen={() => onNavigate('results')} />
          ) : (
            <EmptyState title="История пока отсутствует" icon="sessions">
              Приложение сейчас хранит только последнюю локальную сессию в браузере.
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
