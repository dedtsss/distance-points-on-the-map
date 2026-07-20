import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SESSION_COLOR_SUGGESTIONS,
  loadExportDescription,
  loadSessionColor,
  photoSessionSignature,
  saveSessionColor,
} from '../features/export/exportPreferences.js';
import {
  buildPhotoResultBlocks,
  formatAllPhotoResultBlocks,
} from '../features/export/resultBlockFormatter.js';
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

export default function ResultsSummary({ photos, onClear }) {
  const [copyStatus, setCopyStatus] = useState('');
  const [copiedPhotoId, setCopiedPhotoId] = useState('');
  const copiedTimerRef = useRef(null);
  const sessionSignature = useMemo(() => photoSessionSignature(photos), [photos]);
  const [exportDescription] = useState(() => loadExportDescription());
  const [sessionColor, setSessionColor] = useState(() => loadSessionColor(sessionSignature));
  const uploaded = photos.filter((photo) => photo.uploadResult?.links?.length > 0);
  const indexCoordinateRows = useMemo(() => formatIndexCoordinateRows(photos), [photos]);
  const resultOptions = useMemo(() => ({ description: exportDescription, color: sessionColor }), [exportDescription, sessionColor]);
  const resultBlocks = useMemo(() => buildPhotoResultBlocks(photos, resultOptions), [photos, resultOptions]);
  const allResultBlocks = useMemo(() => formatAllPhotoResultBlocks(photos, resultOptions), [photos, resultOptions]);
  const allLinks = useMemo(() => formatAllLinks(photos), [photos]);

  useEffect(() => {
    setSessionColor(loadSessionColor(sessionSignature));
    setCopyStatus('');
    setCopiedPhotoId('');
  }, [sessionSignature]);

  useEffect(() => () => globalThis.clearTimeout(copiedTimerRef.current), []);

  const handleColorChange = (value) => {
    const next = String(value || '').slice(0, 80);
    setSessionColor(next);
    saveSessionColor(sessionSignature, next);
  };

  const showCopiedPhoto = (photoId) => {
    globalThis.clearTimeout(copiedTimerRef.current);
    setCopiedPhotoId(photoId);
    copiedTimerRef.current = globalThis.setTimeout(() => setCopiedPhotoId(''), 2600);
  };

  const copyIndexesAndCoordinates = async () => {
    try {
      await copyText(indexCoordinateRows);
      setCopyStatus(`Скопировано строк: ${photos.length}`);
    } catch {
      setCopyStatus('Не удалось скопировать индексы и координаты');
    }
  };

  const copyAllBlocks = async () => {
    try {
      await copyText(allResultBlocks);
      setCopyStatus(`Скопировано блоков: ${resultBlocks.length}`);
    } catch {
      setCopyStatus('Не удалось скопировать готовый текст');
    }
  };

  const copyOnlyLinks = async () => {
    try {
      await copyText(allLinks);
      setCopyStatus(`Скопированы ссылки: ${uploaded.length} фото`);
    } catch {
      setCopyStatus('Не удалось скопировать ссылки');
    }
  };

  const copyPhotoBlock = async (block) => {
    try {
      await copyText(block.text);
      showCopiedPhoto(block.photoId);
      setCopyStatus(`Фото ${block.photoNumber || ''}: информация скопирована`.trim());
    } catch {
      setCopyStatus(`Фото ${block.photoNumber || ''}: не удалось скопировать`.trim());
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

      <div className="results-summary-heading results-summary-subheading">
        <div><p className="section-kicker">Экспорт</p><h2>Готовый текст по фотографиям</h2></div>
      </div>

      <div className="result-export-settings">
        <label className="setting-field result-color-field">
          Цвет текущей сессии
          <input
            type="text"
            list="session-color-options"
            maxLength="80"
            value={sessionColor}
            onChange={(event) => handleColorChange(event.target.value)}
            placeholder="Выбери или введи цвет"
            autoComplete="off"
          />
          <datalist id="session-color-options">
            {SESSION_COLOR_SUGGESTIONS.map((color) => <option key={color} value={color} />)}
          </datalist>
        </label>
        <div className="export-description-preview">
          <span>Общее описание</span>
          <p>{exportDescription.trim() || 'Не задано. Добавляется в разделе «Настройки → Общее описание результата».'}</p>
        </div>
      </div>

      <div className="all-links-actions result-export-actions">
        <button type="button" onClick={copyAllBlocks} disabled={!allResultBlocks}>
          <Icon name="copy" size={18} />
          Скопировать все блоки
        </button>
        <button type="button" className="button-secondary" onClick={copyOnlyLinks} disabled={!allLinks}>
          <Icon name="copy" size={18} />
          Скопировать только ссылки
        </button>
      </div>

      <textarea
        className="all-links-output result-blocks-output"
        value={allResultBlocks}
        readOnly
        aria-label="Готовый текст по всем фотографиям"
      />

      <div className="photo-result-block-list" aria-label="Отдельные блоки фотографий">
        {resultBlocks.map((block) => {
          const copied = copiedPhotoId === block.photoId;
          return (
            <article key={block.photoId} className={`photo-result-block${copied ? ' is-copied' : ''}`}>
              <div className="photo-result-block-heading">
                <strong>Фото {block.photoNumber || '—'}</strong>
                <button
                  type="button"
                  className={copied ? 'copy-photo-block-button is-copied' : 'copy-photo-block-button button-secondary'}
                  onClick={() => copyPhotoBlock(block)}
                >
                  <Icon name={copied ? 'check' : 'copy'} size={17} />
                  {copied ? 'Скопировано' : 'Копировать блок'}
                </button>
              </div>
              <pre>{block.text}</pre>
            </article>
          );
        })}
      </div>

      {copyStatus && <p className="copy-status" role="status">{copyStatus}</p>}
      <button type="button" className="clear-result-button" onClick={onClear}>Очистить результат</button>
    </section>
  );
}
