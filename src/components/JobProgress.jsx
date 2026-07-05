import { getProgressSummary } from '../app/appState';

export default function JobProgress({ photos }) {
  const progress = getProgressSummary(photos);
  if (progress.total === 0) return null;

  const stages = [
    ['Файлов выбрано', progress.selected],
    ['OCR попыток', progress.ocrAttempts],
    ['Уверенные', progress.confident],
    ['Подозрительные', progress.suspicious],
    ['Не найдены', progress.missing],
    ['Исправлены вручную', progress.manual],
    ['Очищено', progress.cleaned],
    ['Загружено', progress.uploaded],
    ['Ошибки cleanup/upload', progress.errors],
  ];

  return (
    <section className="progress-card" aria-label="Общий прогресс">
      <div className="progress-heading">
        <h2>Общий прогресс</h2>
        <span>{progress.confident + progress.manual}/{progress.total}</span>
      </div>
      <div className="progress-grid">
        {stages.map(([label, value]) => (
          <div key={label} className="progress-item">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
