import { validateProviderSettings } from '../features/upload/providerPolicy.js';

const OPTIONS = [
  ['freeimage', 'Freeimage'],
  ['ninjabox', 'Ninjabox'],
  ['includeX0', 'x0.at как обязательная третья ссылка'],
  ['fallbackX0', 'Использовать x0.at как fallback при ошибке'],
];

export default function ProviderSettings({ value, onChange, disabled }) {
  const validation = validateProviderSettings(value);
  return (
    <section className="provider-settings" aria-labelledby="provider-settings-title">
      <h2 id="provider-settings-title">Куда загружать</h2>
      <div className="provider-options">
        {OPTIONS.map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={value[key]}
              disabled={disabled}
              onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {!validation.valid && <p className="settings-error">{validation.error}</p>}
    </section>
  );
}
