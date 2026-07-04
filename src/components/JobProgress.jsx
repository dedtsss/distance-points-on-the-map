import { getProgressSummary } from '../app/appState';

export default function JobProgress({ photos }) {
  const progress = getProgressSummary(photos);
  if (progress.total === 0) return null;

  const stages = [
    ['Подготовлено', progress.buffered],
    ['Координаты', progress.gps],
    ['Очищено', progress.cleaned],
    ['Загружено', progress.uploaded],
  ];

  return (
    <section className="progress-card" aria-label="Общий прогресс">
      <div className="progress-heading">
        <h2>Общий прогресс</h2>
        <span>{progress.uploaded}/{progress.total}</span>
      </div>
      <div className="progress-grid">
        {stages.map(([label, value]) => (
          <div key={label} className="progress-item">
            <span>{label}</span>
            <strong>{value}/{progress.total}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
