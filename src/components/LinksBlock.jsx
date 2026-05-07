export default function LinksBlock({ photos, hostingLabel }) {
  return (
    <section className="panel links-panel">
      <h2>Ссылки</h2>
      <p className="muted">Текущий хостинг сессии: {hostingLabel}</p>
      <ol>
        {photos.map((photo) => (
          <li key={photo.id}>
            <span>{photo.number} — </span>
            {photo.uploadedUrl ? (
              <a href={photo.uploadedUrl} target="_blank" rel="noreferrer">{photo.uploadedUrl}</a>
            ) : (
              <span>{photo.uploadStatus === 'Ошибка загрузки' ? 'ошибка загрузки' : 'не загружено'}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
