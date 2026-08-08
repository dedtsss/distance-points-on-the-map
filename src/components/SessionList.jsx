import StatusChip from './StatusChip.jsx';
import { getSessionDisplayName, getSessionMetrics } from '../features/session/sessionDomain.js';

const formatDate = (value) => {
  if (!value) return 'дата неизвестна';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};

const statusTone = (status) => ({ processing: 'warning', attention: 'error', draft: 'neutral', in_progress: 'warning', complete: 'success' }[status] || 'neutral');
const statusLabel = (status) => ({ processing: 'обрабатывается', attention: 'требует внимания', draft: 'черновик', in_progress: 'в работе', complete: 'готова' }[status] || status || 'черновик');

export default function SessionList({ sessions, onOpen }) {
  if (!sessions.length) return null;

  return (
    <div className="session-list">
      {sessions.map((session) => {
        const metrics = getSessionMetrics(session.photos || []);
        return (
          <article className="session-row" key={session.sessionId}>
            <div>
              <p className="page-eyebrow">Сессия №{String(session.sessionNumber || 0).padStart(4, '0')}</p>
              <h3>{getSessionDisplayName(session)}</h3>
              <p>{formatDate(session.updatedAt || session.createdAt)}</p>
            </div>
            <span>{metrics.totalPhotoCount} фото</span>
            <span>{metrics.activeCount} ACTIVE · {metrics.reserveCount} RESERVE</span>
            <span>{metrics.uploadedCount} загружено</span>
            <StatusChip tone={statusTone(session.status)}>{statusLabel(session.status)}</StatusChip>
            {onOpen && (
              <button type="button" className="button-secondary compact-button" onClick={() => onOpen(session.sessionId)}>
                Открыть
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}
