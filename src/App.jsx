import { useMemo, useState } from 'react';
import HostingSelector from './components/HostingSelector';
import LinksBlock from './components/LinksBlock';
import ManualExportPanel from './components/ManualExportPanel';
import PhotoCard from './components/PhotoCard';
import ViolationsBlock from './components/ViolationsBlock';
import { readPhotoExif } from './utils/exifReader';
import {
  buildRemovalRecommendation,
  findDistanceViolations,
  getValidPointsForDistance,
  hasUsableCoordinates,
  isValidCoordinate,
  isZeroZeroCoordinate,
  markProblemPoints,
} from './utils/geoDistance';
import { readGpsFromImageOcr } from './utils/ocrGpsReader';
import { HOSTING_LABELS, uploadPhotosSequentially } from './utils/uploadManager';

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const DEFAULT_PROXY_URL = 'https://spring-mouse-8d81.dvabobra2014.workers.dev/';

const makePhotoId = () => `${Date.now()}-${crypto.randomUUID()}`;

const toCoordinateValue = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const numeric = Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
};

const makeCoordinatePatch = ({
  latitude,
  longitude,
  gpsSource,
  foundText,
  missingText,
  gpsWarnings = [],
  preserveInputValues = false,
  zeroZeroConfirmed = false,
}) => {
  const normalizedWarnings = new Set(gpsWarnings);
  const isZeroZero = isZeroZeroCoordinate(latitude, longitude);
  const canUseZeroZero = gpsSource === 'manual' && zeroZeroConfirmed === true;

  if (isValidCoordinate(latitude, longitude) && (!isZeroZero || canUseZeroZero)) {
    const normalizedLatitude = Number(latitude);
    const normalizedLongitude = Number(longitude);

    return {
      latitude: normalizedLatitude,
      longitude: normalizedLongitude,
      coordinates: {
        latitude: normalizedLatitude,
        longitude: normalizedLongitude,
      },
      gpsSource,
      gpsStatus: 'found',
      gpsStatusText: foundText,
      gpsWarnings: [...normalizedWarnings],
      zeroZeroConfirmed,
    };
  }

  if (isZeroZero) {
    normalizedWarnings.add('zero_zero_placeholder');
  }
  normalizedWarnings.add('coordinates_invalid');

  return {
    latitude: preserveInputValues ? latitude : null,
    longitude: preserveInputValues ? longitude : null,
    coordinates: null,
    gpsSource: gpsSource === 'manual' ? 'manual' : 'missing',
    gpsStatus: 'missing',
    gpsStatusText: isZeroZero ? 'Координаты 0,0 похожи на placeholder и не используются' : missingText,
    gpsWarnings: [...normalizedWarnings],
    zeroZeroConfirmed: false,
  };
};

const createPhotoModel = (file, index) => ({
  id: makePhotoId(),
  number: index + 1,
  file,
  fileName: file.name,
  originalName: file.name,
  previewUrl: URL.createObjectURL(file),
  indexFromOcr: null,
  displayIndex: String(index + 1),
  latitude: null,
  longitude: null,
  coordinates: null,
  gpsSource: 'missing',
  gpsStatus: 'pending',
  gpsStatusText: 'OCR ожидает обработки...',
  gpsWarnings: [],
  zeroZeroConfirmed: false,
  ocrStatus: 'pending',
  rawOcrText: '',
  normalizedOcrText: '',
  ocrConfidence: 0,
  ocrCandidates: [],
  ocrChosenCandidate: null,
  ocrAttempts: [],
  ocrCropPreview: '',
  ocrProcessedPreview: '',
  orientation: 1,
  exifError: null,
  description: '',
  distanceStatus: 'missing_coordinates',
  distanceWarnings: [],
  imageUrl: '',
  cleanStatus: 'ожидает загрузки',
  cleanWarnings: [],
  cleanMethod: '',
  metadataRemoved: null,
  cleanVerification: null,
  uploadFilename: '',
  uploadStatus: 'не загружено',
  uploadError: '',
  uploadedUrl: '',
  hostingUsed: '',
  expanded: false,
});

