import { SESSION_COLOR_SUGGESTIONS } from '../features/export/exportPreferences.js';
import Icon from './Icon.jsx';

const STEPS = [
  ['processing', '1', 'Сессия и фото'],
  ['upload', '2', 'Распознавание'],
  ['map', '3', 'Карта и конфликты'],
  ['result', '4', 'Результат'],
];

export default function SessionWizard({
  session,
  photoCount,
  isBusy,
  onSessionChange,
  onStartNew,
  onStageChange,
}) {
  const update = (patch) => onSessionChange?.(patch);
  const number = String(session?.sessionNumber || 0).padStart(4, '0');

  return (
    <section className="session-wizard" aria-labelledby="session-wizard-title">
      <div className="session-wizard-heading">
        <div>
          <p className="page-eyebrow">Сессия №{number}</p>
          <h2 id="session-wizard-title">Мастер обработки фотографий</h2>
          <p>Данные сохраняются локально между перезагрузками. Исходные фото остаются на устройстве.</p>
        </div>
        <button type="button" className="button-secondary" onClick={onStartNew} disabled={isBusy}>
          <Icon name="plus" size={18} /> Новая сессия
        </button>
      </div>

      <ol className="wizard-stepper" aria-label="Этапы сессии">
        {STEPS.map(([id, numberLabel, label]) => (
          <li key={id} className={session?.stage === id ? 'is-current' : ''}>
            <button type="button" onClick={() => onStageChange?.(id)} disabled={isBusy && session?.stage !== id}>
              <span>{numberLabel}</span>{label}
            </button>
          </li>
        ))}
      </ol>

      <div className="session-fields">
        <label className="setting-field">
          Название сессии <small>необязательно</small>
          <input
            type="text"
            maxLength="160"
            value={session?.title || session?.name || ''}
            onChange={(event) => update({ title: event.target.value, name: event.target.value })}
            placeholder="Например: Северный участок, 8 августа"
            disabled={isBusy}
          />
        </label>
        <label className="setting-field">
          Цвет
          <input
            type="text"
            list="wizard-session-color-options"
            maxLength="80"
            value={session?.color || ''}
            onChange={(event) => update({ color: event.target.value })}
            placeholder="Красный"
            disabled={isBusy}
          />
          <datalist id="wizard-session-color-options">
            {SESSION_COLOR_SUGGESTIONS.map((color) => <option key={color} value={color} />)}
          </datalist>
        </label>
        <label className="setting-field">
          Фасовка
          <input
            type="text"
            maxLength="120"
            value={session?.packing || ''}
            onChange={(event) => update({ packing: event.target.value })}
            placeholder="Например: пачка 10 шт."
            disabled={isBusy}
          />
        </label>
        <label className="setting-field session-description-field">
          Общий комментарий <small>необязательно</small>
          <textarea
            rows="3"
            maxLength="4000"
            value={session?.description || ''}
            onChange={(event) => update({ description: event.target.value })}
            placeholder="Комментарий будет добавлен в результат ACTIVE-точек"
            disabled={isBusy}
          />
        </label>
      </div>
      <p className="session-wizard-helper">Выбрано фото: {photoCount}. Шаг 1 поддерживает обычный выбор и Android-compatible выбор папки.</p>
    </section>
  );
}
