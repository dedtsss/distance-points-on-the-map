import { useState } from 'react';
import { cleanImageForUpload } from '../utils/imageCleaner';
import { applyLinksByOrder, parseNinjaBoxLinks } from '../utils/linkParser';
import { buildCsv, buildGpx, buildKml, downloadTextFile, getExportablePoints } from '../utils/geoExport';

const padNumber = (value) => String(value).padStart(3, '0');

const downloadBlob = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function ManualExportPanel({ photos, setPhotos, isReadingExif, setGlobalMessage }) {
  const [manualText, setManualText] = useState('');
  const [parsedLinks, setParsedLinks] = useState([]);
  const exportablePoints = getExportablePoints(photos);

  const handleDownloadCleaned = async () => {
    if (photos.length === 0) {
      setGlobalMessage('Сначала выберите фотографии.');
      return;
    }

    if (isReadingExif) {
      setGlobalMessage('Дождитесь завершения чтения EXIF/GPS.');
      return;
    }

    let okCount = 0;
    const updates = [];

    for (const photo of photos) {
      const preferredFilename = `gps-${padNumber(photo.number)}.jpg`;
      const cleaned = await cleanImageForUpload(photo.file, photo.orientation, preferredFilename);

      updates.push({
        id: photo.id,
        cleanStatus: cleaned.ok ? 'очищенная копия скачана' : 'ошибка очистки',
        cleanWarnings: cleaned.warnings,
        uploadFilename: cleaned.filename,
      });

      if (cleaned.ok && cleaned.file) {
        okCount += 1;
        downloadBlob(cleaned.filename, cleaned.file);
      }
    }

    setPhotos((currentPhotos) => currentPhotos.map((photo) => {
      const update = updates.find((item) => item.id === photo.id);
      return update ? { ...photo, ...update } : photo;
    }));

    setGlobalMessage(`Очищенные фото скачаны: ${okCount} из ${photos.length}. Загрузи их на NinjaBox в том же порядке.`);
  };

  const handleParseLinks = () => {
    const links = parseNinjaBoxLinks(manualText);
    setParsedLinks(links);

    if (links.length === 0) {
      setGlobalMessage('Ссылки NinjaBox не найдены. Скопируй страницу результата или список ссылок и вставь сюда.');
      return;
    }

    setPhotos((currentPhotos) => applyLinksByOrder(currentPhotos, links));
    setGlobalMessage(`Найдено ссылок NinjaBox: ${links.length}. Они сопоставлены с фото по порядку.`);
  };

  const handleExport = (type) => {
    if (exportablePoints.length === 0) {
      setGlobalMessage('Нет точек с GPS для экспорта.');
      return;
    }

    if (type === 'gpx') {
      downloadTextFile('gps-checker-points.gpx', buildGpx(exportablePoints), 'application/gpx+xml;charset=utf-8');
    } else if (type === 'kml') {
      downloadTextFile('gps-checker-points.kml', buildKml(exportablePoints), 'application/vnd.google-earth.kml+xml;charset=utf-8');
    } else {
      downloadTextFile('gps-checker-points.csv', buildCsv(exportablePoints), 'text/csv;charset=utf-8');
    }

    setGlobalMessage(`Экспортировано точек: ${exportablePoints.length}.`);
  };

  return (
    <section className="panel manual-panel">
      <h2>Ручная загрузка и экспорт</h2>
      <p className="muted">
        Рабочий ручной режим: приложение очищает фото и называет их gps-001.jpg, gps-002.jpg и так далее. Потом ты вручную загружаешь эти файлы на NinjaBox, копируешь страницу результата или список ссылок и вставляешь сюда.
      </p>

      <div className="manual-actions">
        <button type="button" onClick={handleDownloadCleaned} disabled={photos.length === 0 || isReadingExif}>
          Скачать очищенные фото
        </button>
        <a className="button-link" href="https://ninjabox.org/" target="_blank" rel="noreferrer">
          Открыть NinjaBox
        </a>
      </div>

      <label className="field">
        HTML / текст / ссылки со страницы результата NinjaBox
        <textarea
          value={manualText}
          onChange={(event) => setManualText(event.target.value)}
          placeholder="Вставь сюда содержимое страницы результата NinjaBox или список ссылок"
          rows={7}
        />
      </label>

      <div className="manual-actions">
        <button type="button" onClick={handleParseLinks} disabled={!manualText.trim()}>
          Распарсить ссылки NinjaBox
        </button>
        <button type="button" onClick={() => handleExport('gpx')} disabled={exportablePoints.length === 0}>
          Скачать GPX
        </button>
        <button type="button" onClick={() => handleExport('kml')} disabled={exportablePoints.length === 0}>
          Скачать KML
        </button>
        <button type="button" onClick={() => handleExport('csv')} disabled={exportablePoints.length === 0}>
          Скачать CSV
        </button>
      </div>

      {parsedLinks.length > 0 && (
        <div className="parsed-links">
          <h3>Найденные ссылки</h3>
          <ol>
            {parsedLinks.map((link) => (
              <li key={link}><a href={link} target="_blank" rel="noreferrer">{link}</a></li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