function App() {
  const [photos, setPhotos] = useState([]);
  const [threshold, setThreshold] = useState(25);
  const [highlightProblems, setHighlightProblems] = useState(false);
  const [hosting, setHosting] = useState('imgbbproxy');
  const [proxyUrl, setProxyUrl] = useState(DEFAULT_PROXY_URL);
  const [globalMessage, setGlobalMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const debugMode = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);

  const thresholdNumber = Number.isFinite(Number(threshold)) && Number(threshold) > 0 ? Number(threshold) : 25;
  const violations = useMemo(
    () => findDistanceViolations(photos, { thresholdMeters: thresholdNumber }),
    [photos, thresholdNumber],
  );
  const recommendation = useMemo(() => buildRemovalRecommendation(violations, photos), [violations, photos]);
  const markedPhotos = useMemo(() => markProblemPoints(photos, violations), [photos, violations]);
  const problemPhotoIds = useMemo(
    () => new Set(violations.flatMap((violation) => [violation.pointAId, violation.pointBId])),
    [violations],
  );
  const pointStats = useMemo(() => {
    const validCount = getValidPointsForDistance(photos).length;
    const missingCount = photos.length - validCount;

    return {
      totalCount: photos.length,
      validCount,
      missingCount,
      violationCount: violations.length,
    };
  }, [photos, violations.length]);
  const isReadingGps = photos.some((photo) => photo.gpsStatus === 'pending' || ['pending', 'processing'].includes(photo.ocrStatus));

  const updatePhoto = (id, patch) => {
    setPhotos((currentPhotos) => currentPhotos.map((photo) => (
      photo.id === id ? { ...photo, ...patch } : photo
    )));
  };

  const resetUploadsForHostingChange = (nextHosting) => {
    setHosting(nextHosting);
    setGlobalMessage('Хостинг изменён. Ссылки очищены, фотографии нужно загрузить заново.');
    setPhotos((currentPhotos) => currentPhotos.map((photo) => ({
      ...photo,
      imageUrl: '',
      uploadedUrl: '',
      uploadStatus: 'не загружено',
      uploadError: '',
      hostingUsed: '',
    })));
  };

  const processPhotoGps = async (photo) => {
    updatePhoto(photo.id, {
      ocrStatus: 'processing',
      gpsStatus: 'pending',
      gpsStatusText: 'OCR: подготовка изображения...',
    });

    const ocr = await readGpsFromImageOcr(photo.file, {
      debug: debugMode,
      onProgress: ({ status, progress }) => {
        const percent = progress > 0 ? ` ${Math.round(progress * 100)}%` : '';
        updatePhoto(photo.id, {
          ocrStatus: 'processing',
          gpsStatusText: `OCR: ${status}${percent}`,
        });
      },
    });

    const ocrBasePatch = {
      indexFromOcr: ocr.indexFromOcr,
      displayIndex: ocr.indexFromOcr || photo.displayIndex,
      rawOcrText: ocr.rawText || '',
      normalizedOcrText: ocr.normalizedText || '',
      ocrConfidence: ocr.confidence || 0,
      ocrStatus: ocr.ocrStatus || (ocr.ok ? 'found' : 'missing'),
      ocrCandidates: ocr.candidates || [],
      ocrChosenCandidate: ocr.chosenCandidate || null,
      ocrAttempts: ocr.attempts || [],
      ocrCropPreview: ocr.cropPreview || '',
      ocrProcessedPreview: ocr.processedPreview || '',
    };

    if (ocr.ok) {
      return {
        ...photo,
        ...ocrBasePatch,
        ...makeCoordinatePatch({
          latitude: ocr.latitude,
          longitude: ocr.longitude,
          gpsSource: 'ocr',
          foundText: 'OCR: координаты найдены',
          missingText: 'OCR: координаты невалидны',
          gpsWarnings: ocr.warnings,
        }),
      };
    }

    updatePhoto(photo.id, {
      ...ocrBasePatch,
      gpsStatusText: 'OCR не нашёл координаты, читаю EXIF...',
    });

    const exif = await readPhotoExif(photo.file);

    if (exif.coordinates) {
      return {
        ...photo,
        ...ocrBasePatch,
        orientation: exif.orientation || 1,
        exifError: null,
        ...makeCoordinatePatch({
          latitude: exif.coordinates.latitude,
          longitude: exif.coordinates.longitude,
          gpsSource: 'exif',
          foundText: 'EXIF fallback: GPS найден',
          missingText: 'EXIF fallback: координаты невалидны',
          gpsWarnings: ocr.warnings,
        }),
      };
    }

    return {
      ...photo,
      ...ocrBasePatch,
      orientation: exif.orientation || 1,
      exifError: exif.exifError,
      ...makeCoordinatePatch({
        latitude: null,
        longitude: null,
        gpsSource: 'missing',
        foundText: '',
        missingText: 'OCR и EXIF не нашли координаты',
        gpsWarnings: [...new Set([...(ocr.warnings || []), 'exif_coordinates_not_found'])],
      }),
    };
  };

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => ACCEPTED_TYPES.includes(file.type));
    setGlobalMessage('');
    setHighlightProblems(false);

    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));

    if (files.length === 0) {
      setPhotos([]);
      setGlobalMessage('Выберите JPG/JPEG фотографии. PNG/WebP поддерживаются, если браузер может прочитать изображение.');
      return;
    }

    const nextPhotos = files.map(createPhotoModel);
    setPhotos(nextPhotos);

    const processedPhotos = [];

    for (const photo of nextPhotos) {
      const processedPhoto = await processPhotoGps(photo);
      processedPhotos.push(processedPhoto);
      updatePhoto(photo.id, processedPhoto);
    }

    if (!processedPhotos.some(hasUsableCoordinates)) {
      setGlobalMessage('Координаты не найдены ни OCR, ни EXIF. Их можно ввести вручную в карточках фото.');
    } else if (processedPhotos.some((photo) => !hasUsableCoordinates(photo))) {
      setGlobalMessage('Часть фото без координат. Фото без координат не участвуют в расчёте расстояний и экспорте.');
    }
  };

  const handleUpload = async () => {
    if (photos.length === 0) {
      setGlobalMessage('Сначала выберите фотографии.');
      return;
    }

    if (isReadingGps) {
      setGlobalMessage('Дождитесь завершения OCR/EXIF перед загрузкой.');
      return;
    }

    if ((hosting === 'imgbbproxy' || hosting === 'allwebsproxy' || hosting === 'umbproxy' || hosting === 'ninjaproxy') && !proxyUrl.trim()) {
      setGlobalMessage('Укажите URL прокси-загрузчика.');
      return;
    }

    setIsUploading(true);
    setGlobalMessage('Загрузка началась. Файлы отправляются последовательно на выбранный хостинг.');
    setPhotos((currentPhotos) => currentPhotos.map((photo) => ({
      ...photo,
      imageUrl: '',
      uploadedUrl: '',
      uploadStatus: 'в очереди',
      uploadError: '',
      hostingUsed: HOSTING_LABELS[hosting],
    })));

    try {
      const uploadResult = await uploadPhotosSequentially({
        photos,
        hosting,
        proxyUrl,
        timeoutMs: 30000,
        onPhotoUpdate: updatePhoto,
      });
      setPhotos((currentPhotos) => currentPhotos.map((photo) => ({
        ...photo,
        imageUrl: photo.uploadedUrl,
      })));
      setGlobalMessage(
        uploadResult.failedCount > 0
          ? `Загрузка завершена с ошибками. Успешно: ${uploadResult.uploadedCount} из ${photos.length}, ошибок: ${uploadResult.failedCount}. Подробности в карточках фото.`
          : `Загрузка завершена. Успешно загружено: ${uploadResult.uploadedCount} из ${photos.length}.`,
      );
    } catch (error) {
      setGlobalMessage(
        error instanceof Error
          ? `${error.message} Выберите другой хостинг или повторите попытку.`
          : 'Ошибка загрузки. Выберите другой хостинг или повторите попытку.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  const toggleDetails = (id) => {
    setPhotos((currentPhotos) => currentPhotos.map((photo) => (
      photo.id === id ? { ...photo, expanded: !photo.expanded } : photo
    )));
  };

  const handleCoordinateChange = (id, field, value) => {
    setPhotos((currentPhotos) => currentPhotos.map((photo) => {
      if (photo.id !== id) {
        return photo;
      }

      const nextPhoto = {
        ...photo,
        [field]: toCoordinateValue(value),
      };

      return {
        ...nextPhoto,
        ...makeCoordinatePatch({
          latitude: field === 'latitude' ? toCoordinateValue(value) : nextPhoto.latitude,
          longitude: field === 'longitude' ? toCoordinateValue(value) : nextPhoto.longitude,
          gpsSource: 'manual',
          foundText: 'Координаты введены вручную',
          missingText: 'Ручные координаты неполные или невалидные',
          gpsWarnings: [],
          preserveInputValues: true,
          zeroZeroConfirmed: nextPhoto.zeroZeroConfirmed === true,
        }),
      };
    }));
  };

  const handleDescriptionChange = (id, description) => {
    setPhotos((currentPhotos) => currentPhotos.map((photo) => (
      photo.id === id ? { ...photo, description } : photo
    )));
  };

  return (
    <main className="app-shell">
      <header className="hero hero-compact">
        <p className="eyebrow">рабочая версия</p>
        <h1>GPS-чекер</h1>
      </header>

      <section className="panel controls">
        <label className="field">
          Фотографии
          <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple onChange={handleFileChange} />
        </label>
        <label className="field threshold-field">
          Порог нарушения, метров
          <input
            type="number"
            min="1"
            step="0.1"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
          />
        </label>
        <button type="button" onClick={() => setHighlightProblems(true)} disabled={violations.length === 0}>
          Показать проблемные точки
        </button>
      </section>

      <HostingSelector
        hosting={hosting}
        proxyUrl={proxyUrl}
        onHostingChange={resetUploadsForHostingChange}
        onProxyUrlChange={setProxyUrl}
      />

      {globalMessage && <div className="status-banner">{globalMessage}</div>}

      <ViolationsBlock
        violations={violations}
        recommendation={recommendation}
        pointStats={pointStats}
        thresholdMeters={thresholdNumber}
      />

      <ManualExportPanel
        photos={photos}
        setPhotos={setPhotos}
        isReadingGps={isReadingGps}
        violations={violations}
        setGlobalMessage={setGlobalMessage}
      />

      <section className="panel upload-panel">
        <h2>Автоматическая загрузка очищенных копий</h2>
        <p className="muted">
          Экспериментальный режим. Для стабильной работы сейчас лучше использовать ручную загрузку выше.
        </p>
        <button type="button" onClick={handleUpload} disabled={isUploading || isReadingGps || photos.length === 0}>
          {isUploading ? 'Загрузка...' : `Загрузить на ${HOSTING_LABELS[hosting]}`}
        </button>
      </section>

      {photos.length > 0 && <LinksBlock photos={photos} hostingLabel={HOSTING_LABELS[hosting]} />}

      <section className="photo-list" aria-live="polite">
        {markedPhotos.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            isProblem={problemPhotoIds.has(photo.id)}
            isHighlighted={highlightProblems}
            conflicts={violations.filter((violation) => violation.pointAId === photo.id || violation.pointBId === photo.id)}
            onToggle={toggleDetails}
            onCoordinateChange={handleCoordinateChange}
            onDescriptionChange={handleDescriptionChange}
            debugMode={debugMode}
          />
        ))}
      </section>
    </main>
  );
}

export default App;
