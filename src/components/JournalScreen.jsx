import { useState } from 'react';
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

export default function JournalScreen({ entries, activeSince, onClear }) {
  const [filter, setFilter] = useState('all');
  const filtered = entries.filter((entry) => filter === 'all' || entry.type === filter);
  const options = FILTERS.map((item) => ({
    ...item,
    count: item.value === 'all' ? entries.length : entries.filter((entry) => entry.type === item.value).length,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Журнал"
        title="События обработки"
        actions={(
          <button type="button" className="button-secondary" onClick={onClear} disabled={entries.length === 0}>
            <Icon name="trash" size={18} />
            Очистить журнал
          </button>
        )}
      >
        Технические подробности скрыты в карточках фото и debug-режиме. Здесь показаны пользовательские события текущей вкладки.
      </PageHeader>

      {activeSince && (
        <aside className="notice notice-warning">
          Текущий шаг выполняется. Журнал обновляется по мере обработки фотографий.
        </aside>
      )}

      <section className="surface-panel">
        <FilterBar label="Уровень журнала" options={options} value={filter} onChange={setFilter} />
        {filtered.length === 0 ? (
          <EmptyState title={entries.length === 0 ? 'Журнал пуст' : 'Нет записей выбранного уровня'} icon="journal">
            Локальный журнал появится после выбора файлов или запуска обработки.
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
