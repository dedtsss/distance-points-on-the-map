const allLinksText = (photos) => photos
  .flatMap((photo) => photo.uploadResult?.links?.map((link) => link.url) || [])
  .filter(Boolean)
  .join('\n');

export default function ResultsSummary({ photos }) {
  const uploaded = photos.filter((photo) => photo.uploadResult?.links?.length > 0);
  if (uploaded.length === 0) return null;

  const copyAll = async () => navigator.clipboard.writeText(allLinksText(photos));

  return (
    <section className="results-summary">
      <div className="results-summary-heading">
        <div>
          <p className="section-kicker">Результат</p>
          <h2>Ссылки по фотографиям</h2>
        </div>
        <button type="button" onClick={copyAll}>Скопировать все ссылки</button>
      </div>

      <div className="results-table-wrap">
        <table>
          <thead>
            <tr><th>Фото</th><th>Freeimage</th><th>Ninjabox</th><th>Резерв</th></tr>
          </thead>
          <tbody>
            {photos.map((photo) => (
              <tr key={photo.id}>
                <th>{photo.number}. {photo.fileName}</th>
                <td>{photo.uploadResult?.freeimageUrl ? <a href={photo.uploadResult.freeimageUrl} target="_blank" rel="noreferrer">Открыть</a> : '—'}</td>
                <td>{photo.uploadResult?.ninjaboxUrl ? <a href={photo.uploadResult.ninjaboxUrl} target="_blank" rel="noreferrer">Открыть</a> : '—'}</td>
                <td>{photo.uploadResult?.fallbackUrl ? <a href={photo.uploadResult.fallbackUrl} target="_blank" rel="noreferrer">x0.at</a> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
