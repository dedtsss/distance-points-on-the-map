import { useEffect, useState } from 'react';

export default function ProcessingJournal({ entries, activeSince }) {
  const [open, setOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!activeSince) { setElapsed(0); return undefined; }
    const update = () => setElapsed(Math.floor((Date.now() - activeSince) / 1000));
    update();
    const interval = globalThis.setInterval(update, 1000);
    return () => globalThis.clearInterval(interval);
  }, [activeSince]);
  return (
    <section className="journal-card">
      <div className="journal-heading">
        <div><h2>Журнал обработки</h2>{activeSince && <p>Текущий шаг выполняется · {elapsed} сек.</p>}</div>
        <button type="button" className="button-secondary compact-button" onClick={() => setOpen((value) => !value)}>{open ? 'Скрыть журнал' : 'Показать журнал'}</button>
      </div>
      {open && <ol className="journal-list">{entries.map((entry) => <li key={entry.id}><time>{entry.time}</time><span>{entry.message}</span></li>)}</ol>}
    </section>
  );
}
