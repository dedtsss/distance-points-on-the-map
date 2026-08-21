import { useMemo, useState } from 'react';
import {
  buildCoordinateExport,
  downloadCoordinateExport,
  getExportablePoints,
  shareCoordinateExport,
} from '../features/export/coordinateExport.js';
import { buildExportPackage } from '../features/export/exportPackage.js';
import { SESSION_COLOR_SUGGESTIONS } from '../features/export/exportPreferences.js';
import {
  activeSessionPhotos,
  buildSessionTextExport,
  downloadSessionTextExport,
} from '../features/export/sessionTextExport.js';
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

const exportFormatLabel = (format) => ({ gpx: 'GPX', kml: 'KML', geojson: 'GeoJSON' }[format] || format);

export default function ResultsSummary({
  photos,
  session = {},
  onClear,
  onSessionChange,
  showCoordinateExport = true,
}) {
  const [copyStatus, setCopyStatus] = useState('');
  const [geoExportStatus, setGeoExportStatus] = useState('');
  const activePhotos = useMemo(() => activeSessionPhotos(photos), [photos]);
  const copiedPhotoIds = useMemo(() => new Set((session.copiedPhotoIds || []).map(String)), [session.copiedPhotoIds]);
  const exportablePointCount = useMemo(() => getExportablePoints(activePhotos).length, [activePhotos]);
  const indexCoordinateRows = useMemo(() => formatIndexCoordinateRows(activePhotos), [activePhotos]);
  const textExport = useMemo(() => buildSessionTextExport({ ...session, photos: activePhotos }), [session, activePhotos]);
  const allLinks = useMemo(() => formatAllLinks(activePhotos), [activePhotos]);
  const packagePreview = useMemo(() => buildExportPackage({ ...session, photos: activePhotos }), [session, activePhotos]);

  const markCopied = (photoId) => {
    const next = [...new Set([...(session.copiedPhotoIds || []).map(String), String(photoId)])];
    onSessionChange?.({ copiedPhotoIds: next });
  };

  const copyIndexesAndCoordinates = async () => {
    try {
      await copyText(indexCoordinateRows);
      setCopyStatus(`Скопировано строк: ${activePhotos.length}`);
    } catch {
      setCopyStatus('Не удалось скопировать индексы и координаты');
    }
  };

  const copyAllBlocks = async () => {
    try {
      await copyText(textExport.content);
      setCopyStatus(`Скопировано блоков: ${textExport.blocks.length}`);
    } catch {
      setCopyStatus('Не удалось скопировать готовый текст');
    }
  };

  const copyOnlyLinks = async () => {
    try {
      await copyText(allLinks);
      setCopyStatus(`Скопированы ссылки: ${activePhotos.filter((photo) => photo.uploadResult?.links?.length).length} фото`);
    } catch {
      setCopyStatus('Не удалось скопировать ссылки');
    }
  };

  const copyPhotoBlock = async (block) => {
    try {
      await copyText(block.text);
      markCopied(block.photoId);
      setCopyStatus(`Фото ${block.photoNumber || ''}: информация скопирована`.trim());
    } catch {
      setCopyStatus(`Фото ${block.photoNumber || ''}: не удалось скопировать`.trim());
    }
  };

  const copyNextBlock = async () => {
    const next = textExport.blocks.find((block) => !copiedPhotoIds.has(String(block.photoId))) || textExport.blocks[0];
    if (next) await copyPhotoBlock(next);
  };

  const downloadCoordinateFile = (format) => {
    setGeoExportStatus('');
    try {
      const exportData = buildCoordinateExport(activePhotos, format, {
        title: `Dark Cat CRM · сессия №${String(session.sessionNumber || 0).padStart(4, '0')}`,
        fileNameBase: `dark-cat-${String(session.sessionNumber || 0).padStart(4, '0')}`,
      });
      downloadCoordinateExport(exportData);
      setGeoExportStatus(`${exportFormatLabel(format)} скачан: ${exportData.pointCount} точек.`);
    } catch {
      setGeoExportStatus('Не удалось создать файл координат.');
    }
  };

  const shareSessionCoordinates = async () => {
    setGeoExportStatus('');
    try {
      const result = await shareCoordinateExport(activePhotos, {
        format: 'gpx',
        title: `Dark Cat CRM · сессия №${String(session.sessionNumber || 0).padStart(4, '0')}`,
        fileNameBase: `dark-cat-${String(session.sessionNumber || 0).padStart(4, '0')}`,
      });
      setGeoExportStatus(result.mode === 'downloaded'
        ? `GPX скачан: ${result.exportData.pointCount} точек.`
        : `Передано точек: ${result.exportData.pointCount}.`);
    } catch (error) {
      if (error?.name !== 'AbortError') setGeoExportStatus('Не удалось поделиться координатами сессии.');
    }
  };

  const downloadTxt = () => {
    try {
      downloadSessionTextExport(textExport);
      setCopyStatus(`TXT скачан: ${textExport.fileName}`);
    } catch {
      setCopyStatus('Не удалось скачать TXT.');
    }
  };

  return (
    <section className="results-summary">
      <div className="results-summary-heading">
        <div><p className="section-kicker">Данные сессии</p><h2>ACTIVE: индексы и координаты</h2></div>
        <strong className="active-copy-counter">Скопировано {textExport.blocks.filter((block) => copiedPhotoIds.has(String(block.photoId))).length} / {textExport.blocks.length}</strong>
      </div>
      <p className="setting-helper">RESERVE-точки ({Math.max(0, photos.length - activePhotos.length)}) не попадают в этот результат, TXT и coordinate export.</p>
      <div className="all-links-actions">
        <button type="button" onClick={copyIndexesAndCoordinates} disabled={!indexCoordinateRows}>
          <Icon name="copy" size={18} /> Копировать индексы и координаты
        </button>
      </div>
      <textarea className="all-links-output" value={indexCoordinateRows} readOnly aria-label="Все ACTIVE индексы и координаты" />

      {showCoordinateExport && (<>
        <div className="results-summary-heading results-summary-subheading">
          <div><p className="section-kicker">Картография</p><h2>Экспорт ACTIVE-точек</h2></div>
        </div>
        <p className="setting-helper">Доступно точек: {exportablePointCount}. GPX, KML и GeoJSON используют только текущие ACTIVE данные.</p>
        <div className="all-links-actions result-export-actions coordinate-export-actions">
          <button type="button" onClick={shareSessionCoordinates} disabled={!exportablePointCount}><Icon name="share" size={18} /> Поделиться сессией</button>
          <button type="button" className="button-secondary" onClick={() => downloadCoordinateFile('gpx')} disabled={!exportablePointCount}><Icon name="download" size={18} /> GPX</button>
          <button type="button" className="button-secondary" onClick={() => downloadCoordinateFile('kml')} disabled={!exportablePointCount}><Icon name="download" size={18} /> KML</button>
          <button type="button" className="button-secondary" onClick={() => downloadCoordinateFile('geojson')} disabled={!exportablePointCount}><Icon name="download" size={18} /> GeoJSON</button>
        </div>
        {geoExportStatus && <p className="copy-status" role="status">{geoExportStatus}</p>}
      </>)}

      <div className="results-summary-heading results-summary-subheading">
        <div><p className="section-kicker">Экспорт</p><h2>Готовый текст по ACTIVE фотографиям</h2></div>
      </div>
      <div className="result-export-settings">
        <label className="setting-field result-color-field">
          Цвет текущей сессии
          <input
            type="text"
            list="session-color-options"
            maxLength="80"
            value={session.color || ''}
            onChange={(event) => onSessionChange?.({ color: event.target.value })}
            placeholder="Выбери или введи цвет"
            autoComplete="off"
          />
          <datalist id="session-color-options">{SESSION_COLOR_SUGGESTIONS.map((color) => <option key={color} value={color} />)}</datalist>
        </label>
        <label className="setting-field result-packing-field">
          Фасовка текущей сессии
          <input type="text" maxLength="120" value={session.packing || ''} onChange={(event) => onSessionChange?.({ packing: event.target.value })} placeholder="Например: пачка 10 шт." autoComplete="off" />
        </label>
        <div className="export-description-preview"><span>Общий комментарий</span><p>{session.description?.trim() || 'Не задано.'}</p></div>
      </div>
      <div className="all-links-actions result-export-actions">
        <button type="button" onClick={copyAllBlocks} disabled={!textExport.content}><Icon name="copy" size={18} /> Скопировать всё</button>
        <button type="button" className="button-secondary" onClick={copyNextBlock} disabled={!textExport.blocks.length}><Icon name="copy" size={18} /> Скопировать следующий</button>
        <button type="button" className="button-secondary" onClick={copyOnlyLinks} disabled={!allLinks}><Icon name="copy" size={18} /> Скопировать только ссылки</button>
        <button type="button" className="button-secondary" onClick={downloadTxt} disabled={!textExport.content}><Icon name="download" size={18} /> Скачать TXT</button>
        <button type="button" className="button-secondary" disabled title={`ExportPackage v${packagePreview.schemaVersion} подготовлен; transport ещё не подключён.`}>Внешний скрипт — скоро</button>
      </div>
      <textarea className="all-links-output result-blocks-output" value={textExport.content} readOnly aria-label="Готовый текст по ACTIVE фотографиям" />
      <div className="photo-result-block-list" aria-label="Отдельные ACTIVE блоки фотографий">
        {textExport.blocks.map((block) => {
          const copied = copiedPhotoIds.has(String(block.photoId));
          return (
            <article key={block.photoId} className={`photo-result-block${copied ? ' is-copied' : ''}`}>
              <div className="photo-result-block-heading">
                <strong>Фото {block.photoNumber || '—'}</strong>
                <button type="button" className={copied ? 'copy-photo-block-button is-copied' : 'copy-photo-block-button button-secondary'} onClick={() => copyPhotoBlock(block)}>
                  <Icon name={copied ? 'check' : 'copy'} size={17} /> {copied ? 'Скопировано' : 'Копировать блок'}
                </button>
              </div>
              <pre>{block.text}</pre>
            </article>
          );
        })}
      </div>
      {copyStatus && <p className="copy-status" role="status">{copyStatus}</p>}
      <button type="button" className="clear-result-button" onClick={onClear}>Очистить текущую сессию</button>
    </section>
  );
}
