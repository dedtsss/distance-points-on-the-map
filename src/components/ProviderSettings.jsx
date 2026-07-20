import { normalizeProviderSettings, validateProviderSettings } from '../features/upload/providerPolicy.js';

const FALLBACK_OPTIONS = [
  ['fallbackFreeimage', 'Freeimage — только если NinjaBox вернул ошибку'],
  ['fallbackX0', 'x0.at — только если NinjaBox и Freeimage не сработали'],
];

export default function ProviderSettings({ value, onChange, disabled }) {
  const normalized = normalizeProviderSettings(value);
  const validation = validateProviderSettings(normalized);
  return (
    <section className="provider-settings" aria-labelledby="provider-settings-title">
      <h2 id="provider-settings-title">Цепочка загрузки</h2>
      <p>NinjaBox используется первым. Следующий хостинг запускается только после ошибки предыдущего.</p>
      <div className="provider-options">
        <label>
          <input type="checkbox" checked disabled />
          <span>NinjaBox — основной хостинг</span>
        </label>
        {FALLBACK_OPTIONS.map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={normalized[key]}
              disabled={disabled}
              onChange={(event) => onChange({ ...normalized, [key]: event.target.checked })}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {!validation.valid && <p className="settings-error">{validation.error}</p>}
    </section>
  );
}
