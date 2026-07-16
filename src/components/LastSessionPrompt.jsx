export default function LastSessionPrompt({ session, onRestore, onDelete }) {
  if (!session) return null;
  const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(session.updatedAt || session.createdAt));
  return (
    <aside className="session-prompt">
      <p>Найден последний результат от {date}.</p>
      <div>
        <button type="button" onClick={onRestore}>Восстановить</button>
        <button type="button" className="button-secondary" onClick={onDelete}>Удалить</button>
      </div>
    </aside>
  );
}
