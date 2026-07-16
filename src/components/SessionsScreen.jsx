import EmptyState from './EmptyState.jsx';
import Icon from './Icon.jsx';
import PageHeader from './PageHeader.jsx';
import SessionList from './SessionList.jsx';

export default function SessionsScreen({
  sessions,
  savedSession,
  onOpenSession,
  onRestoreSaved,
  onDeleteSaved,
  onNavigateUpload,
}) {
  return (
    <>
      <PageHeader
        eyebrow="Сессии"
        title="Локальные проверки"
        actions={<button type="button" onClick={onNavigateUpload}><Icon name="upload" size={18} /> Новая проверка</button>}
      >
        Постоянная история сессий сейчас не реализована. Экран подготовлен к будущему хранилищу и показывает только реальные локальные данные.
      </PageHeader>

      <section className="surface-panel">
        {sessions.length > 0 ? (
          <SessionList sessions={sessions} onOpen={onOpenSession} />
        ) : (
          <EmptyState title="История пока отсутствует" icon="sessions">
            После обработки или восстановления результата здесь появится текущая локальная сессия.
          </EmptyState>
        )}
      </section>

      <section className="surface-panel">
        <div className="panel-heading">
          <div>
            <p className="page-eyebrow">Последняя сохранённая сессия</p>
            <h3>Восстановление из браузера</h3>
          </div>
        </div>
        {savedSession ? (
          <div className="saved-session-actions">
            <p>Найдена последняя сохранённая сессия: {savedSession.photos?.length || 0} фото.</p>
            <div>
              <button type="button" onClick={onRestoreSaved}>Восстановить</button>
              <button type="button" className="button-secondary danger-ghost-button" onClick={onDeleteSaved}>
                <Icon name="trash" size={18} />
                Удалить
              </button>
            </div>
          </div>
        ) : (
          <EmptyState title="Сохранённой сессии нет" icon="file">
            Браузер не вернул последнюю сессию из `localStorage`.
          </EmptyState>
        )}
      </section>
    </>
  );
}
