import { cleanImageForUpload } from '../utils/imageCleaner';
import {
  buildCsv,
  buildDistanceReportCsv,
  buildGpx,
  buildKml,
  downloadTextFile,
  getExportablePoints,
} from '../utils/geoExport';

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

export default function ManualExportPanel({ photos, setPhotos, isReadingGps, violations, setGlobalMessage }) {
  const exportablePoints = getExportablePoints(photos);

  const handleDownloadCleaned = async () => {
    if (photos.length === 0) {
      setGlobalMessage('Сначала выберите фотографии.');
      return;
    }

    if (isReadingGps) {
      setGlobalMessage('Дождитесь завершения OCR/EXIF.');
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
        cleanMethod: cleaned.method,
        metadataRemoved: cleaned.metadataRemoved,
        cleanVerification: cleaned.verification,
        uploadFilename: cleaned.filename,
      });

      if (cleaned.ok && cleaned.file && cleaned.verification?.hasGps !== true) {
        okCount += 1;
        downloadBlob(cleaned.filename, cleaned.file);
      }
    }

    setPhotos((currentPhotos) => currentPhotos.map((photo) => {
      const update = updates.find((item) => item.id === photo.id);
      return update ? { ...photo, ...update } : photo;
    }));

    setGlobalMessage(`Очищенные фото скачаны: ${okCount} из ${photos.length}.`);
  };

  const handleExport = (type) => {
    if (type === 'distance') {
      if (violations.length === 0) {
        setGlobalMessage('Нет нарушений дистанции для экспорта.');
        return;
      }

      downloadTextFile('gps-checker-distance-report.csv', buildDistanceReportCsv(violations), 'text/csv;charset=utf-8');
      setGlobalMessage(`Экспортировано нарушений: ${violations.length}.`);
      return;
    }

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
      <h2>Скачивание и экспорт</h2>
      <p className="muted">
        Можно скачать очищенные копии отдельно или экспортировать точки и нарушения.
      </p>

      <div className="manual-actions">
        <button type="button" onClick={handleDownloadCleaned} disabled={photos.length === 0 || isReadingGps}>
          Скачать очищенные фото
        </button>
      </div>

      <div className="manual-actions">
        <button type="button" onClick={() => handleExport('gpx')} disabled={exportablePoints.length === 0}>
          Скачать GPX
        </button>
        <button type="button" onClick={() => handleExport('kml')} disabled={exportablePoints.length === 0}>
          Скачать KML
        </button>
        <button type="button" onClick={() => handleExport('csv')} disabled={exportablePoints.length === 0}>
          Скачать CSV
        </button>
        <button type="button" onClick={() => handleExport('distance')} disabled={violations.length === 0}>
          Скачать CSV нарушений
        </button>
      </div>

    </section>
  );
}
