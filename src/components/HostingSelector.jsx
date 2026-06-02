export default function HostingSelector({ hosting, proxyUrl, onHostingChange, onProxyUrlChange }) {
  const needsProxy = hosting === 'imgbbproxy' || hosting === 'allwebsproxy' || hosting === 'umbproxy' || hosting === 'ninjaproxy';

  return (
    <section className="panel">
      <h2>Хостинг изображений</h2>
      <p className="muted">Одна сессия использует только один выбранный хостинг. Автоматического переключения нет.</p>

      <div className="hosting-options">
        <label className="radio-card">
          <input
            type="radio"
            name="hosting"
            value="imgbbproxy"
            checked={hosting === 'imgbbproxy'}
            onChange={(event) => onHostingChange(event.target.value)}
          />
          ImgBB через прокси
        </label>
        <label className="radio-card disabled-card">
          <input
            type="radio"
            name="hosting"
            value="allwebsproxy"
            checked={hosting === 'allwebsproxy'}
            onChange={(event) => onHostingChange(event.target.value)}
            disabled
          />
          Allwebs legacy
        </label>
        <label className="radio-card">
          <input
            type="radio"
            name="hosting"
            value="catbox"
            checked={hosting === 'catbox'}
            onChange={(event) => onHostingChange(event.target.value)}
          />
          Catbox без API-ключа
        </label>
        <label className="radio-card">
          <input
            type="radio"
            name="hosting"
            value="umbproxy"
            checked={hosting === 'umbproxy'}
            onChange={(event) => onHostingChange(event.target.value)}
          />
          UMBPhotos через прокси
        </label>
        <label className="radio-card">
          <input
            type="radio"
            name="hosting"
            value="ninjaproxy"
            checked={hosting === 'ninjaproxy'}
            onChange={(event) => onHostingChange(event.target.value)}
          />
          NinjaBox через прокси
        </label>
      </div>

      {needsProxy && (
        <label className="field">
          URL прокси-загрузчика
          <input
            type="url"
            value={proxyUrl}
            onChange={(event) => onProxyUrlChange(event.target.value)}
            placeholder="https://your-worker.your-subdomain.workers.dev"
          />
        </label>
      )}

    </section>
  );
}
