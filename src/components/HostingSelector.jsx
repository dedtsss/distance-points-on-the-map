export default function HostingSelector({ hosting, imgbbApiKey, onHostingChange, onApiKeyChange }) {
  return (
    <section className="panel">
      <h2>Хостинг изображений</h2>
      <p className="muted">Одна сессия использует только один выбранный хостинг. Автоматического переключения нет.</p>

      <div className="hosting-options">
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
            value="imgbb"
            checked={hosting === 'imgbb'}
            onChange={(event) => onHostingChange(event.target.value)}
          />
          ImgBB с API-ключом
        </label>
      </div>

      {hosting === 'imgbb' && (
        <label className="field">
          API ключ ImgBB
          <input
            type="password"
            value={imgbbApiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder="Введите API ключ ImgBB"
          />
        </label>
      )}
    </section>
  );
}
