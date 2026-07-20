import { useEffect, useMemo, useState } from 'react';
import { formatAllLinks } from '../features/links/linkFormatter.js';
import { formatIndexCoordinateRows } from '../features/points/indexCoordinateFormatter.js';
import Icon from './Icon.jsx';
import './ResultsSummary.css';

const copyText = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand?.('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard API недоступен');
};

export default function ResultsSummary({ photos, providerSettings, onClear }) {
  const [allLinks, setAllLinks] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const uploaded = photos.filter((photo) => photo.uploadResult?.links?.length > 0);
  const indexCoordinateRows = useMemo(() => formatIndexCoordinateRows(photos), [photos]);

  useEffect(() => {
    setAllLinks('');
    setCopyStatus('');
  }, [photos]);

  const generate = () => {
    const value = formatAllLinks(photos, providerSettings);
    setAllLinks(value);
    return value;
  };

  const copyAllLinks = async () => {
    try {
      await copyText(allLinks || generate());
      setCopyStatus(`Скопированы ссылки: ${uploaded.length} фото`);
    } catch {
      setCopyStatus('Не удалось скопировать ссылки');
    }
  };

  const copyIndexesAndCoordinates = async () => {
    try {
      await copyText(indexCoordinateRows);
      setCopyStatus(`Скопировано строк: ${photos.length}`);
    } catch {
      setCopyStatus('Не удалось скопировать индексы и координаты');
    }
  };

  return (
    <section className="results-summary">
      <div className="results-summary-heading">
        <div><p className="section-kicker">Данные сессии</p><h2>Индексы и координаты</h2></div>
      </div>
      <div className="all-links-actions">
        <button type="button" onClick={copyIndexesAndCoordinates} disabled={!indexCoordinateRows}>
          <Icon name="copy" size={18} />
          Копировать индексы и координаты
        </button>
      </div>
      <textarea
        className="all-links-output"
        value={indexCoordinateRows}
        readOnly
        aria-label="Все индексы и координаты"
      />

      {uploaded.length > 0 && (
        <>
          <div className="results-summary-heading results-summary-subheading">
            <div><p className="section-kicker">Хостинги</p><h2>Все ссылки</h2></div>
          </div>
          <div className="all-links-actions">
            <button type="button" onClick={generate}>Сформировать все ссылки</button>
            <button type="button" className="button-secondary" onClick={copyAllLinks}>
              <Icon name="copy" size={18} />
              Скопировать все ссылки
            </button>
          </div>
          <textarea
            className="all-links-output"
            value={allLinks}
            readOnly
            aria-label="Все ссылки без подписей"
            placeholder="Нажмите «Сформировать все ссылки»"
          />
        </>
      )}

      {copyStatus && <p className="copy-status" role="status">{copyStatus}</p>}
      <button type="button" className="clear-result-button" onClick={onClear}>Очистить результат</button>
    </section>
  );
}
