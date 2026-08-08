import { useMemo, useState } from 'react';
import EmptyState from './EmptyState.jsx';
import Icon from './Icon.jsx';
import PageHeader from './PageHeader.jsx';
import SessionList from './SessionList.jsx';

export default function SessionsScreen({
  sessions,
  savedSession,
  onOpenSession,
  onCreateSession,
  onNavigateUpload,
}) {
  const [query, setQuery] = useState('');
  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    return sessions.filter((session) => [
      session.sessionNumber,
      session.title,
      session.name,
      session.color,
      session.packing,
      session.status,
    ].join(' ').toLowerCase().includes(normalized));
  }, [query, sessions]);
  return (
    <>
      <PageHeader
        eyebrow="Сессии"
        title="Сессии обработки"
        actions={<button type="button" onClick={onCreateSession || onNavigateUpload}><Icon name="plus" size={18} /> Новая сессия</button>}
      >
        Новые сверху. История загружается из серверного D1; локальная копия остаётся backup и источником миграции.
      </PageHeader>

      <section className="surface-panel">
        <label className="session-search setting-field">
          Поиск по номеру, названию, цвету или фасовке
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Например: 0042, Красный, пачка" />
        </label>
        {filteredSessions.length > 0 ? (
          <SessionList sessions={filteredSessions} onOpen={onOpenSession} />
        ) : (
          <EmptyState title={sessions.length ? 'Нет совпадений' : 'История пока отсутствует'} icon="sessions">
            {sessions.length ? 'Измените текст поиска.' : 'Создайте сессию или начните обработку фотографий.'}
          </EmptyState>
        )}
      </section>

      <section className="surface-panel">
        <div className="panel-heading">
          <div>
              <p className="page-eyebrow">Совместимость</p>
              <h3>Последний legacy snapshot</h3>
          </div>
        </div>
        {savedSession ? (
          <div className="saved-session-actions"><p>Найден compatibility snapshot: {savedSession.photos?.length || 0} фото. Его данные уже переносятся в новую сессионную модель после открытия.</p></div>
        ) : (
          <EmptyState title="Сохранённой сессии нет" icon="file">
            Браузер не вернул последнюю сессию из `localStorage`.
          </EmptyState>
        )}
      </section>
    </>
  );
}
