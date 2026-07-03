import { PROVIDER_LABELS } from '../utils/uploadManager';

export default function LinksBlock({ photos }) {
  const galleryUrl = photos.find((photo) => photo.ninjaboxGalleryUrl)?.ninjaboxGalleryUrl || '';

  return (
    <section className="panel links-panel">
      <h2>Ссылки</h2>
      <p className="muted">По умолчанию: Freeimage + Ninjabox. x0.at отображается только как резерв.</p>
      {galleryUrl && (
        <p>
          Общая галерея Ninjabox: <a href={galleryUrl} target="_blank" rel="noreferrer">{galleryUrl}</a>
        </p>
      )}
      <ol>
        {photos.map((photo) => (
          <li key={photo.id}>
            <strong>Фото {photo.number}</strong>
            {photo.uploadLinks?.length > 0 ? (
              <ul className="provider-links">
                {photo.uploadLinks.map((link) => (
                  <li key={`${photo.id}-${link.provider}`}>
                    <span>{PROVIDER_LABELS[link.provider] || link.provider}: </span>
                    <a href={link.url} target="_blank" rel="noreferrer">{link.url}</a>
                    {link.role === 'fallback' && <span className="warning-text"> (резерв)</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <span> — {photo.uploadStatus === 'Ошибка загрузки' ? 'ошибка загрузки' : 'не загружено'}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
