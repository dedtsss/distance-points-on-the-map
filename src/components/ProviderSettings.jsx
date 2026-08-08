import { normalizeProviderSettings, validateProviderSettings } from '../features/upload/providerPolicy.js';

const FALLBACK_OPTIONS = [
  ['fallbackFreeimage', 'Freeimage — только если NinjaBox вернул ошибку'],
  ['fallbackX0', 'x0.at — только если NinjaBox и Freeimage не сработали'],
];
const PROVIDER_LABELS = { ninjabox: 'NinjaBox', freeimage: 'Freeimage', x0: 'x0.at' };

export default function ProviderSettings({ value, onChange, disabled }) {
  const normalized = normalizeProviderSettings(value);
  const validation = validateProviderSettings(normalized);
  const order = validation.providerOrder;
  const move = (provider, direction) => {
    const index = order.indexOf(provider);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...normalized, providerOrder: next });
  };
  return (
    <section className="provider-settings" aria-labelledby="provider-settings-title">
      <h2 id="provider-settings-title">Цепочка загрузки</h2>
      <p>Следующий хостинг запускается только после ошибки предыдущего. Порядок ниже — реальный policy, который передаётся Worker.</p>
      <div className="provider-options">
        <label>
          <input type="checkbox" checked disabled />
          <span>NinjaBox включён в цепочку</span>
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
      <div className="provider-order" aria-label="Порядок fallback провайдеров">
        <strong>Порядок fallback</strong>
        {order.map((provider, index) => (
          <div key={provider} className="provider-order-row">
            <span>{index + 1}. {PROVIDER_LABELS[provider]}</span>
            <span>
              <button type="button" className="button-secondary compact-button" onClick={() => move(provider, -1)} disabled={disabled || index === 0} aria-label={`Поднять ${provider}`}>↑</button>
              <button type="button" className="button-secondary compact-button" onClick={() => move(provider, 1)} disabled={disabled || index === order.length - 1} aria-label={`Опустить ${provider}`}>↓</button>
            </span>
          </div>
        ))}
      </div>
      {!validation.valid && <p className="settings-error">{validation.error}</p>}
    </section>
  );
}
