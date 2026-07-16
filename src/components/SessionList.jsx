import StatusChip from './StatusChip.jsx';

const formatDate = (value) => {
  if (!value) return 'дата неизвестна';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
};

const sessionStatus = (session) => {
  if (session.status) return session.status;
  if (session.photos?.some((photo) => photo.uploadStatus === 'processing' || photo.gpsStatus === 'processing')) return 'обрабатывается';
  if (session.photos?.length > 0) return 'локальная';
  return 'пустая';
};

export default function SessionList({ sessions, onOpen }) {
  if (!sessions.length) return null;

  return (
    <div className="session-list">
      {sessions.map((session) => {
        const lowPrecision = session.photos.filter((photo) => photo.coordinateQuality === 'low_precision').length;
        const conflicts = session.photos.reduce((sum, photo) => (
          photo.distanceStatus === 'too_close' ? sum + (photo.distanceConflicts?.length || 0) : sum
        ), 0) / 2;
        return (
          <article className="session-row" key={session.sessionId}>
            <div>
              <h3>{session.name || `Сессия ${String(session.sessionId).slice(0, 8)}`}</h3>
              <p>{formatDate(session.updatedAt || session.createdAt)}</p>
            </div>
            <span>{session.photos.length} фото</span>
            <span>{lowPrecision} low_precision</span>
            <span>{conflicts} конфликтов</span>
            <StatusChip tone={sessionStatus(session) === 'обрабатывается' ? 'warning' : 'success'}>{sessionStatus(session)}</StatusChip>
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
