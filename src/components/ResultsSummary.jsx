import { useEffect, useState } from 'react';
import { formatAllLinks } from '../features/links/linkFormatter.js';

export default function ResultsSummary({ photos, providerSettings, onClear }) {
  const [allLinks, setAllLinks] = useState('');
  const uploaded = photos.filter((photo) => photo.uploadResult?.links?.length > 0);

  useEffect(() => setAllLinks(''), [photos]);
  if (uploaded.length === 0) return null;

  const generate = () => {
    const value = formatAllLinks(photos, providerSettings);
    setAllLinks(value);
    return value;
  };
  const copyAll = () => navigator.clipboard.writeText(allLinks || generate());

  return (
    <section className="results-summary">
      <div className="results-summary-heading">
        <div><p className="section-kicker">Результат</p><h2>Все ссылки</h2></div>
      </div>
      <div className="all-links-actions">
        <button type="button" onClick={generate}>Сформировать все ссылки</button>
        <button type="button" className="button-secondary" onClick={copyAll}>Скопировать все ссылки</button>
      </div>
      <textarea
        className="all-links-output"
        value={allLinks}
        readOnly
        aria-label="Все ссылки без подписей"
        placeholder="Нажмите «Сформировать все ссылки»"
      />
      <button type="button" className="clear-result-button" onClick={onClear}>Очистить результат</button>
    </section>
  );
}
